"""Season sets (#54): the named sets of seasons a record can be ranked over.

Every figure a record ranks over some of the seasons (bracket tallies,
streaks, completed seasons) is kept once per season set, and the site filters
records by the same keys, which are also the URL segments of a record's
variants. The sets are all seasons, the two eras, each League size (#56) and
the one pairing of era and size no other set already gives: the NFL.com era's
16-team seasons. Keys never collide with a record's phases ('all', 'regular',
'playoffs').
"""

SCHEMA = """
-- The seasons in each season set (recordbook/season_sets.py): the sets of
-- seasons a record can be ranked over.
create table season_sets (
    season_set text not null,
    season integer not null references seasons(year),
    primary key (season_set, season)
);
"""

ALL = "all-seasons"

# Each League size's seasons, as fixed years (GLOSSARY.md) rather than read
# from the season formats: (first season, last season or None while it lasts).
SIZES = {"10-teams": (2012, 2012), "12-teams": (2013, 2014), "16-teams": (2015, None)}


def _sized(year, size):
    first, last = SIZES[size]
    return first <= year and (last is None or year <= last)


def season_sets(seasons):
    """{season set: frozenset of seasons}, in the order records list them,
    from the seasons rows (year, era, team count)."""
    by_era = {"nfl-com": "nfl.com", "sleeper": "sleeper"}
    return {
        ALL: frozenset(year for year, _era, _count in seasons),
        **{key: frozenset(year for year, era, _count in seasons if era == platform)
           for key, platform in by_era.items()},
        **{size: frozenset(year for year, _era, _count in seasons if _sized(year, size)) for size in SIZES},
        "nfl-com-16-teams": frozenset(year for year, era, _count in seasons
                                      if era == "nfl.com" and _sized(year, "16-teams")),
    }


def rows(sets):
    """season_sets rows (season set, season)."""
    return [(key, season) for key, seasons in sets.items() for season in sorted(seasons)]
