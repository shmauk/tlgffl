"""Franchise profiles and head-to-head (#27): the figures the profile and pair
pages show, worked out by hand from tests/test_games.py's one 4-team season.

Ant 1, Bee 2, Cat 3, Dog 4. Regular season (weeks 1-3):
  wk1 Ant 100-90 Bee, Cat 80-70 Dog; wk2 Ant 110-100 Cat, Bee 95-95 Dog;
  wk3 Ant 90-120 Dog, Bee 105-85 Cat. Week 4 Playoffs final: Ant 130-120 Bee.
"""
import pytest

from recordbook import profiles
from tests.archive import write_games, write_csv
from tests.test_games import REGULAR, POSTSEASON, data, built, query  # noqa: F401 (fixture)


def test_a_franchise_career_sums_its_season_lines(data, tmp_path):
    db = built(data, tmp_path)
    assert query(db, "select franchise_id, seasons, wins, losses, ties, points_for, points_against, "
                     "championships, shit_bowls from franchise_careers order by franchise_id") == [
        (1, 1, 2, 1, 0, 300.0, 310.0, 1, 0),
        (2, 1, 1, 1, 1, 290.0, 280.0, 0, 0),
        (3, 1, 1, 2, 0, 265.0, 285.0, 0, 0),
        (4, 1, 1, 1, 1, 285.0, 265.0, 0, 0),
    ]


def test_career_rates_count_a_tie_as_half_a_win(data, tmp_path):
    db = built(data, tmp_path)
    [(win, pf, pa, bd)] = query(db, "select win_pct, points_for_per_game, points_against_per_game, "
                                    "breakdown_pct from franchise_careers where franchise_id = 2")
    # Bee: 1-1-1, 290 for and 280 against in 3 games, Breakdown 4-4-1.
    assert (win, pf, pa, bd) == (pytest.approx(0.5), pytest.approx(290 / 3), pytest.approx(280 / 3),
                                 pytest.approx(4.5 / 9))


def test_head_to_head_sums_every_game_two_franchises_played_lower_id_first(data, tmp_path):
    db = built(data, tmp_path)
    assert query(db, "select lo_franchise_id, hi_franchise_id, games, lo_wins, hi_wins, ties, "
                     "lo_points, hi_points, scored_games, bracket_games from head_to_head "
                     "order by lo_franchise_id, hi_franchise_id") == [
        (1, 2, 2, 2, 0, 0, 230.0, 210.0, 2, 1),   # wk1 100-90, final 130-120
        (1, 3, 1, 1, 0, 0, 110.0, 100.0, 1, 0),
        (1, 4, 1, 0, 1, 0, 90.0, 120.0, 1, 0),
        (2, 3, 1, 1, 0, 0, 105.0, 85.0, 1, 0),
        (2, 4, 1, 0, 0, 1, 95.0, 95.0, 1, 0),
        (3, 4, 1, 1, 0, 0, 80.0, 70.0, 1, 0),
    ]


def test_a_lost_score_still_counts_its_result_but_not_its_points(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert query(db, "select games, lo_wins, hi_wins, lo_points, hi_points, scored_games "
                     "from head_to_head where lo_franchise_id = 1 and hi_franchise_id = 2") == [
        (2, 2, 0, 100.0, 90.0, 1)]


def test_pairs_that_both_played_a_season_with_missing_games_are_flagged(data, tmp_path):
    # Week 3's Bee v Cat is lost, so every pair may have met more than is known.
    write_games(data, [(2014, *g) for g in REGULAR[:-1] + POSTSEASON])
    db = built(data, tmp_path)
    assert query(db, "select lo_franchise_id, hi_franchise_id, games_missing from head_to_head "
                     "order by 1, 2") == [(1, 2, 1), (1, 3, 1), (1, 4, 1), (2, 4, 1), (3, 4, 1)]
    write_games(data, [(2014, *g) for g in REGULAR + POSTSEASON])
    db = built(data, tmp_path / "full")
    assert query(db, "select distinct games_missing from head_to_head") == [(0,)]


def best_worst(db, fid):
    return query(db, "select b.measure, b.rank, g.week, b.points from franchise_best_worst b "
                     "join games g on g.id = b.game_id where b.franchise_id = ? "
                     "order by b.measure, b.rank", fid)


def test_a_franchises_best_and_worst_games_rank_its_scores(data, tmp_path):
    db = built(data, tmp_path)
    # Ant scored 100, 110, 90 and 130 in the final.
    assert best_worst(db, 1) == [
        ("best", 1, 4, 130.0), ("best", 2, 2, 110.0), ("best", 3, 1, 100.0), ("best", 4, 3, 90.0),
        ("worst", 1, 3, 90.0), ("worst", 2, 1, 100.0), ("worst", 3, 2, 110.0), ("worst", 4, 4, 130.0),
    ]


def test_best_and_worst_games_leave_out_games_whose_score_is_lost(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert [r for r in best_worst(db, 1) if r[0] == "best"] == [
        ("best", 1, 2, 110.0), ("best", 2, 1, 100.0), ("best", 3, 3, 90.0)]


def test_only_the_top_five_are_kept_plus_any_level_with_fifth():
    # (game id, franchise, points): franchise 1's scores, two level at 90.
    scores = [(1, 1, 130.0), (2, 1, 120.0), (3, 1, 110.0), (4, 1, 100.0), (5, 1, 90.0),
              (6, 1, 90.0), (7, 1, 80.0)]
    rows = profiles.best_worst_rows(scores)
    assert [(rank, gid) for _f, m, rank, gid, _p in rows if m == "best"] == [
        (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (5, 6)]
    assert [(rank, gid) for _f, m, rank, gid, _p in rows if m == "worst"] == [
        (1, 7), (2, 5), (2, 6), (4, 4), (5, 3)]
