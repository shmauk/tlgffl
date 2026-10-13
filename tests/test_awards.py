"""The nine awards (#33): each formula, its qualifying minimum and co-winners,
worked out by hand on small seasons.

Franchises Ant 1, Bee 2, Cat 3, Dog 4 play a 4-week regular season in 2015:
  wk1 Ant 100-90 Bee, Cat 80-70 Dog
  wk2 Ant 110-100 Cat, Bee 95-95 Dog
  wk3 Ant 90-120 Dog, Bee 105-85 Cat
  wk4 Ant 120-110 Bee, Cat 60-100 Dog
"""
import pytest

from recordbook import awards
from recordbook.games import Game

ANT, BEE, CAT, DOG = 1, 2, 3, 4


def game(week, home, hp, away, ap, season=2015, phase="regular"):
    winner = home if hp > ap else away if ap > hp else None
    bracket, rnd = (None, None) if phase == "regular" else ("playoffs", 1)
    return Game(season, week, phase, bracket, rnd, "final", home, hp, away, ap, winner)


GAMES = [
    game(1, ANT, 100, BEE, 90), game(1, CAT, 80, DOG, 70),
    game(2, ANT, 110, CAT, 100), game(2, BEE, 95, DOG, 95),
    game(3, ANT, 90, DOG, 120), game(3, BEE, 105, CAT, 85),
    game(4, ANT, 120, BEE, 110), game(4, CAT, 60, DOG, 100),
    # A bracket game never counts.
    game(5, ANT, 200, DOG, 10, phase="bracket"),
]


def test_nail_biter_is_the_average_absolute_margin():
    values = awards.nail_biter(GAMES, {2015})
    # Ant 10, 10, 30, 10; Bee 10, 0, 20, 10; Cat 10, 10, 20, 40; Dog 10, 0, 30, 40.
    assert values == {(2015, ANT): 15.0, (2015, BEE): 10.0, (2015, CAT): 20.0, (2015, DOG): 20.0}


def test_an_award_is_absent_for_a_season_it_is_not_decided_in():
    assert awards.nail_biter(GAMES, set()) == {}


def test_ranks_are_shared_by_level_values_and_level_firsts_are_co_winners():
    values = {(2015, ANT): 15.0, (2015, BEE): 10.0, (2015, CAT): 10.0, (2015, DOG): 20.0}
    assert awards.ranked("nail-biter", values) == [
        ("nail-biter", 2015, BEE, 10.0, 1), ("nail-biter", 2015, CAT, 10.0, 1),
        ("nail-biter", 2015, ANT, 15.0, 3), ("nail-biter", 2015, DOG, 20.0, 4)]
    assert [r[4] for r in awards.ranked("standard-deviation", values)] == [1, 2, 3, 3]


def test_ranks_ignore_floating_point_noise():
    values = {(2015, ANT): 0.1 + 0.2, (2015, BEE): 0.3}
    assert [r[4] for r in awards.ranked("nail-biter", values)] == [1, 1]


def test_standard_deviation_is_the_sample_standard_deviation_of_scores():
    values = awards.standard_deviation(GAMES, {2015})
    # Ant 100, 110, 90, 120: mean 105, squares 25+25+225+225 = 500, / 3.
    assert values[(2015, ANT)] == pytest.approx((500 / 3) ** 0.5)
    # Dog 70, 95, 120, 100: mean 96.25.
    assert values[(2015, DOG)] == pytest.approx((sum((x - 96.25) ** 2 for x in (70, 95, 120, 100)) / 3) ** 0.5)


def test_heartbreaker_averages_scores_in_losses_and_needs_three_losses():
    games = GAMES + [game(6, ANT, 50, CAT, 70), game(6, BEE, 60, DOG, 70),
                     game(7, BEE, 80, CAT, 90), game(7, ANT, 40, DOG, 70)]
    values = awards.heartbreaker(games, {2015})
    # Ant lost 90, 50, 40; Bee 90, 110, 60, 80; Cat 100, 85, 60; Dog 70 only.
    assert values == {(2015, ANT): 60.0, (2015, BEE): 85.0, (2015, CAT): pytest.approx(245 / 3)}


def test_a_tie_is_neither_a_win_nor_a_loss():
    # Bee lost twice and tied 95-95 with Dog: two losses, not three.
    assert (2015, BEE) not in awards.heartbreaker(GAMES, {2015})


