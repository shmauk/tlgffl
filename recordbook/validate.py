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

from recordbook import build as buildlib
from recordbook import formats as formatfile
from recordbook import franchises as franchiselib
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


def advanced_is_one_of_the_pair(row):
    advanced = row["advanced"].strip()
    if advanced and advanced not in (row["roster_a"].strip(), row["roster_b"].strip()):
        return f"advanced {advanced} is neither roster_a nor roster_b"


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
        key=lambda row: f"roster {row['roster_id']}"),
    "emoji.csv": Table(
        {"franchise": required, "emoji": text},
        key=lambda row: row["franchise"], franchises=("franchise",)),
    # Sleeper-era tables (#25): the league bracket of each bracket-week
    # pairing, and the explanations of Sleeper's roster-total gaps.
    "sleeper_brackets.csv": Table(
        {"season": whole_number, "week": whole_number, "roster_a": whole_number,
         "roster_b": whole_number, "bracket": one_of("playoffs", "shit_bowl", "mediocre_bowl", "filler"),
         "round": optional(whole_number), "advanced": optional(whole_number)},
        [games_need_a_round, advanced_is_one_of_the_pair], pairing_key),
    "sleeper_adjustments.csv": Table(
        {"season": whole_number, "roster_id": whole_number, "week": whole_number,
         "points": number, "reason": required}),
    # Keepers (#37): Sleeper's is_keeper is always null, so they are kept by
    # hand. A season with no rows shows "keepers not yet recorded", unless
    # data/formats.yaml says it was played without keepers.
    "keepers.csv": Table(
        {"season": whole_number, "franchise_id": whole_number, "nfl_player_id": required,
         "round": whole_number},
        key=lambda row: f"{row['season']} franchise {row['franchise_id']} NFL player {row['nfl_player_id']}"),
    # Each season's divisions and their lineage (#32); the build checks they
    # match the divisions played and keep within one realignment.
    "division_lineages.csv": Table(
        {"season": whole_number, "division": required, "lineage": required},
        key=lambda row: f"{row['season']} {row['division']}"),
    # Games left out of the records, each with the league's reason; the build
    # checks the franchise played a game with a score that week.
    "record_exclusions.csv": Table(
        {"season": whole_number, "week": whole_number, "franchise": required, "reason": required},
        key=lambda row: f"{row['season']} week {row['week']} {row['franchise']}", franchises=("franchise",)),
    "documents.csv": Table(
        {"kind": one_of("constitution", "agm"), "season": optional(whole_number),
         "title": required, "url": web_link},
        [agms_have_a_season]),
    # Each Sleeper-era season's league id (#26), which the fetch reads: add next
    # season's when Sleeper creates it.
    "sleeper_leagues.csv": Table(
        {"season": whole_number, "league_id": whole_number}, key=lambda row: row["season"]),
    # Scissors-paper-rock rulings (#34): the franchises a ruling orders, winner first.
    "scissors_paper_rock.csv": Table(
        {"season": whole_number, "order": required}, franchises=("order",)),
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
    nfl, sleeper = buildlib.nfl_seasons(data), buildlib.sleeper_seasons(data)
    registry = franchiselib.load(data, nfl, sleeper)
    formats, format_problems = {}, []
    try:
        formats = formatfile.load(data / "formats.yaml", buildlib.team_counts(nfl, sleeper))
    except formatfile.FormatError as e:
        format_problems = e.problems
    problems = registry.problems + format_problems + check_sleeper_leagues(data)
    if problems:
        return problems
    for name, table in SCHEMAS.items():
        if table.franchises and (data / name).exists():
            problems += check_franchise_names(name, table, data / name, registry)
    return problems + check_keepers(data, registry, formats)


def check_keepers(data, registry, formats):
    """Each keeper's franchise id must exist and, in a season with a Sleeper
    draft snapshot, be the franchise that took the NFL player with the pick
    of the round it cost. Elsewhere the NFL player must be a Sleeper id some
    snapshot knows."""
    path = data / "keepers.csv"
    if not path.exists():
        return []
    franchises = set(registry.ids)
    sleeper = data / "sleeper"
    drafts = {}
    for f in sorted(sleeper.glob("*-draft_picks.json")):
        drafts[int(f.name[:4])] = {(p["roster_id"], p["player_id"]): p["round"]
                                   for p in json.loads(f.read_text(encoding="utf-8")) if p.get("player_id")}
    keeperless = {y for y, f in formats.items() if not f.keepers}
    known = None
    problems = []
    for line, row in read_rows(path)[1]:
        where = f"data/keepers.csv line {line}"
        season, fid, pid, rnd = int(row["season"]), int(row["franchise_id"]), row["nfl_player_id"].strip(), int(row["round"])
        if season in keeperless:
            problems.append(f"{where}: data/formats.yaml says {season} was played without keepers")
        elif fid not in franchises:
            problems.append(f"{where}: franchise_id {fid} is not a franchise id in data/franchises.csv")
        elif season in drafts:
            taken = {registry.roster(r): n for (r, p), n in drafts[season].items() if p == pid}
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


def check_sleeper_leagues(data):
    """Each Sleeper league snapshot must be the league data/sleeper_leagues.csv
    gives its season, and every snapshotted season needs a row."""
    path = data / "sleeper_leagues.csv"
    ids = {int(row["season"]): row["league_id"].strip() for _, row in read_rows(path)[1]} if path.exists() else {}
    problems = []
    for f in sorted((data / "sleeper").glob("*-league.json")):
        lid = json.loads(f.read_text(encoding="utf-8")).get("league_id")
        season = int(f.name[:4])
        if lid is None:
            continue
        if season not in ids:
            problems.append(f"data/sleeper/{f.name}: {season} has no row in data/sleeper_leagues.csv")
        elif ids[season] != str(lid):
            problems.append(f"data/sleeper/{f.name} is league {lid}, but data/sleeper_leagues.csv "
                            f"gives {season} league {ids[season]}")
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


def check_franchise_names(name, table, path, registry):
    problems = []
    for line, row in read_rows(path)[1]:
        for column in table.franchises:
            for franchise in (n.strip() for n in (row[column] or "").split("|")):
                if franchise and registry.named(franchise) is None:
                    problems.append(
                        f"data/{name} line {line}: {column} {franchise!r} is not a franchise name "
                        "(a hand-kept table names a franchise by its franchise name or its filed name: "
                        f"{', '.join(registry.names)})")
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
