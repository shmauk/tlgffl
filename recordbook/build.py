"""Build the league database from the canonical data in data/.

    python3 -m recordbook.build [--data data] [--out build/league.sqlite]

Restructured from ff-data-project's build.py (ADR 0004). The database is a
build artifact (ADR 0003): it is written from scratch every run and never
committed. The Astro site only reads it.
"""
import argparse
import csv
import json
import re
import sqlite3
from collections import defaultdict
from dataclasses import astuple
from pathlib import Path

from recordbook import brackets as bracketlib
from recordbook import formats as formatfile
from recordbook import games as gamelog

LEAGUE = "1078038"

# Names a platform shows when no real team name exists. They are kept as a
# season's team name but never become a franchise name.
PLACEHOLDER_NAMES = {"pending", "[name redacted]"}

SCHEMA = """
create table franchises (
    id integer primary key,
    name text not null,
    active integer not null,
    first_season integer,
    last_season integer
);
create table seasons (
    year integer primary key,
    era text not null check (era in ('nfl.com', 'sleeper')),
    team_count integer not null
);
create table team_names (
    franchise_id integer not null references franchises(id),
    season integer not null references seasons(year),
    team_name text not null,
    primary key (franchise_id, season)
);
-- A franchise's season line as NFL.com reported it (ADR 0001 keeps these for
-- every NFL.com season, whether or not the games survive).
create table reported_season_lines (
    franchise_id integer not null references franchises(id),
    season integer not null references seasons(year),
    wins integer not null,
    losses integer not null,
    ties integer not null,
    points_for real not null,
    points_against real not null,
    division text,
    seed integer,
    bracket text,
    final_placing integer,
    primary key (franchise_id, season)
);
-- A head-to-head pairing that counts in the league's results. Platform filler
-- pairings are never written. Only final games count.
create table games (
    id integer primary key,
    season integer not null references seasons(year),
    week integer not null,
    phase text not null check (phase in ('regular', 'bracket')),
    bracket text check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    round integer,
    status text not null check (status in ('scheduled', 'live', 'final')),
    home_franchise_id integer not null references franchises(id),
    home_points real,
    away_franchise_id integer not null references franchises(id),
    away_points real,
    -- Null for a tie. A bracket game whose score is lost (null points) still
    -- has the winner its bracket says it had.
    winner_franchise_id integer references franchises(id),
    check ((phase = 'regular') = (bracket is null and round is null))
);
-- How many of a week's games survive, per phase and bracket. The site's gap
-- markers come from here (ADR 0001). Only brackets whose games are known are
-- listed: NFL.com-era Shit Bowl and Mediocre Bowl games are recorded by hand.
create table coverage (
    season integer not null references seasons(year),
    week integer not null,
    phase text not null check (phase in ('regular', 'bracket')),
    bracket text check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    games_expected integer not null,
    games_final integer not null,
    complete integer not null check (complete in (0, 1))
);
create unique index coverage_key on coverage (season, week, phase, coalesce(bracket, ''));
-- The season line the site shows (ADR 0001): W-L-T and points derived from
-- games where the season's regular season is fully covered, reported by
-- NFL.com otherwise. `source` records which.
create table season_lines (
    franchise_id integer not null references franchises(id),
    season integer not null references seasons(year),
    source text not null check (source in ('derived', 'reported')),
    wins integer not null,
    losses integer not null,
    ties integer not null,
    points_for real not null,
    points_against real not null,
    division text,
    seed integer,
    bracket text,
    final_placing integer,
    -- Breakdown and luck (win % minus Breakdown %, a tie counting half, as a
    -- fraction) only exist for fully covered seasons.
    breakdown_wins integer,
    breakdown_losses integer,
    breakdown_ties integer,
    luck real,
    primary key (franchise_id, season)
);
-- A season's format (#11), from the hand-kept data/formats.yaml. Its team
-- count is seasons.team_count. realignment is the first season of the
-- division cycle the season belongs to; tiebreaks and seeding are the rules
-- in words.
create table season_formats (
    season integer primary key references seasons(year),
    divisions integer not null,
    regular_season_first_week integer not null,
    regular_season_last_week integer not null,
    realignment integer not null,
    tiebreaks text
);
create table season_brackets (
    season integer not null references season_formats(season),
    bracket text not null check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    size integer not null,
    first_week integer not null,
    last_week integer not null,
    series text,
    seeding text,
    primary key (season, bracket)
);
-- The constitution and AGM documents (Google Docs links), from the hand-kept
-- data/documents.csv. The constitution has no season.
create table documents (
    kind text not null check (kind in ('constitution', 'agm')),
    season integer,
    title text not null,
    url text not null
);
-- Who each bracket crowned: the champion (Playoffs), the Shit Bowl winner and
-- the Mediocre Bowl winner. The champion is derived from the Playoffs; the
-- NFL.com era's other winners come from hand-kept tables. A disputed outcome
-- has one row per candidate and counts for nobody; an unknown one has a single
-- row with no franchise.
create table bracket_winners (
    season integer not null references seasons(year),
    bracket text not null check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    franchise_id integer references franchises(id),
    source text not null check (source in ('derived', 'confirmed', 'recalled', 'disputed', 'unknown')),
    check ((franchise_id is null) = (source = 'unknown'))
);
"""

