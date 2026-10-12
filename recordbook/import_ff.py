"""One-time import of ff-data-project's archive into this repo (ADR 0003).

    python3 -m recordbook.import_ff <ff-data-project checkout> [--dest .]

Copies the raw platform responses and hand-kept tables into data/, and
ff-data-project's published figures into golden/ for the golden test. Fields
the privacy check forbids (Sleeper chat metadata, manager-typed player
nicknames) are stripped on the way in; everything else is copied byte for
byte. ff-data-project's data/franchises.csv is build output, so it isn't
imported: data/franchises.csv here is the hand-kept franchise id table.
After the import nothing reads from ff-data-project again.
"""
import argparse
import json
import shutil
from pathlib import Path

from recordbook.privacy import redact

DATA_FILES = ["league_h2h.csv", "shitbowl.csv", "emoji.csv", "sleeper_aliases.csv"]
DATA_DIRS = ["nfl-api", "sleeper"]


def import_archive(src, dest):
    src, dest = Path(src), Path(dest)
    copies = [(src / "data" / f, dest / "data" / f) for f in DATA_FILES]
    for d in DATA_DIRS:
        copies += [(p, dest / "data" / d / p.name) for p in sorted((src / "data" / d).glob("*.json"))]
    copies.append((src / "docs" / "data" / "league_records.json", dest / "golden" / "league_records.json"))
    for a, b in copies:
        b.parent.mkdir(parents=True, exist_ok=True)
        if a.suffix == ".json":
            raw = a.read_text(encoding="utf-8")
            obj = json.loads(raw)
            clean = redact(obj, a)
            if clean != obj:
                # Rewrite in Sleeper's compact style; only touched files change.
                b.write_text(json.dumps(clean, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
                continue
        shutil.copyfile(a, b)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("src", type=Path)
    p.add_argument("--dest", type=Path, default=Path("."))
    args = p.parse_args(argv)
    import_archive(args.src, args.dest)


if __name__ == "__main__":
    main()
