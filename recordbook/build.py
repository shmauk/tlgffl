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
from recordbook import current as currentlib
from recordbook import divisions as divisionlib
from recordbook import franchises as franchiselib
from recordbook import formats as formatfile
from recordbook import games as gamelog
from recordbook import lineup_records
from recordbook import profiles
from recordbook import records
from recordbook import season_records
from recordbook import season_sets
from recordbook import sleeper as sleeperlib

LEAGUE = "1078038"

SCHEMA = """
-- name is the latest team name the franchise played under, Sleeper's
-- included. filed_name is the name the hand-kept tables and the golden test
-- know it by (recordbook/franchises.py), which a rename doesn't change.
create table franchises (
    id integer primary key,
    name text not null,
    active integer not null,
    first_season integer,
    last_season integer,
    filed_name text not null
);
create table seasons (
    year integer primary key,
    era text not null check (era in ('nfl.com', 'sleeper')),
    team_count integer not null,
    -- Over: before the current season, or the current one in its off-season
    -- (recordbook/current.py). A season in progress or still to start is not.
    finished integer not null check (finished in (0, 1))
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
    -- A tied knockout game's franchise that went on: the higher seed, as
    -- recorded in data/sleeper_brackets.csv (#43). Null for any other game.
    advanced_franchise_id integer references franchises(id),
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
-- Games the league leaves out of the records, from the hand-kept
-- data/record_exclusions.csv: the game, the franchise it is about and why. It
-- still counts for the standings and season totals, but not for the
-- single-game records, best and worst games, or a season's highs and lows.
create table record_exclusions (
    game_id integer primary key references games(id),
    franchise_id integer not null references franchises(id),
    reason text not null
);
-- Each season's highest and lowest score and biggest and narrowest winning
-- margin, over its games with a score that aren't left out of the records. Every game level on a measure gets a
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
-- Each franchise's run through each bracket it played in or was crowned by
-- (#43): the round it reached and how the run ended. A crowned franchise from
-- a hand-kept table has no round, and its source is the crown's.
create table bracket_runs (
    season integer not null references seasons(year),
    bracket text not null check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    franchise_id integer not null references franchises(id),
    round_reached integer,
    result text not null check (result in ('crowned', 'runner_up', 'out', 'alive')),
    source text not null check (source in ('derived', 'confirmed', 'recalled', 'disputed')),
    primary key (season, bracket, franchise_id)
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
-- Sleeper era only (#37). Every pick of a season's draft: the franchise whose
-- slot it was and the franchise that made it (they differ for a traded pick).
-- kept is 1 for a keeper (data/keepers.csv), 0 for a drafted NFL player, and
-- null while the season's keepers aren't recorded.
create table draft_picks (
    season integer not null references seasons(year),
    pick_no integer not null,
    round integer not null,
    draft_slot integer not null,
    slot_franchise_id integer not null references franchises(id),
    franchise_id integer not null references franchises(id),
    nfl_player_id text not null,
    kept integer check (kept in (0, 1)),
    primary key (season, pick_no)
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
-- Sleeper era only. Regular-season pairings scheduled but not yet final: the
-- seeding module's clinch marks need them (ADR 0005). Never games.
create table upcoming_games (
    season integer not null references seasons(year),
    week integer not null,
    home_franchise_id integer not null references franchises(id),
    away_franchise_id integer not null references franchises(id)
);
-- Sleeper era only. Pairings Sleeper has made in bracket weeks not yet final,
-- with their bracket and round: from data/sleeper_brackets.csv where it has a
-- row (filler is left out), else from the bracket games already played (a
-- franchise still in a bracket plays its next round). Null only before either
-- franchise has played a bracket game, which the seeds alone can place (the
-- seeding module, ADR 0005). Never games, never scores.
create table upcoming_bracket_pairings (
    season integer not null references seasons(year),
    week integer not null,
    home_franchise_id integer not null references franchises(id),
    away_franchise_id integer not null references franchises(id),
    bracket text check (bracket in ('playoffs', 'shit_bowl', 'mediocre_bowl')),
    round integer
);
-- Sleeper era only. When each season's draft starts (ms since the epoch, null
-- until Sleeper has a date) and its week 1 (the NFL season's start date, null
-- if no state snapshot saw it). The site picks the current season with them.
create table season_calendar (
    season integer primary key references seasons(year),
    draft_start integer,
    week1_date text
);
-- The date the build is for (the UK date, unless --today says otherwise): the
-- site's "Updated <date>" stamp, and the date the current season is chosen on.
create table build_date (
    today text not null
);
-- The current season (GLOSSARY.md) on the build date, and its phase: the one
-- definition, from recordbook/current.py. No row before any season has started. through is the latest final week, playing
-- the week being played (null in the off-season); in the off-season,
-- next_season is the next one if Sleeper has it, with its draft start.
create table current_season (
    season integer primary key references seasons(year),
    phase text not null check (phase in ('regular', 'brackets', 'off-season')),
    through integer,
    playing integer,
    next_season integer,
    next_draft_start integer
);
-- Scissors-paper-rock rulings, from the hand-kept data/scissors_paper_rock.csv:
-- each ruling orders the franchises it names, its winner at position 1. The
-- seeding module applies them; nobody else seeds Sleeper-era seasons.
create table scissors_paper_rock (
    season integer not null references seasons(year),
    ruling integer not null,
    position integer not null,
    franchise_id integer not null references franchises(id),
    primary key (season, ruling, position)
);
"""

