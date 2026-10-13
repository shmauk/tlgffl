"""Validation of the hand-kept tables (#39): every bad row fails CI with a
message that names the file, the line and what is wrong with it."""
from pathlib import Path

import pytest

from recordbook.validate import main, validate
from tests.archive import (write_csv, write_documents, write_franchise_keys, write_sleeper_aliases,
                           write_sleeper_season, write_formats, fmt)


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
    write_formats(archive, {2012: fmt(2, 3, (1, [4])), 2013: fmt(2, 3, (1, [4])),
                            2025: fmt(3, 14, (2, [15])), 2026: fmt(4, 14, (2, [15]))})
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


def test_bracket_winner_tables_check_their_source_and_season(archive):
    write_csv(archive / "mediocre_bowl.csv", ["year", "franchise", "source"],
              [(2012, "Bravo", "guessed"), (2013, "", ""), (2013, "Charlie", "recalled"),
               ("2o14", "Bravo", "recalled"), (2014, "Bravo", "")])
    assert validate(archive) == [
        "data/mediocre_bowl.csv line 2: source 'guessed' must be one of confirmed, recalled, disputed",
        "data/mediocre_bowl.csv line 4: 2013 is already on line 3",
        "data/mediocre_bowl.csv line 5: year '2o14' must be a whole number",
        "data/mediocre_bowl.csv line 6: a winner needs a source (confirmed, recalled or disputed)",
    ]


def test_a_blank_winner_is_unknown_and_needs_no_source(archive):
    write_csv(archive / "shitbowl.csv", ["year", "franchise", "second_last", "source"],
              [(2012, "", "", ""), (2013, "Bravo|Charlie", "", "inconclusive")])
    assert validate(archive) == []


def test_emoji_badges_belong_to_franchises_once_each(archive):
    write_csv(archive / "emoji.csv", ["franchise", "emoji"],
              [("Bravo", "🐻"), ("Bravo", "🧸"), ("Bravvo", "🐻")])
    assert validate(archive) == [
        "data/emoji.csv line 3: Bravo is already on line 2",
    ]
    write_csv(archive / "emoji.csv", ["franchise", "emoji"], [("Bravo", "🐻"), ("Bravvo", "🐻")])
    assert [p.split(" (")[0] for p in validate(archive)] == [
        "data/emoji.csv line 3: franchise 'Bravvo' is not a franchise name"]


def test_sleeper_aliases_need_a_roster_id_and_a_franchise(archive):
    write_sleeper_aliases(archive, [(1, "Charlie Sleeper", "Charlie"),
                                    (2, "Alpha Sleeper", ""),
                                    ("three", "Delta", "Delta")])
    assert validate(archive) == [
        "data/sleeper_aliases.csv line 3: franchise is blank",
        "data/sleeper_aliases.csv line 4: roster_id 'three' must be a whole number",
    ]


def test_documents_need_a_kind_a_season_for_agms_and_a_web_link(archive):
    write_documents(archive, [("constitution", "", "Constitution", "https://docs.google.com/x"),
                              ("agm", "", "AGM minutes", "https://docs.google.com/y"),
                              ("minutes", 2021, "Minutes", "https://docs.google.com/z"),
                              ("agm", 2022, "AGM minutes", "docs.google.com/z")])
    assert validate(archive) == [
        "data/documents.csv line 3: an agm document needs a season",
        "data/documents.csv line 4: kind 'minutes' must be one of constitution, agm",
        "data/documents.csv line 5: url 'docs.google.com/z' must start with https://",
    ]


def test_a_season_without_a_format_fails(archive):
    write_formats(archive, {2012: fmt(2, 3, (1, [4])), 2013: fmt(2, 3, (1, [4]))})
    assert validate(archive) == [
        "2025 has no format in data/formats.yaml: every season needs one"]


def test_a_format_missing_a_field_or_unreadable_yaml_fails_readably(archive):
    entry = fmt(3, 14, (2, [15]))
    del entry["regular_season_weeks"]
    write_formats(archive, {2012: fmt(2, 3, (1, [4])), 2013: fmt(2, 3, (1, [4])), 2025: entry})
    assert validate(archive) == ["data/formats.yaml 2025: no regular_season_weeks"]
    (archive / "formats.yaml").write_text("2012: {teams: 2\n")
    [problem] = validate(archive)
    assert problem.startswith("data/formats.yaml is not valid YAML")


def test_the_cli_prints_each_problem_and_fails(archive, capsys):
    assert main([str(archive)]) == 0
    write_sleeper_aliases(archive, [(1, "Charlie Sleeper", "Charlie"), (2, "Alpha Sleeper", "Alpha Two")])
    assert main([str(archive)]) == 1
    out = capsys.readouterr().out
    assert "data/sleeper/2025-rosters.json: roster 3 has no row in data/sleeper_aliases.csv" in out
    assert "1 problem(s)" in out


def test_the_real_hand_kept_data_is_valid():
    data = Path(__file__).resolve().parent.parent / "data"
    if not (data / "nfl-api").is_dir():
        pytest.skip("archive not imported (see README)")
    assert validate(data) == []
