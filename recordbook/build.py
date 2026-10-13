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

from recordbook import awards as awardlib
from recordbook import brackets as bracketlib
from recordbook import formats as formatfile
from recordbook import games as gamelog
from recordbook import profiles
from recordbook import records
from recordbook import season_records
from recordbook import sleeper as sleeperlib

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
-- Each season's highest and lowest score and biggest and narrowest winning
-- margin, over its games with a score. Every game level on a measure gets a
-- row. franchise_id is the scorer for a score, the winner for a margin.
create table season_highs_lows (
    season integer not null references seasons(year),
    measure text not null check (measure in
        ('highest_score', 'lowest_score', 'biggest_margin', 'narrowest_margin')),
    game_id integer not null references games(id),
    franchise_id integer not null references franchises(id),
    value real not null
);
create table bracket_winners (
    season integer not null references seasons(year),
    bracket text not null check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    franchise_id integer references franchises(id),
    source text not null check (source in ('derived', 'confirmed', 'recalled', 'disputed', 'unknown')),
    check ((franchise_id is null) = (source = 'unknown'))
);
-- Sleeper era only. A franchise's lineup in each week it played a game: the
-- starters by slot (slot_index from 1; an empty slot has no NFL player) and
-- the bench (slot 'BN'), with each NFL player's points (Sleeper ids).
create table lineups (
    season integer not null references seasons(year),
    week integer not null,
    franchise_id integer not null references franchises(id),
    slot text,
    slot_index integer,
    starter integer not null check (starter in (0, 1)),
    nfl_player_id text,
    points real
);
-- NFL players by Sleeper id, from the Sleeper players snapshots. Sleeper only
-- keeps the current state, so position and NFL team are the latest known;
-- null where no snapshot knows the NFL player.
create table nfl_players (
    id text primary key,
    name text,
    position text,
    nfl_team text
);
-- Sleeper era only. Completed trades, won waiver claims and free-agent
-- pickups (GLOSSARY.md: Transaction), with the NFL players each franchise
-- added and dropped, the draft picks and FAAB budget traded.
create table transactions (
    id text primary key,
    season integer not null references seasons(year),
    week integer not null,
    type text not null check (type in ('trade', 'waiver', 'free_agent')),
    created integer
);
create table transaction_moves (
    transaction_id text not null references transactions(id),
    franchise_id integer not null references franchises(id),
    nfl_player_id text not null,
    move text not null check (move in ('add', 'drop'))
);
create table transaction_picks (
    transaction_id text not null references transactions(id),
    pick_season integer not null,
    round integer not null,
    original_franchise_id integer not null references franchises(id),
    from_franchise_id integer not null references franchises(id),
    to_franchise_id integer not null references franchises(id)
);
create table transaction_budget (
    transaction_id text not null references transactions(id),
    from_franchise_id integer not null references franchises(id),
    to_franchise_id integer not null references franchises(id),
    amount integer not null
);
-- Every waiver claim, won or lost, with its bid (a lost claim is not a
-- transaction, so it has no transactions row).
create table waiver_claims (
    transaction_id text not null,
    season integer not null references seasons(year),
    week integer not null,
    franchise_id integer not null references franchises(id),
    nfl_player_id text not null,
    dropped_nfl_player_id text,
    bid integer,
    won integer not null check (won in (0, 1)),
    -- When Sleeper processed the claim: a waiver run's claims share it.
    processed integer
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


def _count(value):
    """An NFL.com count, or None where NFL.com didn't report one."""
    return None if value in (None, "") else int(value)


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
    nfl_moves = {}
    for year, lg in nfl.items():
        seasons.append((year, "nfl.com", len(lg["teams"])))
        order = lg.get("finalStandingsTeamIds") or []
        divisions = {d["divisionId"]: d.get("name") for d in (lg.get("divisions") or {}).values()}
        for t in lg["teams"].values():
            fid = nfl_franchise(year, t)
            played[fid].add(year)
            team_names[(fid, year)] = t["name"]
            s = _season_stats(t, year)
            nfl_moves[(year, fid)] = (_count(s.get("transactionAddCount")),
                                      _count(s.get("transactionTradeCount")))
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
        snapshot = sleeperlib.team_names(data / "sleeper", year)
        for r in rosters:
            rid = r["roster_id"]
            fid = sleeper_franchise(year, rid)
            played[fid].add(year)
            sleeper_ids[fid] = rid
            if rid not in aliases:
                raise BuildError(f"{year} Sleeper roster {rid} has no row in data/sleeper_aliases.csv")
            # Never the manager's display name: an unsnapshotted season takes
            # the name ff-data-project recorded for the roster.
            team_names[(fid, year)] = snapshot.get(rid) or aliases[rid]["sleeper_name"]

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
    try:
        assigned = sleeperlib.read_assignments(read_optional_csv(data / "sleeper_brackets.csv"))
        for year, (lg, _rosters) in sorted(sleeper.items()):
            games += sleeperlib.season_games(year, lg, sleeperlib.read_weeks(data / "sleeper", year),
                                             formats[year], lambda r, y=year: sleeper_franchise(y, r),
                                             assigned.get(year, {}))
    except sleeperlib.SleeperError as e:
        raise BuildError(str(e)) from e
    check_one_game_a_week(games)
    team_counts = {year: count for year, _, count in seasons}
    coverage = gamelog.coverage(games, team_counts, regular_weeks, playoff_teams)
    season_lines, disagreements = gamelog.season_lines(games, coverage, lines)
    if disagreements:
        raise BuildError("the games and NFL.com's reported season lines disagree (ADR 0001):\n  "
                         + "\n  ".join(disagreements))
    explained = sleeperlib.read_explanations(read_optional_csv(data / "sleeper_adjustments.csv"))
    problems = []
    for year, (lg, rosters) in sorted(sleeper.items()):
        coverage += sleeperlib.coverage(year, games, team_counts[year])
        of = lambda r, y=year: sleeper_franchise(y, r)  # noqa: E731
        lines_of_year = sleeperlib.season_lines(year, games, lg, rosters, of)
        problems += sleeperlib.cross_check(year, lg, rosters, lines_of_year, of, explained.get(year, {}))
        season_lines += lines_of_year
    if problems:
        raise BuildError("Sleeper's roster totals and the games disagree (ADR 0001, Sleeper era):\n  "
                         + "\n  ".join(problems))

    all_ids = sorted(set(keys.values()))
    current = max(year for year, _, _ in seasons)
    franchises = []
    for fid in all_ids:
        if not played[fid]:
            raise BuildError(f"franchise {fid} in data/franchises.csv never played a season")
        nfl_names = {k: n for k, n in team_names.items() if k[1] in nfl}
        franchises.append((fid, franchise_name(fid, nfl_names, sleeper_ids, aliases),
                           int(current in played[fid]), min(played[fid]), max(played[fid])))
    check_against_sleeper_aliases(franchises, sleeper_ids, aliases)
    format_rows, bracket_rows = season_format_rows(formats)
    hand_kept = {b: read_optional_csv(data / table) for b, (table, _) in bracketlib.HAND_KEPT.items()}
    try:
        winners = bracketlib.winner_rows([g for g in games if g.season in nfl], formats, nfl, hand_kept,
                                         {name: fid for fid, name, *_ in franchises})
    except bracketlib.BracketError as e:
        raise BuildError(str(e)) from e
    lineups = []
    moves = defaultdict(list)
    picks = []
    for year, (lg, _rosters) in sorted(sleeper.items()):
        of = lambda r, y=year: sleeper_franchise(y, r)  # noqa: E731
        winners += sleeperlib.crowns(year, games, formats[year])
        lineups += sleeperlib.lineups(year, lg, sleeperlib.read_weeks(data / "sleeper", year), games, of)
        for table, rows in sleeperlib.transactions(
                year, sleeperlib.read_transactions(data / "sleeper", year), of).items():
            moves[table] += rows
        picks += sleeperlib.draft_picks(data / "sleeper", year, of)
    documents = [(r["kind"], int(r["season"]) if r["season"] else None, r["title"], r["url"])
                 for r in read_optional_csv(data / "documents.csv")]
    games.sort(key=lambda g: (g.season, g.week, g.phase != "regular", g.home))
    highs_lows = [(season, measure, i + 1, fid, value)
                  for season, measure, i, fid, value in gamelog.highs_and_lows(games)]
    award_results, award_unknowns = awardlib.results(
        games=games, coverage=coverage, regular_weeks={y: f.regular_season for y, f in formats.items()},
        nfl_counts=nfl_moves, moves=moves, lineups=lineups, picks=picks,
        played={y: {f for f, ys in played.items() if y in ys} for y in sleeper},
        keepers=read_keepers(read_optional_csv(data / "keepers.csv")))

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
        con.executemany(f"insert into games (id, {', '.join(GAME_COLUMNS)}) "
                        f"values ({', '.join('?' * (len(GAME_COLUMNS) + 1))})",
                        [(i, *astuple(g)) for i, g in enumerate(games, start=1)])
        con.executemany("insert into season_highs_lows values (?, ?, ?, ?, ?)", highs_lows)
        con.executemany("insert into coverage values (?, ?, ?, ?, ?, ?, ?)", coverage)
        con.executemany(f"insert into season_lines values ({', '.join('?' * 16)})",
                        sorted(season_lines))
        con.executemany("insert into season_formats values (?, ?, ?, ?, ?, ?)", format_rows)
        con.executemany("insert into season_brackets values (?, ?, ?, ?, ?, ?, ?)", bracket_rows)
        con.executemany("insert into documents values (?, ?, ?, ?)", documents)
        con.executemany("insert into bracket_winners values (?, ?, ?, ?)", winners)
        con.executemany("insert into lineups values (?, ?, ?, ?, ?, ?, ?, ?)", lineups)
        con.executemany("insert into nfl_players values (?, ?, ?, ?)",
                        sleeperlib.nfl_players(data / "sleeper", lineups))
        for table, rows in moves.items():
            if rows:
                con.executemany(f"insert into {table} values ({', '.join('?' * len(rows[0]))})", rows)
        write_profiles(con, franchises, played, season_lines, winners, current, games, coverage)
        write_records(con, games, seasons, formats, played, current, winners)
        season_records.write(con, season_lines=season_lines, coverage=coverage, games=games,
                             winners=winners, formats=formats, seasons=seasons, played=played,
                             current=current)
        con.executescript(awardlib.SCHEMA)
        con.executemany("insert into awards values (?, ?, ?, ?, ?, ?)", awardlib.award_rows())
        con.executemany("insert into award_results values (?, ?, ?, ?, ?)", award_results)
        con.executemany("insert into award_unknowns values (?, ?, ?)", award_unknowns)
        con.commit()
    finally:
        con.close()


def write_profiles(con, franchises, played, season_lines, winners, current, games, coverage):
    """The franchise profile and head-to-head tables (#27)."""
    con.executescript(profiles.SCHEMA)
    con.executemany(f"insert into franchise_careers values ({', '.join('?' * 18)})",
                    profiles.career_rows(franchises, played, season_lines, winners, current))
    con.executemany(f"insert into head_to_head values ({', '.join('?' * 11)})",
                    profiles.head_to_head_rows(games, coverage, played))
    con.executemany("insert into franchise_best_worst values (?, ?, ?, ?, ?)",
                    profiles.best_worst_rows(profiles.game_scores(games)))


def write_records(con, games, seasons, formats, played, current, winners):
    """The candidates for the records Statsguru can't express (#30)."""
    eras = {year: era for year, era, _ in seasons}
    con.executescript(records.SCHEMA)
    con.executemany("insert into record_streaks values (?, ?, ?, ?, ?, ?, ?, ?)", records.streak_rows(
        games, eras, {y: f.regular_season[1] for y, f in formats.items()},
        {year: count for year, _, count in seasons}, played, current))
    con.executemany("insert into combined_scores values (?, ?)", records.combined_rows(games))
    crowned = {season for season, bracket, fid, _ in winners if bracket == "playoffs" and fid is not None}
    con.executemany("insert into completed_seasons values (?, ?, ?)",
                    records.completed_rows(played, eras, current, crowned))


def read_optional_csv(path):
    return read_csv(path) if path.exists() else []


def read_keepers(rows):
    """{season: {(franchise, NFL player)}} from the hand-kept keeper list
    (data/keepers.csv, #37), for the seasons it records."""
    out = defaultdict(set)
    for r in rows:
        out[int(r["season"])].add((int(r["franchise_id"]), r["nfl_player_id"].strip()))
    return dict(out)


def season_format_rows(formats):
    """Rows for season_formats and season_brackets."""
    rows, brackets = [], []
    for season, f in sorted(formats.items()):
        rows.append((season, f.divisions, *f.regular_season, f.realignment, f.tiebreaks))
        for b in f.brackets.values():
            brackets.append((season, b.name, b.size, b.first_week, b.last_week, b.series, b.seeding))
    return rows, brackets


def franchise_name(fid, team_names, sleeper_ids, aliases):
    """The last real NFL.com-era team name the franchise played under.

    Sleeper-era team names are recorded per season but don't rename
    franchises yet: the hand-kept tables and the golden test name franchises
    as ff-data-project does, so a franchise that has only played on Sleeper
    takes the name ff-data-project gave its roster. (Whether Sleeper names
    should rename franchises is a maintainer's call; see #25.)
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
