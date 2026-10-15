"""Each franchise's bracket runs (#43): the round it reached in each bracket
and how its run ended, written by the build for both eras.

NFL.com era: test_games' 4-team 2014 season, Ant beating Bee in the week-4
Playoffs final.
"""
import pytest

from recordbook.build import BuildError
from tests import scenarios
from tests.test_brackets import write_shitbowl
from tests.archive import write_formats, write_sleeper_brackets, write_sleeper_league, fmt
from tests.test_games import data, built, query  # noqa: F401  (data is a fixture)
from tests.test_sleeper_build import BRACKETS, DIVISIONS, TOTALS, WEEKS, sleeper  # noqa: F401  (a fixture)


def runs(db, season):
    return query(db, "select bracket, f.name, round_reached, result, source from bracket_runs r "
                     "join franchises f on f.id = r.franchise_id where season = ? "
                     "order by bracket, f.name", season)


def test_the_playoffs_final_crowns_one_finalist_and_leaves_the_other_runner_up(data, tmp_path):
    db = built(data, tmp_path)
    assert runs(db, 2014) == [("playoffs", "Ant", 1, "crowned", "derived"),
                              ("playoffs", "Bee", 1, "runner_up", "derived")]


def test_a_hand_kept_crown_is_a_run_with_no_round_and_the_crowns_source(data, tmp_path):
    write_shitbowl(data, [(2014, "Dog", "recalled")])
    db = built(data, tmp_path)
    assert [r for r in runs(db, 2014) if r[0] == "shit_bowl"] == [("shit_bowl", "Dog", None, "crowned", "recalled")]


def test_every_candidate_for_a_disputed_crown_has_a_disputed_run(data, tmp_path):
    write_shitbowl(data, [(2014, "Cat|Dog", "inconclusive")])
    db = built(data, tmp_path)
    assert [r for r in runs(db, 2014) if r[0] == "shit_bowl"] == [("shit_bowl", "Cat", None, "crowned", "disputed"),
                                                                ("shit_bowl", "Dog", None, "crowned", "disputed")]


def test_an_unknown_winner_has_no_run(data, tmp_path):
    db = built(data, tmp_path)
    assert [r for r in runs(db, 2014) if r[0] == "shit_bowl"] == []


def sleeper_runs(scenario, tmp_path):
    return [(b, f, rnd, result) for b, f, rnd, result, _source in runs(scenarios.write(scenario, tmp_path), 2025)]


def test_after_the_first_playoffs_week_its_winners_are_still_in_and_its_losers_out_in_round_1(tmp_path):
    assert [r for r in sleeper_runs("brackets", tmp_path) if r[0] == "playoffs"] == [
        ("playoffs", "Team 1", 1, "alive"), ("playoffs", "Team 2", 1, "alive"),
        ("playoffs", "Team 3", 1, "out"), ("playoffs", "Team 4", 1, "out")]


def test_a_finished_sleeper_season_crowns_and_places_every_franchise_in_its_brackets(tmp_path):
    assert sleeper_runs("off-season", tmp_path) == [
        ("playoffs", "Team 1", 2, "crowned"), ("playoffs", "Team 2", 2, "runner_up"),
        ("playoffs", "Team 3", 1, "out"), ("playoffs", "Team 4", 1, "out"),
        # Losing advances: Team 5 won the final and escaped as runner-up.
        ("shit_bowl", "Team 5", 1, "runner_up"), ("shit_bowl", "Team 6", 1, "crowned")]


