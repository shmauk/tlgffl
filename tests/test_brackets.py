"""Who each bracket crowned: the champion from the Playoffs, and the Shit Bowl
and Mediocre Bowl winners from their hand-kept tables (NFL.com era).

Uses test_games' 4-team 2014 season: Ant beat Bee in the week-4 final.
"""
import pytest

from recordbook.build import BuildError
from tests.archive import write_csv, write_formats, fmt
from tests.test_games import data, built, query  # noqa: F401  (data is a fixture)

FORMAT_2014 = fmt(4, 3, (2, [4]), shit_bowl=(2, [4]))


def write_shitbowl(data, rows):
    write_csv(data / "shitbowl.csv", ["year", "franchise", "second_last", "source"],
              [(y, f, "", s) for y, f, s in rows], comments=["Who took the shitbowl"])


def write_mediocre_bowl(data, rows):
    write_csv(data / "mediocre_bowl.csv", ["year", "franchise", "source"], rows)


def winners(db, bracket):
    return query(db, "select season, f.name, source from bracket_winners w "
                     "left join franchises f on f.id = w.franchise_id "
                     "where bracket = ? order by season, f.name", bracket)


def test_the_champion_is_the_winner_of_the_playoffs_final(data, tmp_path):
    db = built(data, tmp_path)
    assert winners(db, "playoffs") == [(2014, "Ant", "derived")]


def test_the_champion_stands_when_the_finals_score_is_lost(data, tmp_path):
    from tests.archive import write_games
    from tests.test_games import REGULAR
    write_games(data, [(2014, *g) for g in REGULAR])
    db = built(data, tmp_path)
    assert winners(db, "playoffs") == [(2014, "Ant", "derived")]


@pytest.mark.parametrize("source, ours", [
    ("derived-confirmed", "confirmed"), ("recalled", "recalled")])
def test_the_shit_bowl_winner_comes_from_the_hand_kept_table_with_its_source(data, tmp_path, source, ours):
    write_shitbowl(data, [(2014, "Dog", source)])
    db = built(data, tmp_path)
    assert winners(db, "shit_bowl") == [(2014, "Dog", ours)]


def test_a_disputed_shit_bowl_lists_every_candidate_as_disputed(data, tmp_path):
    write_shitbowl(data, [(2014, "Cat|Dog", "inconclusive")])
    db = built(data, tmp_path)
    assert winners(db, "shit_bowl") == [(2014, "Cat", "disputed"), (2014, "Dog", "disputed")]


def test_a_bracket_with_no_recorded_winner_has_an_unknown_one(data, tmp_path):
    db = built(data, tmp_path)
    assert winners(db, "shit_bowl") == [(2014, None, "unknown")]


def test_a_shit_bowl_winner_that_is_no_franchise_fails_the_build(data, tmp_path):
    write_shitbowl(data, [(2014, "The Dirty Bird", "recalled")])
    with pytest.raises(BuildError, match="shitbowl.csv.*2014.*'The Dirty Bird'"):
        built(data, tmp_path)


def test_mediocre_bowl_winners_come_from_their_own_table_and_blank_is_unknown(data, tmp_path):
    write_formats(data, {2014: fmt(4, 3, (2, [4]), shit_bowl=(2, [4]), mediocre_bowl=(2, [4]))})
    write_mediocre_bowl(data, [(2014, "", "")])
    db = built(data, tmp_path)
    assert winners(db, "mediocre_bowl") == [(2014, None, "unknown")]
    write_mediocre_bowl(data, [(2014, "Bee", "recalled")])
    db = built(data, tmp_path / "again")
    assert winners(db, "mediocre_bowl") == [(2014, "Bee", "recalled")]


def test_a_winner_for_a_bracket_the_season_did_not_have_fails_the_build(data, tmp_path):
    write_mediocre_bowl(data, [(2014, "Bee", "recalled")])
    with pytest.raises(BuildError, match="mediocre_bowl.csv.*2014.*no Mediocre Bowl"):
        built(data, tmp_path)
