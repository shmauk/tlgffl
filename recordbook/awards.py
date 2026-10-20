"""The awards (#8, #33): nine light-hearted per-season titles, each with a
fixed formula, reimplemented from their written definitions.

Each award goes to a franchise per season, over the regular season only, and
is decided when the regular season ends; tied franchises are co-winners. An
award result is (award, season, franchise, value, rank). A franchise with no
value for an award (it missed the qualifying minimum, or the data has none) has
no result: absent, never zero.
"""
import statistics
from collections import defaultdict
from dataclasses import dataclass

# Values level to this many decimal places share a rank.
PRECISION = 6


SCHEMA = """
-- The awards (#8), in the order the site lists them. unit says how a value
-- reads: 'points', 'count', 'share' (a fraction) or 'dollars' (FAAB).
-- measure says, in a few words and with its unit, what a value is.
-- lowest_wins is 1 where the smallest value ranks first.
create table awards (
    slug text primary key,
    position integer not null unique,
    name text not null,
    definition text not null,
    measure text not null,
    unit text not null check (unit in ('points', 'count', 'share', 'dollars')),
    lowest_wins integer not null check (lowest_wins in (0, 1))
);
-- One franchise's value and rank for one award in one season. Level values
-- share a rank, so every rank-1 franchise is a winner. A franchise with no
-- value has no row: absent, never zero.
create table award_results (
    award text not null references awards(slug),
    season integer not null references seasons(year),
    franchise_id integer not null references franchises(id),
    value real not null,
    rank integer not null,
    primary key (award, season, franchise_id)
);
-- The award leaders (GLOSSARY.md): like award_results, for a regular season
-- still being played, over its weeks final so far. Rank 1 leads.
create table award_leaders (
    award text not null references awards(slug),
    season integer not null references seasons(year),
    franchise_id integer not null references franchises(id),
    value real not null,
    rank integer not null,
    primary key (award, season, franchise_id)
);
-- A season an award is due for but can't be decided yet from the data, and why.
create table award_unknowns (
    award text not null references awards(slug),
    season integer not null references seasons(year),
    reason text not null,
    primary key (award, season)
);
"""


@dataclass(frozen=True)
class Award:
    slug: str
    name: str
    unit: str
    lowest_wins: bool
    measure: str
    definition: str


GAMES_NOTE = ("Regular-season games only, and only in seasons where every one of them survives "
              "(no partial seasons).")
SLEEPER_NOTE = "Sleeper era only (2025 on): no earlier data records it."
AWARDS = [
    Award("nail-biter", "Nail Biter", "points", True, "Average margin (points)",
          f"The smallest average absolute margin over its games. {GAMES_NOTE}"),
    Award("standard-deviation", "Standard Deviation", "points", False, "Spread of scores (points)",
          f"The highest sample standard deviation (n−1) of its game scores. {GAMES_NOTE}"),
    Award("heartbreaker", "Heartbreaker", "points", False, "Average score in losses (points)",
          f"The highest average score in its losses, with at least 3 losses. {GAMES_NOTE}"),
    Award("lucky-duck", "Lucky Duck", "points", True, "Average score in wins (points)",
          f"The lowest average score in its wins, with at least 3 wins. {GAMES_NOTE}"),
    Award("pick-a-lane", "Pick a Lane", "count", False, "Adds plus trades",
          "The most adds plus trades, each trade counting once for every franchise in it. "
          "Sleeper era: regular season only, adds being the NFL players gained by won waiver claims "
          "and free-agent pickups. NFL.com era: NFL.com's whole-season add and trade counts. "
          "The two eras' figures aren't compared."),
    Award("one-man-army", "One-Man Army", "share", False, "Best player's share of starters' points",
          "The highest share of its starters' points scored by its single best NFL player, summed "
          f"over the regular-season weeks it started them. {SLEEPER_NOTE}"),
    Award("draft-dodger", "Draft Dodger", "count", True, "Own draft picks still rostered",
          "The fewest NFL players it drafted that season with its own picks (traded-for picks "
          "included, keepers excluded) still on its roster at the end of the regular season. "
          f"{SLEEPER_NOTE}"),
    Award("highest-failed-bid", "Highest failed bid", "dollars", False,
          "Biggest losing waiver bid (FAAB)",
          f"The biggest regular-season bid that lost a waiver claim. {SLEEPER_NOTE}"),
    Award("most-overpaid", "Most overpaid", "dollars", False,
          "Winning bid over next-highest (FAAB)",
          "The biggest gap between a winning regular-season waiver bid and the next-highest bid "
          "for the same NFL player in the same waiver run ($0 if nobody else bid). "
          f"{SLEEPER_NOTE}"),
]
BY_SLUG = {a.slug: a for a in AWARDS}

