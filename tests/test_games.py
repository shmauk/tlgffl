"""NFL.com-era games, coverage and the ADR 0001 agreement check.

The fixture is one 4-team season: a 3-week regular season, then a 2-team
Playoffs final and a consolation game in week 4. Every expected figure below is
worked out by hand from the game list.
"""
import sqlite3

import pytest

from recordbook.build import build, BuildError
from tests.archive import (team, write_nfl_season, write_franchise_keys, write_sleeper_aliases,
                           write_games, write_formats, fmt)

# (week, home, away, home score, away score)
REGULAR = [
    (1, "Ant", "Bee", 100, 90), (1, "Cat", "Dog", 80, 70),
    (2, "Ant", "Cat", 110, 100), (2, "Bee", "Dog", 95, 95),
    (3, "Ant", "Dog", 90, 120), (3, "Bee", "Cat", 105, 85),
]
POSTSEASON = [(4, "Ant", "Bee", 130, 120), (4, "Cat", "Dog", 70, 60)]

# As NFL.com reported them: (W, L, T, PF, PA)
REPORTED = {
    "Ant": (2, 1, 0, 300, 310),
    "Bee": (1, 1, 1, 290, 280),
    "Cat": (1, 2, 0, 265, 285),
    "Dog": (1, 1, 1, 285, 265),
}


def write_season(data, reported=REPORTED):
    seeds = {"Ant": (1, "championship"), "Bee": (2, "championship"),
             "Cat": (1, "consolation"), "Dog": (2, "consolation")}
    teams = []
    for slot, name in enumerate(reported, start=1):
        w, l, t, pf, pa = reported[name]
        seed, bracket = seeds[name]
        teams.append(team(slot, slot * 100, name, (w, l, t), pf, pa, seed=seed, bracket=bracket))
    write_nfl_season(data, 2014, teams, final_order=[1, 2, 3, 4])


@pytest.fixture
def data(tmp_path):
    data = tmp_path / "data"
    write_season(data)
    write_franchise_keys(data, [(slot, "nfl.com", slot, slot * 100) for slot in range(1, 5)])
    write_sleeper_aliases(data, [])
    write_games(data, [(2014, *g) for g in REGULAR + POSTSEASON])
    write_formats(data, {2014: fmt(4, 3, (2, [4]), shit_bowl=(2, [4]))})
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


def test_regular_season_games_are_stored_against_franchises(data, tmp_path):
    db = built(data, tmp_path)
    assert query(db, "select week, phase, bracket, round, status, home_franchise_id, home_points, "
                     "away_franchise_id, away_points from games where season = 2014 "
                     "and phase = 'regular' order by week, home_franchise_id") == [
        (1, "regular", None, None, "final", 1, 100.0, 2, 90.0),
        (1, "regular", None, None, "final", 3, 80.0, 4, 70.0),
        (2, "regular", None, None, "final", 1, 110.0, 3, 100.0),
        (2, "regular", None, None, "final", 2, 95.0, 4, 95.0),
        (3, "regular", None, None, "final", 1, 90.0, 4, 120.0),
        (3, "regular", None, None, "final", 2, 105.0, 3, 85.0),
    ]


def test_playoffs_games_carry_bracket_and_round_and_other_postseason_pairings_are_not_stored(data, tmp_path):
    # Cat v Dog in week 4 is NFL.com's consolation bracket, which advanced
    # winners: the league's Shit Bowl games are recorded by hand, not taken from it.
    db = built(data, tmp_path)
    assert query(db, "select week, phase, bracket, round, status, home_franchise_id, home_points, "
                     "away_franchise_id, away_points from games where week > 3") == [
        (4, "bracket", "playoffs", 1, "final", 1, 130.0, 2, 120.0)]


def test_a_playoffs_game_whose_score_is_lost_is_rebuilt_from_seeds_and_final_placings(data, tmp_path):
    # Ant (seed 1) finished first and Bee (seed 2) second, so they met in the
    # final, and Ant won it, even though no score survives.
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert query(db, "select week, bracket, round, status, home_franchise_id, home_points, "
                     "away_franchise_id, away_points, winner_franchise_id from games "
                     "where phase = 'bracket'") == [(4, "playoffs", 1, "final", 1, None, 2, None, 1)]


def test_a_logged_playoffs_score_that_contradicts_the_final_placings_fails_the_build(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR] + [(2014, 4, "Ant", "Bee", 110, 120)])
    with pytest.raises(BuildError, match="2014 week 4.*final placings"):
        built(data, tmp_path)


def test_a_seasons_highs_and_lows_come_from_its_scored_games(data, tmp_path):
    db = built(data, tmp_path)
    rows = query(db, "select h.measure, g.week, h.franchise_id, h.value from season_highs_lows h "
                     "join games g on g.id = h.game_id where h.season = 2014 "
                     "order by h.measure, g.week, h.franchise_id")
    assert rows == [
        ("biggest_margin", 3, 4, 30.0),            # Dog 120, Ant 90
        ("highest_score", 4, 1, 130.0),            # Ant in the final
        ("lowest_score", 1, 4, 70.0),              # Dog
        # Ties for the narrowest win are all listed; Bee v Dog's tie is no win.
        ("narrowest_margin", 1, 1, 10.0), ("narrowest_margin", 1, 3, 10.0),
        ("narrowest_margin", 2, 1, 10.0), ("narrowest_margin", 4, 1, 10.0),
    ]


