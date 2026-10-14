"""The current season and its phase (GLOSSARY.md, #16, #35), chosen from the
data and the build date, never by hand: the season being played or, between
seasons, the one that finished most recently, until the next season's week 1."""
from datetime import datetime, timezone

from recordbook.current import Current, SeasonState, current_season, finished, uk_today

DRAFT_2026 = 1788285600000  # 1 September 2026, 18:00 UTC


def weeks(a, b):
    return list(range(a, b + 1))


# 2025 finished: 14 regular weeks and three bracket weeks, all three brackets crowned.
DONE_2025 = SeasonState(season=2025, week1=None, draft_start=None, regular_weeks=(1, 14),
                        final_weeks=weeks(1, 17), brackets=3, crowned=3)
PRE_2026 = SeasonState(season=2026, week1="2026-09-09", draft_start=DRAFT_2026, regular_weeks=(1, 14),
                       final_weeks=[], brackets=3, crowned=0)


def with_(state, **changes):
    return SeasonState(**{**state.__dict__, **changes})


def test_during_the_regular_season_it_is_through_the_latest_final_week_with_the_next_being_played():
    s2026 = with_(PRE_2026, final_weeks=weeks(1, 4))
    assert current_season([DONE_2025, s2026], "2026-10-14") == Current(2026, "regular", 4, 5, None, None)


def test_between_seasons_it_is_the_one_that_finished_with_the_next_draft_until_the_next_week_1():
    assert current_season([DONE_2025, PRE_2026], "2026-09-08") == Current(
        2025, "off-season", 17, None, 2026, DRAFT_2026)
    assert current_season([DONE_2025, PRE_2026], "2026-09-09") == Current(2026, "regular", None, 1, None, None)


def test_a_next_season_with_no_draft_date_yet_has_a_null_draft():
    no_draft = with_(PRE_2026, draft_start=None)
    got = current_season([DONE_2025, no_draft], "2026-03-01")
    assert (got.next_season, got.next_draft_start) == (2026, None)
    assert current_season([DONE_2025], "2026-03-01").next_season is None


def test_once_every_regular_season_week_is_final_and_a_bracket_is_uncrowned_the_brackets_are_on():
    brackets = with_(PRE_2026, final_weeks=weeks(1, 15), crowned=0)
    assert current_season([DONE_2025, brackets], "2026-12-22") == Current(2026, "brackets", 15, 16, None, None)
    # The last bracket game crowns the last bracket: the off-season starts.
    over = with_(brackets, final_weeks=weeks(1, 17), crowned=3)
    got = current_season([DONE_2025, over], "2027-01-06")
    assert (got.season, got.phase, got.playing) == (2026, "off-season", None)


def test_a_season_with_final_games_has_started_even_with_no_week_1_date():
    undated = with_(PRE_2026, week1=None, final_weeks=[1])
    got = current_season([DONE_2025, undated], "2026-09-01")
    assert (got.season, got.phase, got.through) == (2026, "regular", 1)
    assert current_season([DONE_2025, with_(PRE_2026, week1=None)], "2026-12-01").season == 2025


def test_an_nfl_com_season_is_over_even_where_its_games_are_lost():
    nfl = SeasonState(season=2013, week1=None, draft_start=None, regular_weeks=(1, 13), final_weeks=[],
                      brackets=2, crowned=1, reported=True)
    assert current_season([nfl, PRE_2026], "2026-01-01") == Current(2013, "off-season", None, None, 2026, DRAFT_2026)


def test_with_no_season_started_there_is_no_current_season():
    assert current_season([PRE_2026], "2026-08-01") is None


def test_finished_seasons_are_those_before_the_current_one_and_the_current_one_in_its_off_season():
    regular = Current(2026, "regular", 4, 5, None, None)
    assert finished([2024, 2025, 2026], regular) == {2024, 2025}
    assert finished([2024, 2025, 2026], Current(2025, "off-season", 17, None, 2026, None)) == {2024, 2025}
    assert finished([2025], None) == set()


def test_today_is_the_uk_date():
    # 23:30 UTC is 00:30 the next day in London in summer time (BST), but not in winter (GMT).
    assert uk_today(datetime(2026, 10, 14, 23, 30, tzinfo=timezone.utc)) == "2026-10-15"
    assert uk_today(datetime(2026, 12, 14, 23, 30, tzinfo=timezone.utc)) == "2026-12-14"
