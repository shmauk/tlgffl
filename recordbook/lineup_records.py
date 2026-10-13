"""Sleeper-era records from lineups (#7, #32): best single NFL player score
for a franchise, and bench points in a game and in a season.

NFL players only exist from the Sleeper era (2025) on, so these records have no
era filter. A started NFL player's points are what he scored for the
franchise; the bench is every rostered player not started. A player's name
comes from the privacy-reduced players snapshots in data/sleeper/ (the latest
weekly snapshot first, then the league-wide dump); one missing from all of
them is left unknown, never guessed.
"""
import json
from collections import defaultdict

SCHEMA = """
-- Every started NFL player's score for a franchise in a game.
-- player_name and position are null where no players snapshot has him.
create table record_player_scores (
    season integer not null references seasons(year),
    week integer not null,
    franchise_id integer not null references franchises(id),
    game_id integer not null references games(id),
    nfl_player_id text not null,
    player_name text,
    position text,
    points real not null
);
-- A franchise's bench points in a game: its unstarted NFL players' points.
create table record_bench_games (
    season integer not null references seasons(year),
    week integer not null,
    franchise_id integer not null references franchises(id),
    game_id integer not null references games(id),
    points real not null
);
-- A franchise's bench points over a completed season's regular season, and
-- the games they come from.
create table record_bench_seasons (
    season integer not null references seasons(year),
    franchise_id integer not null references franchises(id),
    points real not null,
    games integer not null,
    primary key (season, franchise_id)
);
"""


def player_names(sleeper_dir):
    """{NFL player id: (name, position)} from the players snapshots, a
    weekly snapshot winning over the dump and a later week over an earlier."""
    names = {}
    files = [sleeper_dir / "players.json", *sorted(
        sleeper_dir.glob("*-players-*.json"), key=lambda f: (f.stem.split("-")[0], int(f.stem.rsplit("-", 1)[1])))]
    for f in files:
        if f.exists():
            for pid, p in json.loads(f.read_text(encoding="utf-8")).items():
                names[pid] = (p.get("name") or None, p.get("pos") or None)
    return names


def _game_ids(games):
    """{(season, week, franchise): (game id, phase)}, ids being 1-based positions."""
    return {(g.season, g.week, f): (i, g.phase) for i, g in enumerate(games, start=1) for f in (g.home, g.away)}


def player_score_rows(lineups, games, names):
    ids = _game_ids(games)
    rows = []
    for season, week, fid, _slot, _i, starter, pid, points in lineups:
        if starter and pid is not None and points is not None and (season, week, fid) in ids:
            name, pos = names.get(pid, (None, None))
            rows.append((season, week, fid, ids[(season, week, fid)][0], pid, name, pos, points))
    return rows


def bench_game_rows(lineups, games):
    ids = _game_ids(games)
    bench = defaultdict(float)
    for season, week, fid, _slot, _i, starter, _pid, points in lineups:
        key = (season, week, fid)
        if key in ids:
            bench[key] += 0.0 if starter or points is None else points
    return [(s, w, f, ids[(s, w, f)][0], round(p, 2)) for (s, w, f), p in sorted(bench.items())]


def bench_season_rows(bench_games, games, completed):
    phases = {i: g.phase for i, g in enumerate(games, start=1)}
    acc = defaultdict(lambda: [0.0, 0])
    for season, _week, fid, gid, points in bench_games:
        if season in completed and phases[gid] == "regular":
            acc[(season, fid)][0] += points
            acc[(season, fid)][1] += 1
    return [(s, f, round(p, 2), n) for (s, f), (p, n) in sorted(acc.items())]
