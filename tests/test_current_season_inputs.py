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