GAME_COLUMNS = ("season", "week", "phase", "bracket", "round", "status", "home_franchise_id",
                "home_points", "away_franchise_id", "away_points", "winner_franchise_id",
                "advanced_franchise_id")

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


def team_counts(nfl, sleeper):
    """{season: teams played} from the NFL.com and Sleeper seasons."""
    return ({year: len(league["teams"]) for year, league in nfl.items()}
            | {year: int(league.get("total_rosters") or len(rosters))
               for year, (league, rosters) in sleeper.items()})


def sleeper_seasons(data):
    """{year: (league, rosters)} from the Sleeper snapshots."""
    out = {}
    for f in sorted((data / "sleeper").glob("*-league.json")):
        year = int(f.name[:4])
        rosters = json.loads((data / "sleeper" / f"{year}-rosters.json").read_text())
        out[year] = (json.loads(f.read_text()), rosters)
    return out


# ---------- build ----------

def build(data, out, today=None):
    """Write the database. today (YYYY-MM-DD, the UK date by default) is the
    date the current season is chosen on (recordbook/current.py)."""
    data, out = Path(data), Path(out)
    today = today or currentlib.uk_today()
    nfl = nfl_seasons(data)
    sleeper = sleeper_seasons(data)
    if not nfl and not sleeper:
        raise BuildError(f"no seasons in {data}: is the archive imported? (see README)")
    registry = franchiselib.load(data, nfl, sleeper)
    if registry.problems:
        raise BuildError("the franchises can't be told apart or named:\n  "
                         + "\n  ".join(registry.problems))
    team_names, played = registry.team_names, registry.played

    counts = team_counts(nfl, sleeper)
    seasons = []
    lines = []
    nfl_moves = {}
    for year, lg in nfl.items():
        seasons.append((year, "nfl.com", counts[year]))
        order = lg.get("finalStandingsTeamIds") or []
        divisions = {d["divisionId"]: d.get("name") for d in (lg.get("divisions") or {}).values()}
        for t in lg["teams"].values():
            fid = registry.nfl_team(t)
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
    seasons += [(year, "sleeper", counts[year]) for year in sleeper]
    try:
        formats = formatfile.load(data / "formats.yaml", counts)
    except formatfile.FormatError as e:
        raise BuildError(str(e)) from e
    regular_weeks = {y: formats[y].regular_season[1] for y in nfl}

    def franchise_of(year, name):
        if (fid := registry.team_named(year, name)) is None:
            raise BuildError(f"the {year} game log names {name!r}, but no team had that name in {year}")
        return fid

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
                                             formats[year], registry.roster,
                                             assigned.get(year, {}))
    except sleeperlib.SleeperError as e:
        raise BuildError(str(e)) from e
    check_one_game_a_week(games)
    coverage = gamelog.coverage(games, counts, regular_weeks, playoff_teams)
    season_lines, disagreements = gamelog.season_lines(games, coverage, lines)
    if disagreements:
        raise BuildError("the games and NFL.com's reported season lines disagree (ADR 0001):\n  "
                         + "\n  ".join(disagreements))
    explained = sleeperlib.read_explanations(read_optional_csv(data / "sleeper_adjustments.csv"))
    problems = []
    for year, (lg, rosters) in sorted(sleeper.items()):
        coverage += sleeperlib.coverage(year, games, counts[year])
        lines_of_year = sleeperlib.season_lines(year, games, lg, rosters, registry.roster)
        problems += sleeperlib.cross_check(year, lg, rosters, lines_of_year, registry.roster,
                                           explained.get(year, {}))
        season_lines += lines_of_year
    if problems:
        raise BuildError("Sleeper's roster totals and the games disagree (ADR 0001, Sleeper era):\n  "
                         + "\n  ".join(problems))
    check_team_names(team_names, games, season_lines)

    # Whether each is active is known once the current season is (below).
    franchises = [(fid, registry.filed_name(fid), None, min(played[fid]), max(played[fid]))
                  for fid in registry.ids]
    shown = {fid: registry.franchise_name(fid) for fid in registry.ids}
    by_name = {name: registry.named(name) for name in registry.names}
    format_rows, bracket_rows = season_format_rows(formats)
    hand_kept = {b: read_optional_csv(data / table) for b, (table, _) in bracketlib.HAND_KEPT.items()}
    try:
        winners = bracketlib.winner_rows([g for g in games if g.season in nfl], formats, nfl, hand_kept,
                                         by_name)
    except bracketlib.BracketError as e:
        raise BuildError(str(e)) from e
    rulings = scissors_paper_rock(read_optional_csv(data / "scissors_paper_rock.csv"), by_name)
    lineups = []
    moves = defaultdict(list)
    picks = []
    upcoming = []
    calendar = []
    upcoming_brackets = []
    for year, (lg, _rosters) in sorted(sleeper.items()):
        calendar.append(sleeperlib.calendar(data / "sleeper", year))
        upcoming_brackets += sleeperlib.upcoming_brackets(
            year, lg, sleeperlib.read_weeks(data / "sleeper", year), formats[year], registry.roster,
            assigned.get(year, {}), games)
        upcoming += sleeperlib.upcoming(year, lg, sleeperlib.read_weeks(data / "sleeper", year),
                                        formats[year], registry.roster)
        winners += sleeperlib.crowns(year, games, formats[year])
        lineups += sleeperlib.lineups(year, lg, sleeperlib.read_weeks(data / "sleeper", year), games,
                                      registry.roster)
        for table, rows in sleeperlib.transactions(
                year, sleeperlib.read_transactions(data / "sleeper", year), registry.roster).items():
            moves[table] += rows
        try:
            picks += sleeperlib.draft_picks(data / "sleeper", year, registry.roster)
        except sleeperlib.SleeperError as e:
            raise BuildError(str(e)) from e
    current = currentlib.current_season(season_states(formats, games, winners, calendar, set(nfl)), today)
    current_row = (current.season, current.phase, current.through, current.playing, current.next_season,
                   current.next_draft_start) if current else None
    franchises = [(fid, name, int(current is not None and current.season in played[fid]), first, last)
                  for fid, name, _active, first, last in franchises]
    done = currentlib.finished({year for year, _, _ in seasons}, current)
    documents = [(r["kind"], int(r["season"]) if r["season"] else None, r["title"], r["url"])
                 for r in read_optional_csv(data / "documents.csv")]
    games.sort(key=lambda g: (g.season, g.week, g.phase != "regular", g.home))
    exclusions = record_exclusions(read_optional_csv(data / "record_exclusions.csv"), games, by_name)
    excluded = {gid for gid, _, _ in exclusions}
    highs_lows = [(season, measure, i + 1, fid, value)
                  for season, measure, i, fid, value in gamelog.highs_and_lows(games, {i - 1 for i in excluded})]
    keepers = read_keepers(read_optional_csv(data / "keepers.csv"))
    # A season played without keepers has them all recorded: there are none.
    keepers |= {y: set() for y, f in formats.items() if not f.keepers}
    lineages = divisionlib.read_lineages(read_optional_csv(data / "division_lineages.csv"))
    try:
        lineage_rows = divisionlib.lineage_rows(lineages, season_lines, formats)
    except divisionlib.LineageError as e:
        raise BuildError(str(e)) from e
    award_inputs = dict(
        games=games, coverage=coverage, regular_weeks={y: f.regular_season for y, f in formats.items()},
        nfl_counts=nfl_moves, moves=moves, lineups=lineups,
        picks=[(season, fid, pid, False) for season, *_, fid, pid in picks],
        played={y: {f for f, ys in played.items() if y in ys} for y in sleeper},
        keepers=keepers)
    award_results, award_unknowns = awardlib.results(**award_inputs)
    award_leaders = awardlib.leaders(**award_inputs)

    if out.exists():
        out.unlink()
    out.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(out)
    try:
        con.executescript(SCHEMA)
        con.executemany("insert into seasons values (?, ?, ?, ?)",
                        [(year, era, count, int(year in done)) for year, era, count in sorted(seasons)])
        con.executemany("insert into franchises values (?, ?, ?, ?, ?, ?)",
                        [(fid, shown[fid], active, first, last, name)
                         for fid, name, active, first, last in franchises])
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
        con.executemany("insert into bracket_runs values (?, ?, ?, ?, ?, ?)",
                        bracketlib.run_rows(games, formats, winners))
        con.executemany("insert into lineups values (?, ?, ?, ?, ?, ?, ?, ?)", lineups)
        con.executemany("insert into upcoming_games values (?, ?, ?, ?)", upcoming)
        con.executemany("insert into season_calendar values (?, ?, ?)", calendar)
        if current_row:
            con.execute("insert into current_season values (?, ?, ?, ?, ?, ?)", current_row)
        con.execute("insert into build_date values (?)", (today,))
        con.executemany("insert into upcoming_bracket_pairings values (?, ?, ?, ?, ?, ?)", upcoming_brackets)
        con.executemany("insert into scissors_paper_rock values (?, ?, ?, ?)", rulings)
        con.executemany("insert into nfl_players values (?, ?, ?, ?)",
                        sleeperlib.nfl_players(data / "sleeper", lineups))
        con.executemany("insert into draft_picks values (?, ?, ?, ?, ?, ?, ?, ?)",
                        [(*p, kept(keepers, p)) for p in picks])
        for table, rows in moves.items():
            if rows:
                con.executemany(f"insert into {table} values ({', '.join('?' * len(rows[0]))})", rows)
        season = current.season if current else None
        con.executemany("insert into record_exclusions values (?, ?, ?)", exclusions)
        write_profiles(con, franchises, played, season_lines, winners, season, done, games, coverage, excluded)
        write_records(con, games, seasons, formats, played, season, done)
        write_division_records(con, lineage_rows, lineages, season_lines, done)
        write_lineup_records(con, lineups, games, lineup_records.player_names(data / "sleeper"), done)
        season_records.write(con, season_lines=season_lines, coverage=coverage, games=games,
                             winners=winners, formats=formats, seasons=seasons, played=played,
                             current=current, done=done)
        con.executescript(awardlib.SCHEMA)
        con.executemany("insert into awards values (?, ?, ?, ?, ?, ?, ?)", awardlib.award_rows())
        con.executemany("insert into award_results values (?, ?, ?, ?, ?)", award_results)
        con.executemany("insert into award_unknowns values (?, ?, ?)", award_unknowns)
        con.executemany("insert into award_leaders values (?, ?, ?, ?, ?)", award_leaders)
        con.commit()
    finally:
        con.close()


