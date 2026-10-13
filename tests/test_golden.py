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
            # The fixture's Sleeper season has no games yet.
            season(2025, "Alpha Sleeper", (0, 0, 0), 0.0, 0.0, platform="Sleeper")]},
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
    # 4 franchises x (exists, active) + 5 season lines (4 NFL.com, 1 Sleeper) x 8 figures
    assert report.checked == 4 * 2 + 5 * 8


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


def bracket_golden():
    """ff-data-project's figures for test_games' 2014 season: Ant (seed 1) beat
    Bee (seed 2) in the final, and Dog took the Shit Bowl."""
    def s(name, placing, made, wins, losses, shitbowl=False):
        return {"year": "2014", "platform": "NFL.com", "finalOrder": placing, "madePlayoffs": made,
                "playoff": {"wins": wins, "losses": losses}, "shitbowl": shitbowl,
                "shitbowlDisputed": False}
    return {
        "meta": {"finals": [{"year": "2014", "platform": "NFL.com", "champion": "Ant", "runnerUp": "Bee",
                             "shitbowl": "Dog", "shitbowlCandidates": ["Dog"]}]},
        "franchises": {
            "Ant": {"active": True, "seasons": [s("Ant", 1, True, 1, 0)]},
            "Bee": {"active": True, "seasons": [s("Bee", 2, True, 0, 1)]},
            "Cat": {"active": True, "seasons": [s("Cat", 3, False, 0, 0)]},
            "Dog": {"active": True, "seasons": [s("Dog", 4, False, 0, 0, shitbowl=True)]},
        },
    }


@pytest.fixture
def bracket_paths(tmp_path):
    from tests.test_games import REGULAR, POSTSEASON, write_season
    from tests.archive import write_franchise_keys, write_sleeper_aliases, write_games, write_formats, fmt
    data = tmp_path / "data"
    write_season(data)
    write_franchise_keys(data, [(slot, "nfl.com", slot, slot * 100) for slot in range(1, 5)])
    write_sleeper_aliases(data, [])
    write_games(data, [(2014, *g) for g in REGULAR + POSTSEASON])
    write_formats(data, {2014: fmt(4, 3, (2, [4]), shit_bowl=(2, [4]))})
    write_csv(data / "shitbowl.csv", ["year", "franchise", "second_last", "source"],
              [(2014, "Dog", "", "recalled")])
    db = tmp_path / "league.sqlite"
    build(data, db)
    allow = tmp_path / "allowlist.csv"
    write_csv(allow, ["figure", "reason"], [])
    return db, tmp_path / "league_records.json", allow


def test_bracket_results_and_crowns_are_compared(bracket_paths):
    db, golden, allow = bracket_paths
    write(golden, bracket_golden())
    report = compare(db, golden, allow)
    assert report.mismatches == []
    # 4 franchises x (exists, active) + 4 seasons x 6 figures + 4 crowns
    assert report.checked == 4 * 2 + 4 * 6 + 4


def test_a_differing_bracket_result_or_crown_is_a_mismatch(bracket_paths):
    db, golden, allow = bracket_paths
    g = bracket_golden()
    g["franchises"]["Cat"]["seasons"][0]["playoff"] = {"wins": 1, "losses": 1}
    g["franchises"]["Cat"]["seasons"][0]["madePlayoffs"] = True
    g["meta"]["finals"][0].update(champion="Bee", shitbowl=None, shitbowlCandidates=["Cat", "Dog"])
    write(golden, g)
    assert sorted((m.figure, m.ours, m.theirs) for m in compare(db, golden, allow).mismatches) == [
        ("2014|champion", "Ant", "Bee"),
        ("2014|shitbowl", "Dog", None),
        ("2014|shitbowlCandidates", ["Dog"], ["Cat", "Dog"]),
        ("Cat|2014|madePlayoffs", False, True),
        ("Cat|2014|playoffLosses", 0, 1),
        ("Cat|2014|playoffWins", 0, 1),
    ]


def test_cli_fails_on_unexplained_mismatch(paths, capsys):
    db, golden, allow = paths
    g = golden_for_archive()
    g["franchises"]["Bravo"]["seasons"][0]["wins"] = 3
    write(golden, g)
    assert main(["--db", str(db), "--golden", str(golden), "--allow", str(allow)]) == 1
    assert "Bravo|2012|wins" in capsys.readouterr().out
    write(golden, golden_for_archive())
    assert main(["--db", str(db), "--golden", str(golden), "--allow", str(allow)]) == 0
