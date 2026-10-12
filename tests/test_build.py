import sqlite3

import pytest

from recordbook.build import build, BuildError
from tests.archive import (team, write_nfl_season, write_franchise_keys, write_sleeper_aliases,
                           write_formats, write_documents, fmt)


def query(db, sql, *args):
    con = sqlite3.connect(db)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


def test_franchise_name_is_the_last_team_name_it_played_under(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select id, name from franchises order by id") == [
        (1, "Alpha Two"), (2, "Bravo"), (3, "Charlie"), (4, "Delta")]


def test_placeholder_team_names_never_become_a_franchise_name(archive, tmp_path):
    write_nfl_season(archive, 2014, [
        team(1, 100, "[name redacted]", (1, 0, 0), 100, 90),
        team(2, 300, "pending", (0, 1, 0), 90, 100),
    ])
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select id, name from franchises where id in (1, 3) order by id") == [
        (1, "Alpha Two"), (3, "Charlie")]
    # ...but they are still what the franchise played under that season.
    assert query(db, "select franchise_id, team_name from team_names where season = 2014 "
                     "order by franchise_id") == [(1, "[name redacted]"), (3, "pending")]


def test_an_unplayed_all_zero_nfl_season_is_not_a_season(archive, tmp_path):
    # NFL.com rolled the league over into 2025 after it moved to Sleeper; it
    # was never played and a departed manager's team appears in it.
    write_nfl_season(archive, 2025, [team(1, 100, "Alpha Ghost"), team(2, 200, "Bravo Ghost")])
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select year, era, team_count from seasons order by year") == [
        (2012, "nfl.com", 2), (2013, "nfl.com", 2), (2025, "sleeper", 3)]
    assert query(db, "select count(*) from reported_season_lines where season = 2025") == [(0,)]
    assert query(db, "select name, active from franchises where id = 2") == [("Bravo", 0)]


def test_active_franchises_are_those_in_the_current_season(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select id, active, first_season, last_season from franchises order by id") == [
        (1, 1, 2012, 2025), (2, 0, 2012, 2012), (3, 1, 2013, 2025), (4, 1, 2025, 2025)]


def test_reported_season_line_comes_from_nfl_com_standings(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select * from reported_season_lines where franchise_id = 1 and season = 2012") == [
        (1, 2012, 2, 1, 0, 300.5, 280.25, "Division 1", 1, "championship", 1)]
    assert query(db, "select * from reported_season_lines where franchise_id = 1 and season = 2013") == [
        (1, 2013, 1, 2, 0, 260.0, 290.0, "Division 1", None, None, 2)]


def test_a_team_with_no_franchise_fails_the_build(archive, tmp_path):
    write_nfl_season(archive, 2014, [team(1, 100, "Alpha", (1, 0, 0)), team(2, 999, "Stranger", (0, 1, 0))])
    with pytest.raises(BuildError, match="2014 NFL.com team 2 .*999"):
        build(archive, tmp_path / "league.sqlite")


def test_a_manager_switching_accounts_stays_one_franchise(archive, tmp_path):
    # The league judged owner 400 to be owner 100 on a new NFL.com account.
    write_franchise_keys(archive, [
        (1, "nfl.com", 1, 100), (1, "nfl.com", 1, 400), (2, "nfl.com", 2, 200),
        (3, "nfl.com", 2, 300), (3, "sleeper", 1, ""), (1, "sleeper", 2, ""), (4, "sleeper", 3, "")])
    write_nfl_season(archive, 2014, [team(1, 400, "Alpha Three", (1, 0, 0)), team(2, 300, "Charlie", (0, 1, 0))])
    write_sleeper_aliases(archive, [(1, "C", "Charlie"), (2, "A", "Alpha Three"), (3, "D", "Delta")])
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select season, team_name from team_names where franchise_id = 1 order by season") == [
        (2012, "Alpha One"), (2013, "Alpha Two"), (2014, "Alpha Three")]


def test_franchise_ids_must_agree_with_ff_data_projects_sleeper_aliases(archive, tmp_path):
    # Roster 2 is Alpha Two's; claiming it for Charlie contradicts ff-data-project.
    write_franchise_keys(archive, [
        (1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200), (3, "nfl.com", 2, 300),
        (3, "sleeper", 2, ""), (1, "sleeper", 1, ""), (4, "sleeper", 3, "")])
    with pytest.raises(BuildError, match="roster 1"):
        build(archive, tmp_path / "league.sqlite")