GAME_COLUMNS = ("season", "week", "phase", "bracket", "round", "status", "home_franchise_id",
                "home_points", "away_franchise_id", "away_points", "winner_franchise_id")

class BuildError(Exception):
    """The canonical data is inconsistent; the build must not go on."""


def read_csv(path):
    """Rows of a hand-kept CSV, skipping '#' comment lines."""
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


# ---------- sources ----------

def nfl_seasons(data):
    """{year: league} from the archived NFL.com standings.

    A standings file where every team is 0-0-0 was never played: NFL.com
    rolled the league over into 2025 after it had moved to Sleeper. Skip it.
    """
    out = {}
    for f in sorted((data / "nfl-api").glob("standings-*.json")):
        year = int(re.search(r"(\d{4})", f.name).group(1))
        league = json.loads(f.read_text())["games"][f"10{year}"]["leagues"][LEAGUE]
        if all(_season_stats(t, year).get("record", "0-0-0") == "0-0-0"
               for t in league["teams"].values()):
            continue
        out[year] = league
    return out


def _season_stats(team, year):
    return ((team.get("stats") or {}).get("season") or {}).get(str(year)) or {}


def sleeper_seasons(data):
    """{year: (league, rosters)} from the Sleeper snapshots."""
    out = {}
    for f in sorted((data / "sleeper").glob("*-league.json")):
        year = int(f.name[:4])
        rosters = json.loads((data / "sleeper" / f"{year}-rosters.json").read_text())
        out[year] = (json.loads(f.read_text()), rosters)
    return out


def franchise_keys(data):
    """{(era, slot, owner user id): franchise id} from the hand-kept table.

    NFL.com teams are keyed on (teamId, ownerUserId); Sleeper teams on roster
    id alone. Several keys may share one franchise: that is how the league's
    judgement that a manager merely switched accounts is recorded.
    """
    keys = {}
    for r in read_csv(data / "franchises.csv"):
        owner = r["owner_user_id"] if r["era"] == "nfl.com" else ""
        keys[(r["era"], str(r["slot"]), owner)] = int(r["franchise_id"])
    return keys


# ---------- build ----------

