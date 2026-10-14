"""The inputs Python writes for the seeding module (ADR 0005, #34): the
regular-season pairings still to play and the scissors-paper-rock rulings.
Python derives no Sleeper-era seeds itself."""
import sqlite3

import pytest

from recordbook.build import build, BuildError
from recordbook.validate import validate
from tests.archive import write_csv, write_sleeper_league
from tests.test_sleeper_build import DIVISIONS, WEEKS, sleeper  # noqa: F401 (fixture)


def built(data, tmp_path):
    db = tmp_path / "league.sqlite"
    build(data, db)
    return db


def query(db, sql, *args):
    con = sqlite3.connect(db)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


def write_rulings(data, rows):
    write_csv(data / "scissors_paper_rock.csv", ["season", "order"], rows)


def test_regular_season_pairings_not_yet_final_are_upcoming_games(sleeper, tmp_path):  # noqa: F811
    # Sleeper has scored week 1 only: week 2's pairings are still to play. Week 3 is a bracket week.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         totals={1: (1, 0, 0, 100.0), 2: (0, 1, 0, 90.0), 3: (0, 1, 0, 80.0),
                                 4: (1, 0, 0, 85.0), 5: (0, 1, 0, 70.0), 6: (1, 0, 0, 70.5)})
    db = built(sleeper, tmp_path)
    assert query(db, "select season, week, home_franchise_id, away_franchise_id from upcoming_games "
                     "order by week, home_franchise_id") == [
        (2025, 2, 11, 13), (2025, 2, 12, 15), (2025, 2, 14, 16)]


def test_a_finished_regular_season_has_no_upcoming_games(sleeper, tmp_path):  # noqa: F811
    db = built(sleeper, tmp_path)
    assert query(db, "select count(*) from upcoming_games") == [(0,)]


def test_sleeper_seeds_are_left_to_the_seeding_module(sleeper, tmp_path):  # noqa: F811
    db = built(sleeper, tmp_path)
    assert query(db, "select distinct seed from season_lines where season = 2025") == [(None,)]


def test_scissors_paper_rock_rulings_are_written_in_order_by_franchise(sleeper, tmp_path):  # noqa: F811
    write_rulings(sleeper, [(2025, "Team 4|Team 2|Team 5")])
    db = built(sleeper, tmp_path)
    assert query(db, "select season, ruling, position, franchise_id from scissors_paper_rock "
                     "order by ruling, position") == [(2025, 1, 1, 14), (2025, 1, 2, 12), (2025, 1, 3, 15)]


def test_a_ruling_naming_an_unknown_franchise_fails_the_build(sleeper, tmp_path):  # noqa: F811
    write_rulings(sleeper, [(2025, "Team 4|Nobody")])
    with pytest.raises(BuildError, match="Nobody"):
        built(sleeper, tmp_path)


def test_a_ruling_is_checked_like_every_hand_kept_table(sleeper):  # noqa: F811
    write_rulings(sleeper, [(2025, "Team 4|Nobody"), ("soon", "Team 4|Team 2")])
    problems = validate(sleeper)
    assert any("scissors_paper_rock.csv line" in p and "season" in p for p in problems), problems
    write_rulings(sleeper, [(2025, "Team 4|Nobody")])
    problems = validate(sleeper)
    assert any("scissors_paper_rock.csv" in p and "Nobody" in p for p in problems), problems
