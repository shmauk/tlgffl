"""Sleeper-era drafts and keepers in the build (#37): each pick with the
franchise whose slot it was and the franchise that made it, and whether it
was a keeper once the season's keepers are recorded."""
import pytest

from recordbook.build import BuildError
from tests.archive import write_keepers, write_sleeper_draft
from tests.test_sleeper_build import built, query, sleeper  # noqa: F401  (the fixture)

# Rosters 1-6 are franchises 11-16. Slot 1 is roster 2's, slot 2 roster 1's.
SLOTS = {1: 2, 2: 1, 3: 3, 4: 4, 5: 5, 6: 6}
# Round 1 in slot order; in round 2 (snake) roster 1 also picks in roster 2's slot: a traded pick.
PICKS = ([(1, s, SLOTS[s], f"p{s}") for s in range(1, 7)]
         + [(2, 6, 6, "q6"), (2, 5, 5, "q5"), (2, 4, 4, "q4"), (2, 3, 3, "q3"), (2, 2, 1, "q2"),
            (2, 1, 1, "q1")])
TRADED = [(2, 2, 1)]


@pytest.fixture
def drafted(sleeper):  # noqa: F811
    write_sleeper_draft(sleeper, 2025, SLOTS, PICKS, TRADED)
    return sleeper


def picks(db, where="1"):
    return query(db, "select pick_no, round, draft_slot, slot_franchise_id, franchise_id, nfl_player_id, kept "
                     f"from draft_picks where season = 2025 and {where} order by pick_no")


def test_each_pick_records_whose_slot_it_was_and_who_made_it(drafted, tmp_path):
    db = built(drafted, tmp_path)
    assert picks(db, "round = 1") == [(1, 1, 1, 12, 12, "p1", None), (2, 1, 2, 11, 11, "p2", None),
                                      (3, 1, 3, 13, 13, "p3", None), (4, 1, 4, 14, 14, "p4", None),
                                      (5, 1, 5, 15, 15, "p5", None), (6, 1, 6, 16, 16, "p6", None)]
    # Roster 1 traded for roster 2's round 2 pick and used it.
    assert picks(db, "slot_franchise_id != franchise_id") == [(12, 2, 1, 12, 11, "q1", None)]


def test_a_pick_made_by_a_franchise_that_did_not_own_it_fails_the_build(drafted, tmp_path):
    write_sleeper_draft(drafted, 2025, SLOTS, PICKS, traded=[])
    with pytest.raises(BuildError, match=r"2025 pick 12 \(round 2\) was roster 2's, but roster 1 made it"):
        built(drafted, tmp_path)


def test_picks_are_kept_or_drafted_once_the_seasons_keepers_are_recorded(drafted, tmp_path):
    write_keepers(drafted, [(2025, 13, "q3", 2)])
    db = built(drafted, tmp_path)
    assert picks(db, "kept = 1") == [(10, 2, 3, 13, 13, "q3", 1)]
    assert query(db, "select count(*) from draft_picks where kept = 0") == [(11,)]


def test_a_draft_without_its_slot_map_fails_the_build(drafted, tmp_path):
    (drafted / "sleeper" / "2025-draft.json").unlink()
    with pytest.raises(BuildError, match="2025-draft.json"):
        built(drafted, tmp_path)