def test_lucky_duck_averages_scores_in_wins_and_needs_three_wins():
    values = awards.lucky_duck(GAMES, {2015})
    # Ant won 100, 110, 120; Dog won 120, 100 only (two wins); Cat 80 only.
    assert values == {(2015, ANT): 110.0}


def test_lowest_first_awards_rank_ascending():
    values = {(2015, ANT): 110.0, (2015, DOG): 90.0}
    assert [r[2] for r in awards.ranked("lucky-duck", values)] == [DOG, ANT]


def cov(season, week, complete=1, phase="regular"):
    return (season, week, phase, None, 8, 8 if complete else 3, complete)


REGULAR_WEEKS = {2015: (1, 3), 2022: (1, 3), 2026: (1, 3)}
COVERAGE = ([cov(2015, w) for w in (1, 2, 3)]
            + [cov(2022, 1), cov(2022, 2, complete=0), cov(2022, 3)]
            # 2026 is still being played: week 3 isn't final.
            + [cov(2026, 1), cov(2026, 2)])


def test_a_season_is_decided_once_every_regular_season_week_is_final():
    assert awards.regular_seasons_over(COVERAGE, REGULAR_WEEKS) == {2015, 2022}


def test_game_awards_need_every_regular_season_game():
    assert awards.regular_seasons_covered(COVERAGE, REGULAR_WEEKS) == {2015}


def test_nfl_com_pick_a_lane_adds_nfl_coms_whole_season_adds_and_trades():
    counts = {(2014, ANT): (25, 6), (2014, BEE): (0, 0), (2014, CAT): (None, None)}
    # NFL.com didn't report Cat's counts: no value rather than zero.
    assert awards.pick_a_lane(counts, {}, {}, {}, {2014}) == {(2014, ANT): 31, (2014, BEE): 0}


SLEEPER_MOVES = {
    "transactions": [("t1", 2025, 2, "trade", 0), ("t2", 2025, 2, "waiver", 0),
                     ("t3", 2025, 3, "free_agent", 0), ("t4", 2025, 3, "trade", 0),
                     # Week 15 is after the regular season.
                     ("t5", 2025, 15, "free_agent", 0)],
    "transaction_moves": [("t1", ANT, "100", "add"), ("t1", BEE, "200", "add"),
                          ("t1", ANT, "200", "drop"), ("t1", BEE, "100", "drop"),
                          ("t2", CAT, "300", "add"), ("t2", CAT, "301", "drop"),
                          ("t3", CAT, "400", "add"), ("t3", CAT, "401", "add"),
                          ("t5", DOG, "500", "add")],
    # t4: Ant sends Dog a pick for FAAB. No NFL players move.
    "transaction_picks": [("t4", 2026, 3, ANT, ANT, DOG)],
    "transaction_budget": [("t4", DOG, ANT, 10)],
    "waiver_claims": [],
}
PLAYED = {2025: {ANT, BEE, CAT, DOG}}


def test_sleeper_pick_a_lane_counts_players_added_and_each_trade_once_per_franchise_in_it():
    # Ant: trades t1, t4; Bee: t1; Cat: 1 waiver add + 2 free-agent adds; Dog: t4 (t5 is too late).
    assert awards.pick_a_lane({}, SLEEPER_MOVES, PLAYED, {2025: (1, 14)}, {2025}) == {
        (2025, ANT): 2, (2025, BEE): 1, (2025, CAT): 3, (2025, DOG): 1}


def test_sleeper_pick_a_lane_waits_for_the_regular_season_to_end():
    assert awards.pick_a_lane({}, SLEEPER_MOVES, PLAYED, {2025: (1, 14)}, set()) == {}


def lineup(week, fid, pid, points, starter=True, season=2025):
    return (season, week, fid, "FLEX" if starter else "BN", 1 if starter else None, int(starter), pid, points)


