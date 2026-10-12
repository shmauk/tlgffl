import json

import pytest

from recordbook.build import build
from recordbook.golden import compare, main
from tests.archive import write_csv


def season(year, team_name, record, pf, pa, seed=None, final_order=None, platform="NFL.com"):
    w, l, t = record
    return {"year": str(year), "platform": platform, "teamName": team_name,
            "wins": w, "losses": l, "ties": t, "pointsFor": pf, "pointsAgainst": pa,
            "playoffSeed": seed, "finalOrder": final_order}


def golden_for_archive():
    """league_records.json as ff-data-project would write it for the archive fixture."""
    return {"franchises": {
        "Alpha Two": {"active": True, "seasons": [
            season(2012, "Alpha One", (2, 1, 0), 300.5, 280.25, 1, 1),
            season(2013, "Alpha Two", (1, 2, 0), 260.0, 290.0, None, 2),
            season(2025, "Alpha Two", (9, 5, 0), 1500.0, 1400.0, platform="Sleeper")]},
        "Bravo": {"active": False, "seasons": [
            season(2012, "Bravo", (1, 2, 0), 250.0, 270.0, None, 2)]},
        "Charlie": {"active": True, "seasons": [
            season(2013, "Charlie", (2, 1, 0), 310.0, 280.5, 1, 1)]},
        "Delta": {"active": True, "seasons": []},
    }}


@pytest.fixture
def paths(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    build(archive, db)
    golden = tmp_path / "league_records.json"
    allow = tmp_path / "allowlist.csv"
    write_csv(allow, ["figure", "reason"], [])
    return db, golden, allow


def write(path, obj):
    path.write_text(json.dumps(obj))


def test_matching_figures_pass(paths):
    db, golden, allow = paths
    write(golden, golden_for_archive())
    report = compare(db, golden, allow)
    assert report.mismatches == [] and report.stale == []
    # 4 franchises x (exists, active) + 4 NFL.com season lines x 8 figures
    assert report.checked == 4 * 2 + 4 * 8


def test_a_differing_figure_is_a_mismatch(paths):
    db, golden, allow = paths
    g = golden_for_archive()
    g["franchises"]["Bravo"]["seasons"][0]["pointsFor"] = 251.0
    write(golden, g)
    report = compare(db, golden, allow)
    assert [(m.figure, m.ours, m.theirs) for m in report.mismatches] == [
        ("Bravo|2012|pointsFor", 250.0, 251.0)]


def test_franchise_missing_from_the_database_is_a_mismatch(paths):
    db, golden, allow = paths
    g = golden_for_archive()
    g["franchises"]["Echo"] = {"active": False, "seasons": []}
    g["franchises"]["Charlie"]["active"] = False
    write(golden, g)
    assert [(m.figure, m.ours, m.theirs) for m in compare(db, golden, allow).mismatches] == [
        ("Charlie|active", True, False), ("Echo|exists", False, True)]


def test_allow_listed_mismatch_passes_but_needs_a_reason(paths):
    db, golden, allow = paths
    g = golden_for_archive()
    g["franchises"]["Bravo"]["seasons"][0]["teamName"] = "Bravo!"
    write(golden, g)
    write_csv(allow, ["figure", "reason"], [("Bravo|2012|teamName", "ff kept a typo")])
    assert compare(db, golden, allow).mismatches == []
    write_csv(allow, ["figure", "reason"], [("Bravo|2012|teamName", "")])
    with pytest.raises(ValueError, match="reason"):
        compare(db, golden, allow)


def test_allow_list_entry_with_nothing_to_excuse_is_stale(paths):
    db, golden, allow = paths
    write(golden, golden_for_archive())
    write_csv(allow, ["figure", "reason"], [("Bravo|2012|wins", "no longer differs")])
    assert compare(db, golden, allow).stale == ["Bravo|2012|wins"]


def test_cli_fails_on_unexplained_mismatch(paths, capsys):
    db, golden, allow = paths
    g = golden_for_archive()
    g["franchises"]["Bravo"]["seasons"][0]["wins"] = 3
    write(golden, g)
    assert main(["--db", str(db), "--golden", str(golden), "--allow", str(allow)]) == 1
    assert "Bravo|2012|wins" in capsys.readouterr().out
    write(golden, golden_for_archive())
    assert main(["--db", str(db), "--golden", str(golden), "--allow", str(allow)]) == 0