MIN_LOSSES = MIN_WINS = 3
KEEPERS_UNKNOWN = "The season's keepers aren't recorded yet, so its draft picks can't be told from its keepers."


def award_rows():
    """Rows for the awards table."""
    return [(a.slug, n, a.name, a.definition, a.measure, a.unit, int(a.lowest_wins))
            for n, a in enumerate(AWARDS, start=1)]


def results(*, games, coverage, regular_weeks, nfl_counts, moves, played, lineups, picks, keepers):
    """award_results and award_unknowns rows.

    regular_weeks: {season: (first, last)}; nfl_counts: {(season, franchise):
    (adds, trades)} as NFL.com reported them; moves: the Sleeper transaction
    tables (sleeper.transactions); played: {Sleeper season: franchises};
    lineups: lineups rows; picks: (season, franchise that made the pick, NFL
    player, keeper flag) for each Sleeper draft pick; keepers: {season:
    {(franchise, NFL player)}}, for the seasons whose keepers are recorded.
    """
    over = regular_seasons_over(coverage, regular_weeks)
    covered = regular_seasons_covered(coverage, regular_weeks)
    drafted = {season for season, *_ in picks}
    known = over & set(keepers)
    claims = moves.get("waiver_claims", [])
    values = {
        "nail-biter": nail_biter(games, covered),
        "standard-deviation": standard_deviation(games, covered),
        "heartbreaker": heartbreaker(games, covered),
        "lucky-duck": lucky_duck(games, covered),
        "pick-a-lane": pick_a_lane(nfl_counts, moves, played, regular_weeks, over),
        "one-man-army": one_man_army(lineups, regular_weeks, over),
        "draft-dodger": draft_dodger(picks, keepers, lineups, regular_weeks, known & drafted),
        "highest-failed-bid": highest_failed_bid(claims, regular_weeks, over),
        "most-overpaid": most_overpaid(claims, regular_weeks, over),
    }
    rows = [row for a in AWARDS for row in ranked(a.slug, values[a.slug])]
    unknowns = [("draft-dodger", season, KEEPERS_UNKNOWN) for season in sorted((over & drafted) - known)]
    return rows, unknowns


def leaders(*, coverage, regular_weeks, **inputs):
    """award_leaders rows: each award's formula over the regular-season weeks
    final so far, for each season whose regular season is still being played
    (the same inputs as results). Nothing is decided by them."""
    weeks = _regular_weeks_final(coverage, regular_weeks)
    over = regular_seasons_over(coverage, regular_weeks)
    so_far = {season: (first, max(weeks[season])) for season, (first, _last) in regular_weeks.items()
              if season not in over and weeks.get(season)}
    if not so_far:
        return []
    rows, _unknowns = results(coverage=coverage, regular_weeks=so_far, **inputs)
    return [r for r in rows if r[1] in so_far]


def ranked(slug, values):
    """Award-result rows (award, season, franchise, value, rank) from
    {(season, franchise): value}, ranked within each season. Level values
    share a rank (1, 1, 3), so level firsts are co-winners."""
    sign = 1 if BY_SLUG[slug].lowest_wins else -1
    by_season = defaultdict(list)
    for (season, fid), value in values.items():
        by_season[season].append((sign * round(value, PRECISION), fid, value))
    rows = []
    for season, entries in sorted(by_season.items()):
        entries.sort()
        rank = 0
        for n, (key, fid, value) in enumerate(entries):
            if n == 0 or key != entries[n - 1][0]:
                rank = n + 1
            rows.append((slug, season, fid, value, rank))
    return rows


