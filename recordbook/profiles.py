"""Franchise profiles and head-to-head (#27): the figures the profile and pair
pages show, so the site only reads them (ADR 0004).
"""
from collections import defaultdict

from recordbook.games import win_pct

SCHEMA = """
-- A franchise's career (#7's profile summary), summed from its season lines
-- (ADR 0001), so it covers every season, reported or derived. Rates count a
-- tie as half a win. Breakdown only exists for fully covered seasons, so its
-- rate is over breakdown_seasons of them, and null if there are none.
-- Championships and Shit Bowl winner titles leave disputed outcomes out.
create table franchise_careers (
    franchise_id integer primary key references franchises(id),
    seasons integer not null,
    current_division text,
    wins integer not null,
    losses integer not null,
    ties integer not null,
    points_for real not null,
    points_against real not null,
    win_pct real,
    points_for_per_game real,
    points_against_per_game real,
    breakdown_wins integer,
    breakdown_losses integer,
    breakdown_ties integer,
    breakdown_seasons integer not null,
    breakdown_pct real,
    championships integer not null,
    shit_bowls integer not null
);
-- Every pair of franchises that has met, lower id first, over all their
-- games. A game whose score is lost counts its result but not its points, so
-- points are over scored_games. games_missing is 1 where both franchises
-- played a season with regular-season games missing (ADR 0001), so they may
-- have met more often than is known.
create table head_to_head (
    lo_franchise_id integer not null references franchises(id),
    hi_franchise_id integer not null references franchises(id),
    games integer not null,
    lo_wins integer not null,
    hi_wins integer not null,
    ties integer not null,
    lo_points real not null,
    hi_points real not null,
    scored_games integer not null,
    bracket_games integer not null,
    games_missing integer not null check (games_missing in (0, 1)),
    primary key (lo_franchise_id, hi_franchise_id),
    check (lo_franchise_id < hi_franchise_id)
);
-- Each franchise's highest ('best') and lowest ('worst') scores over its
-- games with a score: the top five, plus any game level with fifth. Ranks are
-- shared by level scores (1, 2, 2, 4).
create table franchise_best_worst (
    franchise_id integer not null references franchises(id),
    measure text not null check (measure in ('best', 'worst')),
    rank integer not null,
    game_id integer not null references games(id),
    points real not null
);
"""

TOP = 5


def career_rows(franchises, played, season_lines, winners, current):
    """franchise_careers rows.

    franchises are (id, name, active, first, last) rows, played maps a
    franchise to the seasons it played, season_lines and winners are the
    season_lines and bracket_winners rows, and current is the current season.
    """
    lines = defaultdict(list)
    for row in season_lines:
        lines[row[0]].append(row)
    crowns = defaultdict(lambda: defaultdict(int))
    for _season, bracket, fid, source in winners:
        if fid is not None and source != "disputed":
            crowns[fid][bracket] += 1
    rows = []
    for fid, *_ in franchises:
        w = l = t = 0
        pf = pa = 0.0
        bw = bl = bt = covered = 0
        division = None
        for (_f, season, _source, lw, ll, lt, lpf, lpa, ldiv, _seed, _bracket, _placing,
             bdw, bdl, bdt, _luck) in lines[fid]:
            w, l, t, pf, pa = w + lw, l + ll, t + lt, pf + lpf, pa + lpa
            if bdw is not None:
                bw, bl, bt, covered = bw + bdw, bl + bdl, bt + bdt, covered + 1
            if season == current:
                division = ldiv
        games = w + l + t
        rows.append((
            fid, len(played[fid]), division, w, l, t, round(pf, 2), round(pa, 2),
            win_pct(w, l, t), pf / games if games else None, pa / games if games else None,
            *((bw, bl, bt) if covered else (None, None, None)), covered,
            win_pct(bw, bl, bt) if covered else None,
            crowns[fid]["playoffs"], crowns[fid]["shit_bowl"],
        ))
    return rows


def head_to_head_rows(games, coverage, played):
    """head_to_head rows from the stored games (Game records), the coverage
    rows and {franchise: seasons played}."""
    gap_seasons = {season for season, _w, phase, _b, _e, _f, complete in coverage
                   if phase == "regular" and not complete}
    pairs = defaultdict(lambda: [0, 0, 0, 0, 0.0, 0.0, 0, 0])
    for g in games:
        if g.status != "final":
            continue
        lo, hi = sorted((g.home, g.away))
        acc = pairs[(lo, hi)]
        acc[0] += 1
        acc[1 if g.winner == lo else 2 if g.winner == hi else 3] += 1
        if g.home_points is not None:
            points = {g.home: g.home_points, g.away: g.away_points}
            acc[4] += points[lo]
            acc[5] += points[hi]
            acc[6] += 1
        acc[7] += g.phase == "bracket"
    rows = []
    for (lo, hi), (n, lw, hw, t, lp, hp, scored, bracket) in sorted(pairs.items()):
        missing = bool(played[lo] & played[hi] & gap_seasons)
        rows.append((lo, hi, n, lw, hw, t, round(lp, 2), round(hp, 2), scored, bracket, int(missing)))
    return rows


def game_scores(games):
    """(game id, franchise, points) for every score of the stored games, the
    game id being its 1-based position, as build.py stores them."""
    return [(i, fid, pts) for i, g in enumerate(games, start=1) if g.home_points is not None
            for fid, pts in ((g.home, g.home_points), (g.away, g.away_points))]


def best_worst_rows(scores):
    """franchise_best_worst rows (franchise, measure, rank, game id, points)
    from (game id, franchise, points) scores."""
    by_franchise = defaultdict(list)
    for gid, fid, pts in scores:
        by_franchise[fid].append((gid, pts))
    rows = []
    for fid, mine in sorted(by_franchise.items()):
        for measure, sign in (("best", -1), ("worst", 1)):
            ranked = sorted(mine, key=lambda s: (sign * s[1], s[0]))
            for n, (gid, pts) in enumerate(ranked):
                rank = n + 1 if n == 0 or ranked[n - 1][1] != pts else rows[-1][2]
                if rank > TOP:
                    break
                rows.append((fid, measure, rank, gid, pts))
    return rows
