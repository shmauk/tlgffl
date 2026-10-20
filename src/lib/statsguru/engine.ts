// Statsguru's query engine. It runs in the browser over sql.js and in tests
// over node:sqlite, against the same database the static pages are built from,
// so a query's figures and the pages' can't disagree (ADR 0002). It only adds
// up what the database holds (ADR 0004): games, and for weeks whose games don't
// survive, NFL.com's reported season line less the games that do (ADR 0001).
// Nothing is estimated: games a filter can't check are left out and counted.
import { playerRows, positionRows, type PerformanceRow, type PlayerRow, type PositionRow } from './lineups';
import { groupRank, pickRows, type PickGroupRow, type PickPlayerRow, type PickRow } from './picks';
import { positionRank, searchedSeasons, sortOf, viewOf, type Phase, type Query, type Result, type SeasonScope } from './query';
import type { Db } from '../database';

export type { NflPlayer, PerformanceRow, PlayerRow, PositionRow } from './lineups';
export type { PickGroupRow, PickPlayerRow, PickRow } from './picks';

export interface Named {
  id: number;
  name: string;
}

/** One line of an aggregate view: a franchise, alone or by season, opponent or phase. */
export interface GroupRow {
  kind: 'group';
  franchise: Named;
  season: number | null;
  /** Null in the opponent view for reported games, whose opponents aren't known. */
  opponent: Named | null;
  phase: Phase | null;
  gp: number;
  w: number;
  l: number;
  t: number;
  pct: number | null;
  pf: number | null;
  pa: number | null;
  apf: number | null;
  apa: number | null;
  hi: number | null;
  lo: number | null;
  /** † Includes NFL.com's reported totals for weeks with no game scores. */
  reported: boolean;
  /** ‡ Games whose result is known but whose score is lost. */
  lostScores: number;
  /** * High and low come only from the games with a score. */
  partialHighs: boolean;
  /** § Games left out because the week, opponent or result filter can't check them. */
  unchecked: number;
}

/** One game, from one franchise's side. */
export interface GameRow {
  kind: 'game';
  season: number;
  week: number;
  phase: Phase;
  franchise: Named;
  opponent: Named;
  /** Null when the score is lost (‡). */
  pf: number | null;
  pa: number | null;
  result: Result;
  margin: number | null;
}

/** A franchise's games in a season that have no detail: reported (†) or left out (§). */
export interface GapRow {
  kind: 'reported' | 'unchecked';
  season: number;
  weeks: number[];
  phase: 'R';
  franchise: Named;
  gp: number;
  /** Reported figures; null for games left out. */
  w: number | null;
  l: number | null;
  t: number | null;
  pf: number | null;
  pa: number | null;
}

export type Row = GroupRow | GameRow | GapRow | PositionRow | PlayerRow | PerformanceRow | PickRow | PickGroupRow | PickPlayerRow;

/** Query-level remarks, not tied to any row. */
export type QueryNote =
  /** Seasons whose Shit Bowl and Mediocre Bowl games were never recorded. */
  | { kind: 'unrecorded'; seasons: number[] }
  /** The Shit Bowl and the Mediocre Bowl are counted together. */
  | { kind: 'mixed' }
  /** ¶ Lineups and NFL players only exist from the Sleeper era. */
  | { kind: 'lineups' }
  /** The query's seasons all come before lineups do: there is nothing to show. */
  | { kind: 'beforeLineups'; firstSeason: number | null }
  /** Draft picks are only known from this season (null: no draft yet). */
  | { kind: 'drafts'; firstSeason: number | null }
  /** The query's seasons all come before the first draft: there is nothing to show. */
  | { kind: 'beforeDrafts'; firstSeason: number | null }
  /** Seasons in the query whose keepers aren't recorded: their keepers count as drafted. */
  | { kind: 'keepersUnrecorded'; seasons: number[] };

export interface QueryResult {
  rows: Row[];
  notes: QueryNote[];
}

interface Unit {
  season: number;
  week: number;
  phase: Phase;
  f: number;
  o: number;
  pf: number | null;
  pa: number | null;
  result: Result;
}

