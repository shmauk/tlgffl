"""Season sets (#54): the named sets of seasons a record can be ranked over.

Every figure a record ranks over some of the seasons (bracket tallies,
streaks, completed seasons) is kept once per season set, and the site filters
records by the same keys, which are also the URL segments of a record's
variants. The sets are all seasons, the two eras, each League size (#56) and
the one pairing of era and size no other set already gives: the NFL.com era's
16-team seasons. Keys never collide with a record's phases ('all', 'regular',
'playoffs').

The season_sets table is the one definition of each League size's seasons:
Statsguru's size= reads it too (src/lib/season-sets.ts), so a record and its
full list can't disagree (ADR 0002).
"""

# Each League size's seasons, as fixed years (GLOSSARY.md) rather than read
# from the season formats: (first season, last season or None while it lasts).
SIZES = {10: (2012, 2012), 12: (2013, 2014), 16: (2015, None)}

# Each season set, in the order records list them: (key, era, League size),
# None for any era or any size. src/lib/season-sets.ts lists the same sets.
SETS = (
    ("all-seasons", None, None),
    ("nfl-com", "nfl.com", None),
    ("sleeper", "sleeper", None),
    ("10-teams", None, 10),
    ("12-teams", None, 12),
    ("16-teams", None, 16),
    ("nfl-com-16-teams", "nfl.com", 16),
)

# The season_set column of every table keyed by season set.
COLUMN = "season_set text not null check (season_set in ({}))".format(
    ", ".join(f"'{key}'" for key, _era, _size in SETS))

SCHEMA = f"""
-- The seasons in each season set (recordbook/season_sets.py): the sets of
-- seasons a record can be ranked over.
create table season_sets (
    {COLUMN},
    season integer not null references seasons(year),
    primary key (season_set, season)
);
"""


def _sized(year, size):
    first, last = SIZES[size]
    return first <= year and (last is None or year <= last)


def season_sets(seasons):
    """{season set: frozenset of seasons}, in the order records list them,
    from the seasons rows (year, era, team count)."""
    return {
        key: frozenset(year for year, season_era, _count in seasons
                       if (era is None or season_era == era) and (size is None or _sized(year, size)))
        for key, era, size in SETS
    }


def rows(sets):
    """season_sets rows (season set, season)."""
    return [(key, season) for key, seasons in sets.items() for season in sorted(seasons)]