def write_profiles(con, franchises, played, season_lines, winners, current, done, games, coverage, excluded):
    """The franchise profile and head-to-head tables (#27)."""
    con.executescript(profiles.SCHEMA)
    con.executemany(f"insert into franchise_careers values ({', '.join('?' * 18)})",
                    profiles.career_rows(franchises, played, season_lines, winners, current, done))
    con.executemany(f"insert into head_to_head values ({', '.join('?' * 11)})",
                    profiles.head_to_head_rows(games, coverage, played))
    con.executemany("insert into franchise_best_worst values (?, ?, ?, ?, ?)",
                    profiles.best_worst_rows([s for s in profiles.game_scores(games) if s[0] not in excluded]))


def write_records(con, games, seasons, formats, played, current, done):
    """The candidates for the records Statsguru can't express (#30)."""
    sets = season_sets.season_sets(seasons)
    con.executescript(season_sets.SCHEMA)
    con.executemany("insert into season_sets values (?, ?)", season_sets.rows(sets))
    con.executescript(records.SCHEMA)
    con.executemany("insert into record_streaks values (?, ?, ?, ?, ?, ?, ?, ?)", records.streak_rows(
        games, sets, {y: f.regular_season[1] for y, f in formats.items()},
        {year: count for year, _, count in seasons}, played, current))
    con.executemany("insert into combined_scores values (?, ?)", records.combined_rows(games))
    con.executemany("insert into completed_seasons values (?, ?, ?)",
                    records.completed_rows(played, sets, done))