interface Remainder {
  season: number;
  f: number;
  weeks: number[];
  gp: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const PHASE_OF = (phase: string, bracket: string | null): Phase =>
  phase === 'regular' ? 'R' : bracket === 'playoffs' ? 'P' : 'C';

function units(db: Db): Unit[] {
  const sides = (f: string, o: string) => `
    select season, week, phase, bracket, ${f}_franchise_id as f, ${o}_franchise_id as o,
           ${f}_points as pf, ${o}_points as pa, winner_franchise_id as win
    from games where status = 'final'`;
  return db.all(`${sides('home', 'away')} union all ${sides('away', 'home')}`).map((r) => ({
    season: r.season,
    week: r.week,
    phase: PHASE_OF(r.phase, r.bracket),
    f: r.f,
    o: r.o,
    pf: r.pf,
    pa: r.pa,
    result: r.win == null ? 'T' : r.win === r.f ? 'W' : 'L',
  }));
}

/** Each reported season line less the games that survive: the weeks with no detail. */
function remainders(db: Db, games: Unit[]): Remainder[] {
  const gapWeeks = new Map<number, number[]>();
  for (const r of db.all(`select season, week from coverage where phase = 'regular' and not complete order by week`))
    gapWeeks.set(r.season, [...(gapWeeks.get(r.season) ?? []), r.week]);
  const lines = db.all(
    `select franchise_id as f, season, wins as w, losses as l, ties as t, points_for as pf, points_against as pa
     from season_lines where source = 'reported'`,
  );
  return lines.flatMap((line) => {
    const played = games.filter((g) => g.phase === 'R' && g.season === line.season && g.f === line.f);
    const weeks = (gapWeeks.get(line.season) ?? []).filter((w) => !played.some((g) => g.week === w));
    const count = (res: Result) => played.filter((g) => g.result === res).length;
    const sum = (k: 'pf' | 'pa') => played.reduce((s, g) => s + (g[k] ?? 0), 0);
    const rem = {
      season: line.season,
      f: line.f,
      weeks,
      w: line.w - count('W'),
      l: line.l - count('L'),
      t: line.t - count('T'),
      pf: line.pf - sum('pf'),
      pa: line.pa - sum('pa'),
    };
    const gp = rem.w + rem.l + rem.t;
    return gp > 0 ? [{ ...rem, gp }] : [];
  });
}

export function runQuery(db: Db, q: Query): QueryResult {
  const franchises = new Map<number, Named & { active: boolean }>(
    db.all('select id, name, active from franchises').map((r) => [r.id, { id: r.id, name: r.name, active: !!r.active }]),
  );
  const named = (id: number): Named => ({ id, name: franchises.get(id)!.name });
  const seasons = new Set(
    searchedSeasons(q, db.all('select year, era, team_count as size from seasons') as SeasonScope[]),
  );
  const inWeeks = (w: number) => !q.weeks || (w >= q.weeks[0] && w <= q.weeks[1]);
  const okFranchise = (f: number) =>
    (!q.franchises.length || q.franchises.includes(f)) && (!q.active || franchises.get(f)!.active);
  const phases = new Set(q.phases);

  if (q.subject === 'pick') {
    const drafted = db.all('select distinct season, kept is null as unrecorded from draft_picks order by season');
    const first = drafted[0]?.season ?? null;
    const notes: QueryNote[] = [{ kind: 'drafts', firstSeason: first }];
    if ([...seasons].every((y) => first == null || y < first)) return { rows: [], notes: [{ kind: 'beforeDrafts', firstSeason: first }] };
    if (!drafted.some((d) => seasons.has(d.season))) return { rows: [], notes };
    const unrecorded = [...new Set(drafted.filter((d) => d.unrecorded && seasons.has(d.season)).map((d) => d.season as number))];
    if (unrecorded.length) notes.push({ kind: 'keepersUnrecorded', seasons: unrecorded });
    return { rows: sortRows(pickRows(db, { ...q, view: viewOf(q) }, seasons, named), q), notes };
  }

  if (q.subject === 'player' || q.view === 'pos') {
    const sleeper = db.all(`select year from seasons where era = 'sleeper' order by year`).map((r) => r.year as number);
    if (!sleeper.some((y) => seasons.has(y)))
      return { rows: [], notes: [{ kind: 'beforeLineups', firstSeason: sleeper[0] ?? null }] };
    const scope = { seasons, named, isActive: (f: number) => franchises.get(f)!.active };
    const rows = q.subject === 'player' ? playerRows(db, q, scope) : positionRows(db, q, scope);
    return { rows: sortRows(rows, q), notes: [{ kind: 'lineups' }] };
  }

  const all = units(db);
  const games = all.filter(
    (g) =>
      seasons.has(g.season) &&
      phases.has(g.phase) &&
      inWeeks(g.week) &&
      okFranchise(g.f) &&
      (!q.opponents.length || q.opponents.includes(g.o)) &&
      (!q.result || g.result === q.result),
  );
  const reported: Remainder[] = [];
  const unchecked: Remainder[] = [];
  if (phases.has('R'))
    for (const rem of remainders(db, all)) {
      if (!seasons.has(rem.season) || !okFranchise(rem.f)) continue;
      const weeks = rem.weeks.filter(inWeeks);
      if (!weeks.length) continue;
      const whole = weeks.length === rem.weeks.length && !q.opponents.length && !q.result;
      if (whole) reported.push(rem);
      else unchecked.push({ ...rem, weeks, gp: weeks.length });
    }

  let rows: Row[];
  if (q.view === 'games') {
    const gameRows: Row[] = games.map((g) => ({
      kind: 'game',
      season: g.season,
      week: g.week,
      phase: g.phase,
      franchise: named(g.f),
      opponent: named(g.o),
      pf: g.pf,
      pa: g.pa,
      result: g.result,
      margin: g.pf == null || g.pa == null ? null : round2(g.pf - g.pa),
    }));
    const gap = (kind: GapRow['kind'], r: Remainder): GapRow => ({
      kind,
      season: r.season,
      weeks: r.weeks,
      phase: 'R',
      franchise: named(r.f),
      gp: r.gp,
      ...(kind === 'reported'
        ? { w: r.w, l: r.l, t: r.t, pf: round2(r.pf), pa: round2(r.pa) }
        : { w: null, l: null, t: null, pf: null, pa: null }),
    });
    rows = [...gameRows, ...reported.map((r) => gap('reported', r)), ...unchecked.map((r) => gap('unchecked', r))];
    if (q.minGames > 0) {
      const gp = new Map<number, number>();
      for (const r of rows) {
        const n = r.kind === 'game' ? 1 : r.kind === 'reported' ? r.gp : 0;
        gp.set(r.franchise.id, (gp.get(r.franchise.id) ?? 0) + n);
      }
      rows = rows.filter((r) => (gp.get(r.franchise.id) ?? 0) >= q.minGames);
    }
  } else {
    rows = aggregate(q, games, reported, unchecked, named).filter((r) => r.gp >= q.minGames);
  }
  return { rows: sortRows(rows, q), notes: notes(db, q, seasons) };
}

function aggregate(
  q: Query,
  games: Unit[],
  reported: Remainder[],
  unchecked: Remainder[],
  named: (id: number) => Named,
): GroupRow[] {
  const key = (f: number, season: number, o: number | null, phase: Phase) =>
    ({ totals: `${f}`, season: `${f}|${season}`, opp: `${f}|${o}`, phase: `${f}|${phase}`, games: '' })[q.view];
  const acc = new Map<string, GroupRow & { scored: number; reportedGames: number; sumPf: number; sumPa: number }>();
  const group = (f: number, season: number, o: number | null, phase: Phase) => {
    const k = key(f, season, o, phase);
    let g = acc.get(k);
    if (!g) {
      g = {
        kind: 'group',
        franchise: named(f),
        season: q.view === 'season' ? season : null,
        opponent: q.view === 'opp' && o != null ? named(o) : null,
        phase: q.view === 'phase' ? phase : null,
        gp: 0, w: 0, l: 0, t: 0, pct: null, pf: null, pa: null, apf: null, apa: null, hi: null, lo: null,
        reported: false, lostScores: 0, partialHighs: false, unchecked: 0,
        scored: 0, reportedGames: 0, sumPf: 0, sumPa: 0,
      };
      acc.set(k, g);
    }
    return g;
  };
  const tally = (g: GroupRow, res: Result, n = 1) => {
    g.gp += n;
    if (res === 'W') g.w += n;
    else if (res === 'L') g.l += n;
    else g.t += n;
  };
  for (const u of games) {
    const g = group(u.f, u.season, u.o, u.phase);
    tally(g, u.result);
    if (u.pf == null || u.pa == null) {
      g.lostScores++;
      continue;
    }
    g.scored++;
    g.sumPf += u.pf;
    g.sumPa += u.pa;
    g.hi = Math.max(g.hi ?? -Infinity, u.pf);
    g.lo = Math.min(g.lo ?? Infinity, u.pf);
  }
  for (const r of reported) {
    const g = group(r.f, r.season, null, 'R');
    tally(g, 'W', r.w);
    tally(g, 'L', r.l);
    tally(g, 'T', r.t);
    g.reported = true;
    g.reportedGames += r.gp;
    g.sumPf += r.pf;
    g.sumPa += r.pa;
  }
  for (const r of unchecked) group(r.f, r.season, null, 'R').unchecked += r.gp;
  return [...acc.values()].map(({ scored, reportedGames, sumPf, sumPa, ...g }) => {
    const n = scored + reportedGames;
    return {
      ...g,
      pct: g.gp ? (g.w + g.t / 2) / g.gp : null,
      pf: n ? round2(sumPf) : null,
      pa: n ? round2(sumPa) : null,
      apf: n ? round2(sumPf / n) : null,
      apa: n ? round2(sumPa / n) : null,
      partialHighs: g.hi != null && (g.reported || g.lostScores > 0),
    };
  });
}

/** A row's value for a column, for sorting. */
function value(r: Row, key: string): number | string | null {
  const name = (n: Named | null) => n?.name.toLowerCase() ?? null;
  switch (key) {
    case 'f': return 'franchise' in r ? name(r.franchise) : null;
    case 'o': return 'opponent' in r ? name(r.opponent) : null;
    case 's': return 'season' in r ? r.season : null;
    case 'pk': return r.kind === 'pick' ? r.pick : null;
    case 'rd': return r.kind === 'pick' ? r.round : r.kind === 'pickGroup' ? (r.group as number) : null;
    case 'sf': return r.kind === 'pick' ? name(r.slotFranchise) : null;
    case 'kd': return r.kind === 'pick' ? (r.kept == null ? null : r.kept ? 1 : 0) : null;
    case 'val': return 'value' in r ? r.value : null;
    case 'top': return r.kind === 'pickGroup' ? r.top : r.kind === 'pickPlayer' ? r.top.season * 1000 + r.top.pick : null;
    case 'frs': return r.kind === 'pickPlayer' ? r.franchises.length : null;
    case 'wk': return 'week' in r ? r.week : 'weeks' in r ? r.weeks[0] : null;
    case 'ph': return 'phase' in r ? 'R P C'.indexOf(r.phase ?? '') : null;
    case 'pl': return 'player' in r ? (r.player.name ?? r.player.id).toLowerCase() : null;
    case 'pos':
      if (r.kind === 'pickGroup') return groupRank(r);
      return r.kind === 'position' ? positionRank(r.pos) : 'player' in r ? positionRank(r.player.position) : null;
    case 'slot': return r.kind === 'performance' ? positionRank(r.slot === 'BN' ? '~BN' : r.slot) : null;
    case 'res': return r.kind === 'game' ? r.result : null;
    case 'mar': return r.kind === 'game' ? r.margin : null;
    // A gap row's points are several weeks' totals, not one game's score.
    case 'pf':
    case 'pa': return r.kind === 'reported' || r.kind === 'unchecked' ? null : r[key];
    default: return (r as any)[key] ?? null;
  }
}

function sortRows(rows: Row[], q: Query): Row[] {
  const { key, dir } = sortOf(q);
  const sign = dir === 'asc' ? 1 : -1;
  const tiebreak = ['s', 'pk', 'wk', 'f', 'pos', 'rd', 'pl', 'o', 'ph'];
  const cmp = (a: Row, b: Row, k: string, s: number) => {
    const x = value(a, k), y = value(b, k);
    if (x === y) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return s * (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number));
  };
  return rows.sort((a, b) => cmp(a, b, key, sign) || tiebreak.reduce((c, k) => c || cmp(a, b, k, 1), 0));
}

function notes(db: Db, q: Query, seasons: Set<number>): QueryNote[] {
  if (!q.phases.includes('C')) return [];
  const unrecorded = db
    .all(
      `select distinct b.season from season_brackets b
       where b.bracket in ('shit_bowl', 'mediocre_bowl')
         and not exists (select 1 from games g where g.season = b.season and g.bracket = b.bracket)
         -- a season whose Playoffs have been played
         and exists (select 1 from games g where g.season = b.season and g.bracket = 'playoffs')
       order by b.season`,
    )
    .map((r) => r.season as number)
    .filter((y) => seasons.has(y));
  return [...(unrecorded.length ? [{ kind: 'unrecorded' as const, seasons: unrecorded }] : []), { kind: 'mixed' }];
}
