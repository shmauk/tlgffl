"""NFL.com-era games, coverage and the ADR 0001 agreement check.

The fixture is one 4-team season: a 3-week regular season, then a 2-team
Playoffs final and a consolation game in week 4. Every expected figure below is
worked out by hand from the game list.
"""
import sqlite3

import pytest

from recordbook.build import build, BuildError
from tests.archive import (team, write_nfl_season, write_franchise_keys, write_sleeper_aliases,
                           write_games)

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
