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


def test_the_constitution_and_agm_documents_are_linked(db):
    assert db.execute("select count(*) from documents where kind = 'constitution'").fetchone() == (1,)
    assert [s for (s,) in db.execute("select distinct season from documents where kind = 'agm' order by season")
            ] == [2021, 2022, 2023, 2024, 2025]
