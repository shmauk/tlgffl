"""Season sets (#54): the named sets of seasons a record can be ranked over.

Every figure a record ranks over some of the seasons (bracket tallies,
streaks, completed seasons) is kept once per season set, and the site filters
records by the same keys, which are also the URL segments of a record's
variants. For now the sets are all seasons and the two eras; another set
(League size, #56) is one more entry in season_sets(). Keys never collide
with a record's phases ('all', 'regular', 'playoffs').
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


def season_sets(seasons):
    """{season set: frozenset of seasons}, in the order records list them,
    from the seasons rows (year, era, team count)."""
    by_era = {"nfl-com": "nfl.com", "sleeper": "sleeper"}
    return {
        ALL: frozenset(year for year, _era, _count in seasons),
        **{key: frozenset(year for year, era, _count in seasons if era == platform)
           for key, platform in by_era.items()},
    }


def rows(sets):
    """season_sets rows (season set, season)."""
    return [(key, season) for key, seasons in sets.items() for season in sorted(seasons)]
