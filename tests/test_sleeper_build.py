"""The Sleeper era in the build (#25): games, brackets, the roster-total
cross-check, lineups and transactions, from synthetic snapshots."""
import sqlite3

import pytest

from recordbook.build import build, BuildError
from tests.archive import (write_sleeper_league, write_sleeper_brackets, write_sleeper_adjustments,
                           write_franchise_keys, write_sleeper_aliases, write_formats, fmt)

# Six rosters in two divisions; roster r is franchise 10 + r.
DIVISIONS = {1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2}
WEEKS = {
    1: [(1, 100.0, 2, 90.0), (3, 80.0, 4, 85.0), (5, 70.0, 6, 70.5)],
    2: [(1, 110.0, 3, 95.0), (2, 99.0, 5, 101.0), (4, 60.0, 6, 65.0)],
    # Week 3: the Playoffs final, the Shit Bowl final, and a filler pairing.
    3: [(1, 120.0, 6, 100.0), (2, 50.0, 3, 60.0), (4, 75.0, 5, 74.0)],
}
TOTALS = {1: (2, 0, 0, 210.0), 2: (0, 2, 0, 189.0), 3: (0, 2, 0, 175.0),
          4: (1, 1, 0, 145.0), 5: (1, 1, 0, 171.0), 6: (2, 0, 0, 135.5)}
BRACKETS = [(2025, 3, 1, 6, "playoffs", 1), (2025, 3, 2, 3, "shit_bowl", 1),
            (2025, 3, 4, 5, "filler", "")]


@pytest.fixture
def sleeper(tmp_path):
    data = tmp_path / "data"
    write_sleeper_league(data, 2025, WEEKS, DIVISIONS, totals=TOTALS)
    write_franchise_keys(data, [(10 + r, "sleeper", r, "") for r in DIVISIONS])
    write_sleeper_aliases(data, [(r, f"Sleeper {r}", f"Team {r}") for r in DIVISIONS])
    write_sleeper_brackets(data, BRACKETS)
    write_formats(data, {2025: fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025)})
    return data


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


def test_regular_season_games_come_from_sleeper_matchups(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert query(db, "select week, home_franchise_id, home_points, away_franchise_id, away_points, "
                     "winner_franchise_id, status from games where phase = 'regular' and week = 1 "
                     "order by home_franchise_id") == [
        (1, 11, 100.0, 12, 90.0, 11, "final"),
        (1, 13, 80.0, 14, 85.0, 14, "final"),
        (1, 15, 70.0, 16, 70.5, 16, "final")]


def test_season_lines_are_always_derived_from_sleeper_games(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert query(db, "select franchise_id, source, wins, losses, ties, points_for, points_against, "
                     "division from season_lines where season = 2025 order by franchise_id") == [
        (11, "derived", 2, 0, 0, 210.0, 185.0, "Group A"),
        (12, "derived", 0, 2, 0, 189.0, 201.0, "Group A"),
        (13, "derived", 0, 2, 0, 175.0, 195.0, "Group A"),
        (14, "derived", 1, 1, 0, 145.0, 145.0, "Group B"),
        (15, "derived", 1, 1, 0, 171.0, 169.5, "Group B"),
        (16, "derived", 2, 0, 0, 135.5, 130.0, "Group B")]
    # Breakdown: week 1 scores 100, 90, 80, 85, 70, 70.5; week 2 110, 95, 99, 101, 60, 65.
    assert query(db, "select breakdown_wins, breakdown_losses, breakdown_ties, round(luck, 4) "
                     "from season_lines where season = 2025 and franchise_id in (11, 16) "
                     "order by franchise_id") == [(10, 0, 0, 0.0), (2, 8, 0, 0.8)]


def test_bracket_games_follow_the_hand_kept_assignment_and_filler_never_becomes_a_game(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert query(db, "select week, bracket, round, home_franchise_id, home_points, away_franchise_id, "
                     "away_points, winner_franchise_id from games where phase = 'bracket' "
                     "order by bracket") == [
        (3, "playoffs", 1, 11, 120.0, 16, 100.0, 11),
        (3, "shit_bowl", 1, 12, 50.0, 13, 60.0, 13)]
    assert query(db, "select count(*) from games where 14 in (home_franchise_id, away_franchise_id) "
                     "and week = 3") == [(0,)]


def test_a_bracket_week_pairing_with_no_assignment_fails_the_build(sleeper, tmp_path):
    write_sleeper_brackets(sleeper, BRACKETS[:2])
    with pytest.raises(BuildError, match="2025 week 3.*rosters 4 and 5.*data/sleeper_brackets.csv"):
        build(sleeper, tmp_path / "league.sqlite")


def test_an_assignment_with_no_such_pairing_fails_the_build(sleeper, tmp_path):
    write_sleeper_brackets(sleeper, [*BRACKETS, (2025, 3, 1, 2, "playoffs", 1)])
    with pytest.raises(BuildError, match="2025 week 3.*rosters 1 and 2.*no such pairing"):
        build(sleeper, tmp_path / "league.sqlite")


def test_an_assignment_outside_its_brackets_weeks_fails_the_build(sleeper, tmp_path):
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3]), shit_bowl=(2, [4]), divisions=2, realignment=2025)})
    with pytest.raises(BuildError, match="2025 week 3.*Shit Bowl.*weeks 4"):
        build(sleeper, tmp_path / "league.sqlite")


