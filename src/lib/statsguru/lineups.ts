// Statsguru's lineup-based queries (#29): the franchise subject's by-position
// view and the NFL-player subject. Lineups only exist from 2025 (the Sleeper
// era, ¶), and only for weeks a franchise played a game, so every figure here
// adds up those weeks' NFL player points and nothing else.
import type { Db, Named } from './engine';
import type { Phase, Query, Result } from './query';

export interface NflPlayer {
  id: string;
  /** Null when no Sleeper snapshot knows the NFL player. */
  name: string | null;
  /** Sleeper's position for them (current-state only); null when unknown. */
  position: string | null;
}

/** One franchise at one position (or lineup slot). */
export interface PositionRow {
  kind: 'position';
  franchise: Named;
  /** The NFL player position or lineup slot; null for NFL players of unknown position. */
  pos: string | null;
  /** Games the franchise played in the query. */
  gp: number;
  st: number;
  spts: number;
  ppg: number | null;
  avg: number | null;
  /** Of the franchise's starter points, as a fraction. */
  share: number | null;
  /** Against every franchise at the position, by points per game (ties share a rank). */
  rank: number;
  /** Null for a slot no bench NFL player can fill (FLEX). */
  bpts: number | null;
  best: number | null;
}

/** One NFL player, alone or by franchise or season. */
export interface PlayerRow {
  kind: 'player';
  player: NflPlayer;
  franchise: Named | null;
  season: number | null;
  ro: number;
  st: number;
  spts: number;
  avg: number | null;
  bpts: number;
  best: number | null;
  nfr: number;
}

/** One NFL player in one franchise's lineup in one week. */
export interface PerformanceRow {
  kind: 'performance';
  season: number;
  week: number;
  phase: Phase;
  player: NflPlayer;
  franchise: Named;
  opponent: Named;
  slot: string;
  starter: boolean;
  points: number | null;
}

