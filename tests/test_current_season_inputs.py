"""What Python writes for the current season (#35): each Sleeper season's
calendar (draft and week 1), the bracket-week pairings still to play, and the
award leaders while a regular season is on. Which season is current, and its
phase, are decided once, here, from these and the build date (recordbook/current.py)."""
import json

import yaml

from recordbook.build import build
from recordbook.formats import Bracket, Format
from recordbook.games import Game
from recordbook.sleeper import upcoming_brackets

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


def built_on(data, tmp_path, today):
    db = tmp_path / "league.sqlite"
    build(data, db, today=today)
    return db


CURRENT = ("select season, phase, through, playing, next_season, next_draft_start, today "
           "from current_season, build_date")


def test_the_current_season_and_its_phase_are_written_once_for_the_build_date(sleeper, tmp_path):  # noqa: F811
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         totals={1: (1, 0, 0, 100.0), 2: (0, 1, 0, 90.0), 3: (0, 1, 0, 80.0),
                                 4: (1, 0, 0, 85.0), 5: (0, 1, 0, 70.0), 6: (1, 0, 0, 70.5)})
    db = built_on(sleeper, tmp_path, "2025-09-20")
    assert query(db, CURRENT) == [(2025, "regular", 1, 2, None, None, "2025-09-20")]


def test_a_crowned_season_is_in_its_off_season_with_the_next_draft_once_sleeper_has_it(sleeper, tmp_path):  # noqa: F811
    write_sleeper_league(sleeper, 2026, {1: [(1, 0.0, 2, 0.0)]}, DIVISIONS, status="pre_draft", last_scored_leg=0)
    write_snapshot(sleeper, "2026-drafts.json", [{"draft_id": "D", "start_time": 1788285600000}])
    write_snapshot(sleeper, "2026-state.json", {"season": "2026", "season_start_date": "2026-09-09"})
    formats = yaml.safe_load((sleeper / "formats.yaml").read_text())
    formats[2026] = formats[2025]
    (sleeper / "formats.yaml").write_text(yaml.safe_dump(formats, sort_keys=False))
    db = built_on(sleeper, tmp_path, "2026-09-08")
    assert query(db, CURRENT) == [(2025, "off-season", 3, None, 2026, 1788285600000, "2026-09-08")]
    db = built_on(sleeper, tmp_path, "2026-09-09")
    assert query(db, CURRENT)[0][:4] == (2026, "regular", None, 1)


# Placing a bracket-week pairing nobody has assigned yet, from the season's
# bracket games (ADR 0004: the site only renders it). Roster r is franchise
# 10 + r; Sleeper has paired week 4, which isn't final.
def place(fmt_brackets, played, week4, assigned=None):
    fmt = Format(2025, 8, 1, 2025, (1, 2), {name: Bracket(name, size, tuple(weeks), series)
                                            for name, (size, weeks, series) in fmt_brackets.items()})
    games = [Game(2025, 3, "bracket", b, 1, "final", 10 + h, hp, 10 + a, ap,
                  10 + h if hp > ap else 10 + a if ap > hp else None) for b, h, hp, a, ap in played]
    weeks = {3: [], 4: [{"roster_id": r, "matchup_id": m, "points": 0.0}
                        for m, pair in enumerate(week4, start=1) for r in pair]}
    league = {"status": "in_season", "settings": {"last_scored_leg": 3}}
    return upcoming_brackets(2025, league, weeks, fmt, lambda r: 10 + r, assigned or {}, games)


def test_a_pairing_with_a_franchise_still_in_a_bracket_is_that_brackets_next_round():
    # The Playoffs' semi-finals were week 3: 1 and 2 won, 3 and 4 are out.
    rows = place({"playoffs": (4, [3, 4], None)},
                 [("playoffs", 1, 100.0, 4, 90.0), ("playoffs", 2, 100.0, 3, 90.0)],
                 [(1, 2), (3, 4), (5, 6)])
    assert rows == [(2025, 4, 11, 12, "playoffs", 2), (2025, 4, 13, 14, None, None),
                    (2025, 4, 15, 16, None, None)]


def test_a_bye_franchise_meeting_a_winner_is_in_the_winners_bracket():
    # Seed 1 (roster 1) had a bye; roster 2 won round 1.
    rows = place({"playoffs": (3, [3, 4], None)}, [("playoffs", 2, 100.0, 3, 90.0)], [(1, 2), (3, 4)])
    assert rows == [(2025, 4, 11, 12, "playoffs", 2), (2025, 4, 13, 14, None, None)]


def test_in_the_shit_bowl_losing_advances_and_winning_is_out():
    rows = place({"shit_bowl": (4, [3, 4], None)},
                 [("shit_bowl", 5, 100.0, 6, 90.0), ("shit_bowl", 7, 100.0, 8, 90.0)],
                 [(6, 8), (5, 7)])
    assert rows == [(2025, 4, 16, 18, "shit_bowl", 2), (2025, 4, 15, 17, None, None)]


def test_a_series_keeps_both_franchises_and_stays_round_1():
    rows = place({"mediocre_bowl": (2, [3, 4, 5], "best of three")}, [("mediocre_bowl", 1, 100.0, 2, 90.0)],
                 [(1, 2)])
    assert rows == [(2025, 4, 11, 12, "mediocre_bowl", 1)]


def test_a_maintainers_row_wins_and_a_bracket_not_playing_that_week_places_nothing():
    rows = place({"playoffs": (4, [3], None), "mediocre_bowl": (2, [4], None)},
                 [("playoffs", 1, 100.0, 4, 90.0), ("playoffs", 2, 100.0, 3, 90.0)],
                 [(1, 2), (5, 6)], assigned={(4, frozenset((5, 6))): ("mediocre_bowl", 1)})
    assert rows == [(2025, 4, 11, 12, None, None), (2025, 4, 15, 16, "mediocre_bowl", 1)]