def test_a_commissioners_custom_points_override_the_matchup_points(sleeper, tmp_path):
    # The commissioner gave roster 2 a week-1 score of 101, turning the loss into a win.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, custom={(1, 2): 101.0},
                         totals={**TOTALS, 1: (1, 1, 0, 210.0), 2: (1, 1, 0, 200.0)})
    db = built(sleeper, tmp_path)
    assert query(db, "select home_points, away_points, winner_franchise_id from games "
                     "where season = 2025 and week = 1 and home_franchise_id = 11") == [(100.0, 101.0, 12)]
    assert query(db, "select wins, losses, points_for from season_lines where franchise_id = 12"
                 ) == [(1, 1, 200.0)]


def test_weeks_sleeper_has_not_finished_scoring_are_not_games(sleeper, tmp_path):
    # Mid-season: Sleeper has scored week 1 only; week 2 is live and week 3 to come.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         totals={1: (1, 0, 0, 100.0), 2: (0, 1, 0, 90.0), 3: (0, 1, 0, 80.0),
                                 4: (1, 0, 0, 85.0), 5: (0, 1, 0, 70.0), 6: (1, 0, 0, 70.5)})
    db = built(sleeper, tmp_path)
    assert query(db, "select distinct week from games where season = 2025") == [(1,)]
    assert query(db, "select wins, losses, points_for from season_lines where franchise_id = 11"
                 ) == [(1, 0, 100.0)]
    assert query(db, "select count(*) from bracket_winners where season = 2025") == [(0,)]


def crowned(db, season=2025):
    return query(db, "select bracket, franchise_id, source from bracket_winners where season = ? "
                     "order by bracket", season)


def test_each_bracket_crowns_from_its_final(sleeper, tmp_path):
    # The Shit Bowl crowns the final's loser: roster 2 scored 50 to roster 3's 60.
    db = built(sleeper, tmp_path)
    assert crowned(db) == [("playoffs", 11, "derived"), ("shit_bowl", 12, "derived")]


