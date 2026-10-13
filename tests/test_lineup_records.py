"""Sleeper-era records from lineups (#7, #32), worked out by hand from
tests/test_sleeper_build.py's 2025 season (roster r is franchise 10 + r;
weeks 1-2 are the regular season, week 3 the Playoffs final, 1 v 6).

Franchise 11 starts NFL player 100 every week: 10.0, 30.0, then 40.0 in the
final. Its bench: week 1 player 400 2.0; week 2 400 12.5 and 500 1.5 (14.0);
week 3 400 3.0. Franchise 14 starts 200 in week 1 (25.0) with 600 on the bench
(8.0).
"""
import json

from tests.archive import write_sleeper_league, write_division_lineages, write_formats, fmt
from tests.test_sleeper_build import DIVISIONS, WEEKS, TOTALS, sleeper, built, query  # noqa: F401 (fixture)

LINEUPS = {
    (1, 1): (["100", "0", "300"], {"100": 10.0, "300": 5.5, "400": 2.0}),
    (2, 1): (["100"], {"100": 30.0, "400": 12.5, "500": 1.5}),
    (3, 1): (["100"], {"100": 40.0, "400": 3.0}),
    (1, 4): (["200"], {"200": 25.0, "600": 8.0}),
}


def write_players(data, name, players):
    (data / "sleeper" / name).write_text(json.dumps(players))


def lineup_season(data):
    write_sleeper_league(data, 2025, WEEKS, DIVISIONS, totals=TOTALS, lineups=LINEUPS)
    write_players(data, "players.json", {"100": {"name": "Ann Back", "pos": "QB", "team": "AAA"},
                                         "200": {"name": "Bo Runner", "pos": "RB", "team": "BBB"}})


def test_every_started_nfl_player_score_is_kept_with_the_players_name(sleeper, tmp_path):
    lineup_season(sleeper)
    db = built(sleeper, tmp_path)
    assert query(db, "select r.season, r.week, r.franchise_id, g.phase, r.nfl_player_id, r.player_name, "
                     "r.position, r.points from record_player_scores r join games g on g.id = r.game_id "
                     "order by r.points desc") == [
        (2025, 3, 11, "bracket", "100", "Ann Back", "QB", 40.0),
        (2025, 2, 11, "regular", "100", "Ann Back", "QB", 30.0),
        (2025, 1, 14, "regular", "200", "Bo Runner", "RB", 25.0),
        (2025, 1, 11, "regular", "100", "Ann Back", "QB", 10.0),
        # Not in any players snapshot: the name is unknown, not guessed.
        (2025, 1, 11, "regular", "300", None, None, 5.5)]


def test_a_weekly_players_snapshot_names_players_the_dump_lacks(sleeper, tmp_path):
    lineup_season(sleeper)
    write_players(sleeper, "2025-players-03.json", {"300": {"name": "Cy Flex", "pos": "WR", "team": "CCC"}})
    db = built(sleeper, tmp_path)
    assert query(db, "select player_name, position from record_player_scores where nfl_player_id = '300'") == [
        ("Cy Flex", "WR")]


def test_bench_points_in_a_game_add_up_the_bench(sleeper, tmp_path):
    lineup_season(sleeper)
    db = built(sleeper, tmp_path)
    assert query(db, "select r.season, r.week, r.franchise_id, g.bracket, r.points from record_bench_games r "
                     "join games g on g.id = r.game_id order by r.points desc, r.week") == [
        (2025, 2, 11, None, 14.0), (2025, 1, 14, None, 8.0), (2025, 3, 11, "playoffs", 3.0),
        (2025, 1, 11, None, 2.0)]


def test_bench_points_in_a_season_are_over_the_regular_season(sleeper, tmp_path):
    lineup_season(sleeper)
    db = built(sleeper, tmp_path)
    assert query(db, "select season, franchise_id, points, games from record_bench_seasons "
                     "order by points desc") == [(2025, 11, 16.0, 2), (2025, 14, 8.0, 1)]


def test_a_season_in_progress_has_no_bench_season_yet(sleeper, tmp_path):
    lineup_season(sleeper)
    write_sleeper_league(sleeper, 2026, {1: WEEKS[1]}, DIVISIONS, status="in_season",
                         lineups={(1, 1): (["100"], {"100": 50.0, "400": 20.0})})
    f = fmt(6, 2, (2, [3]), shit_bowl=(2, [3]), divisions=2, realignment=2025)
    write_formats(sleeper, {2025: f, 2026: f})
    write_division_lineages(sleeper, [(s, g, g) for s in (2025, 2026) for g in ("Group A", "Group B")])
    db = built(sleeper, tmp_path)
    assert query(db, "select distinct season from record_bench_seasons") == [(2025,)]
    # Games of the season in progress count as they happen.
    assert query(db, "select max(points) from record_player_scores") == [(50.0,)]
    assert query(db, "select max(points) from record_bench_games") == [(20.0,)]
