"""The current season (GLOSSARY.md) and its phase (#16, #35), chosen from the
data and the build date, never by hand: the season being played or, between
seasons, the one that finished most recently, until the next season's week 1.

This is the one definition (ADR 0004): the build writes it to the
current_season table, and everything else, Python or the site, reads it.

A season has started once it has a final week, or its week 1 date has come.
Its brackets start once every regular-season week is final, and its
off-season once every bracket is crowned. An NFL.com-era season is over: its
final standings were reported.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

PHASES = ("regular", "brackets", "off-season")
UK = ZoneInfo("Europe/London")


@dataclass(frozen=True)
class SeasonState:
    """What the build knows about a season's progress."""
    season: int
    week1: str | None  # YYYY-MM-DD, if Sleeper's state was snapshotted for the season
    draft_start: int | None  # ms since the epoch, once Sleeper has a date
    regular_weeks: tuple  # (first, last)
    final_weeks: list  # every week with final games, regular season and brackets
    brackets: int  # how many brackets the format has
    crowned: int  # how many of them have crowned a winner
    # NFL.com reported the season's final standings: it was played and is over,
    # whether or not its games survive.
    reported: bool = False


@dataclass(frozen=True)
class Current:
    season: int
    phase: str
    through: int | None  # the latest final week; None before week 1 is final
    playing: int | None  # the week being played (no scores shown); None in the off-season
    next_season: int | None  # in the off-season, the next season if Sleeper has it
    next_draft_start: int | None  # and its draft start


def uk_today(at=None):
    """The UK date (YYYY-MM-DD) at a moment (now by default): the day the build is for."""
    return (at or datetime.now(timezone.utc)).astimezone(UK).date().isoformat()


def _started(s, today):
    return s.reported or bool(s.final_weeks) or (s.week1 is not None and s.week1 <= today)


def current_season(states, today):
    """The current season on today (YYYY-MM-DD), or None if no season has started."""
    ordered = sorted(states, key=lambda s: s.season)
    started = [s for s in ordered if _started(s, today)]
    if not started:
        return None
    s = started[-1]
    first, last = s.regular_weeks
    final = set(s.final_weeks)
    through = max(final) if final else None
    regular_done = all(w in final for w in range(first, last + 1))
    phase = ("off-season" if s.reported else "regular" if not regular_done
             else "brackets" if s.crowned < s.brackets else "off-season")
    after = next((x for x in ordered if x.season > s.season), None)
    off = phase == "off-season"
    return Current(
        season=s.season,
        phase=phase,
        through=through,
        playing=None if off else (through if through is not None else first - 1) + 1,
        next_season=after.season if off and after else None,
        next_draft_start=after.draft_start if off and after else None,
    )


def finished(seasons, current):
    """The seasons that are over: every one before the current season, and the
    current season itself once it is in its off-season. A season in progress,
    or one not yet started, is not."""
    if current is None:
        return set()
    return {s for s in seasons
            if s < current.season or (s == current.season and current.phase == "off-season")}
