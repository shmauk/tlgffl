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
