"""The scheduled run's cadence (#26): daily from the draft to the end of the
brackets, weekly (Tuesdays) otherwise, read from the season's own data."""
import json
from datetime import date, datetime, timezone

from recordbook.schedule import decide
from tests.archive import fmt, write_formats, write_sleeper_season

TUESDAY = date(2026, 10, 13)
WEDNESDAY = date(2026, 10, 14)


def ms(d):
    return int(datetime(d.year, d.month, d.day, 10, tzinfo=timezone.utc).timestamp() * 1000)


def season(data, year, status="in_season", last_scored_leg=None, draft=None):
    write_sleeper_season(data, year, [1, 2], league_extra={
        "status": status, "settings": {"playoff_week_start": 15, "last_scored_leg": last_scored_leg}})
    drafts = [{"draft_id": "1", "start_time": ms(draft) if draft else None}]
    (data / "sleeper" / f"{year}-drafts.json").write_text(json.dumps(drafts))


def formats(data, *years):
    write_formats(data, {y: fmt(2, 14, (2, [15, 16, 17]), shit_bowl=(2, [15, 16])) for y in years})


def test_runs_daily_from_draft_day_while_the_season_is_in_progress(tmp_path):
    formats(tmp_path, 2026)
    season(tmp_path, 2026, last_scored_leg=4, draft=date(2026, 9, 5))
    assert decide(tmp_path, WEDNESDAY).run
    assert decide(tmp_path, date(2026, 9, 5)).run


def test_runs_only_on_tuesdays_before_the_draft(tmp_path):
    formats(tmp_path, 2026)
    season(tmp_path, 2026, status="pre_draft", draft=date(2026, 9, 5))
    assert not decide(tmp_path, date(2026, 9, 2)).run
    assert decide(tmp_path, date(2026, 9, 1)).run


def test_a_draft_with_no_date_yet_is_off_season(tmp_path):
    formats(tmp_path, 2026)
    season(tmp_path, 2026, status="pre_draft", draft=None)
    assert not decide(tmp_path, WEDNESDAY).run
    assert decide(tmp_path, TUESDAY).run


def test_stays_daily_until_the_last_bracket_week_is_final(tmp_path):
    formats(tmp_path, 2026)
    season(tmp_path, 2026, last_scored_leg=16, draft=date(2026, 9, 5))
    assert decide(tmp_path, date(2026, 12, 30)).run
    season(tmp_path, 2026, last_scored_leg=17, draft=date(2026, 9, 5))
    assert not decide(tmp_path, date(2026, 12, 30)).run
    assert decide(tmp_path, date(2026, 12, 29)).run


def test_a_complete_season_is_off_season(tmp_path):
    formats(tmp_path, 2025)
    season(tmp_path, 2025, status="complete", draft=date(2025, 8, 30))
    assert not decide(tmp_path, date(2026, 3, 4)).run


def test_the_latest_season_decides(tmp_path):
    formats(tmp_path, 2025, 2026)
    season(tmp_path, 2025, status="complete", draft=date(2025, 8, 30))
    season(tmp_path, 2026, last_scored_leg=4, draft=date(2026, 9, 5))
    assert decide(tmp_path, WEDNESDAY).run


def test_says_why(tmp_path):
    formats(tmp_path, 2026)
    season(tmp_path, 2026, last_scored_leg=4, draft=date(2026, 9, 5))
    assert "2026" in decide(tmp_path, WEDNESDAY).reason
    assert "daily" in decide(tmp_path, WEDNESDAY).reason