def season_states(formats, games, winners, calendar, reported):
    """Every season's progress (recordbook/current.py) from its format, its
    final games, the brackets it has crowned (an unknown NFL.com-era winner
    still closes its bracket) and the Sleeper calendar rows. reported is the
    NFL.com-era seasons, which are over."""
    weeks, crowned = defaultdict(set), defaultdict(set)
    for g in games:
        if g.status == "final":
            weeks[g.season].add(g.week)
    for season, bracket, _fid, _source in winners:
        crowned[season].add(bracket)
    dates = {season: (draft, week1) for season, draft, week1 in calendar}
    return [currentlib.SeasonState(season=season, week1=dates.get(season, (None, None))[1],
                                   draft_start=dates.get(season, (None, None))[0],
                                   regular_weeks=f.regular_season, final_weeks=sorted(weeks[season]),
                                   brackets=len(f.brackets), crowned=len(crowned[season]),
                                   reported=season in reported)
            for season, f in sorted(formats.items())]


def write_division_records(con, lineage_rows, lineages, season_lines, completed):
    """Division lineages and the division records (#32)."""
    con.executescript(divisionlib.SCHEMA)
    con.executemany("insert into division_lineages values (?, ?, ?)", lineage_rows)
    con.executemany(f"insert into record_divisions values ({', '.join('?' * 10)})",
                    divisionlib.record_rows(lineages, season_lines, completed))


