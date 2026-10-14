"""Records (#7, #30): the figures behind the records Statsguru can't express,
so the site only ranks and shows them (ADR 0004).

Streaks run over regular-season games only, across seasons: NFL.com-era Shit
Bowl and Mediocre Bowl games were never recorded, so a run over every game
could pass through games nobody can see. A week with no score is a gap: a run
that reaches one is marked, because it may continue into it.
"""
from collections import defaultdict

SCHEMA = """
-- Every maximal run of one franchise's consecutive regular-season games
-- (record 'winning' or 'losing') or weeks beating at least half the league
-- ('top_half', a level score counting half), across seasons, over all eras or
-- one. gap_before and gap_after are 1 where the week before or after the run
-- has no score for the franchise (top_half: not every score of the week), so
-- the run may have begun or may continue there.
create table record_streaks (
    record text not null check (record in ('winning', 'losing', 'top_half')),
    era text not null check (era in ('all', 'nfl.com', 'sleeper')),
    franchise_id integer not null references franchises(id),
    length integer not null,
    first_game_id integer not null references games(id),
    last_game_id integer not null references games(id),
    gap_before integer not null check (gap_before in (0, 1)),
    gap_after integer not null check (gap_after in (0, 1))
);
-- Both franchises' points together, for every game with a score.
create table combined_scores (
    game_id integer primary key references games(id),
    points real not null
);
-- Seasons a franchise has completed, over all eras or one: every finished
-- season it played (recordbook/current.py). Career
-- rates need at least 2 (#7).
create table completed_seasons (
    franchise_id integer not null references franchises(id),
    era text not null check (era in ('all', 'nfl.com', 'sleeper')),
    seasons integer not null,
    primary key (franchise_id, era)
);
"""

ERAS = ("all", "nfl.com", "sleeper")
GAP = None


def _in_era(era, season_era):
    return era == "all" or era == season_era


def streak_rows(games, season_eras, regular_weeks, team_counts, played, current):
    """record_streaks rows.

    games are the stored Game records (ids are 1-based positions), season_eras
    maps a season to its era, regular_weeks a season to its regular season's
    last week, team_counts a season to its team count, played a franchise to
    the seasons it played, and current is the current season.
    """
    regular = [(i, g) for i, g in enumerate(games, start=1)
               if g.phase == "regular" and g.status == "final"]
    mine = {}                       # (franchise, season, week) -> (game id, result, scored)
    week_scores = defaultdict(list)  # (season, week) -> [(franchise, points)]
    for gid, g in regular:
        scored = g.home_points is not None and g.away_points is not None
        for me, other in ((g.home, g.away), (g.away, g.home)):
            result = "T" if g.winner is None else "W" if g.winner == me else "L"
            mine[(me, g.season, g.week)] = (gid, result, scored)
        if scored:
            week_scores[(g.season, g.week)] += [(g.home, g.home_points), (g.away, g.away_points)]
    # The current season stops at its latest week with a final game; later
    # weeks aren't gaps, they haven't been played.
    last_week = dict(regular_weeks)
    last_week[current] = max((g.week for _, g in regular if g.season == current), default=0)

    def top_half(fid, season, week):
        scores = week_scores.get((season, week), [])
        if len(scores) != team_counts[season]:
            return GAP
        points = dict(scores)[fid]
        beaten = sum(1 if p < points else 0.5 if p == points else 0 for f, p in scores if f != fid)
        return beaten >= team_counts[season] / 2

    rows = []
    for fid in sorted(played):
        for era in ERAS:
            events = []   # (game id or None, result, top half or None)
            for season in sorted(played[fid]):
                if not _in_era(era, season_eras[season]):
                    continue
                for week in range(1, last_week.get(season, 0) + 1):
                    game = mine.get((fid, season, week))
                    if game is None or not game[2]:
                        events.append((None, GAP, GAP))
                    else:
                        events.append((game[0], game[1], top_half(fid, season, week)))
            for record, hit in (("winning", lambda e: e[1] == "W"), ("losing", lambda e: e[1] == "L"),
                                ("top_half", lambda e: e[2] is True)):
                for first, last in _runs(events, hit):
                    rows.append((record, era, fid, last - first + 1, events[first][0], events[last][0],
                                 int(first > 0 and _gap(events[first - 1], record)),
                                 int(last + 1 < len(events) and _gap(events[last + 1], record))))
    return rows


def _gap(event, record):
    return event[0] is None if record != "top_half" else event[2] is GAP


def _runs(events, hit):
    """(first, last) index pairs of each maximal run of events that hit."""
    start = None
    for n, e in enumerate(events):
        if hit(e):
            start = n if start is None else start
        elif start is not None:
            yield start, n - 1
            start = None
    if start is not None:
        yield start, len(events) - 1


def combined_rows(games):
    """combined_scores rows (game id, points) for every game with a score."""
    return [(i, round(g.home_points + g.away_points, 2)) for i, g in enumerate(games, start=1)
            if g.home_points is not None and g.away_points is not None]


def completed_rows(played, season_eras, finished):
    """completed_seasons rows; finished is the seasons that are over."""
    rows = []
    for fid in sorted(played):
        done = [s for s in played[fid] if s in finished]
        for era in ERAS:
            rows.append((fid, era, sum(1 for s in done if _in_era(era, season_eras[s]))))
    return rows
