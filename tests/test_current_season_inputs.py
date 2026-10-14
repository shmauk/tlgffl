"""What Python writes for the current season (#35): each Sleeper season's
calendar (draft and week 1), the bracket-week pairings still to play, and the
award leaders while a regular season is on. Which season is current, and its
phase, is decided by the site from these and the build date."""
import json

from tests.archive import write_sleeper_brackets, write_sleeper_league
from tests.test_seeding_inputs import built, query
from tests.test_sleeper_build import BRACKETS, DIVISIONS, TOTALS, WEEKS, sleeper  # noqa: F401 (fixture)


def write_snapshot(data, name, obj):
    (data / "sleeper" / name).write_text(json.dumps(obj))


def test_a_seasons_calendar_has_its_draft_start_and_week_1_date(sleeper, tmp_path):  # noqa: F811
    write_snapshot(sleeper, "2025-drafts.json", [{"draft_id": "D", "start_time": 1756000000000},
                                                 {"draft_id": "E", "start_time": 1755000000000}])
    write_snapshot(sleeper, "2025-state.json", {"season": "2025", "season_start_date": "2025-09-04"})
    db = built(sleeper, tmp_path)
    assert query(db, "select season, draft_start, week1_date from season_calendar") == [
        (2025, 1755000000000, "2025-09-04")]


def test_a_season_with_no_draft_time_or_state_has_an_empty_calendar(sleeper, tmp_path):  # noqa: F811
    db = built(sleeper, tmp_path)
    assert query(db, "select season, draft_start, week1_date from season_calendar") == [(2025, None, None)]


def test_bracket_week_pairings_not_yet_final_carry_their_assignment_and_filler_is_left_out(sleeper, tmp_path):  # noqa: F811
    # The regular season (weeks 1-2) is final; week 3, a bracket week, is being played. Only
    # the Playoffs pairing has a row so far: the other is written with no bracket, for the
    # site to place.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=2, totals=TOTALS)
    write_sleeper_brackets(sleeper, [BRACKETS[0], BRACKETS[2]])
    db = built(sleeper, tmp_path)
    assert query(db, "select season, week, home_franchise_id, away_franchise_id, bracket, round "
                     "from upcoming_bracket_pairings order by home_franchise_id") == [
        (2025, 3, 11, 16, "playoffs", 1), (2025, 3, 12, 13, None, None)]
    assert query(db, "select count(*) from games where week = 3") == [(0,)]


def test_a_finished_season_has_no_bracket_pairings_to_come(sleeper, tmp_path):  # noqa: F811
    db = built(sleeper, tmp_path)
    assert query(db, "select count(*) from upcoming_bracket_pairings") == [(0,)]
