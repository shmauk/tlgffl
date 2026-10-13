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


def team_names(sleeper_dir, year):
    """{roster: team name} from the season's weekly team-name snapshots
    ({year}-team_names-{week}.json, written by the fetch): each roster's
    latest non-empty name. Sleeper's team names are only current-state, so
    an empty one keeps the name the roster had before."""
    out = {}
    for f in sorted(sleeper_dir.glob(f"{year}-team_names-*.json")):
        for r in json.loads(f.read_text(encoding="utf-8")):
            if (r.get("team_name") or "").strip():
                out[r["roster_id"]] = r["team_name"].strip()
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


def coverage(year, games, team_count):
    """coverage rows for the season's final weeks. Sleeper keeps every game,
    so each is complete: a regular-season week has a game for every pair of
    franchises, a bracket week the games its assignment gives it."""
    counts = defaultdict(int)
    for g in games:
        if g.season == year:
            counts[(g.week, g.phase, g.bracket)] += 1
    rows = []
    for (week, phase, bracket), n in sorted(counts.items(), key=lambda kv: (kv[0][0], kv[0][2] or "")):
        expected = team_count // 2 if phase == "regular" else n
        rows.append((year, week, phase, bracket, expected, n, int(n == expected)))
    return rows


def season_lines(year, games, league, rosters, franchise_of):
    """Season-line rows (franchise, season, 'derived', W, L, T, PF, PA,
    division, seed, bracket, placing, Breakdown W, L, T, luck), always derived
    from the season's games (ADR 0001, Sleeper era). bracket is the league
    bracket the franchise played in; seed and final placing are left to the
    seeding module (ADR 0005)."""
    results = regular_season_results(games, {year})
    breakdowns = breakdown(games, {year})
    names = league.get("metadata") or {}
    brackets = {}
    for g in sorted((g for g in games if g.season == year and g.bracket), key=lambda g: g.week):
        brackets.setdefault(g.home, g.bracket)
        brackets.setdefault(g.away, g.bracket)
    rows = []
    for r in rosters:
        fid = franchise_of(r["roster_id"])
        w, l, t, pf, pa = results.get((fid, year), (0, 0, 0, 0.0, 0.0))
        bd = breakdowns.get((fid, year), (None, None, None))
        luck = win_pct(w, l, t) - win_pct(*bd) if w + l + t and bd[0] is not None else None
        division = names.get(f"division_{(r.get('settings') or {}).get('division')}")
        rows.append((fid, year, "derived", w, l, t, pf, pa, division, None, brackets.get(fid), None, *bd, luck))
    return rows


def crowns(year, games, fmt):
    """bracket_winners rows (season, bracket, franchise, 'derived') for each
    of the season's brackets whose last week has been played.

    A bracket's last round decides it: in a series, on games won (a tie
    counting half) and then total points. The Playoffs and the Mediocre Bowl
    crown the franchise on top; the Shit Bowl, where losing advances you,
    crowns the one at the bottom.
    """
    rows = []
    for name, b in fmt.brackets.items():
        played = [g for g in games if g.season == year and g.bracket == name]
        if not any(g.week == b.last_week for g in played):
            continue
        last = max(g.round for g in played)
        standing = defaultdict(lambda: [0.0, 0.0])
        for g in played:
            if g.round != last:
                continue
            for me, pts in ((g.home, g.home_points), (g.away, g.away_points)):
                standing[me][0] += 1 if g.winner == me else 0.5 if g.winner is None else 0
                standing[me][1] += pts
        pick = min if name == "shit_bowl" else max
        rows.append((year, name, pick(standing, key=lambda f: tuple(standing[f])), "derived"))
    return sorted(rows)


def lineups(year, league, weeks, games, franchise_of):
    """lineups rows (season, week, franchise, slot, slot index, starter,
    NFL player id, points) for every week a franchise played a game.

    Starters follow the league's roster positions (slot index from 1); an
    empty starting slot ("0") has no NFL player. Bench NFL players are
    those rostered but not started, in slot BN.
    """
    played = {(g.week, f) for g in games if g.season == year for f in (g.home, g.away)}
    positions = [p for p in league.get("roster_positions") or [] if p != "BN"]
    rows = []
    for week, matchups in sorted(weeks.items()):
        for m in matchups:
            fid = franchise_of(m["roster_id"])
            if (week, fid) not in played:
                continue
            points = m.get("players_points") or {}
            starters = m.get("starters") or []
            for i, pid in enumerate(starters):
                slot = positions[i] if i < len(positions) else None
                if pid == "0":
                    rows.append((year, week, fid, slot, i + 1, 1, None, None))
                else:
                    rows.append((year, week, fid, slot, i + 1, 1, pid, points.get(pid)))
            for pid in sorted(set(m.get("players") or []) - set(starters)):
                rows.append((year, week, fid, "BN", None, 0, pid, points.get(pid)))
    return rows


