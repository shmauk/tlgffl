"""Sleeper-era games (ADR 0001, Sleeper era) from the snapshots in data/sleeper/.

A game's score is Sleeper's matchup `points`, or `custom_points` when the
commissioner overrode it; nothing is re-scored. Matchups carry no "final"
flag: a week is final once the league is complete or Sleeper has scored it
(`last_scored_leg`). Only final weeks become games.
"""
import json
from collections import defaultdict

from recordbook.games import Game, breakdown, regular_season_results, win_pct


class SleeperError(Exception):
    """The Sleeper snapshots and the hand-kept tables don't fit together."""


def read_weeks(sleeper_dir, year):
    """{week: matchup rows} for the season's snapshots."""
    out = {}
    for f in sorted(sleeper_dir.glob(f"{year}-matchups-*.json")):
        out[int(f.stem.rsplit("-", 1)[1])] = json.loads(f.read_text(encoding="utf-8"))
    return out


def final_weeks(league, weeks):
    """The weeks whose scores are final."""
    if league.get("status") == "complete":
        return set(weeks)
    scored = (league.get("settings") or {}).get("last_scored_leg") or 0
    return {w for w in weeks if w <= scored}


def score(row):
    """A roster's points for the week: the commissioner's override if any."""
    return row["custom_points"] if row.get("custom_points") is not None else row["points"]


def pairings(rows):
    """[(roster, points, roster, points)] for the week's pairings, lower roster first."""
    by_matchup = defaultdict(list)
    for r in rows:
        if r.get("matchup_id") is not None:
            by_matchup[r["matchup_id"]].append(r)
    out = []
    for m, pair in sorted(by_matchup.items()):
        if len(pair) != 2:
            raise SleeperError(f"matchup {m} has {len(pair)} rosters, not 2")
        a, b = sorted(pair, key=lambda r: r["roster_id"])
        out.append((a["roster_id"], round(score(a), 2), b["roster_id"], round(score(b), 2)))
    return out


TITLES = {"playoffs": "the Playoffs", "shit_bowl": "the Shit Bowl",
          "mediocre_bowl": "the Mediocre Bowl"}
ASSIGNMENTS = "data/sleeper_brackets.csv"


def read_assignments(rows):
    """{season: {(week, frozenset of two rosters): (bracket or 'filler', round)}}
    from the hand-kept bracket assignment's rows."""
    out = defaultdict(dict)
    for r in rows:
        season, week = int(r["season"]), int(r["week"])
        a, b = int(r["roster_a"]), int(r["roster_b"])
        bracket = r["bracket"].strip()
        if bracket != "filler" and bracket not in TITLES:
            raise SleeperError(f"{season} week {week}: {ASSIGNMENTS} names bracket {bracket!r} "
                               f"(expected one of {', '.join(TITLES)} or filler)")
        rnd = (r.get("round") or "").strip()
        if bracket != "filler" and not rnd:
            raise SleeperError(f"{season} week {week}: {ASSIGNMENTS} gives rosters {a} and {b} no round")
        out[season][(week, frozenset((a, b)))] = (bracket, int(rnd) if bracket != "filler" else None)
    return out


def season_games(year, league, weeks, fmt, franchise_of, assigned):
    """The season's final games. franchise_of(roster id) gives the franchise;
    assigned is the season's hand-kept bracket assignment (read_assignments).

    In a bracket week every pairing must be assigned to one of the league's
    brackets or marked as filler, which never becomes a game. Sleeper's own
    winners and losers brackets don't match the league's three, so they
    aren't used.
    """
    first, last = fmt.regular_season
    bracket_weeks = {w for b in fmt.brackets.values() for w in b.weeks}
    final = final_weeks(league, weeks)
    games, seen = [], set()
    for week in sorted(final):
        if first <= week <= last:
            phase = "regular"
        elif week in bracket_weeks:
            phase = "bracket"
        else:
            continue
        for a, pa, b, pb in pairings(weeks[week]):
            home, away = franchise_of(a), franchise_of(b)
            winner = home if pa > pb else away if pb > pa else None
            if phase == "regular":
                games.append(Game(year, week, "regular", None, None, "final", home, pa, away, pb, winner))
                continue
            key = (week, frozenset((a, b)))
            if key not in assigned:
                raise SleeperError(f"{year} week {week}: rosters {a} and {b} have no bracket in "
                                   f"{ASSIGNMENTS} (name the bracket, or filler)")
            seen.add(key)
            bracket, rnd = assigned[key]
            if bracket == "filler":
                continue
            played = fmt.brackets[bracket].weeks if bracket in fmt.brackets else ()
            if week not in played:
                raise SleeperError(f"{year} week {week}: {ASSIGNMENTS} puts rosters {a} and {b} in "
                                   f"{TITLES[bracket]}, which data/formats.yaml plays in weeks "
                                   f"{', '.join(map(str, played)) or 'none'}")
            games.append(Game(year, week, "bracket", bracket, rnd, "final", home, pa, away, pb, winner))
    for week, pair in sorted(assigned, key=lambda k: (k[0], sorted(k[1]))):
        if week in final and (week, pair) not in seen:
            a, b = sorted(pair)
            raise SleeperError(f"{year} week {week}: {ASSIGNMENTS} assigns rosters {a} and {b}, "
                               "but there is no such pairing that week")
    return games


def season_lines(year, games, league, rosters, franchise_of):
    """Season-line rows (franchise, season, 'derived', W, L, T, PF, PA,
    division, seed, bracket, placing, Breakdown W, L, T, luck), always derived
    from the season's games (ADR 0001, Sleeper era)."""
    results = regular_season_results(games, {year})
    breakdowns = breakdown(games, {year})
    names = league.get("metadata") or {}
    rows = []
    for r in rosters:
        fid = franchise_of(r["roster_id"])
        w, l, t, pf, pa = results.get((fid, year), (0, 0, 0, 0.0, 0.0))
        bd = breakdowns.get((fid, year), (None, None, None))
        luck = win_pct(w, l, t) - win_pct(*bd) if w + l + t and bd[0] is not None else None
        division = names.get(f"division_{(r.get('settings') or {}).get('division')}")
        rows.append((fid, year, "derived", w, l, t, pf, pa, division, None, None, None, *bd, luck))
    return rows