def _regular_weeks_final(coverage, regular_weeks):
    """{season: {week: complete}} for the regular-season weeks with coverage."""
    out = defaultdict(dict)
    for season, week, phase, _bracket, _expected, _final, complete in coverage:
        if phase == "regular":
            out[season][week] = bool(complete)
    return out


def regular_seasons_over(coverage, regular_weeks):
    """Seasons whose every regular-season week (regular_weeks: {season: (first,
    last)}) has been played, scores surviving or not: their awards are decided."""
    weeks = _regular_weeks_final(coverage, regular_weeks)
    return {season for season, (first, last) in regular_weeks.items()
            if all(w in weeks[season] for w in range(first, last + 1))}


def regular_seasons_covered(coverage, regular_weeks):
    """Seasons that are over with every regular-season game surviving: only
    these have game-based awards (no partial seasons)."""
    weeks = _regular_weeks_final(coverage, regular_weeks)
    return {season for season in regular_seasons_over(coverage, regular_weeks)
            if all(weeks[season].values())}


def _regular(games, seasons):
    """(season, franchise, points, opponent's points) for each franchise in
    each scored regular-season game of the seasons."""
    for g in games:
        if g.phase != "regular" or g.status != "final" or g.season not in seasons or g.home_points is None:
            continue
        yield g.season, g.home, g.home_points, g.away_points
        yield g.season, g.away, g.away_points, g.home_points


def nail_biter(games, seasons):
    """{(season, franchise): average absolute margin} over regular-season games."""
    margins = defaultdict(list)
    for season, fid, mine, theirs in _regular(games, seasons):
        margins[(season, fid)].append(abs(mine - theirs))
    return {k: statistics.fmean(v) for k, v in margins.items()}


def standard_deviation(games, seasons):
    """{(season, franchise): sample standard deviation of its scores}."""
    scores = defaultdict(list)
    for season, fid, mine, _theirs in _regular(games, seasons):
        scores[(season, fid)].append(mine)
    return {k: statistics.stdev(v) for k, v in scores.items() if len(v) > 1}


def _average_in(games, seasons, won, minimum):
    scores = defaultdict(list)
    for season, fid, mine, theirs in _regular(games, seasons):
        if (mine > theirs) if won else (mine < theirs):
            scores[(season, fid)].append(mine)
    return {k: statistics.fmean(v) for k, v in scores.items() if len(v) >= minimum}


def heartbreaker(games, seasons):
    """{(season, franchise): average score in losses}, at least 3 losses."""
    return _average_in(games, seasons, False, MIN_LOSSES)


def lucky_duck(games, seasons):
    """{(season, franchise): average score in wins}, at least 3 wins."""
    return _average_in(games, seasons, True, MIN_WINS)


def _regular_transactions(moves, seasons, regular_weeks):
    """{transaction id: type} for the completed transactions in the regular
    season of the given seasons."""
    out = {}
    for tid, season, week, kind, _created in moves.get("transactions", []):
        first, last = regular_weeks.get(season, (0, -1))
        if season in seasons and first <= week <= last:
            out[tid] = (season, kind)
    return out


def pick_a_lane(nfl_counts, moves, played, regular_weeks, seasons):
    """{(season, franchise): adds + trades}.

    NFL.com era: nfl_counts {(season, franchise): (adds, trades)} as NFL.com
    reported them for the whole season (a missing count gives no value).
    Sleeper era: from the transaction tables (sleeper.transactions), regular
    season only. Adds are the NFL players gained by won waiver claims and
    free-agent pickups; a trade counts once for each franchise in it. played
    maps a Sleeper season to its franchises, which start from zero.
    """
    out = {}
    for (season, fid), (adds, trades) in nfl_counts.items():
        if season in seasons and adds is not None and trades is not None:
            out[(season, fid)] = adds + trades
    regular = _regular_transactions(moves, seasons, regular_weeks)
    counts = defaultdict(int)
    for season in seasons & set(played):
        for fid in played[season]:
            counts[(season, fid)] = 0
    trades = set()
    for tid, fid, _pid, move in moves.get("transaction_moves", []):
        if tid not in regular:
            continue
        season, kind = regular[tid]
        if kind == "trade":
            trades.add((tid, season, fid))
        elif move == "add":
            counts[(season, fid)] += 1
    sides = ([(tid, sender, receiver) for tid, _s, _r, _o, sender, receiver in moves.get("transaction_picks", [])]
             + [(tid, sender, receiver) for tid, sender, receiver, _amount in moves.get("transaction_budget", [])])
    for tid, sender, receiver in sides:
        if tid in regular:
            trades |= {(tid, regular[tid][0], sender), (tid, regular[tid][0], receiver)}
    for _tid, season, fid in trades:
        counts[(season, fid)] += 1
    out.update(counts)
    return out


