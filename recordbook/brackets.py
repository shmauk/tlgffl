"""Brackets by role (GLOSSARY.md): the Playoffs, the Shit Bowl and the
Mediocre Bowl, and who each one crowned.

NFL.com never returned bracket games, only each Playoffs franchise's seed and
the season's final placings. Those pin the Playoffs down, because the league
re-seeds between rounds: the top seed always meets the lowest surviving seed.
ff-data-project checked this reconstruction against the game log for
2012-2020 (46 pairings out of 46). NFL.com's consolation bracket advanced
winners, unlike the Shit Bowl, and it never seeded a Mediocre Bowl, so neither
can be rebuilt from the platform: their winners are recorded by hand.
"""
import math
from collections import defaultdict

from recordbook.formats import BRACKET_NAMES
from recordbook.games import Game, playoffs_rounds


class BracketError(Exception):
    """The bracket can't be rebuilt, or the evidence contradicts it."""


def playoffs_pairings(season, seeds, placings, weeks):
    """[(round, week, higher seed, lower seed, winner)] for a single-elimination
    Playoffs, rebuilt from {franchise: seed} and {franchise: final placing}.

    The top seeds take byes until the field is a power of two, and every round
    is re-seeded. A franchise placed p (p >= 2) went out in the round
    floor(log2(p - 1)) rounds before the final; the champion never did.
    """
    rounds = playoffs_rounds(len(seeds))
    if not rounds:
        return []
    if len(weeks) != len(rounds):
        raise BracketError(f"{season}: a {len(seeds)}-team Playoffs takes {len(rounds)} rounds, "
                           f"but the format gives it {len(weeks)} weeks")
    missing = sorted(f for f in seeds if placings.get(f) is None)
    if missing:
        raise BracketError(f"{season}: Playoffs franchises {missing} have no final placing")

    def out_in(f):
        p = placings[f]
        return None if p == 1 else len(rounds) - int(math.log2(p - 1))

    alive = sorted(seeds, key=seeds.get)
    out = []
    for n, (games, week) in enumerate(zip(rounds, weeks), start=1):
        byes, playing = alive[:len(alive) - 2 * games], alive[len(alive) - 2 * games:]
        winners = []
        for i in range(games):
            high, low = playing[i], playing[-1 - i]
            losers = [f for f in (high, low) if out_in(f) == n]
            if len(losers) != 1:
                raise BracketError(f"{season} week {week}: the final placings don't fit a "
                                   f"re-seeded bracket (seed {seeds[high]} v seed {seeds[low]})")
            winner = low if losers == [high] else high
            out.append((n, week, high, low, winner))
            winners.append(winner)
        alive = sorted(byes + winners, key=seeds.get)
    return out


def playoffs_games(season, seeds, placings, weeks, logged):
    """The season's Playoffs games, with each pairing's logged score attached.

    logged maps (week, frozenset of two franchises) to the logged Game. A
    pairing the log doesn't have is still a game: its score is lost, so its
    points are null. A logged score must agree with the final placings.
    """
    games = []
    for n, week, high, low, winner in playoffs_pairings(season, seeds, placings, weeks):
        g = logged.get((week, frozenset((high, low))))
        if g is None:
            games.append(Game(season, week, "bracket", "playoffs", n, "final",
                              high, None, low, None, winner))
            continue
        scored = g.home if g.home_points > g.away_points else g.away if g.away_points > g.home_points else None
        if scored != winner:
            raise BracketError(f"{season} week {week}: the logged score {g.home_points}-{g.away_points} "
                               f"contradicts the final placings, which have franchise {winner} winning")
        games.append(Game(season, week, "bracket", "playoffs", n, "final",
                          g.home, g.home_points, g.away, g.away_points, winner))
    return games


# Hand-kept sources (ff-data-project's words on the left) -> GLOSSARY.md's.
SOURCES = {"derived-confirmed": "confirmed", "confirmed": "confirmed", "derived": "derived",
           "recalled": "recalled", "inconclusive": "disputed", "disputed": "disputed"}

HAND_KEPT = {"shit_bowl": ("shitbowl.csv", BRACKET_NAMES["shit_bowl"]),
             "mediocre_bowl": ("mediocre_bowl.csv", BRACKET_NAMES["mediocre_bowl"])}


