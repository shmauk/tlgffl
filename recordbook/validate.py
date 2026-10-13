"""Validate the hand-kept tables in data/ (#39).

    python3 -m recordbook.validate [DATA]   (default: data)

Maintainers edit the hand-kept CSV and YAML by pull request. This checks each
table's schema row by row, then that every franchise it names exists, and
reports every problem with its file and line, so a bad edit fails CI with a
message a maintainer can act on.
"""
import csv
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from recordbook import build as buildlib
from recordbook import formats as formatfile
from recordbook import sleeper as sleeperlib


# ---------- column checks: what's wrong with a value, or None ----------

def one_of(*allowed):
    def check(value):
        if value not in allowed:
            return f"{value!r} must be one of {', '.join(allowed)}"
    return check


def whole_number(value):
    if not (value or "").strip().isdigit():
        return f"{value!r} must be a whole number"


def number(value):
    try:
        float(value)
    except ValueError:
        return f"{value!r} must be a number"


def text(value):
    """Any value, blank included."""


def required(value):
    if not (value or "").strip():
        return "is blank"


def web_link(value):
    if not (value or "").startswith("https://"):
        return f"{value!r} must start with https://"


def optional(check):
    """check, but a blank value is fine."""
    return lambda value: None if not (value or "").strip() else check(value)


# ---------- row checks: what's wrong with a row, or None ----------

def nfl_keys_need_an_owner(row):
    if row["era"] == "nfl.com" and not row["owner_user_id"].strip():
        return "owner_user_id is blank, but an nfl.com key needs one"
    if row["era"] == "sleeper" and row["owner_user_id"].strip():
        return "owner_user_id must be blank for a sleeper key (the roster id is the key)"


def agms_have_a_season(row):
    if row["kind"] == "agm" and not row["season"].strip():
        return "an agm document needs a season"
    if row["kind"] == "constitution" and row["season"].strip():
        return "the constitution has no season; leave it blank"


def franchise_key(row):
    if row["era"] == "nfl.com":
        return f"nfl.com team {row['slot']} (owner {row['owner_user_id']})"
    return f"sleeper roster {row['slot']}"


def games_need_a_round(row):
    if row["bracket"] != "filler" and not row["round"].strip():
        return "a playoffs, shit_bowl or mediocre_bowl game needs a round"


def pairing_key(row):
    a, b = sorted((int(row["roster_a"]), int(row["roster_b"])))
    return f"{row['season']} week {row['week']} rosters {a} and {b}"


SHIT_BOWL_SOURCES =("derived-confirmed", "recalled", "inconclusive")
MEDIOCRE_BOWL_SOURCES = ("confirmed", "recalled", "disputed")


def winners_need_a_source(sources):
    def check(row):
        if row["franchise"].strip() and not row["source"].strip():
            return f"a winner needs a source ({', '.join(sources[:-1])} or {sources[-1]})"
    return check


@dataclass(frozen=True)
class Table:
    """A hand-kept CSV's schema.

    columns maps each required column to its value check; rows are checks on
    a whole row, run once its values pass; key names what must be unique; and
    franchises lists the columns that hold franchise names ("A|B" for two).
    """
    columns: dict
    rows: list = field(default_factory=list)
    key: object = None
    franchises: tuple = ()


SCHEMAS = {
    "franchises.csv": Table(
        {"franchise_id": whole_number, "era": one_of("nfl.com", "sleeper"),
         "slot": whole_number, "owner_user_id": optional(whole_number)},
        [nfl_keys_need_an_owner], franchise_key),
    # The bracket winners only data can't supply (data/<table>'s comments
    # explain each source).
    "shitbowl.csv": Table(
        {"year": whole_number, "franchise": text,
         "source": optional(one_of(*SHIT_BOWL_SOURCES))},
        [winners_need_a_source(SHIT_BOWL_SOURCES)], lambda row: row["year"], ("franchise",)),
    "mediocre_bowl.csv": Table(
        {"year": whole_number, "franchise": text,
         "source": optional(one_of(*MEDIOCRE_BOWL_SOURCES))},
        [winners_need_a_source(MEDIOCRE_BOWL_SOURCES)], lambda row: row["year"], ("franchise",)),
    "sleeper_aliases.csv": Table(
        {"roster_id": whole_number, "sleeper_name": text, "franchise": required},
        key=lambda row: f"roster {row['roster_id']}", franchises=("franchise",)),
    "emoji.csv": Table(
        {"franchise": required, "emoji": text},
        key=lambda row: row["franchise"], franchises=("franchise",)),
    # Sleeper-era tables (#25): the league bracket of each bracket-week
    # pairing, and the explanations of Sleeper's roster-total gaps.
    "sleeper_brackets.csv": Table(
        {"season": whole_number, "week": whole_number, "roster_a": whole_number,
         "roster_b": whole_number, "bracket": one_of("playoffs", "shit_bowl", "mediocre_bowl", "filler"),
         "round": optional(whole_number)},
        [games_need_a_round], pairing_key),
    "sleeper_adjustments.csv": Table(
        {"season": whole_number, "roster_id": whole_number, "week": whole_number,
         "points": number, "reason": required}),
    # Keepers (#37): Sleeper's is_keeper is always null, so they are kept by
    # hand. A season with no rows shows "keepers not yet recorded".
    "keepers.csv": Table(
        {"season": whole_number, "franchise_id": whole_number, "nfl_player_id": required,
         "round": whole_number},
        key=lambda row: f"{row['season']} franchise {row['franchise_id']} NFL player {row['nfl_player_id']}"),
    # Each season's divisions and their lineage (#32); the build checks they
    # match the divisions played and keep within one realignment.
    "division_lineages.csv": Table(
        {"season": whole_number, "division": required, "lineage": required},
        key=lambda row: f"{row['season']} {row['division']}"),
    "documents.csv": Table(
        {"kind": one_of("constitution", "agm"), "season": optional(whole_number),
         "title": required, "url": web_link},
        [agms_have_a_season]),
}