def write_lineup_records(con, lineups, games, names, completed):
    """The Sleeper-era records from lineups (#32)."""
    con.executescript(lineup_records.SCHEMA)
    con.executemany("insert into record_player_scores values (?, ?, ?, ?, ?, ?, ?, ?)",
                    lineup_records.player_score_rows(lineups, games, names))
    bench = lineup_records.bench_game_rows(lineups, games)
    con.executemany("insert into record_bench_games values (?, ?, ?, ?, ?)", bench)
    con.executemany("insert into record_bench_seasons values (?, ?, ?, ?)",
                    lineup_records.bench_season_rows(bench, games, completed))


def read_optional_csv(path):
    return read_csv(path) if path.exists() else []


def read_keepers(rows):
    """{season: {(franchise, NFL player)}} from the hand-kept keeper list
    (data/keepers.csv, #37), for the seasons it records."""
    out = defaultdict(set)
    for r in rows:
        out[int(r["season"])].add((int(r["franchise_id"]), r["nfl_player_id"].strip()))
    return dict(out)


def kept(keepers, pick):
    """1 if a draft pick was a keeper, 0 if drafted, None while its season's
    keepers aren't recorded (a season with no keeper rows that formats.yaml
    doesn't say was played without keepers)."""
    season, *_, fid, pid = pick
    return None if season not in keepers else int((fid, pid) in keepers[season])