def build(data, out):
    data, out = Path(data), Path(out)
    keys = franchise_keys(data)
    nfl = nfl_seasons(data)
    sleeper = sleeper_seasons(data)
    aliases = {int(r["roster_id"]): r for r in read_csv(data / "sleeper_aliases.csv")}

    def nfl_franchise(year, t):
        key = ("nfl.com", t["teamId"], t["ownerUserId"])
        if key not in keys:
            raise BuildError(f"{year} NFL.com team {t['teamId']} (owner {t['ownerUserId']}) "
                             "has no franchise in data/franchises.csv")
        return keys[key]

    def sleeper_franchise(year, roster_id):
        key = ("sleeper", str(roster_id), "")
        if key not in keys:
            raise BuildError(f"{year} Sleeper roster {roster_id} has no franchise in data/franchises.csv")
        return keys[key]

    seasons = []
    team_names = {}
    lines = []
    played = defaultdict(set)
    for year, lg in nfl.items():
        seasons.append((year, "nfl.com", len(lg["teams"])))
        order = lg.get("finalStandingsTeamIds") or []
        divisions = {d["divisionId"]: d.get("name") for d in (lg.get("divisions") or {}).values()}
        for t in lg["teams"].values():
            fid = nfl_franchise(year, t)
            played[fid].add(year)
            team_names[(fid, year)] = t["name"]
            s = _season_stats(t, year)
            lines.append((
                fid, year, int(s["wins"]), int(s["losses"]), int(s["ties"]),
                round(float(s["pts"]), 2), round(float(s["ptsAgainst"]), 2),
                divisions.get(t.get("divisionId")),
                int(s["playoffSeed"]) if s.get("playoffSeed") else None,
                s.get("playoffBracketType"),
                order.index(t["teamId"]) + 1 if t["teamId"] in order else None,
            ))
    sleeper_ids = {}
    for year, (lg, rosters) in sleeper.items():
        seasons.append((year, "sleeper", int(lg.get("total_rosters") or len(rosters))))
        for r in rosters:
            fid = sleeper_franchise(year, r["roster_id"])
            played[fid].add(year)
            sleeper_ids[fid] = r["roster_id"]

    if not seasons:
        raise BuildError(f"no seasons in {data}: is the archive imported? (see README)")
    try:
        formats = formatfile.load(data / "formats.yaml", {y: n for y, _, n in seasons})
    except formatfile.FormatError as e:
        raise BuildError(str(e)) from e
    regular_weeks = {y: formats[y].regular_season[1] for y in nfl}
    franchise_by_team_name = {(y, n): f for (f, y), n in team_names.items()}

    def franchise_of(year, name):
        if (year, name) not in franchise_by_team_name:
            raise BuildError(f"the {year} game log names {name!r}, but no team had that name in {year}")
        return franchise_by_team_name[(year, name)]

    games, postseason = gamelog.nfl_games(gamelog.read_log(data / "league_h2h.csv"), franchise_of,
                                          regular_weeks)
    playoff_teams = defaultdict(set)
    for year in sorted(nfl):
        seeds = {fid: seed for fid, y, *_, seed, bracket, _p in lines
                 if y == year and bracket == "championship"}
        placings = {fid: placing for fid, y, *_, placing in lines if y == year}
        playoffs = formats[year].brackets.get("playoffs")
        size = playoffs.size if playoffs else 0
        if len(seeds) != size:
            raise BuildError(f"data/formats.yaml gives {year} a {size}-team Playoffs, "
                             f"but NFL.com seeded {len(seeds)}")
        playoff_teams[year] = set(seeds)
        if not seeds:
            continue
        try:
            games += bracketlib.playoffs_games(year, seeds, placings, playoffs.weeks,
                                               postseason.get(year, {}))
        except bracketlib.BracketError as e:
            raise BuildError(str(e)) from e
    check_one_game_a_week(games)
    team_counts = {year: count for year, _, count in seasons}
    coverage = gamelog.coverage(games, team_counts, regular_weeks, playoff_teams)
    season_lines, disagreements = gamelog.season_lines(games, coverage, lines)
    if disagreements:
        raise BuildError("the games and NFL.com's reported season lines disagree (ADR 0001):\n  "
                         + "\n  ".join(disagreements))

    all_ids = sorted(set(keys.values()))
    current = max(year for year, _, _ in seasons)
    franchises = []
    for fid in all_ids:
        if not played[fid]:
            raise BuildError(f"franchise {fid} in data/franchises.csv never played a season")
        franchises.append((fid, franchise_name(fid, team_names, sleeper_ids, aliases),
                           int(current in played[fid]), min(played[fid]), max(played[fid])))
    check_against_sleeper_aliases(franchises, sleeper_ids, aliases)
    format_rows, bracket_rows = season_format_rows(formats)
    hand_kept = {b: read_optional_csv(data / table) for b, (table, _) in bracketlib.HAND_KEPT.items()}
    try:
        winners = bracketlib.winner_rows(games, formats, nfl, hand_kept,
                                         {name: fid for fid, name, *_ in franchises})
    except bracketlib.BracketError as e:
        raise BuildError(str(e)) from e
    documents =[(r["kind"], int(r["season"]) if r["season"] else None, r["title"], r["url"])
                 for r in read_optional_csv(data / "documents.csv")]

    if out.exists():
        out.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(out)
    try:
        con.executescript(SCHEMA)
        con.executemany("insert into seasons values (?, ?, ?)", sorted(seasons))
        con.executemany("insert into franchises values (?, ?, ?, ?, ?)", franchises)
        con.executemany("insert into team_names values (?, ?, ?)",
                        [(f, y, n) for (f, y), n in sorted(team_names.items())])
        con.executemany(f"insert into reported_season_lines values ({', '.join('?' * 11)})",
                        sorted(lines))
        games.sort(key=lambda g: (g.season, g.week, g.phase != "regular", g.home))
        con.executemany(f"insert into games ({', '.join(GAME_COLUMNS)}) "
                        f"values ({', '.join('?' * len(GAME_COLUMNS))})",
                        [astuple(g) for g in games])
        con.executemany("insert into coverage values (?, ?, ?, ?, ?, ?, ?)", coverage)
        con.executemany(f"insert into season_lines values ({', '.join('?' * 16)})",
                        sorted(season_lines))
        con.executemany("insert into season_formats values (?, ?, ?, ?, ?, ?)", format_rows)
        con.executemany("insert into season_brackets values (?, ?, ?, ?, ?, ?, ?)", bracket_rows)
        con.executemany("insert into documents values (?, ?, ?, ?)", documents)
        con.executemany("insert into bracket_winners values (?, ?, ?, ?)", winners)
        con.commit()
    finally:
        con.close()


