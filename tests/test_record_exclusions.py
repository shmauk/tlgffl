"""Games left out of the records (data/record_exclusions.csv): a real result
the league judges shouldn't stand as a record, such as a game tanked on
purpose. It still counts for the standings and the season's totals.

Uses test_games' 4-team 2014 season; in week 1 Cat beat Dog 80-70, the
season's lowest score.
"""
import pytest

from recordbook.build import BuildError
from tests.archive import write_csv
from tests.test_games import data, built, query  # noqa: F401  (data is a fixture)


def exclude(data, rows):
    write_csv(data / "record_exclusions.csv", ["season", "week", "franchise", "reason"], rows)


def test_an_excluded_game_is_recorded_with_its_reason(data, tmp_path):
    exclude(data, [(2014, 1, "Dog", "Tanked on purpose.")])
    db = built(data, tmp_path)
    assert query(db, "select g.season, g.week, e.franchise_id, e.reason from record_exclusions e "
                     "join games g on g.id = e.game_id") == [(2014, 1, 4, "Tanked on purpose.")]


def test_an_excluded_game_is_left_out_of_the_seasons_highs_and_lows(data, tmp_path):
    exclude(data, [(2014, 1, "Dog", "Tanked on purpose.")])
    db = built(data, tmp_path)
    assert query(db, "select h.value, g.week from season_highs_lows h join games g on g.id = h.game_id "
                     "where measure = 'lowest_score'") == [(85.0, 3)]


def test_an_excluded_game_is_left_out_of_both_franchises_best_and_worst(data, tmp_path):
    exclude(data, [(2014, 1, "Dog", "Tanked on purpose.")])
    db = built(data, tmp_path)
    assert query(db, "select distinct g.week from franchise_best_worst b join games g on g.id = b.game_id "
                     "where b.franchise_id in (3, 4) and g.week = 1") == []


def test_an_excluded_game_still_counts_for_the_season(data, tmp_path):
    before = query(built(data, tmp_path / "before"), "select * from season_lines order by 1, 2")
    exclude(data, [(2014, 1, "Dog", "Tanked on purpose.")])
    assert query(built(data, tmp_path / "after"), "select * from season_lines order by 1, 2") == before


def test_an_exclusion_naming_no_game_fails_the_build(data, tmp_path):
    exclude(data, [(2014, 5, "Dog", "Tanked on purpose.")])
    with pytest.raises(BuildError, match="record_exclusions.csv: Dog played no game with a score in 2014 week 5"):
        built(data, tmp_path)
