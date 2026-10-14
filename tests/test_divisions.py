"""Division records and division lineages (#7, #32), worked out by hand from
tests/test_sleeper_build.py's 2025 season.

Group A is rosters 1-3 (franchises 11-13), Group B rosters 4-6 (14-16). The
regular season is weeks 1-2:
  Group A: 11 2-0 210.0 PF, 12 0-2 189.0, 13 0-2 175.0 -> 2-4-0, 574.0 PF, 581.0 PA
  Group B: 14 1-1 145.0, 15 1-1 171.0, 16 2-0 135.5 -> 4-2-0, 451.5 PF, 444.5 PA
2025's Playoffs final (week 3) crowns franchise 11, so the season is complete.
"""
import pytest

from recordbook.build import BuildError
from tests.archive import write_division_lineages, write_sleeper_league, write_formats, fmt
from tests.test_sleeper_build import (DIVISIONS, WEEKS, TOTALS, sleeper, built, query)  # noqa: F401 (fixture)


def divisions(db):
    return query(db, "select season, division, lineage, lineage_name, wins, losses, ties, points_for, "
                     "points_against, reported from record_divisions order by season, division")


def test_a_divisions_season_sums_its_franchises_season_lines(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert divisions(db) == [
        (2025, "Group A", "A25", "Group A, 2025", 2, 4, 0, 574.0, 581.0, 0),
        (2025, "Group B", "B25", "Group B, 2025", 4, 2, 0, 451.5, 444.5, 0)]


def test_every_division_must_resolve_to_a_lineage(sleeper, tmp_path):
    write_division_lineages(sleeper, [(2025, "Group A", "A25")])
    with pytest.raises(BuildError, match=r"2025 division 'Group B' has no lineage in data/division_lineages.csv"):
        built(sleeper, tmp_path)


def test_a_lineage_row_for_no_such_division_fails(sleeper, tmp_path):
    write_division_lineages(sleeper, [(2025, "Group A", "A25"), (2025, "Group B", "B25"),
                                      (2025, "Group C", "C25")])
    with pytest.raises(BuildError, match=r"data/division_lineages.csv: 2025 has no division 'Group C'"):
        built(sleeper, tmp_path)


def test_a_lineage_has_one_division_a_season(sleeper, tmp_path):
    write_division_lineages(sleeper, [(2025, "Group A", "A25"), (2025, "Group B", "A25")])
    with pytest.raises(BuildError, match=r"lineage 'A25' has two divisions in 2025"):
        built(sleeper, tmp_path)


def two_seasons(data, second_names=None):
    """2026 replays 2025 in the same realignment, still in its regular season."""
    write_sleeper_league(data, 2026, {1: WEEKS[1]}, DIVISIONS, status="in_season", totals=None,
                         division_names=second_names)
    f = fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025)
    write_formats(data, {2025: f, 2026: f})


def test_a_lineage_runs_across_its_realignments_seasons_even_when_renamed(sleeper, tmp_path):
    # In 2026 Group A is renamed Group Z: the hand-kept table keeps its lineage.
    two_seasons(sleeper, {1: "Group Z", 2: "Group B"})
    write_division_lineages(sleeper, [(2025, "Group A", "A25"), (2025, "Group B", "B25"),
                                      (2026, "Group Z", "A25"), (2026, "Group B", "B25")])
    db = built(sleeper, tmp_path)
    assert query(db, "select season, division, lineage from division_lineages order by season, division") == [
        (2025, "Group A", "A25"), (2025, "Group B", "B25"), (2026, "Group B", "B25"), (2026, "Group Z", "A25")]
    # The lineage is named after its first season's division, over every season it spans.
    assert [r[:4] for r in divisions(db)] == [(2025, "Group A", "A25", "Group A, 2025–2026"),
                                              (2025, "Group B", "B25", "Group B, 2025–2026")]


def test_the_season_in_progress_is_left_out_of_division_records(sleeper, tmp_path):
    two_seasons(sleeper)
    write_division_lineages(sleeper, [(2025, "Group A", "A25"), (2025, "Group B", "B25"),
                                      (2026, "Group A", "A25"), (2026, "Group B", "B25")])
    db = built(sleeper, tmp_path)
    assert {r[0] for r in divisions(db)} == {2025}


def test_a_lineage_cannot_cross_a_realignment(sleeper, tmp_path):
    two_seasons(sleeper)
    write_formats(sleeper, {2025: fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025),
                            2026: fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2026)})
    write_division_lineages(sleeper, [(2025, "Group A", "A25"), (2025, "Group B", "B25"),
                                      (2026, "Group A", "A25"), (2026, "Group B", "B26")])
    with pytest.raises(BuildError, match=r"lineage 'A25' crosses a realignment \(2025 and 2026\)"):
        built(sleeper, tmp_path)
