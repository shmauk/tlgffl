"""The build over the real archive in data/ (or $TLGFFL_DATA)."""
import os
import sqlite3
from pathlib import Path

import pytest

from recordbook.build import build

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("TLGFFL_DATA", ROOT / "data"))

pytestmark = pytest.mark.skipif(not (DATA / "nfl-api").is_dir(),
                                reason="archive not imported (see README)")


@pytest.fixture(scope="module")
def db(tmp_path_factory):
    out = tmp_path_factory.mktemp("build") / "league.sqlite"
    build(DATA, out)
    con = sqlite3.connect(out)
    yield con
    con.close()


def test_twenty_franchises_sixteen_active(db):
    assert db.execute("select count(*), sum(active) from franchises").fetchone() == (20, 16)


def test_departed_franchises(db):
    assert db.execute("select name from franchises where not active order by id").fetchall() == [
        ("London Tanqs",), ("The Claireville Cougars",), ("Mikkels Manatees",),
        ("Mooreccan chicken with rice",)]


def test_seasons_run_2012_to_the_current_season_without_the_phantom_nfl_2025(db):
    rows = db.execute("select year, era, team_count from seasons order by year").fetchall()
    assert rows[0] == (2012, "nfl.com", 10)
    assert [r for r in rows if r[0] >= 2024] == [
        (2024, "nfl.com", 16), (2025, "sleeper", 16), (2026, "sleeper", 16)]
    assert db.execute("select count(*) from reported_season_lines where season >= 2025").fetchone() == (0,)


def test_redacted_and_pending_names_stay_team_names_only(db):
    assert db.execute("select count(*) from franchises where name in ('pending', '[name redacted]')"
                      ).fetchone() == (0,)
    assert db.execute("select f.name from team_names t join franchises f on f.id = t.franchise_id "
                      "where t.season = 2019 and t.team_name = '[name redacted]'").fetchall() == [
        ("Bearnaise Dynamics",)]


def test_every_season_has_a_format(db):
    assert db.execute("select count(*) from seasons where year not in (select season from season_formats)"
                      ).fetchone() == (0,)


def test_formats_follow_the_rules_by_season(db):
    # The table in #11: 14-week regular seasons in 2012-14 and from 2021, 13 in 2015-20.
    rows = db.execute("select season, divisions, regular_season_last_week from season_formats "
                      "where season in (2012, 2015, 2021, 2026) order by season").fetchall()
    assert rows == [(2012, 1, 14), (2015, 4, 13), (2021, 4, 14), (2026, 4, 14)]
    assert db.execute("select bracket, size, first_week, last_week, series from season_brackets "
                      "where season = 2026 order by first_week, size desc").fetchall() == [
        ("playoffs", 7, 15, 17, None), ("shit_bowl", 7, 15, 17, None),
        ("mediocre_bowl", 2, 15, 17, "best of three")]
    assert db.execute("select bracket, first_week, last_week from season_brackets "
                      "where season = 2018 order by bracket").fetchall() == [
        ("mediocre_bowl", 14, 15), ("playoffs", 14, 16), ("shit_bowl", 14, 16)]


def test_a_new_realignment_cycle_starts_exactly_where_nfl_com_divisions_were_redrawn(db):
    # Division membership by franchise, season by season (NFL.com era; 2012-14
    # is one division whose membership only changes with the team count).
    members = {}
    for season, division, fid in db.execute(
            "select season, division, franchise_id from season_lines where season between 2015 and 2024"):
        members.setdefault(season, {}).setdefault(division, set()).add(fid)
    groups = {s: sorted(sorted(m) for m in d.values()) for s, d in members.items()}
    cycles = dict(db.execute("select season, realignment from season_formats"))
    for season in range(2016, 2025):
        redrawn = groups[season] != groups[season - 1]
        assert (cycles[season] == season) == redrawn, season
    assert cycles[2015] == 2015
    assert {cycles[y] for y in (2012, 2013, 2014)} == {2012}


def test_the_constitution_and_agm_documents_are_linked(db):
    assert db.execute("select count(*) from documents where kind = 'constitution'").fetchone() == (1,)
    assert [s for (s,) in db.execute("select distinct season from documents where kind = 'agm' order by season")
            ] == [2021, 2022, 2023, 2024, 2025]