interface Entry {
  season: number;
  week: number;
  phase: Phase;
  f: number;
  o: number;
  result: Result;
  slot: string | null;
  starter: boolean;
  player: NflPlayer | null;
  points: number | null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Every lineup entry, with its game's phase, opponent and result. */
function entries(db: Db): Entry[] {
  return db
    .all(
      `select l.season, l.week, l.franchise_id as f, l.slot, l.starter, l.nfl_player_id as pid, l.points,
              p.name, p.position, g.phase, g.bracket, g.winner_franchise_id as win,
              case when g.home_franchise_id = l.franchise_id then g.away_franchise_id else g.home_franchise_id end as o
       from lineups l
       join games g on g.season = l.season and g.week = l.week and g.status = 'final'
                   and l.franchise_id in (g.home_franchise_id, g.away_franchise_id)
       left join nfl_players p on p.id = l.nfl_player_id
       order by l.season, l.week, l.franchise_id, l.starter desc, l.slot_index, l.nfl_player_id`,
    )
    .map((r) => ({
      season: r.season,
      week: r.week,
      phase: r.phase === 'regular' ? 'R' : r.bracket === 'playoffs' ? 'P' : 'C',
      f: r.f,
      o: r.o,
      result: r.win == null ? 'T' : r.win === r.f ? 'W' : 'L',
      slot: r.slot,
      starter: !!r.starter,
      player: r.pid == null ? null : { id: r.pid, name: r.name ?? null, position: r.position ?? null },
      points: r.points,
    }));
}

export interface Scope {
  seasons: Set<number>;
  named: (id: number) => Named;
  isActive: (id: number) => boolean;
}

function inScope(q: Query, scope: Scope, e: Entry) {
  return (
    scope.seasons.has(e.season) &&
    q.phases.includes(e.phase) &&
    (!q.weeks || (e.week >= q.weeks[0] && e.week <= q.weeks[1])) &&
    (!q.opponents.length || q.opponents.includes(e.o))
  );
}

/** The by-position view: each franchise's starter points per position or lineup slot. */
export function positionRows(db: Db, q: Query, scope: Scope): PositionRow[] {
  const rows = entries(db).filter(
    (e) => inScope(q, scope, e) && (!q.active || scope.isActive(e.f)) && (!q.result || e.result === q.result),
  );
  const games = new Map<number, Set<string>>();
  const total = new Map<number, number>();
  const acc = new Map<string, { f: number; pos: string | null; st: number; spts: number; bpts: number | null; best: number | null }>();
  const at = (f: number, pos: string | null) => {
    const k = `${f}|${pos}`;
    if (!acc.has(k)) acc.set(k, { f, pos, st: 0, spts: 0, bpts: pos === 'FLEX' ? null : 0, best: null });
    return acc.get(k)!;
  };
  for (const e of rows) {
    (games.get(e.f) ?? games.set(e.f, new Set()).get(e.f)!).add(`${e.season}|${e.week}`);
    // An empty starting slot has no NFL player: no start, no points.
    if (!e.player) continue;
    const pts = e.points ?? 0;
    if (e.starter) {
      const a = at(e.f, q.grouping === 'slot' ? e.slot : e.player.position);
      a.st++;
      a.spts += pts;
      if (e.points != null) a.best = Math.max(a.best ?? -Infinity, e.points);
      total.set(e.f, (total.get(e.f) ?? 0) + pts);
    } else {
      // A benched NFL player counts at their position, under either grouping.
      const a = at(e.f, e.player.position);
      a.bpts = (a.bpts ?? 0) + pts;
    }
  }
  const out: PositionRow[] = [...acc.values()].map((a) => {
    const gp = games.get(a.f)!.size;
    const t = total.get(a.f) ?? 0;
    return {
      kind: 'position',
      franchise: scope.named(a.f),
      pos: a.pos,
      gp,
      st: a.st,
      spts: round2(a.spts),
      ppg: gp ? round2(a.spts / gp) : null,
      avg: a.st ? round2(a.spts / a.st) : null,
      share: t ? a.spts / t : null,
      rank: 0,
      bpts: a.bpts == null ? null : round2(a.bpts),
      best: a.best,
    };
  });
  const ppg = (r: PositionRow) => (r.gp ? r.spts / r.gp : 0);
  for (const r of out) r.rank = 1 + out.filter((o) => o.pos === r.pos && ppg(o) > ppg(r)).length;
  return out.filter((r) => (!q.franchises.length || q.franchises.includes(r.franchise.id)) && r.gp >= q.minGames);
}

/** The NFL-player subject: totals per NFL player, by franchise or season, or the performance log. */
export function playerRows(db: Db, q: Query, scope: Scope): (PlayerRow | PerformanceRow)[] {
  const rows = entries(db).filter(
    (e): e is Entry & { player: NflPlayer } =>
      !!e.player &&
      inScope(q, scope, e) &&
      (!q.players.length || q.players.includes(e.player.id)) &&
      (!q.positions.length || q.positions.includes(e.player.position ?? '')) &&
      (!q.franchises.length || q.franchises.includes(e.f)) &&
      (!q.lineup || (q.lineup === 'start') === e.starter),
  );
  const rostered = new Map<string, number>();
  for (const e of rows) rostered.set(e.player.id, (rostered.get(e.player.id) ?? 0) + 1);
  if (q.view === 'log')
    return rows
      .filter((e) => rostered.get(e.player.id)! >= q.minGames)
      .map((e) => ({
        kind: 'performance',
        season: e.season,
        week: e.week,
        phase: e.phase,
        player: e.player,
        franchise: scope.named(e.f),
        opponent: scope.named(e.o),
        slot: e.slot ?? 'BN',
        starter: e.starter,
        points: e.points,
      }));
  const key = (e: Entry & { player: NflPlayer }) =>
    q.view === 'fr' ? `${e.player.id}|${e.f}` : q.view === 'season' ? `${e.player.id}|${e.season}` : e.player.id;
  const acc = new Map<string, PlayerRow & { franchises: Set<number> }>();
  for (const e of rows) {
    const k = key(e);
    if (!acc.has(k))
      acc.set(k, {
        kind: 'player',
        player: e.player,
        franchise: q.view === 'fr' ? scope.named(e.f) : null,
        season: q.view === 'season' ? e.season : null,
        ro: 0, st: 0, spts: 0, avg: null, bpts: 0, best: null, nfr: 0,
        franchises: new Set(),
      });
    const a = acc.get(k)!;
    a.ro++;
    a.franchises.add(e.f);
    if (e.starter) {
      a.st++;
      a.spts += e.points ?? 0;
    } else a.bpts += e.points ?? 0;
    if (e.points != null) a.best = Math.max(a.best ?? -Infinity, e.points);
  }
  return [...acc.values()]
    .filter((a) => a.ro >= q.minGames)
    .map(({ franchises, ...a }) => ({
      ...a,
      spts: round2(a.spts),
      bpts: round2(a.bpts),
      avg: a.st ? round2(a.spts / a.st) : null,
      nfr: franchises.size,
    }));
}
