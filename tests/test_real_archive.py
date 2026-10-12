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


def test_playoffs_games_follow_the_bracket_and_drop_placement_pairings(db):
    # 4-team Playoffs to 2014, 6-team after. 2021's final is missing from the
    # log, and the log stops at 2022 week 9.
    counts = dict(db.execute("select season, count(*) from games where bracket = 'playoffs' "
                             "group by season").fetchall())
    assert counts == {**{y: 3 for y in (2012, 2013, 2014)}, **{y: 5 for y in range(2015, 2021)},
                      2021: 4}
    # 2015: seed 6 beat seed 1 in the semis and met seed 2 in the final; the
    # 1 v 4 third-place pairing that week is filler.
    final = db.execute(
        "select g.round, f.name, g.home_points, a.name, g.away_points from games g "
        "join franchises f on f.id = g.home_franchise_id join franchises a on a.id = g.away_franchise_id "
        "where g.season = 2015 and g.bracket = 'playoffs' and g.week = 16").fetchall()
    assert final == [(3, "Mooreccan chicken with rice", 85.88, "The Hatters", 72.7)]
    assert db.execute("select count(*) from games where bracket is not null and bracket != 'playoffs'"
                      ).fetchone() == (0,)