def series_season(sleeper, through):
    """test_sleeper_build's season with a best-of-three Mediocre Bowl in weeks
    3-5 between rosters 4 and 5 (franchises 14 and 15), final through week
    `through`: 4 wins 91-74, 5 wins 90-80, then 4 wins 95-90."""
    weeks = {**WEEKS, 3: [*WEEKS[3][:2], (4, 91.0, 5, 74.0)], 4: [(4, 80.0, 5, 90.0)],
             5: [(4, 95.0, 5, 90.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, totals=TOTALS, last_scored_leg=through,
                         status="complete" if through == 5 else "in_season")
    write_sleeper_brackets(sleeper, [*BRACKETS[:2], *[(2025, w, 4, 5, "mediocre_bowl", 1) for w in (3, 4, 5)]])
    f = fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025)
    f["brackets"]["mediocre_bowl"] = {"size": 2, "weeks": [3, 4, 5], "series": "best of three"}
    write_formats(sleeper, {2025: f})


def mediocre_runs(db):
    return [r for r in runs(db, 2025) if r[0] == "mediocre_bowl"]


def test_a_series_is_one_round_with_both_franchises_still_in_until_it_is_won(sleeper, tmp_path):
    series_season(sleeper, through=4)
    assert mediocre_runs(built(sleeper, tmp_path / "playing")) == [
        ("mediocre_bowl", "Sleeper 4", 1, "alive", "derived"), ("mediocre_bowl", "Sleeper 5", 1, "alive", "derived")]
    series_season(sleeper, through=5)
    assert mediocre_runs(built(sleeper, tmp_path / "won")) == [
        ("mediocre_bowl", "Sleeper 4", 1, "crowned", "derived"), ("mediocre_bowl", "Sleeper 5", 1, "runner_up", "derived")]


def test_winning_a_shit_bowl_game_escapes_it_and_winning_its_final_is_runner_up(sleeper, tmp_path):
    # A 3-team Shit Bowl in weeks 3-4. Week 3: roster 3 beats roster 2 60-50
    # and escapes; roster 4 has a bye. Week 4: roster 4 beats roster 2 80-70.
    weeks = {**WEEKS, 4: [(1, 0.0, 6, 0.0), (2, 70.0, 4, 80.0), (3, 0.0, 5, 0.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, totals=TOTALS)
    write_sleeper_brackets(sleeper, [*BRACKETS, (2025, 4, 1, 6, "filler", ""), (2025, 4, 2, 4, "shit_bowl", 2),
                                     (2025, 4, 3, 5, "filler", "")])
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3]), shit_bowl=(3, [3, 4]), divisions=2, realignment=2025)})
    assert [r for r in runs(built(sleeper, tmp_path), 2025) if r[0] == "shit_bowl"] == [
        ("shit_bowl", "Sleeper 2", 2, "crowned", "derived"),
        ("shit_bowl", "Sleeper 3", 1, "out", "derived"),
        ("shit_bowl", "Sleeper 4", 2, "runner_up", "derived")]


def tied_shit_bowl(sleeper, advanced=""):
    """The 3-team Shit Bowl above, but week 3's game is a 55-55 tie that
    sends `advanced` (a roster, or nobody recorded) on to week 4's final."""
    weeks = {**WEEKS, 3: [WEEKS[3][0], (2, 55.0, 3, 55.0), WEEKS[3][2]],
             4: [(1, 0.0, 6, 0.0), (2, 70.0, 4, 80.0), (3, 0.0, 5, 0.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, totals=TOTALS)
    write_sleeper_brackets(sleeper, [BRACKETS[0], (2025, 3, 2, 3, "shit_bowl", 1, advanced), BRACKETS[2],
                                     (2025, 4, 1, 6, "filler", ""), (2025, 4, 2, 4, "shit_bowl", 2),
                                     (2025, 4, 3, 5, "filler", "")])
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3]), shit_bowl=(3, [3, 4]), divisions=2, realignment=2025)})


def test_a_tied_bracket_game_with_no_record_of_who_advanced_fails_the_build(sleeper, tmp_path):
    tied_shit_bowl(sleeper)
    with pytest.raises(BuildError, match=r"2025 week 3: rosters 2 and 3 tied .*advanced"):
        built(sleeper, tmp_path)


def test_the_franchise_recorded_as_advancing_from_a_tie_goes_on_and_the_game_stays_a_tie(sleeper, tmp_path):
    tied_shit_bowl(sleeper, advanced=2)
    db = built(sleeper, tmp_path)
    assert [r for r in runs(db, 2025) if r[0] == "shit_bowl"] == [
        ("shit_bowl", "Sleeper 2", 2, "crowned", "derived"),
        ("shit_bowl", "Sleeper 3", 1, "out", "derived"),
        ("shit_bowl", "Sleeper 4", 2, "runner_up", "derived")]
    assert query(db, "select winner_franchise_id, advanced_franchise_id from games "
                     "where season = 2025 and week = 3 and bracket = 'shit_bowl'") == [(None, 12)]


def test_a_tied_final_crowns_the_franchise_recorded_as_advancing(sleeper, tmp_path):
    # Week 4's Shit Bowl final is a 75-75 tie, and roster 4 stays in: it is the Shit Bowl winner.
    weeks = {**WEEKS, 4: [(1, 0.0, 6, 0.0), (2, 75.0, 4, 75.0), (3, 0.0, 5, 0.0)]}
    write_sleeper_league(sleeper, 2025, weeks, DIVISIONS, totals=TOTALS)
    write_sleeper_brackets(sleeper, [*BRACKETS, (2025, 4, 1, 6, "filler", ""), (2025, 4, 2, 4, "shit_bowl", 2, 4),
                                     (2025, 4, 3, 5, "filler", "")])
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3]), shit_bowl=(3, [3, 4]), divisions=2, realignment=2025)})
    db = built(sleeper, tmp_path)
    assert [r for r in runs(db, 2025) if r[0] == "shit_bowl"] == [
        ("shit_bowl", "Sleeper 2", 2, "runner_up", "derived"),
        ("shit_bowl", "Sleeper 3", 1, "out", "derived"),
        ("shit_bowl", "Sleeper 4", 2, "crowned", "derived")]