def read_rows(path):
    """(header, [(line number, row)]) for a CSV, skipping '#' comment lines.

    Line numbers are the file's own, comments included, as an editor shows them.
    """
    with open(path, newline="", encoding="utf-8") as f:
        numbered = [(n, line) for n, line in enumerate(f, start=1) if not line.startswith("#")]
    reader = csv.DictReader(line for _, line in numbered)
    rows = [(numbered[reader.line_num - 1][0], row) for row in reader]
    return reader.fieldnames or [], rows


def validate(data):
    """Every problem in the hand-kept tables under data, as readable messages."""
    data = Path(data)
    problems = []
    for name, table in SCHEMAS.items():
        path = data / name
        if path.exists():
            problems += check_table(name, table, path)
    if problems:
        # The checks across tables assume each table is well formed.
        return problems
    problems = check_platform_teams(data) + check_formats(data)
    if problems:
        return problems
    names = franchise_names(data)
    for name, table in SCHEMAS.items():
        if table.franchises and (data / name).exists():
            problems += check_franchise_names(name, table, data / name, names)
    return problems + check_keepers(data)


def check_keepers(data):
    """Each keeper's franchise id must exist and, in a season with a Sleeper
    draft snapshot, be the franchise that took the NFL player with the pick
    of the round it cost. Elsewhere the NFL player must be a Sleeper id some
    snapshot knows."""
    path = data / "keepers.csv"
    if not path.exists():
        return []
    franchises = {int(fid) for fid in buildlib.franchise_keys(data).values()}
    sleeper = data / "sleeper"
    drafts = {}
    for f in sorted(sleeper.glob("*-draft_picks.json")):
        drafts[int(f.name[:4])] = {(p["roster_id"], p["player_id"]): p["round"]
                                   for p in json.loads(f.read_text(encoding="utf-8")) if p.get("player_id")}
    roster_franchise = {int(slot): fid for (era, slot, _), fid in buildlib.franchise_keys(data).items()
                        if era == "sleeper"}
    known = None
    problems = []
    for line, row in read_rows(path)[1]:
        where = f"data/keepers.csv line {line}"
        season, fid, pid, rnd = int(row["season"]), int(row["franchise_id"]), row["nfl_player_id"].strip(), int(row["round"])
        if fid not in franchises:
            problems.append(f"{where}: franchise_id {fid} is not a franchise id in data/franchises.csv")
        elif season in drafts:
            taken = {roster_franchise.get(r): n for (r, p), n in drafts[season].items() if p == pid}
            if fid not in taken:
                problems.append(f"{where}: franchise {fid} made no pick of NFL player {pid} in the {season} draft "
                                "(a keeper takes the pick of the round it cost)")
            elif taken[fid] != rnd:
                problems.append(f"{where}: franchise {fid} took NFL player {pid} in round {taken[fid]} "
                                f"of the {season} draft, not round {rnd}")
        else:
            if known is None:
                known = {pid for pid, *_ in sleeperlib.nfl_players(sleeper, [])}
            if pid not in known:
                problems.append(f"{where}: NFL player {pid!r} is not a Sleeper player id any snapshot knows")
    return problems


def check_table(name, table, path):
    header, rows = read_rows(path)
    missing = [c for c in table.columns if c not in header]
    if missing:
        return [f"data/{name}: no {c} column" for c in missing]
    problems = []
    seen = {}
    for line, row in rows:
        errors = [f"{column} {e}" for column, check in table.columns.items()
                  if (e := check(row[column] or ""))]
        if not errors:
            errors = [e for check in table.rows if (e := check(row))]
        if not errors and table.key:
            key = table.key(row)
            if key in seen:
                errors = [f"{key} is already on line {seen[key]}"]
            seen.setdefault(key, line)
        problems += [f"data/{name} line {line}: {e}" for e in errors]
    return problems


