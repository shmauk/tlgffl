"""Season, luck and bracket records (#7, #31): the figures behind them, so the
site only ranks and shows them (ADR 0004).

Season-line records leave out the season in progress until its regular season
ends (#16).
"""
from recordbook import season_sets
from recordbook.games import win_pct

SCHEMA = """
-- Every season line the season and luck records rank: all but the current
-- season's while its regular season is on (#16; recordbook/current.py). Rates count a
-- tie as half a win; Breakdown % and luck only exist for fully covered
-- seasons. reported is 1 where the line is NFL.com's reported one (ADR 0001).
create table record_seasons (
    franchise_id integer not null references franchises(id),
    season integer not null references seasons(year),
    games integer not null,
    wins integer not null,
    losses integer not null,
    ties integer not null,
    win_pct real,
    points_for real not null,
    points_against real not null,
    points_for_per_game real,
    points_against_per_game real,
    breakdown_pct real,
    luck real,
    reported integer not null check (reported in (0, 1)),
    primary key (franchise_id, season)
);
-- Each franchise's bracket tallies (#31) over the finished seasons (all but
-- the current season before its off-season), in each season set
-- (recordbook/season_sets.py): championships,
-- finals reached, Playoff appearances, Shit Bowl winner titles, Shit Bowl
-- appearances (Sleeper era only: NFL.com never recorded who played in it)
-- and Mediocre Bowl titles. A disputed or unknown winner counts for nobody.
-- seasons lists them, comma-separated.
create table record_tallies (
    record text not null check (record in ('championships', 'finals', 'playoffs',
        'shit_bowl_titles', 'shit_bowl', 'mediocre_bowl_titles')),
    season_set text not null,
    franchise_id integer not null references franchises(id),
    count integer not null,
    seasons text not null
);
-- Every maximal run of a franchise's consecutive finished seasons with a
-- Playoff appearance ('appearances') or without one ('drought'), in each
-- season set. ongoing is 1 where the run reaches the franchise's latest
-- finished season and it plays the current season, so the run may go on.
create table record_runs (
    record text not null check (record in ('appearances', 'drought')),
    season_set text not null,
    franchise_id integer not null references franchises(id),
    length integer not null,
    first_season integer not null,
    last_season integer not null,
    ongoing integer not null check (ongoing in (0, 1))
);
"""


def season_rows(season_lines, regular_on):
    """record_seasons rows from the season_lines rows; regular_on is the
    current season while its regular season is on (else None), left out."""
    rows = []
    for (fid, season, source, w, l, t, pf, pa, _div, _seed, _bracket, _placing,
         bdw, bdl, bdt, luck) in sorted(season_lines, key=lambda r: (r[1], r[0])):
        if season == regular_on:
            continue
        games = w + l + t
        rows.append((fid, season, games, w, l, t, win_pct(w, l, t), pf, pa,
                     round(pf / games, 2) if games else None, round(pa / games, 2) if games else None,
                     win_pct(bdw, bdl, bdt) if bdw is not None else None, luck,
                     int(source == "reported")))
    return rows


def bracket_seasons(season_lines, games, winners, formats, done):
    """{record: {franchise: set of seasons}} for every bracket tally, over the
    finished seasons. A disputed or unknown winner counts for nobody, and
    NFL.com never recorded who played in the Shit Bowl, so its appearances
    only come from the Sleeper era's bracket games."""
    out = {record: {} for record in TALLIES}

    def add(record, fid, season):
        if season in done:
            out[record].setdefault(fid, set()).add(season)

    titles = {"playoffs": "championships", "shit_bowl": "shit_bowl_titles",
              "mediocre_bowl": "mediocre_bowl_titles"}
    for season, bracket, fid, source in winners:
        if fid is not None and source != "disputed":
            add(titles[bracket], fid, season)
    for g in games:
        playoffs = formats[g.season].brackets.get("playoffs")
        if (g.bracket == "playoffs" and g.status == "final" and playoffs
                and g.week == max(playoffs.weeks)):
            add("finals", g.home, g.season)
            add("finals", g.away, g.season)
    for line in season_lines:
        fid, season, bracket = line[0], line[1], line[10]
        if bracket in ("championship", "playoffs"):
            add("playoffs", fid, season)
        elif bracket == "shit_bowl":
            add("shit_bowl", fid, season)
    return out


TALLIES = ("championships", "finals", "playoffs", "shit_bowl_titles", "shit_bowl", "mediocre_bowl_titles")


def tally_rows(by_record, sets):
    """record_tallies rows (record, season set, franchise, count, seasons);
    sets maps each season set to its seasons."""
    rows = []
    for record in TALLIES:
        for fid, seasons in sorted(by_record[record].items()):
            for key, members in sets.items():
                mine = sorted(s for s in seasons if s in members)
                if mine:
                    rows.append((record, key, fid, len(mine), ",".join(map(str, mine))))
    return rows


def run_rows(appeared, played, sets, current, done):
    """record_runs rows (record, season set, franchise, length, first, last, ongoing):
    every maximal run of a franchise's finished seasons with a Playoff
    appearance ('appearances') or without one ('drought'). appeared maps a
    franchise to its Playoffs seasons, played to every season it played. A
    run is ongoing if it reaches the franchise's latest finished season and
    the franchise plays the current season."""
    rows = []
    for fid in sorted(played):
        mine = sorted(s for s in played[fid] if s in done)
        if not mine:
            continue
        active = current in played[fid]
        for key, members in sets.items():
            seasons = [s for s in mine if s in members]
            runs = []   # (appeared, [seasons])
            for s in seasons:
                hit = s in appeared.get(fid, ())
                if runs and runs[-1][0] == hit and s == runs[-1][1][-1] + 1:
                    runs[-1][1].append(s)
                else:
                    runs.append((hit, [s]))
            for hit, run in runs:
                rows.append(("appearances" if hit else "drought", key, fid, len(run), run[0], run[-1],
                             int(active and run[-1] == mine[-1])))
    return rows


def write(con, *, season_lines, coverage, games, winners, formats, seasons, played, current, done):
    """Write the tables, from what build.py has built. current is the
    current season (recordbook/current.py) or None, done the finished seasons."""
    sets = season_sets.season_sets(seasons)
    regular_on = current.season if current and current.phase == "regular" else None
    con.executescript(SCHEMA)
    con.executemany(f"insert into record_seasons values ({', '.join('?' * 14)})",
                    season_rows(season_lines, regular_on))
    by_record = bracket_seasons(season_lines, games, winners, formats, done)
    con.executemany("insert into record_tallies values (?, ?, ?, ?, ?)", tally_rows(by_record, sets))
    con.executemany("insert into record_runs values (?, ?, ?, ?, ?, ?, ?)",
                    run_rows(by_record["playoffs"], played, sets, current and current.season, done))