def test_an_empty_archive_fails_the_build(tmp_path):
    write_franchise_keys(tmp_path, [(1, "nfl.com", 1, 100)])
    write_sleeper_aliases(tmp_path, [])
    with pytest.raises(BuildError, match="no seasons"):
        build(tmp_path, tmp_path / "league.sqlite")


FORMAT_2012 = {"teams": 2, "divisions": 1, "realignment": 2012, "regular_season_weeks": [1, 14],
               "tiebreaks": "NFL.com's own",
               "brackets": {"playoffs": {"size": 1, "weeks": [15], "seeding": "as NFL.com reported"},
                            "shit_bowl": {"size": 4, "weeks": [15, 16]}}}


def test_a_seasons_format_comes_from_the_hand_kept_format_file(archive, tmp_path):
    write_formats(archive, {
        2012: FORMAT_2012,
        2013: fmt(2, 3, (1, [4])),
        2025: {"teams": 3, "divisions": 4, "realignment": 2025, "regular_season_weeks": [1, 14],
               "tiebreaks": "head-to-head, then Breakdown",
               "brackets": {"playoffs": {"size": 6, "weeks": [15, 16, 17],
                                         "seeding": "division winners 1-4"},
                            "shit_bowl": {"size": 6, "weeks": [15, 16, 17]},
                            "mediocre_bowl": {"size": 2, "weeks": [15, 16, 17],
                                              "series": "best of three"}}},
    })
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select * from season_formats order by season") == [
        (2012, 1, 1, 14, 2012, "NFL.com's own"), (2013, 1, 1, 3, 2012, None),
        (2025, 4, 1, 14, 2025, "head-to-head, then Breakdown")]
    assert query(db, "select * from season_brackets order by season, size desc, bracket") == [
        (2012, "shit_bowl", 4, 15, 16, None, None),
        (2012, "playoffs", 1, 15, 15, None, "as NFL.com reported"),
        (2013, "playoffs", 1, 4, 4, None, None),
        (2025, "playoffs", 6, 15, 17, None, "division winners 1-4"),
        (2025, "shit_bowl", 6, 15, 17, None, None),
        (2025, "mediocre_bowl", 2, 15, 17, "best of three", None),
    ]


def test_a_format_without_its_realignment_cycle_fails_the_build(archive, tmp_path):
    no_cycle = {k: v for k, v in FORMAT_2012.items() if k != "realignment"}
    write_formats(archive, {2012: no_cycle, 2013: fmt(2, 3, (1, [4])), 2025: fmt(3, 14, (2, [15]))})
    with pytest.raises(BuildError, match="2012.*realignment"):
        build(archive, tmp_path / "league.sqlite")


def test_a_season_without_a_format_fails_the_build(archive, tmp_path):
    write_formats(archive, {2012: fmt(2, 3, (1, [4])), 2025: fmt(3, 14, (2, [15]))})
    with pytest.raises(BuildError, match="2013 has no format in data/formats.yaml"):
        build(archive, tmp_path / "league.sqlite")


def test_a_formats_team_count_must_match_the_season(archive, tmp_path):
    write_formats(archive, {2012: {**FORMAT_2012, "teams": 12}, 2013: fmt(2, 3, (1, [4])),
                            2025: fmt(3, 14, (2, [15]))})
    with pytest.raises(BuildError, match="2012.*12 teams.*2 played"):
        build(archive, tmp_path / "league.sqlite")


def test_an_unknown_bracket_in_a_format_fails_the_build(archive, tmp_path):
    write_formats(archive, {2012: {**FORMAT_2012, "brackets": {"toilet_bowl": {"size": 4, "weeks": [15]}}},
                            2013: fmt(2, 3, (1, [4])),
                            2025: fmt(3, 14, (2, [15]))})
    with pytest.raises(BuildError, match="2012.*toilet_bowl"):
        build(archive, tmp_path / "league.sqlite")


def test_league_documents_come_from_the_hand_kept_table(archive, tmp_path):
    write_documents(archive, [
        ("constitution", "", "Constitution", "https://docs.google.com/document/d/c/edit"),
        ("agm", 2022, "AGM minutes 2022", "https://docs.google.com/document/d/m22/edit"),
    ])
    db = tmp_path / "league.sqlite"
    build(archive, db)
    assert query(db, "select kind, season, title, url from documents order by season") == [
        ("constitution", None, "Constitution", "https://docs.google.com/document/d/c/edit"),
        ("agm", 2022, "AGM minutes 2022", "https://docs.google.com/document/d/m22/edit"),
    ]
