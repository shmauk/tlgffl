"""Privacy check: fail if a forbidden field appears in the data.

    python3 -m recordbook.privacy [PATH ...]   (default: data golden build/league.sqlite)

Real names are never published (spec #1), and Sleeper's display names and
usernames identify managers. This checks field names, not values: team names
can legitimately contain first names, so values can't be banned outright.
It scans JSON keys (at any depth), CSV headers and SQLite column names.
"""
import csv
import fnmatch
import json
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path

FORBIDDEN = re.compile(
    r"display_name|user_?name|real_name|full_name|first_name|last_name|e_?mail"
    r"|^p_nick_|^last_author|^last_message",
    re.IGNORECASE,
)

# (file glob, field path, reason): forbidden-looking fields that are fine.
ALLOWED = [
    ("*-draft_picks.json", "[].metadata.first_name", "an NFL player's name, not a manager's"),
    ("*-draft_picks.json", "[].metadata.last_name", "an NFL player's name, not a manager's"),
]

DEFAULT_PATHS = ["data", "golden", "build/league.sqlite"]


@dataclass
class Violation:
    path: Path
    field: str


def _allowed(path, field):
    return any(fnmatch.fnmatch(path.name, g) and field == f for g, f, _ in ALLOWED)


def _json_fields(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            here = f"{prefix}.{k}" if prefix else k
            yield k, here
            yield from _json_fields(v, here)
    elif isinstance(obj, list):
        seen = set()
        for item in obj:
            for key, here in _json_fields(item, f"{prefix}[]"):
                if here not in seen:
                    seen.add(here)
                    yield key, here


def redact(obj, path, prefix=""):
    """obj with every forbidden, not-allowed field removed (at any depth)."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            here = f"{prefix}.{k}" if prefix else k
            if FORBIDDEN.search(k) and not _allowed(Path(path), here):
                continue
            out[k] = redact(v, path, here)
        return out
    if isinstance(obj, list):
        return [redact(item, path, f"{prefix}[]") for item in obj]
    return obj


def _fields(path):
    """(key, reported field path) pairs for one file."""
    if path.suffix == ".json":
        yield from _json_fields(json.loads(path.read_text(encoding="utf-8")))
    elif path.suffix == ".csv":
        with open(path, newline="", encoding="utf-8") as f:
            header = next(csv.reader(line for line in f if not line.startswith("#")), [])
        for col in header:
            yield col, col
    elif path.suffix in (".sqlite", ".db"):
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            tables = [r[0] for r in con.execute("select name from sqlite_master where type in ('table', 'view')")]
            for t in tables:
                for col in con.execute(f'pragma table_info("{t}")'):
                    yield col[1], f"{t}.{col[1]}"
        finally:
            con.close()


def find_violations(paths):
    out = []
    for root in map(Path, paths):
        files = sorted(p for p in root.rglob("*") if p.is_file()) if root.is_dir() else [root]
        for path in files:
            for key, field in _fields(path):
                if FORBIDDEN.search(key) and not _allowed(path, field):
                    out.append(Violation(path, field))
    return out


def main(argv=None):
    paths = (argv if argv is not None else sys.argv[1:]) or [p for p in DEFAULT_PATHS if Path(p).exists()]
    violations = find_violations(paths)
    for v in violations:
        print(f"FORBIDDEN field {v.field} in {v.path}")
    print(f"privacy: {len(violations)} forbidden field(s) in {', '.join(map(str, paths))}")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