def test_games_whose_score_is_lost_are_left_out_of_highs_and_lows(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert query(db, "select value from season_highs_lows where measure = 'highest_score'") == [(120.0,)]


def test_a_game_naming_an_unknown_team_fails_the_build(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR] + [(2014, 4, "Ant", "Eel", 130, 120)])
    with pytest.raises(BuildError, match="2014 .*'Eel'"):
        built(data, tmp_path)


def test_a_franchise_playing_twice_in_a_week_fails_the_build(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR] + [(2014, 3, "Ant", "Bee", 100, 90)])
    with pytest.raises(BuildError, match="2014 week 3"):
        built(data, tmp_path)


def test_coverage_is_recorded_per_season_week_and_phase(data, tmp_path):
    # Week 3's Bee v Cat and the Playoffs final are lost.
    write_games(data, [(2014, *g) for g in REGULAR[:-1]])
    db = built(data, tmp_path)
    assert query(db, "select week, phase, bracket, games_expected, games_final, complete "
                     "from coverage where season = 2014 order by week") == [
        (1, "regular", None, 2, 2, 1),
        (2, "regular", None, 2, 2, 1),
        (3, "regular", None, 2, 1, 0),
        (4, "bracket", "playoffs", 1, 0, 0),
    ]


def test_the_regular_season_is_as_long_as_the_format_says(data, tmp_path):
    # Had the season run four weeks, week 4 would be a regular-season week with
    # no surviving games, and the Playoffs would be in week 5.
    write_formats(data, {2014: fmt(4, 4, (2, [5]), shit_bowl=(2, [5]))})
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert query(db, "select week, phase, bracket, games_expected, games_final, complete "
                     "from coverage where season = 2014 and week > 3 order by week") == [
        (4, "regular", None, 2, 0, 0),
        (5, "bracket", "playoffs", 1, 0, 0),
    ]


def test_a_fully_covered_season_derives_its_season_lines_from_games(data, tmp_path):
    db = built(data, tmp_path)
    assert query(db, "select franchise_id, source, wins, losses, ties, points_for, points_against, "
                     "seed, bracket, final_placing from season_lines where season = 2014 "
                     "order by franchise_id") == [
        (1, "derived", 2, 1, 0, 300.0, 310.0, 1, "championship", 1),
        (2, "derived", 1, 1, 1, 290.0, 280.0, 2, "championship", 2),
        (3, "derived", 1, 2, 0, 265.0, 285.0, 1, "consolation", 3),
        (4, "derived", 1, 1, 1, 285.0, 265.0, 2, "consolation", 4),
    ]


def test_adding_a_seasons_missing_games_switches_its_season_lines_to_derived(data, tmp_path):
    # The log stops before week 3, as 2022's does after week 9.
    write_games(data, [(2014, *g) for g in REGULAR if g[0] < 3])
    db = built(data, tmp_path / "before")
    assert query(db, "select franchise_id, source, wins, losses, ties, points_for, points_against "
                     "from season_lines where season = 2014 order by franchise_id") == [
        (1, "reported", 2, 1, 0, 300.0, 310.0),
        (2, "reported", 1, 1, 1, 290.0, 280.0),
        (3, "reported", 1, 2, 0, 265.0, 285.0),
        (4, "reported", 1, 1, 1, 285.0, 265.0),
    ]
    # The recovered games are appended as plain rows; nothing else changes.
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path / "after")
    assert query(db, "select distinct source from season_lines where season = 2014") == [("derived",)]


@pytest.mark.parametrize("planted, figure", [
    ((1, 2, 0, 300, 310), "W-L-T"),
    ((2, 1, 0, 300.02, 310), "points for"),
    ((2, 1, 0, 300, 309.5), "points against"),
])
def test_a_reported_line_that_disagrees_with_the_games_fails_the_build(data, tmp_path, planted, figure):
    write_season(data, {**REPORTED, "Ant": planted})
    with pytest.raises(BuildError, match=f"2014 franchise 1:.*{figure}"):
        built(data, tmp_path)


def test_a_season_without_full_coverage_has_nothing_to_disagree_with(data, tmp_path):
    write_season(data, {**REPORTED, "Ant": (1, 2, 0, 300, 310)})
    write_games(data, [(2014, *g) for g in REGULAR[:-1]])
    db = built(data, tmp_path)
    assert query(db, "select source, wins, losses from season_lines where franchise_id = 1") == [
        ("reported", 1, 2)]


def test_breakdown_and_luck_are_stored_for_a_fully_covered_season(data, tmp_path):
    # Weekly scores, best first: wk1 Ant 100, Bee 90, Cat 80, Dog 70;
    # wk2 Ant 110, Cat 100, Bee 95 = Dog 95; wk3 Dog 120, Bee 105, Ant 90, Cat 85.
    db = built(data, tmp_path)
    rows = query(db, "select franchise_id, breakdown_wins, breakdown_losses, breakdown_ties, luck "
                     "from season_lines where season = 2014 order by franchise_id")
    assert [r[:4] for r in rows] == [(1, 7, 2, 0), (2, 4, 4, 1), (3, 3, 6, 0), (4, 3, 5, 1)]
    # Win % minus Breakdown %, a tie counting half: Ant 6/9 - 7/9, Dog 4.5/9 - 3.5/9.
    assert [r[4] for r in rows] == [pytest.approx(-1 / 9), pytest.approx(0), pytest.approx(0),
                                    pytest.approx(1 / 9)]


def test_breakdown_and_luck_are_absent_without_full_coverage(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR[:-1]])
    db = built(data, tmp_path)
    assert query(db, "select distinct breakdown_wins, breakdown_losses, breakdown_ties, luck "
                     "from season_lines") == [(None, None, None, None)]