def test_a_mediocre_bowl_series_is_won_on_games_then_total_points(sleeper, tmp_path):
    # Rosters 4 and 5 play a best-of-three in weeks 3-5: 4 wins 91-74, 5 wins
    # 90-80, then a 90-90 tie. Level on 1.5 games, so total points decide it:
    # 4 has 261, 5 has 254.
    weeks = {**WEEKS, 3: [*WEEKS[3][:2], (4, 91.0, 5, 74.0)], 4: [(4, 80.0, 5, 90.0)],
             5: [(4, 90.0, 5, 90.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, totals=TOTALS)
    write_sleeper_brackets(sleeper, [*BRACKETS[:2], *[(2025, w, 4, 5, "mediocre_bowl", 1) for w in (3, 4, 5)]])
    f = fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025)
    f["brackets"]["mediocre_bowl"] = {"size": 2, "weeks": [3, 4, 5], "series": "best of three"}
    write_formats(sleeper, {2025: f})
    db = built(sleeper, tmp_path)
    assert crowned(db)[0] == ("mediocre_bowl", 14, "derived")


def test_no_bracket_crowns_anyone_before_its_last_week_is_final(sleeper, tmp_path):
    weeks = {**WEEKS, 4: [(1, 0.0, 6, 0.0), (2, 0.0, 3, 0.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, status="in_season", last_scored_leg=3,
                         totals=TOTALS)
    write_sleeper_brackets(sleeper, [*BRACKETS, (2025, 4, 1, 6, "playoffs", 2),
                                     (2025, 4, 2, 3, "shit_bowl", 2)])
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3, 4]), shit_bowl=(2, [3, 4]), divisions=2,
                                      realignment=2025)})
    db = built(sleeper, tmp_path)
    assert crowned(db) == []


def test_a_season_line_names_the_bracket_the_franchise_played_in(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert query(db, "select franchise_id, bracket from season_lines order by franchise_id") == [
        (11, "playoffs"), (12, "shit_bowl"), (13, "shit_bowl"), (14, None), (15, None), (16, "playoffs")]


def test_roster_totals_must_agree_with_the_games_on_wins_losses_and_ties(sleeper, tmp_path):
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, totals={**TOTALS, 6: (1, 1, 0, 135.5)})
    with pytest.raises(BuildError, match="2025 roster 6: Sleeper's roster totals give W-L-T 1-1-0, "
                                         "the games 2-0-0"):
        build(sleeper, tmp_path / "league.sqlite")


def test_an_unexplained_points_gap_fails_the_build(sleeper, tmp_path):
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, totals={**TOTALS, 6: (2, 0, 0, 141.5)})
    with pytest.raises(BuildError, match="2025 roster 6: .*141.5.*135.5.*6.0.*data/sleeper_adjustments.csv"):
        build(sleeper, tmp_path / "league.sqlite")


def test_a_points_gap_explained_to_the_point_passes(sleeper, tmp_path):
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, totals={**TOTALS, 6: (2, 0, 0, 141.5)})
    write_sleeper_adjustments(sleeper, [(2025, 6, 2, 6.0, "a return TD the league doesn't score")])
    db = built(sleeper, tmp_path)
    assert query(db, "select points_for from season_lines where franchise_id = 16") == [(135.5,)]


def test_an_explanation_of_the_wrong_amount_fails_the_build(sleeper, tmp_path):
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, totals={**TOTALS, 6: (2, 0, 0, 141.5)})
    write_sleeper_adjustments(sleeper, [(2025, 6, 2, 5.0, "a return TD the league doesn't score")])
    with pytest.raises(BuildError, match="2025 roster 6"):
        build(sleeper, tmp_path / "league.sqlite")


def test_a_stale_explanation_fails_the_build(sleeper, tmp_path):
    # Sleeper fixed its total, so the entry no longer explains anything.
    write_sleeper_adjustments(sleeper, [(2025, 6, 2, 6.0, "a return TD the league doesn't score")])
    with pytest.raises(BuildError, match="data/sleeper_adjustments.csv.*2025 roster 6.*stale"):
        build(sleeper, tmp_path / "league.sqlite")


def test_a_season_sleeper_has_scored_further_than_its_final_weeks_is_not_cross_checked(sleeper, tmp_path):
    # Mid-season, Sleeper's totals already count week 2, which isn't final yet.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         totals=TOTALS)
    db = built(sleeper, tmp_path)
    assert query(db, "select wins from season_lines where franchise_id = 11") == [(1,)]
