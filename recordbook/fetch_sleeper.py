"""Snapshot the Sleeper era's raw API responses into data/sleeper/ (ADR 0003).

    python3 -m recordbook.fetch_sleeper [--data data]

About 50 unauthenticated GETs per season (league, rosters, users, 18 weeks of
matchups and of transactions, both brackets, traded picks, drafts and draft
picks) plus one players dump. A file is written only when its content
changed, so a scheduled run commits nothing on a quiet day.

Privacy reductions are applied before anything is written:
- users become {roster_id, team_name} through the rosters' owner ids. A team
  name may be empty; it never falls back to the manager's display name.
- the players dump (~15 MB, with birth dates and colleges) becomes
  {player id: {name, pos, team}} for the NFL players who appear in the league.
- every field the privacy check forbids (Sleeper chat metadata, manager-typed
  player nicknames) is stripped from every response.

Team names and NFL players' NFL teams are current-state only on Sleeper, so a
season in progress gets dated weekly files, {season}-team_names-{week}.json
and {season}-players-{week}.json, the week being Sleeper's current week; a
new one is written only when it differs from the season's latest. A complete
season gets none: its names would no longer be the ones it was played under.
"""
import argparse
import json
import urllib.request
from pathlib import Path

from recordbook.privacy import redact

BASE = "https://api.sleeper.app/v1"

# Each Sleeper-era season's league id. Sleeper gives every season a new
# league; add next season's here when it is created.
LEAGUES = {2025: "1262684581069332480", 2026: "1380142135487004672"}

WEEKS = range(1, 19)


def http_get(path):
    """The parsed JSON response of a GET to the Sleeper API."""
    req = urllib.request.Request(BASE + path, headers={"User-Agent": "tlgffl record book"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def team_names(users, rosters):
    """[{roster_id, team_name}] from the league's users, via each roster's owner."""
    names = {u["user_id"]: ((u.get("metadata") or {}).get("team_name") or "") for u in users or []}
    return [{"roster_id": r["roster_id"], "team_name": names.get(r.get("owner_id"), "")}
            for r in sorted(rosters, key=lambda r: r["roster_id"])]


def league_players(rosters, matchups, transactions, picks):
    """The ids of every NFL player who appears in the season's league data."""
    ids = set()
    for r in rosters:
        ids.update(r.get("players") or [])
    for rows in matchups.values():
        for m in rows or []:
            ids.update(m.get("players") or [])
            ids.update(m.get("starters") or [])
    for txs in transactions.values():
        for t in txs or []:
            ids.update((t.get("adds") or {}).keys())
            ids.update((t.get("drops") or {}).keys())
    ids.update(p["player_id"] for p in picks or [] if p.get("player_id"))
    ids.discard("0")
    return ids


def reduce_players(dump, ids):
    """{player id: {name, pos, team}} for the given ids found in the dump."""
    out = {}
    for pid in sorted(ids):
        p = dump.get(pid)
        if not p:
            continue
        name = " ".join(x for x in (p.get("first_name"), p.get("last_name")) if x)
        out[pid] = {"name": name, "pos": p.get("position"), "team": p.get("team")}
    return out


def _same(path, obj):
    return path.exists() and json.loads(path.read_text(encoding="utf-8")) == obj


def _write(path, obj, written):
    """Write obj as compact JSON unless the file already holds it."""
    if _same(path, obj):
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    written.append(path)


def _write_weekly(folder, stem, week, obj, written):
    """A dated weekly file, written only when it differs from the latest one."""
    latest = sorted(folder.glob(f"{stem}-*.json"))
    if latest and json.loads(latest[-1].read_text(encoding="utf-8")) == obj:
        return
    _write(folder / f"{stem}-{week:02d}.json", obj, written)


def fetch(data, get=http_get, leagues=None):
    """Snapshot every season in leagues ({season: league id}) into
    data/sleeper/. Returns the paths written."""
    folder = Path(data) / "sleeper"
    leagues = LEAGUES if leagues is None else leagues
    state = get("/state/nfl")
    written, dump = [], None
    for season, lid in sorted(leagues.items()):
        def save(name, obj):
            _write(folder / f"{season}-{name}.json", redact(obj, f"{season}-{name}.json"), written)
            return obj

        league = save("league", get(f"/league/{lid}"))
        rosters = save("rosters", get(f"/league/{lid}/rosters"))
        matchups = {w: save(f"matchups-{w:02d}", get(f"/league/{lid}/matchups/{w}")) for w in WEEKS}
        transactions = {w: save(f"transactions-{w:02d}", get(f"/league/{lid}/transactions/{w}"))
                        for w in WEEKS}
        save("winners_bracket", get(f"/league/{lid}/winners_bracket"))
        save("losers_bracket", get(f"/league/{lid}/losers_bracket"))
        save("traded_picks", get(f"/league/{lid}/traded_picks"))
        drafts = save("drafts", get(f"/league/{lid}/drafts"))
        picks = []
        if drafts:
            picks = save("draft_picks", get(f"/draft/{drafts[0]['draft_id']}/picks"))
        if league.get("status") == "complete":
            continue
        week = int(state.get("week") or 0) if str(state.get("season")) == str(season) else 0
        _write_weekly(folder, f"{season}-team_names", week,
                      team_names(get(f"/league/{lid}/users"), rosters), written)
        if dump is None:
            dump = get("/players/nfl")
        _write_weekly(folder, f"{season}-players", week,
                      reduce_players(dump, league_players(rosters, matchups, transactions, picks)),
                      written)
    return written


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--data", default="data", type=Path)
    args = p.parse_args(argv)
    written = fetch(args.data)
    for path in written:
        print(f"wrote {path}")
    print(f"fetch_sleeper: {len(written)} file(s) changed")


if __name__ == "__main__":
    main()