def _in_regular_season(season, week, seasons, regular_weeks):
    first, last = regular_weeks.get(season, (0, -1))
    return season in seasons and first <= week <= last


def one_man_army(lineups, regular_weeks, seasons):
    """{(season, franchise): the best NFL player's share of its starter points}.

    From the lineups rows (season, week, franchise, slot, slot index, starter,
    NFL player, points), regular season only: each NFL player's points summed
    over the weeks the franchise started them, the best of them over all the
    franchise's starter points. No starter points, no value.
    """
    total = defaultdict(float)
    by_player = defaultdict(lambda: defaultdict(float))
    for season, week, fid, _slot, _index, starter, pid, points in lineups:
        if not starter or pid is None or not _in_regular_season(season, week, seasons, regular_weeks):
            continue
        total[(season, fid)] += points or 0.0
        by_player[(season, fid)][pid] += points or 0.0
    return {k: max(by_player[k].values()) / t for k, t in total.items() if t > 0}


def draft_dodger(picks, keepers, lineups, regular_weeks, seasons):
    """{(season, franchise): NFL players it drafted still rostered when the
    regular season ends}.

    picks are (season, franchise that made the pick, NFL player, Sleeper's
    keeper flag): a franchise's own picks include those it traded for.
    Keepers ({season: {(franchise, NFL player)}}, or flagged by Sleeper) are
    excluded. The roster at the end of the regular season is the franchise's
    lineup, bench included, in the last regular-season week; every franchise
    with one starts from zero.
    """
    rostered = set()
    out = {}
    for season, week, fid, *_rest, pid, _points in lineups:
        if season in seasons and week == regular_weeks.get(season, (0, -1))[1]:
            out[(season, fid)] = 0
            if pid is not None:
                rostered.add((season, fid, pid))
    for season, fid, pid, is_keeper in picks:
        if is_keeper or (fid, pid) in keepers.get(season, set()):
            continue
        if (season, fid, pid) in rostered:
            out[(season, fid)] += 1
    return out


def _regular_claims(claims, regular_weeks, seasons):
    return [c for c in claims if c[6] is not None
            and _in_regular_season(c[1], c[2], seasons, regular_weeks)]


def highest_failed_bid(claims, regular_weeks, seasons):
    """{(season, franchise): its biggest bid that lost a waiver claim}, from
    the waiver_claims rows (transaction, season, week, franchise, NFL player,
    dropped NFL player, bid, won, waiver run), regular season only."""
    out = {}
    for _tid, season, _week, fid, _pid, _dropped, bid, won, _run in _regular_claims(claims, regular_weeks, seasons):
        if not won:
            out[(season, fid)] = max(bid, out.get((season, fid), bid))
    return out


def most_overpaid(claims, regular_weeks, seasons):
    """{(season, franchise): its biggest gap between a winning bid and the
    next-highest bid for the same NFL player in the same waiver run}. With
    nobody else bidding, the next-highest bid is $0."""
    regular = _regular_claims(claims, regular_weeks, seasons)
    bids = defaultdict(list)
    for tid, season, _week, _fid, pid, _dropped, bid, _won, run in regular:
        bids[(season, run, pid)].append((tid, bid))
    out = {}
    for tid, season, _week, fid, pid, _dropped, bid, won, run in regular:
        if not won:
            continue
        gap = bid - max((b for t, b in bids[(season, run, pid)] if t != tid), default=0)
        out[(season, fid)] = max(gap, out.get((season, fid), gap))
    return out
