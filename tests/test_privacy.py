import json
import sqlite3

from recordbook.privacy import find_violations, main
from tests.archive import write_csv


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def test_clean_data_has_no_violations(archive):
    assert find_violations([archive]) == []


def test_planted_forbidden_json_fields_are_found(tmp_path):
    dump(tmp_path / "sleeper" / "2026-users.json",
         [{"user_id": "1", "display_name": "someone", "metadata": {"team_name": "T"}}])
    dump(tmp_path / "sleeper" / "2026-league.json",
         {"name": "L", "last_author_display_name": "someone", "settings": {"real_name": "x"}})
    dump(tmp_path / "sleeper" / "2026-rosters.json", [{"metadata": {"p_nick_123": "Nick"}}])
    found = sorted((v.path.name, v.field) for v in find_violations([tmp_path]))
    assert found == [
        ("2026-league.json", "last_author_display_name"),
        ("2026-league.json", "settings.real_name"),
        ("2026-rosters.json", "[].metadata.p_nick_123"),
        ("2026-users.json", "[].display_name"),
    ]


def test_nfl_player_names_in_draft_picks_are_allowed(tmp_path):
    dump(tmp_path / "sleeper" / "2025-draft_picks.json",
         [{"metadata": {"first_name": "Josh", "last_name": "Allen"}}])
    assert find_violations([tmp_path]) == []
    # ...but not the same field anywhere else.
    dump(tmp_path / "sleeper" / "2025-rosters.json", [{"metadata": {"first_name": "Josh"}}])
    assert [v.field for v in find_violations([tmp_path])] == ["[].metadata.first_name"]


def test_csv_headers_are_checked(tmp_path):
    write_csv(tmp_path / "keepers.csv", ["season", "franchise_id", "username"], [(2025, 1, "x")])
    assert [(v.path.name, v.field) for v in find_violations([tmp_path])] == [("keepers.csv", "username")]


def test_database_columns_are_checked(tmp_path):
    db = tmp_path / "league.sqlite"
    con = sqlite3.connect(db)
    con.execute("create table managers (id integer, display_name text)")
    con.commit()
    con.close()
    assert [v.field for v in find_violations([db])] == ["managers.display_name"]


def test_cli_fails_on_a_planted_field(archive, capsys):
    assert main([str(archive)]) == 0
    dump(archive / "sleeper" / "2025-users.json", [{"username": "someone"}])
    assert main([str(archive)]) == 1
    assert "2025-users.json" in capsys.readouterr().out
