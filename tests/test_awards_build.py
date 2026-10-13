"""The awards in the build (#33): which seasons each award exists for, and what
the database records. The formulas themselves are in tests/test_awards.py."""
import json

import pytest

from tests.archive import write_csv, write_games, write_sleeper_draft, write_sleeper_league
from tests.test_games import REGULAR, POSTSEASON, data, built, query  # noqa: F401 (fixture)
from tests.test_sleeper_build import WEEKS, DIVISIONS, TOTALS, sleeper  # noqa: F401 (fixture)


def results(db, slug, season):
    return query(db, "select franchise_id, round(value, 4), rank from award_results "
                     "where award = ? and season = ? order by rank, franchise_id", slug, season)


def test_the_nine_awards_are_defined_in_order(data, tmp_path):
    db = built(data, tmp_path)
    assert [r[0] for r in query(db, "select name from awards order by position")] == [
        "Nail Biter", "Standard Deviation", "Heartbreaker", "Lucky Duck", "Pick a Lane",
        "One-Man Army", "Draft Dodger", "Highest failed bid", "Most overpaid"]
    assert all(d for (d,) in query(db, "select definition from awards"))


def report_moves(data, counts):
    """Give each NFL.com team its season's add and trade counts."""
    f = data / "nfl-api" / "standings-2014.json"
    raw = json.loads(f.read_text())
    for t in raw["games"]["102014"]["leagues"]["1078038"]["teams"].values():
        adds, trades = counts[t["name"]]
        t["stats"]["season"]["2014"].update(transactionAddCount=adds, transactionTradeCount=trades)
    f.write_text(json.dumps(raw))


def test_a_fully_covered_nfl_com_season_has_every_game_award_and_pick_a_lane(data, tmp_path):
    report_moves(data, {"Ant": ("4", "1"), "Bee": ("2", "0"), "Cat": ("7", "0"), "Dog": ("5", "2")})
    db = built(data, tmp_path)
    # Margins: Ant 10, 10, 30; Bee 10, 0, 20; Cat 10, 10, 20; Dog 10, 0, 30.
    assert results(db, "nail-biter", 2014) == [(2, 10.0, 1), (3, 13.3333, 2), (4, 13.3333, 2), (1, 16.6667, 4)]
    assert results(db, "pick-a-lane", 2014) == [(3, 7.0, 1), (4, 7.0, 1), (1, 5.0, 3), (2, 2.0, 4)]
    # Nobody won or lost three games in a 3-week season.
    assert results(db, "heartbreaker", 2014) == results(db, "lucky-duck", 2014) == []
    assert [r[0] for r in results(db, "standard-deviation", 2014)] == [4, 3, 1, 2]
    assert query(db, "select distinct award from award_results where season = 2014 order by 1") == [
        ("nail-biter",), ("pick-a-lane",), ("standard-deviation",)]


def test_a_season_with_a_missing_game_has_no_game_awards(data, tmp_path):
    report_moves(data, {"Ant": ("4", "1"), "Bee": ("2", "0"), "Cat": ("7", "0"), "Dog": ("5", "2")})
    write_games(data, [(2014, *g) for g in REGULAR[:-1] + POSTSEASON])
    db = built(data, tmp_path)
    assert query(db, "select distinct award from award_results") == [("pick-a-lane",)]


def test_without_nfl_coms_counts_pick_a_lane_is_absent_not_zero(data, tmp_path):
    db = built(data, tmp_path)
    assert results(db, "pick-a-lane", 2014) == []


# The Sleeper fixture: rosters 1-6 are franchises 11-16, weeks 1-2 regular season.
LINEUPS = {(1, 1): (["a", "b"], {"a": 10.0, "b": 40.0}),
           (2, 1): (["a", "b"], {"a": 30.0, "b": 20.0, "c": 5.0})}


def waiver(tid, roster, pid, bid, won, run):
    return {"transaction_id": tid, "type": "waiver", "status": "complete" if won else "failed",
            "roster_ids": [roster], "adds": {pid: roster}, "drops": None,
            "settings": {"waiver_bid": bid}, "draft_picks": [], "waiver_budget": [],
            "created": run - 1, "status_updated": run, "leg": 2}


@pytest.fixture
def season(sleeper):
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, totals=TOTALS, lineups=LINEUPS)
    (sleeper / "sleeper" / "2025-transactions-02.json").write_text(json.dumps([
        waiver("w1", 3, "300", 12, True, 1000), waiver("w2", 4, "300", 10, False, 1000)]))
    # A one-slot draft: roster 1 picks a, c and z in rounds 1-3.
    write_sleeper_draft(sleeper, 2025, {1: 1}, [(r, 1, 1, pid) for r, pid in enumerate(["a", "c", "z"], start=1)])
    return sleeper


def test_a_finished_sleeper_season_has_its_awards(season, tmp_path):
    db = built(season, tmp_path)
    # Margins: 11 10, 15; 12 10, 2; 13 5, 15; 14 5, 5; 15 0.5, 2; 16 0.5, 5.
    assert results(db, "nail-biter", 2025) == [
        (15, 1.25, 1), (16, 2.75, 2), (14, 5.0, 3), (12, 6.0, 4), (13, 10.0, 5), (11, 12.5, 6)]
    assert results(db, "pick-a-lane", 2025) == [(13, 1.0, 1)] + [(f, 0.0, 2) for f in (11, 12, 14, 15, 16)]
    # b's 60 of franchise 11's 100 starter points.
    assert results(db, "one-man-army", 2025) == [(11, 0.6, 1)]
    assert results(db, "highest-failed-bid", 2025) == [(14, 10.0, 1)]
    assert results(db, "most-overpaid", 2025) == [(13, 2.0, 1)]


def test_draft_dodger_is_unknown_until_the_seasons_keepers_are_recorded(season, tmp_path):
    db = built(season, tmp_path)
    assert results(db, "draft-dodger", 2025) == []
    assert query(db, "select award, season from award_unknowns") == [("draft-dodger", 2025)]
    write_csv(season / "keepers.csv", ["season", "franchise_id", "nfl_player_id", "round"],
              [(2025, 11, "c", 2)])
    db = built(season, tmp_path / "with-keepers")
    # Franchise 11 drafted a and c (a keeper) and z; a is still rostered in week 2.
    assert results(db, "draft-dodger", 2025)[0] == (11, 1.0, 1)
    assert query(db, "select count(*) from award_unknowns") == [(0,)]


def test_a_sleeper_season_still_in_its_regular_season_has_no_awards_yet(season, tmp_path):
    write_sleeper_league(season, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         lineups=LINEUPS)
    db = built(season, tmp_path)
    assert query(db, "select count(*) from award_results where season = 2025") == [(0,)]
    assert query(db, "select count(*) from award_unknowns") == [(0,)]
