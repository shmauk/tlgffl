"""Golden test: compare the database with ff-data-project's published figures.

    python3 -m recordbook.golden [--db build/league.sqlite]
        [--golden golden/league_records.json] [--allow golden/allowlist.csv]

golden/league_records.json is ff-data-project's last build output, committed
here once. Every figure checked must match, or be listed in the allow-list
with a reason. An allow-list entry with nothing left to excuse fails too, so
the list can't rot. Coverage grows as the build ports more of ff-data-project.

Figures are named "<franchise name>|<season>|<field>" (season lines, Playoffs
records and Shit Bowl outcomes), "<franchise name>|<exists|active>"
(franchises) or "<season>|<field>" (each season's champion, runner-up and Shit
Bowl winner).
"""
import argparse
import json
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path

from recordbook.build import read_csv

# ff-data-project field -> season_lines expression (derived where games allow, ADR 0001).
SEASON_LINE_FIGURES = {
    "teamName": "t.team_name",
    "wins": "l.wins",
    "losses": "l.losses",
    "ties": "l.ties",
    "pointsFor": "l.points_for",
    "pointsAgainst": "l.points_against",
    "playoffSeed": "l.seed",
    "finalOrder": "l.final_placing",
}


def bracket_figures(con, name, fid, s):
    """A franchise-season's Playoffs record and Shit Bowl outcome, as
    "<franchise>|<season>|<field>" figures, for the fields ff-data-project has."""
    season = int(s["year"])
    wins, losses = con.execute(
        "select coalesce(sum(winner_franchise_id = ?), 0), "
        "coalesce(sum(winner_franchise_id is not null and winner_franchise_id != ?), 0) "
        "from games where season = ? and bracket = 'playoffs' and ? in (home_franchise_id, away_franchise_id)",
        (fid, fid, season, fid)).fetchone()
    crowns = con.execute("select source from bracket_winners where season = ? and bracket = 'shit_bowl' "
                         "and franchise_id = ?", (season, fid)).fetchall()
    ours = {
        "madePlayoffs": wins + losses > 0 or bool(con.execute(
            "select 1 from season_lines where season = ? and franchise_id = ? and bracket in ('championship', 'playoffs')",
            (season, fid)).fetchone()),
        "playoffWins": wins,
        "playoffLosses": losses,
        "shitbowl": any(src != "disputed" for (src,) in crowns),
        "shitbowlDisputed": any(src == "disputed" for (src,) in crowns),
    }
    theirs = {**s, "playoffWins": (s.get("playoff") or {}).get("wins"),
              "playoffLosses": (s.get("playoff") or {}).get("losses")}
    keys = [k for k in ours if (k in s) or (k.startswith("playoff") and "playoff" in s)]
    return [(f"{name}|{season}|{k}", ours[k], theirs[k]) for k in keys]


def crown_figures(con, meta):
    """Each season's champion, runner-up and Shit Bowl winner, as
    "<season>|<field>" figures (a disputed Shit Bowl has no winner)."""
    names = dict(con.execute("select id, name from franchises"))
    found = []
    for f in meta.get("finals", []):
        season = int(f["year"])
        final = con.execute("select winner_franchise_id, case when winner_franchise_id = home_franchise_id "
                            "then away_franchise_id else home_franchise_id end from games "
                            "where season = ? and bracket = 'playoffs' order by round desc limit 1",
                            (season,)).fetchone() or (None, None)
        shit_bowl = con.execute("select franchise_id, source from bracket_winners "
                                "where season = ? and bracket = 'shit_bowl'", (season,)).fetchall()
        candidates = sorted(names[fid] for fid, _ in shit_bowl if fid is not None)
        winner = candidates[0] if len(candidates) == 1 else None
        found += [(f"{season}|champion", names.get(final[0]), f["champion"]),
                  (f"{season}|runnerUp", names.get(final[1]), f["runnerUp"]),
                  (f"{season}|shitbowl", winner, f["shitbowl"]),
                  (f"{season}|shitbowlCandidates", candidates, sorted(f["shitbowlCandidates"]))]
    return found


@dataclass
class Mismatch:
    figure: str
    ours: object
    theirs: object


@dataclass
class Report:
    checked: int = 0
    mismatches: list = field(default_factory=list)
    allowed: list = field(default_factory=list)
    stale: list = field(default_factory=list)


def compare(db_path, golden_path, allow_path):
    allow = {}
    for r in read_csv(allow_path):
        if not (r.get("reason") or "").strip():
            raise ValueError(f"allow-list entry {r['figure']!r} has no reason")
        allow[r["figure"]] = r["reason"]

    records = json.loads(Path(golden_path).read_text())
    golden = records["franchises"]
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        ours = {name: (fid, bool(active)) for fid, name, active
                in con.execute("select id, name, active from franchises")}
        found = []
        for name in sorted(set(golden) | set(ours)):
            found.append((f"{name}|exists", name in ours, name in golden))
            if name in ours and name in golden:
                found.append((f"{name}|active", ours[name][1], bool(golden[name]["active"])))
            if name not in ours:
                continue
            for s in golden.get(name, {}).get("seasons", []):
                row = con.execute(
                    f"select {', '.join(SEASON_LINE_FIGURES.values())} from season_lines l "
                    "join team_names t on t.franchise_id = l.franchise_id and t.season = l.season "
                    "where l.franchise_id = ? and l.season = ?", (ours[name][0], int(s["year"]))
                ).fetchone() or [None] * len(SEASON_LINE_FIGURES)
                for key, value in zip(SEASON_LINE_FIGURES, row):
                    if key in s:
                        found.append((f"{name}|{s['year']}|{key}", value, s[key]))
                found += bracket_figures(con, name, ours[name][0], s)
        found += crown_figures(con, records.get("meta", {}))
    finally:
        con.close()

    report = Report(checked=len(found))
    for figure, mine, theirs in found:
        if mine == theirs:
            continue
        (report.allowed if figure in allow else report.mismatches).append(Mismatch(figure, mine, theirs))
    excused = {m.figure for m in report.allowed}
    report.stale = sorted(f for f in allow if f not in excused)
    return report


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--db", default="build/league.sqlite")
    p.add_argument("--golden", default="golden/league_records.json")
    p.add_argument("--allow", default="golden/allowlist.csv")
    args = p.parse_args(argv)
    report = compare(args.db, args.golden, args.allow)
    for m in report.mismatches:
        print(f"MISMATCH {m.figure}: ours {m.ours!r}, ff-data-project {m.theirs!r}")
    for f in report.stale:
        print(f"STALE allow-list entry {f}: nothing to excuse any more")
    print(f"golden: {report.checked} figures checked, {len(report.allowed)} allow-listed, "
          f"{len(report.mismatches)} mismatched, {len(report.stale)} stale")
    return 1 if report.mismatches or report.stale else 0


if __name__ == "__main__":
    sys.exit(main())