def test_playoffs_games_follow_the_bracket_and_drop_placement_pairings(db):
    # 4-team Playoffs to 2014, 6-team after, every game rebuilt from seeds and
    # final placings. 2021's final is missing from the log, and the log stops
    # at 2022 week 9, so those games have no score.
    counts = db.execute("select season, count(*), count(home_points) from games "
                        "where bracket = 'playoffs' group by season").fetchall()
    assert counts == [*[(y, 3, 3) for y in (2012, 2013, 2014)], *[(y, 5, 5) for y in range(2015, 2021)],
                      (2021, 5, 4), *[(y, 5, 0) for y in (2022, 2023, 2024)], (2025, 5, 5)]
    # 2022's final: SERPION beat Kurlewless, score lost.
    assert db.execute(
        "select f.name, a.name, w.name, g.home_points from games g "
        "join franchises f on f.id = g.home_franchise_id join franchises a on a.id = g.away_franchise_id "
        "join franchises w on w.id = g.winner_franchise_id "
        "where g.season = 2022 and g.bracket = 'playoffs' and g.round = 3").fetchall() == [
        ("SERPION", "Kurlewless", "SERPION", None)]
    # 2015: seed 6 beat seed 1 in the semis and met seed 2 in the final; the
    # 1 v 4 third-place pairing that week is filler.
    final = db.execute(
        "select g.round, f.name, g.home_points, a.name, g.away_points from games g "
        "join franchises f on f.id = g.home_franchise_id join franchises a on a.id = g.away_franchise_id "
        "where g.season = 2015 and g.bracket = 'playoffs' and g.week = 16").fetchall()
    assert final == [(3, "Mooreccan chicken with rice", 85.88, "The Hatters", 72.7)]
    assert db.execute("select count(*) from games where bracket is not null and bracket != 'playoffs' "
                      "and season <= 2024").fetchone() == (0,)


def test_2025s_roster_totals_agree_with_the_games_but_for_one_explained_gap(db):
    # Building at all proves the cross-check passed. Sleeper's total for the
    # Beer Barons kept a 6-point return TD the league doesn't score.
    from recordbook.build import read_csv
    entries = [r for r in read_csv(DATA / "sleeper_adjustments.csv") if r["season"] == "2025"]
    assert [(r["roster_id"], r["week"], float(r["points"])) for r in entries] == [("11", "9", 6.0)]
    assert db.execute("select l.wins, l.losses, l.points_for from season_lines l "
                      "join franchises f on f.id = l.franchise_id "
                      "where l.season = 2025 and f.name = 'The Beer Barons'").fetchall() == [(9, 5, 1385.04)]


def test_2025s_lineups_add_up_to_each_games_score(db):
    # Nine starting slots a week (QB, 2 RB, 2 WR, TE, FLEX, K, DEF), and a
    # game's score is its starters' points.
    assert db.execute("select distinct count(*) from lineups where season = 2025 and starter "
                      "group by week, franchise_id").fetchall() == [(9,)]
    off = db.execute(
        "select g.week, g.home_franchise_id, g.home_points, sum(l.points) from games g "
        "join lineups l on l.season = g.season and l.week = g.week and l.franchise_id = g.home_franchise_id "
        "where g.season = 2025 and l.starter group by g.id having abs(g.home_points - sum(l.points)) > 0.005"
    ).fetchall()
    assert off == []


def test_2025s_transactions_and_waiver_claims(db):
    # Sleeper's 2025 log: 11 trades, 217 won and 231 lost waiver claims, 383 free-agent pickups.
    assert db.execute("select type, count(*) from transactions where season = 2025 group by type "
                      "order by type").fetchall() == [("free_agent", 383), ("trade", 11), ("waiver", 217)]
    assert db.execute("select won, count(*) from waiver_claims where season = 2025 group by won "
                      "order by won").fetchall() == [(0, 231), (1, 217)]


