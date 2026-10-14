"""Each season's format (decided in #11), from the hand-kept data/formats.yaml.

For past seasons the file records what was actually played. Every season the
archive holds must have an entry; a format may also be written down ahead of
its season.
"""
from dataclasses import dataclass, field

import yaml

# The league's three brackets (GLOSSARY.md), in the glossary's order, with
# their names. The site's src/lib/brackets.ts keeps the same keys, order and names.
BRACKETS = ("playoffs", "shit_bowl", "mediocre_bowl")
BRACKET_NAMES = {"playoffs": "Playoffs", "shit_bowl": "Shit Bowl", "mediocre_bowl": "Mediocre Bowl"}


class FormatError(Exception):
    """data/formats.yaml is missing a season or contradicts the archive."""


@dataclass(frozen=True)
class Bracket:
    name: str
    size: int
    weeks: tuple
    series: str | None = None
    seeding: str | None = None

    @property
    def first_week(self):
        return min(self.weeks)

    @property
    def last_week(self):
        return max(self.weeks)


@dataclass(frozen=True)
class Format:
    season: int
    teams: int
    divisions: int
    realignment: int | None
    regular_season: tuple
    brackets: dict = field(default_factory=dict)
    tiebreaks: str | None = None
    # False from the season the league stopped keeping players (2026).
    keepers: bool = True

    @property
    def regular_season_weeks(self):
        """How many weeks the regular season runs."""
        first, last = self.regular_season
        return last - first + 1


def load(path, team_counts):
    """{season: Format} for every season in team_counts ({season: teams played}).

    Raises FormatError when a season has no entry, when an entry's team count
    isn't what was played, or when it names an unknown bracket.
    """
    entries = (yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None) or {}
    for season in sorted(team_counts):
        if season not in entries:
            raise FormatError(f"{season} has no format in data/formats.yaml: every season needs one")
    out = {}
    for season in sorted(team_counts):
        f = entries[season]
        if not f.get("realignment"):
            raise FormatError(f"data/formats.yaml {season}: no realignment (the first season "
                              "of the division cycle it belongs to)")
        if f["teams"] != team_counts[season]:
            raise FormatError(f"data/formats.yaml says {season} had {f['teams']} teams, "
                              f"but {team_counts[season]} played")
        brackets = {}
        for name, b in (f.get("brackets") or {}).items():
            if name not in BRACKETS:
                raise FormatError(f"data/formats.yaml {season}: unknown bracket {name!r} "
                                  f"(expected one of {', '.join(BRACKETS)})")
            brackets[name] = Bracket(name, b["size"], tuple(b["weeks"]), b.get("series"),
                                     b.get("seeding"))
        out[season] = Format(season, f["teams"], f["divisions"], f.get("realignment"),
                             tuple(f["regular_season_weeks"]), brackets, f.get("tiebreaks"),
                             f.get("keepers", True))
    return out