TRANSACTION_TYPES = ("trade", "waiver", "free_agent")


def read_transactions(sleeper_dir, year):
    """{week: transactions} for the season's snapshots."""
    out = {}
    for f in sorted(sleeper_dir.glob(f"{year}-transactions-*.json")):
        out[int(f.stem.rsplit("-", 1)[1])] = json.loads(f.read_text(encoding="utf-8"))
    return out


def transactions(year, by_week, franchise_of):
    """Rows for the transactions, transaction_moves, transaction_picks,
    transaction_budget and waiver_claims tables, as a dict of lists.

    A transaction (GLOSSARY.md) is a completed trade, waiver claim or
    free-agent pickup; commissioner moves and failed trades aren't. Every
    waiver claim is kept, won (complete) or lost (failed), with its bid.
    """
    out = {k: [] for k in ("transactions", "transaction_moves", "transaction_picks",
                           "transaction_budget", "waiver_claims")}
    for week, txs in sorted(by_week.items()):
        for t in txs:
            tid, kind, status = t["transaction_id"], t.get("type"), t.get("status")
            adds, drops = t.get("adds") or {}, t.get("drops") or {}
            if kind == "waiver" and status in ("complete", "failed"):
                bid = (t.get("settings") or {}).get("waiver_bid")
                for pid, rid in adds.items():
                    dropped = [p for p, r in drops.items() if r == rid]
                    out["waiver_claims"].append((tid, year, week, franchise_of(rid), pid,
                                                 dropped[0] if dropped else None, bid,
                                                 int(status == "complete")))
            if kind not in TRANSACTION_TYPES or status != "complete":
                continue
            out["transactions"].append((tid, year, week, kind, t.get("created")))
            for move, players in (("add", adds), ("drop", drops)):
                for pid, rid in players.items():
                    out["transaction_moves"].append((tid, franchise_of(rid), pid, move))
            for p in t.get("draft_picks") or []:
                out["transaction_picks"].append((tid, int(p["season"]), p["round"], franchise_of(p["roster_id"]),
                                                 franchise_of(p["previous_owner_id"]),
                                                 franchise_of(p["owner_id"])))
            for b in t.get("waiver_budget") or []:
                out["transaction_budget"].append((tid, franchise_of(b["sender"]), franchise_of(b["receiver"]),
                                                  b["amount"]))
    return out


ADJUSTMENTS = "data/sleeper_adjustments.csv"


def roster_total(r):
    """Sleeper's season points-for total for a roster."""
    s = r.get("settings") or {}
    return round((s.get("fpts") or 0) + (s.get("fpts_decimal") or 0) / 100, 2)


def read_explanations(rows):
    """{season: {roster: points}} from the hand-kept roster-total explanations."""
    out = defaultdict(lambda: defaultdict(float))
    for r in rows:
        out[int(r["season"])][int(r["roster_id"])] += float(r["points"])
    return out


def cross_check(year, league, rosters, lines, franchise_of, explained):
    """Problems with Sleeper's roster season totals against the season lines
    derived from games (ADR 0001, Sleeper era), each a sentence.

    W-L-T must agree. Points for must agree, or differ by exactly the amount
    explained ({roster: points}, from the hand-kept explanations); an
    explanation where there is no gap is stale. Mid-season, Sleeper's totals
    can count a week that isn't final yet; such a season isn't checked.
    """
    derived = {fid: (w, l, t, pf) for fid, season, _src, w, l, t, pf, *_ in lines if season == year}
    settings = {r["roster_id"]: r.get("settings") or {} for r in rosters}
    played = {rid: s.get("wins", 0) + s.get("losses", 0) + s.get("ties", 0) for rid, s in settings.items()}
    if league.get("status") != "complete" and any(
            n != sum(derived[franchise_of(rid)][:3]) for rid, n in played.items()):
        return []
    problems = []
    for r in rosters:
        rid, s = r["roster_id"], settings[r["roster_id"]]
        w, l, t, pf = derived[franchise_of(rid)]
        theirs = f"{s.get('wins', 0)}-{s.get('losses', 0)}-{s.get('ties', 0)}"
        if theirs != f"{w}-{l}-{t}":
            problems.append(f"{year} roster {rid}: Sleeper's roster totals give W-L-T {theirs}, "
                            f"the games {w}-{l}-{t}")
        gap, excuse = round(roster_total(r) - pf, 2), round(explained.get(rid, 0.0), 2)
        if gap == excuse:
            continue
        if not gap:
            problems.append(f"{ADJUSTMENTS} explains {excuse} points for {year} roster {rid}, but its "
                            "roster total agrees with the games: the entry is stale")
        else:
            problems.append(f"{year} roster {rid}: Sleeper's roster total is {roster_total(r)} points and "
                            f"the games give {pf}, a gap of {gap} that {ADJUSTMENTS} "
                            + (f"puts at {excuse}" if excuse else "doesn't explain"))
    return problems
