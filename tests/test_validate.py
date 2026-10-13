"""Validation of the hand-kept tables (#39): every bad row fails CI with a
message that names the file, the line and what is wrong with it."""
from recordbook.validate import main, validate
from tests.archive import write_csv, write_franchise_keys, write_sleeper_season


def test_the_archive_fixture_is_valid(archive):
    assert validate(archive) == []


def test_a_franchise_key_with_an_unknown_era_names_its_line(archive):
    write_franchise_keys(archive, [
        (1, "nfl.com", 1, 100),
        (2, "nfl.com", 2, 200),
        (3, "nfl.com", 2, 300),
        (3, "sleeper", 1, ""),
        (1, "sleeper", 2, ""),
        (4, "espn", 3, ""),
    ])
    assert validate(archive) == [
        "data/franchises.csv line 7: era 'espn' must be one of nfl.com, sleeper"]


def test_ids_must_be_whole_numbers_and_nfl_keys_need_an_owner(archive):
    write_franchise_keys(archive, [
        ("one", "nfl.com", 1, 100),
        (2, "nfl.com", 2, ""),
        (3, "nfl.com", 2, 300),
        (3, "sleeper", 1, ""),
        (1, "sleeper", 2, ""),
        (4, "sleeper", 3, ""),
    ])
    assert validate(archive) == [
        "data/franchises.csv line 2: franchise_id 'one' must be a whole number",
        "data/franchises.csv line 3: owner_user_id is blank, but an nfl.com key needs one",
    ]


def test_a_missing_column_is_reported_once(archive):
    write_csv(archive / "franchises.csv", ["franchise_id", "era", "slot"], [(1, "nfl.com", 1)])
    assert validate(archive) == ["data/franchises.csv: no owner_user_id column"]


def test_a_platform_team_can_belong_to_only_one_franchise(archive):
    write_franchise_keys(archive, [
        (1, "nfl.com", 1, 100),
        (2, "nfl.com", 2, 200),
        (3, "nfl.com", 2, 300),
        (3, "sleeper", 1, ""),
        (1, "sleeper", 2, ""),
        (4, "sleeper", 3, ""),
        (5, "nfl.com", 1, 100),
    ])
    assert validate(archive) == [
        "data/franchises.csv line 8: nfl.com team 1 (owner 100) is already on line 2"]


def test_every_sleeper_roster_needs_a_franchise_and_an_alias(archive):
    write_sleeper_season(archive, 2026, [1, 2, 3, 4])
    assert validate(archive) == [
        "data/sleeper/2026-rosters.json: roster 4 has no sleeper row in data/franchises.csv",
        "data/sleeper/2026-rosters.json: roster 4 has no row in data/sleeper_aliases.csv",
    ]


def test_a_shit_bowl_winner_must_be_a_franchise_name(archive):
    write_csv(archive / "shitbowl.csv", ["year", "franchise", "second_last", "source"],
              [(2012, "Bravo", "", "recalled"), (2013, "Alpha One", "", "recalled")],
              comments=["Who took the Shit Bowl."])
    assert validate(archive) == [
        "data/shitbowl.csv line 4: franchise 'Alpha One' is not a franchise name "
        "(a franchise goes by the last team name it played under: Alpha Two, Bravo, Charlie, Delta)"]