def read_optional_csv(path):
    return read_csv(path) if path.exists() else []


def season_format_rows(formats):
    """Rows for season_formats and season_brackets."""
    rows, brackets = [], []
    for season, f in sorted(formats.items()):
        rows.append((season, f.divisions, *f.regular_season, f.realignment, f.tiebreaks))
        for b in f.brackets.values():
            brackets.append((season, b.name, b.size, b.first_week, b.last_week, b.series, b.seeding))
    return rows, brackets


def franchise_name(fid, team_names, sleeper_ids, aliases):
    """The last real team name the franchise played under.

    Sleeper-era team names aren't ingested yet, so a franchise that has only
    played on Sleeper takes the name ff-data-project gave its roster.
    """
    real = [n for (f, y), n in sorted(team_names.items(), key=lambda kv: kv[0][1])
            if f == fid and n not in PLACEHOLDER_NAMES]
    if real:
        return real[-1]
    roster = sleeper_ids.get(fid)
    if roster in aliases:
        return aliases[roster]["franchise"]
    raise BuildError(f"franchise {fid} has no team name that could be its franchise name")


def check_one_game_a_week(games):
    seen = set()
    for g in games:
        for fid in (g.home, g.away):
            if (g.season, g.week, fid) in seen:
                raise BuildError(f"{g.season} week {g.week}: franchise {fid} has more than one game")
            seen.add((g.season, g.week, fid))


def check_against_sleeper_aliases(franchises, sleeper_ids, aliases):
    """ff-data-project's sleeper_aliases.csv names the franchise behind each
    Sleeper roster. The franchise ids must make the same call (issue #20)."""
    names = {fid: name for fid, name, *_ in franchises}
    for fid, roster in sorted(sleeper_ids.items(), key=lambda kv: kv[1]):
        expected = aliases.get(roster, {}).get("franchise")
        if expected != names[fid]:
            raise BuildError(f"Sleeper roster {roster} is franchise {fid} ({names[fid]!r}), "
                             f"but data/sleeper_aliases.csv says {expected!r}")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--data", default="data", type=Path)
    p.add_argument("--out", default="build/league.sqlite", type=Path)
    args = p.parse_args(argv)
    build(args.data, args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