def champions(games):
    """{season: franchise} from each season's Playoffs final."""
    finals = {}
    for g in games:
        if g.bracket == "playoffs" and g.round >= finals.get(g.season, (0, None))[0]:
            finals[g.season] = (g.round, g.winner)
    return {season: winner for season, (_, winner) in finals.items()}


def winner_rows(games, formats, seasons, hand_kept, franchise_by_name):
    """bracket_winners rows (season, bracket, franchise or None, source).

    The champion is derived from the Playoffs. Shit Bowl and Mediocre Bowl
    winners of the given (NFL.com-era) seasons come from their hand-kept
    tables, hand_kept[bracket] being that table's rows: "A|B" is disputed,
    with one row per candidate, and a blank or missing row is unknown.
    """
    rows = [(s, "playoffs", f, "derived") for s, f in sorted(champions(games).items())]
    for bracket, (table, title) in HAND_KEPT.items():
        recorded = {}
        for r in hand_kept.get(bracket, []):
            season = int(r["year"])
            if season not in formats:
                raise BracketError(f"data/{table}: {season} is not a season")
            if bracket not in formats[season].brackets:
                raise BracketError(f"data/{table}: {season} had no {title} (data/formats.yaml)")
            recorded[season] = r
        for season in sorted(seasons):
            if bracket not in formats[season].brackets:
                continue
            r = recorded.get(season) or {}
            names = [n.strip() for n in (r.get("franchise") or "").split("|") if n.strip()]
            if not names:
                rows.append((season, bracket, None, "unknown"))
                continue
            source = "disputed" if len(names) > 1 else SOURCES.get((r.get("source") or "").strip())
            if source is None:
                raise BracketError(f"data/{table}: {season} source {r.get('source')!r} is not one of "
                                   f"{', '.join(SOURCES)}")
            for name in names:
                if name not in franchise_by_name:
                    raise BracketError(f"data/{table}: {season} names {name!r}, which is not a "
                                       "franchise name")
                rows.append((season, bracket, franchise_by_name[name], source))
    return rows


def went_on(game, franchise):
    """Whether a franchise went on from a knockout game: by winning it, or in
    the Shit Bowl, where losing advances you, by losing it. From a tie, the
    franchise recorded as advancing (the higher seed) went on. The site's
    src/lib/seeding.ts keeps the same rule in wentOn."""
    if game.winner is None:
        return game.advanced == franchise
    return (game.winner == franchise) != (game.bracket == "shit_bowl")


def run_rows(games, formats, winners):
    """bracket_runs rows (season, bracket, franchise, round reached, result,
    source): each franchise's run through each bracket it played in.

    A franchise that didn't go on from its last game (went_on) is out in that
    round, or runner-up if the round was the final; one that did is still in.
    In a series, both are still in until the bracket crowns one. A crowned
    franchise is crowned whatever its games say.
    """
    crowned = {(s, b, f): source for s, b, f, source in winners if f is not None}
    played = defaultdict(list)
    for g in games:
        if g.phase == "bracket":
            played[(g.season, g.bracket)].append(g)
    rows = []
    for (season, bracket), these in sorted(played.items()):
        b = formats[season].brackets[bracket]
        final = 1 if b.series else len(b.weeks)
        decided = any((season, bracket) == key[:2] for key in crowned)
        last = {}
        for g in sorted(these, key=lambda g: g.week):
            last[g.home] = last[g.away] = g
        for f, g in sorted(last.items()):
            if (season, bracket, f) in crowned:
                rows.append((season, bracket, f, g.round, "crowned", crowned[(season, bracket, f)]))
                continue
            still_in = not decided if b.series else went_on(g, f)
            if still_in:
                rows.append((season, bracket, f, g.round, "alive", "derived"))
            else:
                rows.append((season, bracket, f, g.round, "runner_up" if g.round == final else "out", "derived"))
    # A crown from a hand-kept table, with no games behind it: its path is unknown.
    for (season, bracket, f), source in sorted(crowned.items()):
        if (season, bracket) not in played:
            rows.append((season, bracket, f, None, "crowned", source))
    return rows