def season_format_rows(formats):
    """Rows for season_formats and season_brackets."""
    rows, brackets = [], []
    for season, f in sorted(formats.items()):
        rows.append((season, f.divisions, *f.regular_season, f.realignment, f.tiebreaks))
        for b in f.brackets.values():
            brackets.append((season, b.name, b.size, b.first_week, b.last_week, b.series, b.seeding))
    return rows, brackets


def record_exclusions(rows, games, by_name):
    """record_exclusions rows (game id, franchise, reason) from the hand-kept
    rows (season, week, franchise, reason), game ids being the stored games'
    1-based positions. Each must name a game with a score the franchise played."""
    out = []
    for r in rows:
        season, week, name = int(r["season"]), int(r["week"]), r["franchise"].strip()
        fid = by_name.get(name)
        if fid is None:
            raise BuildError(f"data/record_exclusions.csv: {name!r} is not a franchise name")
        found = [i for i, g in enumerate(games, start=1) if (g.season, g.week) == (season, week)
                 and fid in (g.home, g.away) and g.home_points is not None]
        if not found:
            raise BuildError(f"data/record_exclusions.csv: {name} played no game with a score "
                             f"in {season} week {week}")
        out.append((found[0], fid, r["reason"].strip()))
    return out


def check_team_names(team_names, games, season_lines):
    """Every franchise with a game or a season line in a season has a team
    name for it (ADR 0004), so the site can always show it as that season's
    team. A placeholder name (GLOSSARY.md) counts."""
    needed = {(fid, g.season) for g in games for fid in (g.home, g.away)}
    needed |= {(fid, season) for fid, season, *_ in season_lines}
    missing = sorted(k for k in needed if not team_names.get(k))
    if missing:
        raise BuildError("every franchise needs a team name for each season it plays:\n  " + "\n  ".join(
            f"franchise {fid} has a game or a season line in {season} but no team name" for fid, season in missing))


def check_one_game_a_week(games):
    seen = set()
    for g in games:
        for fid in (g.home, g.away):
            if (g.season, g.week, fid) in seen:
                raise BuildError(f"{g.season} week {g.week}: franchise {fid} has more than one game")
            seen.add((g.season, g.week, fid))


def scissors_paper_rock(rows, franchise_ids):
    """scissors_paper_rock rows (season, ruling, position, franchise) from the
    hand-kept rulings, each an order of franchise names ("A|B|C", winner
    first). Rulings are numbered within their season in file order."""
    out, count = [], defaultdict(int)
    for r in rows:
        season = int(r["season"])
        count[season] += 1
        for position, name in enumerate((n.strip() for n in r["order"].split("|")), start=1):
            if name not in franchise_ids:
                raise BuildError(f"data/scissors_paper_rock.csv: {season} ruling names {name!r}, "
                                 "which is not a franchise name")
            out.append((season, count[season], position, franchise_ids[name]))
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--data", default="data", type=Path)
    p.add_argument("--out", default="build/league.sqlite", type=Path)
    p.add_argument("--today", help="the date (YYYY-MM-DD) the current season is chosen on; "
                                   "the UK date by default")
    args = p.parse_args(argv)
    build(args.data, args.out, args.today)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