def _keyed_slots(data, era):
    path = data / "franchises.csv"
    return {row["slot"] if era == "sleeper" else (row["slot"], row["owner_user_id"])
            for _, row in (read_rows(path)[1] if path.exists() else []) if row["era"] == era}


def check_platform_teams(data):
    """Every platform team needs a franchise, and every Sleeper roster an
    alias: the build can't place one without them (#19: by week 1)."""
    problems = []
    nfl_keys = _keyed_slots(data, "nfl.com")
    for year, league in buildlib.nfl_seasons(data).items():
        for t in league["teams"].values():
            if (t["teamId"], t["ownerUserId"]) not in nfl_keys:
                problems.append(f"data/nfl-api/standings-{year}.json: team {t['teamId']} "
                                f"(owner {t['ownerUserId']}) has no nfl.com row in data/franchises.csv")
    sleeper_keys = _keyed_slots(data, "sleeper")
    aliases_path = data / "sleeper_aliases.csv"
    aliases = ({row["roster_id"] for _, row in read_rows(aliases_path)[1]}
               if aliases_path.exists() else set())
    for path in sorted((data / "sleeper").glob("*-rosters.json")):
        for roster in json.loads(path.read_text(encoding="utf-8")):
            rid = str(roster["roster_id"])
            where = f"data/sleeper/{path.name}: roster {rid}"
            if rid not in sleeper_keys:
                problems.append(f"{where} has no sleeper row in data/franchises.csv")
            if rid not in aliases:
                problems.append(f"{where} has no row in data/sleeper_aliases.csv")
    return problems


FORMAT_FIELDS = ("teams", "divisions", "realignment", "regular_season_weeks")
BRACKET_FIELDS = ("size", "weeks")


def check_formats(data):
    """Every season the archive holds needs a format in data/formats.yaml
    (#19), with the fields the build reads."""
    path = data / "formats.yaml"
    try:
        entries = (yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None) or {}
    except yaml.YAMLError as e:
        return [f"data/formats.yaml is not valid YAML: {e}"]
    problems = []
    for season, entry in entries.items():
        if not isinstance(season, int):
            continue  # anchors such as x-nfl-4
        where = f"data/formats.yaml {season}"
        if not isinstance(entry, dict):
            problems.append(f"{where}: must be a mapping of {', '.join(FORMAT_FIELDS)} and brackets")
            continue
        problems += [f"{where}: no {f}" for f in FORMAT_FIELDS if f not in entry]
        for name, bracket in (entry.get("brackets") or {}).items():
            problems += [f"{where} {name}: no {f}" for f in BRACKET_FIELDS
                         if f not in (bracket or {})]
    if problems:
        return problems
    team_counts = {year: len(league["teams"]) for year, league in buildlib.nfl_seasons(data).items()}
    team_counts |= {year: int(league.get("total_rosters") or len(rosters))
                    for year, (league, rosters) in buildlib.sleeper_seasons(data).items()}
    try:
        formatfile.load(path, team_counts)
    except formatfile.FormatError as e:
        return [str(e)]
    return []


def franchise_names(data):
    """Every franchise's name, as the build gives it: the last real team name
    it played under, or its Sleeper alias if it has only played on Sleeper."""
    keys = buildlib.franchise_keys(data)
    team_names = {}
    for year, league in buildlib.nfl_seasons(data).items():
        for t in league["teams"].values():
            team_names[(keys[("nfl.com", t["teamId"], t["ownerUserId"])], year)] = t["name"]
    sleeper_ids = {fid: int(slot) for (era, slot, _), fid in keys.items() if era == "sleeper"}
    aliases_path = data / "sleeper_aliases.csv"
    aliases = ({int(r["roster_id"]): r for r in buildlib.read_csv(aliases_path)}
               if aliases_path.exists() else {})
    names = set()
    for fid in set(keys.values()):
        try:
            names.add(buildlib.franchise_name(fid, team_names, sleeper_ids, aliases))
        except buildlib.BuildError:
            pass
    return names


def check_franchise_names(name, table, path, names):
    problems = []
    for line, row in read_rows(path)[1]:
        for column in table.franchises:
            for franchise in (n.strip() for n in (row[column] or "").split("|")):
                if franchise and franchise not in names:
                    problems.append(
                        f"data/{name} line {line}: {column} {franchise!r} is not a franchise name "
                        "(a franchise goes by the last team name it played under: "
                        f"{', '.join(sorted(names))})")
    return problems


def main(argv=None):
    args = argv if argv is not None else sys.argv[1:]
    problems = validate(args[0] if args else "data")
    for p in problems:
        print(p)
    print(f"validate: {len(problems)} problem(s) in the hand-kept data")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
