import json

from recordbook.import_ff import import_archive
from recordbook.privacy import find_violations
from tests.archive import write_csv


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def ff_checkout(root):
    """A miniature ff-data-project checkout."""
    data = root / "data"
    dump(data / "nfl-api" / "standings-2012.json", {"games": {}})
    dump(data / "sleeper" / "2025-league.json",
         {"name": "L", "last_author_display_name": "sys", "last_message_id": "9", "settings": {"x": 1}})
    dump(data / "sleeper" / "2025-rosters.json",
         [{"roster_id": 1, "metadata": {"record": "W", "p_nick_42": "Nick"}}])
    dump(data / "sleeper" / "2025-draft_picks.json", [{"metadata": {"first_name": "Josh"}}])
    for name in ("league_h2h.csv", "shitbowl.csv", "emoji.csv", "sleeper_aliases.csv", "franchises.csv"):
        write_csv(data / name, ["a"], [("1",)])
    dump(root / "docs" / "data" / "league_records.json", {"franchises": {}})
    (root / "build.py").write_text("print('not ours')\n")


def test_import_copies_the_archive_and_golden_figures(tmp_path):
    src, dest = tmp_path / "ff", tmp_path / "repo"
    ff_checkout(src)
    import_archive(src, dest)
    files = sorted(str(p.relative_to(dest)) for p in dest.rglob("*") if p.is_file())
    assert files == [
        "data/emoji.csv", "data/league_h2h.csv", "data/nfl-api/standings-2012.json",
        "data/shitbowl.csv", "data/sleeper/2025-draft_picks.json", "data/sleeper/2025-league.json",
        "data/sleeper/2025-rosters.json", "data/sleeper_aliases.csv", "golden/league_records.json"]
    # data/franchises.csv there is build output, not canonical data: never imported.


def test_import_strips_forbidden_fields_and_keeps_the_rest(tmp_path):
    src, dest = tmp_path / "ff", tmp_path / "repo"
    ff_checkout(src)
    import_archive(src, dest)
    assert find_violations([dest]) == []
    assert json.loads((dest / "data/sleeper/2025-league.json").read_text()) == {"name": "L", "settings": {"x": 1}}
    assert json.loads((dest / "data/sleeper/2025-rosters.json").read_text()) == [
        {"roster_id": 1, "metadata": {"record": "W"}}]
    assert (dest / "data/sleeper/2025-draft_picks.json").read_text() == \
        (src / "data/sleeper/2025-draft_picks.json").read_text()