def test_2025s_games_follow_the_hand_kept_bracket_assignment(db):
    # Sleeper made 6, 7 and 6 pairings in weeks 15-17; 6 of them are filler.
    assert db.execute("select week, bracket, count(*) from games where season = 2025 and phase = 'bracket' "
                      "group by week, bracket order by week, bracket").fetchall() == [
        (15, "playoffs", 2), (15, "shit_bowl", 2),
        (16, "mediocre_bowl", 2), (16, "playoffs", 2), (16, "shit_bowl", 2),
        (17, "mediocre_bowl", 1), (17, "playoffs", 1), (17, "shit_bowl", 1)]
    # The final: Seamen 93.60, The Puffins 90.14.
    assert db.execute(
        "select w.name, g.home_points, g.away_points from games g "
        "join franchises w on w.id = g.winner_franchise_id "
        "where g.season = 2025 and g.bracket = 'playoffs' and g.round = 3").fetchall() == [
        ("Seamen", 93.6, 90.14)]
    assert db.execute("select count(*) from games where season = 2025").fetchone() == (8 * 14 + 13,)
    assert db.execute("select w.bracket, f.name, w.source from bracket_winners w "
                      "join franchises f on f.id = w.franchise_id where w.season = 2025 "
                      "order by w.bracket").fetchall() == [
        ("mediocre_bowl", "Standard Deviations", "derived"), ("playoffs", "Seamen", "derived"),
        ("shit_bowl", "Yorkshire Puddings", "derived")]


def test_every_nfl_com_season_crowns_a_champion_and_a_shit_bowl_winner(db):
    def crowned(bracket):
        return db.execute("select season, group_concat(coalesce(f.name, '?'), '|'), source "
                          "from bracket_winners w left join franchises f on f.id = w.franchise_id "
                          "where bracket = ? and season <= 2024 group by season order by season",
                          (bracket,)).fetchall()
    champions = crowned("playoffs")
    assert [s for s, *_ in champions] == list(range(2012, 2025))
    assert champions[-1] == (2024, "Kurlewless", "derived")
    shit_bowl = dict((s, (n, src)) for s, n, src in crowned("shit_bowl"))
    assert shit_bowl[2012] == ("Mikkels Manatees", "confirmed")
    assert shit_bowl[2021] == ("London Tanqs|The Dirty Birds", "disputed")
    assert shit_bowl[2024] == ("SERPION", "recalled")
    # Nothing records a Mediocre Bowl winner before the Sleeper era.
    assert crowned("mediocre_bowl") == [(y, "?", "unknown") for y in range(2015, 2025)]


def test_coverage_marks_the_known_gaps(db):
    def incomplete(phase):
        return db.execute("select season, week from coverage where phase = ? and not complete "
                          "order by season, week", (phase,)).fetchall()
    # Regular-season scores stop at 2022 week 9.
    assert incomplete("regular") == [(2022, w) for w in range(10, 15)] + [
        (y, w) for y in (2023, 2024) for w in range(1, 15)]
    # Playoffs scores stop at 2021, whose final (week 17) is missing too.
    assert incomplete("bracket") == [(2021, 17)] + [(y, w) for y in (2022, 2023, 2024)
                                                    for w in (15, 16, 17)]


def test_season_lines_are_derived_through_2021_and_reported_until_sleeper(db):
    # Building at all proves the agreement check passed for 2012-2021.
    assert db.execute("select season, group_concat(distinct source) from season_lines "
                      "group by season order by season").fetchall() == [
        *[(y, "derived") for y in range(2012, 2022)], *[(y, "reported") for y in (2022, 2023, 2024)],
        (2025, "derived"), (2026, "derived")]


def test_breakdown_and_luck_cover_the_fully_covered_seasons_only(db):
    # A franchise meets every other franchise every regular-season week:
    # 9 x 14 in 2012, 11 x 14 in 2013-14, 15 x 13 in 2015-20, 15 x 14 in 2021
    # and 2025. 2026 has no final week in the archive yet.
    rows = db.execute("select season, min(breakdown_wins + breakdown_losses + breakdown_ties), "
                      "max(breakdown_wins + breakdown_losses + breakdown_ties), count(luck) "
                      "from season_lines group by season order by season").fetchall()
    per_franchise = {2012: 126, 2013: 154, 2014: 154, **{y: 195 for y in range(2015, 2021)},
                     2021: 210, 2025: 210}
    teams = {2012: 10, 2013: 12, 2014: 12}
    assert rows == [*[(y, n, n, teams.get(y, 16)) for y, n in per_franchise.items() if y < 2022],
                    *[(y, None, None, 0) for y in (2022, 2023, 2024)],
                    (2025, 210, 210, 16), (2026, None, None, 0)]
