"""PROTOTYPE data extract for the Statsguru prototype (shmauk/tlgffl#9).

Reads ff-data-project's archive (path as argv[1]) by importing its build.py, and
writes games, reported season lines and coverage as one JSON blob (argv[2]).
"""
import importlib.util
import json
import sys
from collections import defaultdict
from pathlib import Path

root = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("build", root / "build.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

seasons = b.nfl_seasons()
alias, _ = b.franchises(seasons)
salias = b.sleeper_alias()
badge = b.franchise_emoji()
reg_end = b.regular_season_end(seasons)
reg_end["2025"] = 14
reg_end["2026"] = 14

standings = list(b.nfl_standings(seasons, alias)) + list(b.sleeper_standings(salias))
played = b.played_nfl(standings)
made = {(s["year"], s["franchise"]) for s in standings if s["madePlayoffs"]}

names = sorted({s["franchise"] for s in standings} | set(salias.values()))
fid = {n: i + 1 for i, n in enumerate(names)}
live = json.load(open(root / "data" / "sleeper" / "2026-rosters.json"))
active = {salias[str(r["roster_id"])] for r in live}

games = []
logged_po = {}
for year, rnd, phase, a, sa, bb, sb in b.nfl_games(alias, reg_end):
    if phase == "regular":
        games.append([int(year), rnd, "R", fid[a], sa, fid[bb], sb])
    elif (year, a) in made and (year, bb) in made:
        logged_po[(year, frozenset((a, bb)))] = (rnd, {a: sa, bb: sb})
    else:
        games.append([int(year), rnd, "C", fid[a], sa, fid[bb], sb])

# Championship pairings, reconstructed for every NFL season; scores where logged.
for year, gs in b.brackets(seasons, alias, played).items():
    n = len(gs)
    rounds = [1, 1, 2, 2, 3, 3] if n == 6 else [1, 1, 2, 2]
    for (a, bb, w), r in zip(gs, rounds):
        hit = logged_po.get((year, frozenset((a, bb))))
        if hit:
            wk, pts = hit
            games.append([int(year), wk, "P", fid[a], pts[a], fid[bb], pts[bb]])
        else:
            # Result known, score lost: store the winner first with null scores.
            loser = bb if w == a else a
            games.append([int(year), reg_end[year] + r, "P", fid[w], None, fid[loser], None])

# Sleeper: winners bracket = Playoffs, losers bracket = consolation, other
# playoff-week pairings are platform filler and not games.
for year in ("2025", "2026"):
    sroot = root / "data" / "sleeper"
    wb = {frozenset((m["t1"], m["t2"])) for m in json.load(open(sroot / f"{year}-winners_bracket.json"))
          if isinstance(m.get("t1"), int) and isinstance(m.get("t2"), int)}
    lb = {frozenset((m["t1"], m["t2"])) for m in json.load(open(sroot / f"{year}-losers_bracket.json"))
          if isinstance(m.get("t1"), int) and isinstance(m.get("t2"), int)}
    inv = {v: int(k) for k, v in salias.items()}
for year, wk, phase, a, sa, bb, sb in b.sleeper_games(salias):
    if phase == "regular":
        games.append([int(year), wk, "R", fid[a], sa, fid[bb], sb])
        continue
    sroot = root / "data" / "sleeper"
    pair = frozenset((inv[a], inv[bb]))
    wb = {frozenset((m["t1"], m["t2"])) for m in json.load(open(sroot / f"{year}-winners_bracket.json"))
          if isinstance(m.get("t1"), int) and isinstance(m.get("t2"), int)}
    lb = {frozenset((m["t1"], m["t2"])) for m in json.load(open(sroot / f"{year}-losers_bracket.json"))
          if isinstance(m.get("t1"), int) and isinstance(m.get("t2"), int)}
    if pair in wb:
        games.append([int(year), wk, "P", fid[a], sa, fid[bb], sb])
    elif pair in lb:
        games.append([int(year), wk, "C", fid[a], sa, fid[bb], sb])

lines = [[int(s["year"]), fid[s["franchise"]], s["teamName"], s["wins"], s["losses"], s["ties"],
          s["pointsFor"], s["pointsAgainst"], s["madePlayoffs"]] for s in standings]

# Coverage per season: regular weeks with game scores vs weeks played.
cov = {}
for y in sorted({s["year"] for s in standings}):
    wk = reg_end[y]
    have = sorted({g[1] for g in games if g[0] == int(y) and g[2] == "R"})
    po = [g for g in games if g[0] == int(y) and g[2] == "P"]
    cov[y] = {"regWeeks": wk, "regScored": have,
              "poGames": len(po), "poScored": sum(1 for g in po if g[4] is not None)}

spoons = b.shitbowl()
out = {
    "franchises": [{"id": fid[n], "name": n, "emoji": badge.get(n, ""), "active": n in active}
                   for n in names],
    "games": sorted(games),
    "lines": lines,
    "coverage": cov,
    "shitbowl": {y: v["candidates"] for y, v in spoons.items()},
}
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
print(len(games), "games,", len(lines), "season lines,", len(names), "franchises")
for y, c in cov.items():
    print(y, c["regWeeks"], len(c["regScored"]), c["poGames"], c["poScored"])