def test_one_man_army_is_the_best_nfl_players_share_of_starter_points_in_weeks_started():
    rows = [
        # Ant: "a" starts both weeks (30 + 10), "b" 20 + 40; "c" scores 50 on the bench.
        lineup(1, ANT, "a", 30.0), lineup(1, ANT, "b", 20.0), lineup(1, ANT, "c", 50.0, starter=False),
        lineup(2, ANT, "a", 10.0), lineup(2, ANT, "b", 40.0), lineup(2, ANT, "c", 0.0),
        # Bee: an empty slot has no NFL player and no points.
        lineup(1, BEE, "d", 25.0), lineup(1, BEE, None, None),
        lineup(2, BEE, "d", 25.0), lineup(2, BEE, "e", 50.0),
        # Week 15 is after the regular season.
        lineup(15, BEE, "e", 500.0),
    ]
    # Ant: b's 60 of 100; Bee: d's 50 (or e's 50) of 100.
    assert awards.one_man_army(rows, {2025: (1, 14)}, {2025}) == {(2025, ANT): 0.6, (2025, BEE): 0.5}
    assert awards.one_man_army(rows, {2025: (1, 14)}, set()) == {}


def test_draft_dodger_counts_its_own_draft_picks_still_rostered_when_the_regular_season_ends():
    # (season, franchise that made the pick, NFL player, Sleeper's keeper flag).
    picks = [(2025, ANT, "a1", None), (2025, ANT, "a2", None), (2025, ANT, "k1", None),
             # Bee used a pick it traded for: it still counts as Bee's.
             (2025, BEE, "b1", None), (2025, BEE, "b2", None),
             (2025, CAT, "c1", None), (2025, CAT, "c2", True)]
    keepers = {2025: {(ANT, "k1")}}
    # Week 14's lineups, bench included: who is rostered when the regular season ends.
    rows = [lineup(14, ANT, "a1", 1.0), lineup(14, ANT, "k1", 1.0), lineup(14, ANT, "a2", 0.0, starter=False),
            lineup(14, BEE, "b1", 1.0), lineup(14, BEE, "c1", 1.0),
            lineup(14, CAT, "c2", 1.0), lineup(13, CAT, "c1", 1.0),
            lineup(14, DOG, "x", 1.0)]
    # Ant a1, a2 (k1 is a keeper); Bee b1 (c1 isn't its pick); Cat none (c2 is
    # a keeper, c1 was gone by week 14); Dog drafted nobody still there.
    assert awards.draft_dodger(picks, keepers, rows, {2025: (1, 14)}, {2025}) == {
        (2025, ANT): 2, (2025, BEE): 1, (2025, CAT): 0, (2025, DOG): 0}


def claim(tid, week, fid, pid, bid, won, run, season=2025):
    """A waiver_claims row; run is when Sleeper processed the waiver run."""
    return (tid, season, week, fid, pid, None, bid, int(won), run)


CLAIMS = [
    # Run 100 (week 2): Ant wins "p" at 30 over Bee's 12 and Cat's 20; Bee wins "q" at 5 alone.
    claim("w1", 2, ANT, "p", 30, True, 100), claim("w2", 2, BEE, "p", 12, False, 100),
    claim("w3", 2, CAT, "p", 20, False, 100), claim("w4", 2, BEE, "q", 5, True, 100),
    # Run 200 (week 2 again): Cat wins "p" at 8: run 100's bids for "p" don't count against it.
    claim("w5", 2, CAT, "p", 8, True, 200), claim("w6", 2, DOG, "r", 25, False, 200),
    claim("w7", 2, DOG, "r", 25, True, 200),
    # Week 15 is after the regular season.
    claim("w8", 15, BEE, "s", 99, False, 300), claim("w9", 15, ANT, "s", 100, True, 300),
]


def test_highest_failed_bid_is_the_biggest_bid_that_lost_a_waiver_claim():
    # Ant never lost a claim in the regular season: no value.
    assert awards.highest_failed_bid(CLAIMS, {2025: (1, 14)}, {2025}) == {
        (2025, BEE): 12, (2025, CAT): 20, (2025, DOG): 25}


def test_most_overpaid_is_the_biggest_gap_to_the_next_highest_bid_in_the_same_waiver_run():
    # Ant 30 - 20; Bee 5 - $0 (nobody else bid); Cat 8 - $0; Dog 25 - 25.
    assert awards.most_overpaid(CLAIMS, {2025: (1, 14)}, {2025}) == {
        (2025, ANT): 10, (2025, BEE): 5, (2025, CAT): 8, (2025, DOG): 0}
    assert awards.most_overpaid(CLAIMS, {2025: (1, 14)}, set()) == {}
