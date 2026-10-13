"""Season, luck and bracket records (#7, #31): the figures behind them, so the
site only ranks and shows them (ADR 0004).

Season-line records leave out the season in progress until its regular season
ends (#16).
"""
from recordbook.games import win_pct

SCHEMA = """
-- Every season line the season and luck records rank: all but a current
-- season whose last regular-season week isn't final yet (#16). Rates count a
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
-- Each franchise's bracket tallies (#31) over the finished seasons (all but a
-- current one with no champion yet), over all eras or one: championships,
-- finals reached, Playoff appearances, Shit Bowl winner titles, Shit Bowl
-- appearances (Sleeper era only: NFL.com never recorded who played in it)
-- and Mediocre Bowl titles. A disputed or unknown winner counts for nobody.
-- seasons lists them, comma-separated.
create table record_tallies (
    record text not null check (record in ('championships', 'finals', 'playoffs',
        'shit_bowl_titles', 'shit_bowl', 'mediocre_bowl_titles')),
    era text not null check (era in ('all', 'nfl.com', 'sleeper')),
    franchise_id integer not null references franchises(id),
    count integer not null,
    seasons text not null
);
-- Every maximal run of a franchise's consecutive finished seasons with a
-- Playoff appearance ('appearances') or without one ('drought'), over all
-- eras or one. ongoing is 1 where the run reaches the franchise's latest
-- finished season and it plays the current season, so the run may go on.
create table record_runs (
    record text not null check (record in ('appearances', 'drought')),
    era text not null check (era in ('all', 'nfl.com', 'sleeper')),
    franchise_id integer not null references franchises(id),
    length integer not null,
    first_season integer not null,
    last_season integer not null,
    ongoing integer not null check (ongoing in (0, 1))
);
"""


def regular_season_over(season, current, regular_last, games):
    """Whether a season's regular season has ended: every season but the
    current one has, and the current one once its last regular-season week
    is final (Sleeper finalises a week's games together)."""
    return season != current or any(
        g.season == season and g.phase == "regular" and g.week == regular_last and g.status == "final"
        for g in games)


def season_rows(season_lines, current, regular_last, games):
    """record_seasons rows from the season_lines rows and the stored games;
    regular_last maps a season to its regular season's last week."""
    over = {season: regular_season_over(season, current, regular_last[season], games)
            for season in {r[1] for r in season_lines}}
    rows = []
    for (fid, season, source, w, l, t, pf, pa, _div, _seed, _bracket, _placing,
         bdw, bdl, bdt, luck) in sorted(season_lines, key=lambda r: (r[1], r[0])):
        if not over[season]:
            continue
        games = w + l + t
        rows.append((fid, season, games, w, l, t, win_pct(w, l, t), pf, pa,
                     round(pf / games, 2) if games else None, round(pa / games, 2) if games else None,
                     win_pct(bdw, bdl, bdt) if bdw is not None else None, luck,
                     int(source == "reported")))
    return rows


def finished(seasons, current, winners):
    """The seasons whose brackets are over: all but a current one with no champion yet."""
    crowned = {s for s, bracket, fid, _ in winners if bracket == "playoffs" and fid is not None}
    return {s for s in seasons if s != current or s in crowned}


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


def tally_rows(by_record, season_eras):
    """record_tallies rows (record, era, franchise, count, seasons)."""
    rows = []
    for record in TALLIES:
        for fid, seasons in sorted(by_record[record].items()):
            for era in ERAS:
                mine = sorted(s for s in seasons if era == "all" or season_eras[s] == era)
                if mine:
                    rows.append((record, era, fid, len(mine), ",".join(map(str, mine))))
    return rows


ERAS = ("all", "nfl.com", "sleeper")


def run_rows(appeared, played, season_eras, current, done):
    """record_runs rows (record, era, franchise, length, first, last, ongoing):
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
        for era in ERAS:
            seasons = [s for s in mine if era == "all" or season_eras[s] == era]
            runs = []   # (appeared, [seasons])
            for s in seasons:
                hit = s in appeared.get(fid, ())
                if runs and runs[-1][0] == hit and s == runs[-1][1][-1] + 1:
                    runs[-1][1].append(s)
                else:
                    runs.append((hit, [s]))
            for hit, run in runs:
                rows.append(("appearances" if hit else "drought", era, fid, len(run), run[0], run[-1],
                             int(active and run[-1] == mine[-1])))
    return rows


def write(con, *, season_lines, coverage, games, winners, formats, seasons, played, current):
    """Write the tables, from what build.py has built."""
    regular_last = {y: f.regular_season[1] for y, f in formats.items()}
    eras = {year: era for year, era, _ in seasons}
    done = finished(eras, current, winners)
    con.executescript(SCHEMA)
    con.executemany(f"insert into record_seasons values ({', '.join('?' * 14)})",
                    season_rows(season_lines, current, regular_last, games))
    by_record = bracket_seasons(season_lines, games, winners, formats, done)
    con.executemany("insert into record_tallies values (?, ?, ?, ?, ?)", tally_rows(by_record, eras))
    con.executemany("insert into record_runs values (?, ?, ?, ?, ?, ?, ?)",
                    run_rows(by_record["playoffs"], played, eras, current, done))
