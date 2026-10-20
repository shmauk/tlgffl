// The Statsguru engine against the build's own database (run the Python build
// first), so its figures can be checked against what the static pages show.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { runQuery, type GroupRow, type PerformanceRow, type PickGroupRow, type PickPlayerRow, type PickRow, type PlayerRow, type PositionRow } from './engine';
import { open } from '../database';
import { sqlJsDb } from './sqljs';
import { DEFAULT_QUERY, type Query } from './query';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db = open();
const run = (patch: Partial<Query>) => runQuery(db, { ...DEFAULT_QUERY, ...patch });
const groups = (patch: Partial<Query>) => run(patch).rows as GroupRow[];

const SERPION = 8;

describe('figures match the season lines the pages show', () => {
  test('season by season, every franchise, regular season', () => {
    const lines = sqlite
      .prepare('select franchise_id, season, source, wins, losses, ties, points_for, points_against from season_lines')
      .all() as any[];
    const rows = groups({ view: 'season' });
    expect(rows).toHaveLength(lines.length);
    for (const l of lines) {
      const r = rows.find((r) => r.franchise.id === l.franchise_id && r.season === l.season)!;
      expect([r.w, r.l, r.t, r.pf, r.pa], `${l.franchise_id} ${l.season}`).toEqual([
        l.wins, l.losses, l.ties, l.points_for, l.points_against,
      ]);
      expect(r.gp).toBe(l.wins + l.losses + l.ties);
      expect(r.reported, `${l.franchise_id} ${l.season}`).toBe(l.source === 'reported');
    }
  });
});

describe('a season with no game scores after week 9 (SERPION, 2022)', () => {
  const only = (patch: Partial<Query>) => groups({ franchises: [SERPION], seasons: [2022], ...patch });

  test('weeks 1–9 come from the games alone', () => {
    const [r] = only({ weeks: [1, 9] });
    expect([r.gp, r.w, r.l, r.t]).toEqual([9, 7, 2, 0]);
    expect(r.reported).toBe(false);
    expect(r.unchecked).toBe(0);
    expect(r.hi).toBe(138.02);
    expect(r.lo).toBe(65.84);
  });

  test("the whole regular season takes NFL.com's reported totals for weeks 10–14", () => {
    const [r] = only({});
    expect([r.gp, r.w, r.l, r.t, r.pf, r.pa]).toEqual([14, 12, 2, 0, 1464.98, 1258.82]);
    expect(r.reported).toBe(true);
    expect(r.partialHighs).toBe(true);
  });

  test("a week span cutting through weeks 10–14 leaves those games out, and says so", () => {
    const [r] = only({ weeks: [1, 12] });
    expect([r.gp, r.w, r.l]).toEqual([9, 7, 2]);
    expect(r.reported).toBe(false);
    expect(r.unchecked).toBe(3);
  });
});

describe('filters a reported season can’t answer leave its games out (§)', () => {
  test('a result filter counts only the games with a score', () => {
    const [r] = groups({ franchises: [SERPION], seasons: [2022], result: 'W' });
    expect([r.gp, r.w, r.l, r.reported, r.unchecked]).toEqual([7, 7, 0, false, 5]);
  });

  test('an opposition filter does too', () => {
    const [r] = groups({ franchises: [SERPION], seasons: [2022], opponents: [17] });
    expect([r.gp, r.w, r.l, r.unchecked]).toEqual([1, 1, 0, 5]);
  });

  test('a season with no game scores at all is reported whole, or left out whole', () => {
    expect(groups({ franchises: [SERPION], seasons: [2023] }).map((r) => [r.w, r.l, r.reported])).toEqual([[8, 6, true]]);
    const [r] = groups({ franchises: [SERPION], seasons: [2023], weeks: [1, 7] });
    expect([r.gp, r.pf, r.hi, r.unchecked]).toEqual([0, null, null, 7]);
  });
});

describe('views', () => {
  test('totals per franchise add up its season lines', () => {
    const lines = sqlite
      .prepare('select sum(wins) as w, sum(losses) as l, sum(points_for) as pf from season_lines where franchise_id = ?')
      .get(SERPION) as any;
    const [r] = groups({ franchises: [SERPION] });
    expect([r.w, r.l, r.pf]).toEqual([lines.w, lines.l, Math.round(lines.pf * 100) / 100]);
    expect(r.reported).toBe(true);
  });

  test('by opponent: reported games get a row of their own, their opponents not known', () => {
    const rows = groups({ franchises: [SERPION], seasons: [2022], view: 'opp' });
    const unknown = rows.filter((r) => r.opponent === null);
    expect(unknown.map((r) => [r.gp, r.w, r.l, r.reported])).toEqual([[5, 5, 0, true]]);
    expect(rows.reduce((n, r) => n + r.w, 0)).toBe(12);
    expect(rows.find((r) => r.opponent?.id === 7)).toMatchObject({ w: 0, l: 1, pf: 108.8, pa: 110.68 });
  });

  test('by phase: the Playoffs count wins whose scores are lost (‡), with no points', () => {
    const rows = groups({ franchises: [SERPION], seasons: [2022], phases: ['R', 'P'], view: 'phase' });
    expect(rows.map((r) => r.phase)).toEqual(['R', 'P']);
    expect(rows[1]).toMatchObject({ gp: 2, w: 2, l: 0, pf: null, hi: null, lostScores: 2, partialHighs: false });
  });

  test('a game log lists the games and one line for the reported weeks', () => {
    const rows = run({ franchises: [SERPION], seasons: [2022], view: 'games' }).rows;
    expect(rows.filter((r) => r.kind === 'game')).toHaveLength(9);
    expect(rows.at(-1)).toMatchObject({ kind: 'reported', weeks: [10, 11, 12, 13, 14], gp: 5, w: 5, l: 0 });
    expect(rows[7]).toMatchObject({ kind: 'game', week: 8, opponent: { id: 7 }, result: 'L', margin: -1.88 });
  });

  test('a game log under a result filter lists the games it leaves out (§)', () => {
    const rows = run({ franchises: [SERPION], seasons: [2022], view: 'games', result: 'L' }).rows;
    expect(rows.map((r) => r.kind)).toEqual(['game', 'game', 'unchecked']);
  });
});

describe('era and League size', () => {
  const seasonsOf = (patch: Partial<Query>) => [...new Set(groups({ view: 'season', ...patch }).map((r) => r.season))];

  test('16 teams over 2010–2018 searches 2015–2018', () => {
    expect(seasonsOf({ size: 16, seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018] })).toEqual([2015, 2016, 2017, 2018]);
    expect(seasonsOf({ size: 12 })).toEqual([2013, 2014]);
    expect(seasonsOf({ era: 'nfl.com', size: 10 })).toEqual([2012]);
  });

  test('a combination with no seasons returns no results', () => {
    expect(run({ era: 'sleeper', size: 10 }).rows).toEqual([]);
    expect(run({ size: 16, seasons: [2012, 2013], view: 'games' }).rows).toEqual([]);
  });
});

describe('who is counted', () => {
  test('active franchises only', () => {
    const ids = groups({ active: true }).map((r) => r.franchise.id);
    expect(ids).not.toContain(5);
    expect(ids).toContain(SERPION);
  });

  test('a minimum of games played', () => {
    expect(groups({ seasons: [2012], minGames: 1 })).toHaveLength(10);
    expect(groups({ minGames: 30 }).map((r) => r.franchise.id)).not.toContain(5);
  });

  test("sorting a game log by score puts the weeks with no scores last: they aren't one game", () => {
    for (const key of ['pf', 'pa', 'mar'])
      for (const dir of ['asc', 'desc'] as const) {
        const rows = run({ franchises: [SERPION], seasons: [2022], view: 'games', sort: { key, dir } }).rows;
        expect(rows.at(-1)!.kind, `${key} ${dir}`).toBe('reported');
        expect(rows.slice(0, -1).every((r) => r.kind === 'game'), `${key} ${dir}`).toBe(true);
      }
  });

  test('rows sort on any column, either way', () => {
    const pf = (dir: 'asc' | 'desc') => groups({ seasons: [2015], sort: { key: 'pf', dir } }).map((r) => r.pf!);
    expect(pf('desc')).toEqual([...pf('desc')].sort((a, b) => b - a));
    expect(pf('asc')).toEqual([...pf('desc')].reverse());
    const names = groups({ sort: { key: 'f', dir: 'asc' } }).map((r) => r.franchise.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });
});

describe('in the browser', () => {
  test('sql.js over the same file gives the same results', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const bytes = readFileSync(process.env.TLGFFL_DB ?? 'build/league.sqlite');
    const browserDb = sqlJsDb(new SQL.Database(bytes));
    for (const patch of [
      { view: 'season' },
      { view: 'games', franchises: [SERPION], seasons: [2022], phases: ['R', 'P'] },
      { view: 'opp', result: 'T' },
      { view: 'pos', grouping: 'slot' },
      { subject: 'player', view: 'fr', lineup: 'bench' },
    ] as Partial<Query>[]) {
      const query = { ...DEFAULT_QUERY, ...patch };
      expect(runQuery(browserDb, query)).toEqual(runQuery(db, query));
    }
  });
});

describe('query-level notes', () => {
  test('none without the Shit Bowl and Mediocre Bowl', () => {
    expect(run({}).notes).toEqual([]);
  });

  test('they say which seasons have no Shit Bowl or Mediocre Bowl games, and that the two are counted together', () => {
    const { notes } = run({ phases: ['C'], seasons: [2021, 2022] });
    expect(notes).toEqual([{ kind: 'unrecorded', seasons: [2021, 2022] }, { kind: 'mixed' }]);
  });
});

// Figures below were worked out by hand from 2025's lineups, outside the engine.
const ALLEN = '4984';
const HUNTER = '12530'; // Sleeper lists him as DB, the WR/DB two-way player.
const ALIGATORS = 6;

describe('the by-position view (2025 on)', () => {
  const positions = (patch: Partial<Query>) => run({ view: 'pos', seasons: [2025], ...patch }).rows as PositionRow[];
  const at = (rows: PositionRow[], pos: string | null) => rows.find((r) => r.pos === pos)!;

  test("a franchise's starter points by NFL player position, FLEX folded in", () => {
    const rows = positions({ franchises: [SERPION] });
    expect(rows.map((r) => r.pos)).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
    expect(at(rows, 'QB')).toMatchObject({
      franchise: { id: SERPION }, gp: 14, st: 14, spts: 231.36, ppg: 16.53, avg: 16.53, rank: 13, bpts: 0, best: 29.36,
    });
    expect(at(rows, 'QB').share).toBeCloseTo(231.36 / 1260.46, 6);
    // Two WR slots over 14 games make 28 starts; the rest are FLEX starts.
    expect(at(rows, 'WR')).toMatchObject({ st: 41, spts: 421, bpts: 40.2, best: 19.7 });
    expect(at(rows, 'TE')).toMatchObject({ st: 15, spts: 111.5 });
    expect(rows.reduce((s, r) => s + r.share!, 0)).toBeCloseTo(1, 9);
  });

  test('by lineup slot, FLEX gets its own row and has no bench', () => {
    const rows = positions({ franchises: [SERPION], grouping: 'slot' });
    expect(rows.map((r) => r.pos)).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']);
    expect(at(rows, 'FLEX')).toMatchObject({ st: 14, spts: 120.4, best: 19.6, bpts: null });
    expect(at(rows, 'WR')).toMatchObject({ st: 28, spts: 302.2, bpts: 40.2 });
  });

  test('a starter counts at the slot they started in; a FLEX start at their position, if FLEX can hold it', () => {
    const rows = positions({ franchises: [ALIGATORS] });
    // Hunter (DB) started 3 times at WR, counted there, and twice at FLEX,
    // which can't hold a DB, so those count at FLEX. His bench points stay at DB.
    expect(at(rows, 'DB')).toMatchObject({ st: 0, spts: 0, bpts: 25.8, best: null });
    expect(at(rows, 'FLEX')).toMatchObject({ st: 2, spts: 11.4, bpts: null, best: 7.9 });
  });

  test('the league rank is against every franchise at that position, by points per game', () => {
    const qbs = positions({}).filter((r) => r.pos === 'QB');
    expect(qbs).toHaveLength(16);
    expect(qbs.find((r) => r.rank === 1)!.franchise.id).toBe(16);
    expect(qbs.find((r) => r.franchise.id === SERPION)!.rank).toBe(13);
  });

  test('every 2025 lineup, whichever seasons are asked for', () => {
    expect(run({ view: 'pos' }).rows).toEqual(run({ view: 'pos', seasons: [2025, 2026] }).rows);
  });
});

describe('the NFL-player subject (2025 on)', () => {
  const players = (patch: Partial<Query>) =>
    run({ subject: 'player', seasons: [2025], ...patch }).rows as (PlayerRow | PerformanceRow)[];

  test('totals per NFL player', () => {
    const [allen] = players({ players: [ALLEN] }) as PlayerRow[];
    expect(allen).toMatchObject({
      player: { id: ALLEN, name: 'Josh Allen', position: 'QB' },
      ro: 14, st: 13, spts: 310.02, avg: 23.85, bpts: 0, best: 42.68, nfr: 1,
    });
    // The default order is points started, highest first.
    expect((players({}) as PlayerRow[]).slice(0, 3).map((r) => r.player.id)).toEqual([ALLEN, '6813', '4034']);
  });

  test('started or benched only', () => {
    const [started] = players({ players: [HUNTER], lineup: 'start' }) as PlayerRow[];
    expect(started).toMatchObject({ ro: 5, st: 5, spts: 24, bpts: 0, best: 7.9 });
    const [benched] = players({ players: [HUNTER], lineup: 'bench' }) as PlayerRow[];
    expect(benched).toMatchObject({ ro: 3, st: 0, spts: 0, avg: null, bpts: 25.8, best: 20.1 });
  });

  test('by position, rostered by, and a minimum of games rostered', () => {
    const qbs = players({ positions: ['QB'], franchises: [SERPION], minGames: 5 }) as PlayerRow[];
    expect(qbs.length).toBeGreaterThan(0);
    expect(qbs.every((r) => r.player.position === 'QB' && r.ro >= 5)).toBe(true);
  });

  test('per player per franchise, and season by season', () => {
    const [fr] = players({ players: [HUNTER], view: 'fr' }) as PlayerRow[];
    expect(fr).toMatchObject({ franchise: { id: ALIGATORS }, ro: 8 });
    const seasons = players({ players: [HUNTER], view: 'season', seasons: [] }) as PlayerRow[];
    expect(seasons[0]).toMatchObject({ season: 2025, ro: 8, franchise: null });
    expect(new Set(seasons.map((r) => r.season)).size).toBe(seasons.length);
  });

  test('a performance log, one line a week', () => {
    const log = players({ players: [HUNTER], view: 'log' }) as PerformanceRow[];
    expect(log.map((r) => [r.week, r.slot, r.points])).toEqual([
      [1, 'WR', 6.3], [2, 'WR', 3.7], [3, 'WR', 2.6], [4, 'BN', 5.7], [5, 'FLEX', 7.9], [6, 'FLEX', 3.5], [7, 'BN', 20.1], [8, 'BN', 0],
    ]);
    expect(log[0]).toMatchObject({ season: 2025, phase: 'R', franchise: { id: ALIGATORS }, starter: true });
    expect(log[0].opponent.id).not.toBe(ALIGATORS);
  });

  test('an opposition filter', () => {
    const log = players({ players: [ALLEN], view: 'log' }) as PerformanceRow[];
    const opp = log[0].opponent.id;
    expect((players({ players: [ALLEN], view: 'log', opponents: [opp] }) as PerformanceRow[]).every((r) => r.opponent.id === opp)).toBe(true);
  });
});

// Worked out from the 2025 draft snapshot and lineups with SQL, outside the engine.
const PUFFINS = 3;
const BEARNAISE = 10;
const CHASE = '7564';

describe('the draft-picks subject (drafts from 2025)', () => {
  const picks = (patch: Partial<Query>) => run({ subject: 'pick', view: 'list', seasons: [2025], ...patch }).rows as PickRow[];

  test('the pick list, in draft order, with whose slot each pick was', () => {
    const rows = picks({});
    expect(rows).toHaveLength(224);
    expect(rows[0]).toMatchObject({
      season: 2025, pick: 1, round: 1, franchise: { id: 19 }, slotFranchise: { id: 19 },
      player: { id: CHASE, name: "Ja'Marr Chase", position: 'WR' }, kept: null,
    });
    // Pick value: the points he went on to score in the picking franchise's starting lineups that season.
    expect(rows[0].value).toBe(217);
    // Pick 6 was the Puffins' slot, traded to Bearnaise Dynamics.
    expect(rows[5]).toMatchObject({ pick: 6, franchise: { id: BEARNAISE }, slotFranchise: { id: PUFFINS } });
    const [allen] = picks({ players: [ALLEN] });
    expect(allen).toMatchObject({ pick: 22, round: 2, franchise: { id: 16 }, value: 316.92 });
  });

  test('a franchise as the picker, or as the slot owner', () => {
    expect(picks({ franchises: [PUFFINS] })).toHaveLength(14);
    expect(picks({ franchises: [PUFFINS] }).filter((r) => r.slotFranchise.id !== PUFFINS)).toHaveLength(10);
    const slots = picks({ franchises: [PUFFINS], franchiseAs: 'slot' });
    expect(slots).toHaveLength(14);
    expect(slots.every((r) => r.slotFranchise.id === PUFFINS)).toBe(true);
  });

  test('rounds, overall picks and positions', () => {
    expect(picks({ rounds: [1, 2] })).toHaveLength(32);
    expect(picks({ picks: [10, 19] }).map((r) => r.pick)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(picks({ positions: ['QB'], rounds: [1, 1] }).every((r) => r.player.position === 'QB')).toBe(true);
  });

  test('per franchise by position or by round', () => {
    const byPos = run({ subject: 'pick', view: 'fr', seasons: [2025], franchises: [PUFFINS] }).rows as PickGroupRow[];
    expect(byPos.map((r) => [r.group, r.n])).toEqual([['QB', 1], ['RB', 5], ['WR', 6], ['TE', 2]]);
    expect(byPos[1]).toMatchObject({ franchise: { id: PUFFINS }, dr: 5, kc: 0, top: 16 });
    const byRound = run({ subject: 'pick', view: 'fr', grouping: 'round', seasons: [2025], franchises: [PUFFINS] }).rows as PickGroupRow[];
    expect(byRound.map((r) => r.group)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  test('per NFL player: times drafted, highest pick and the franchises', () => {
    const [allen] = run({ subject: 'pick', view: 'pl', players: [ALLEN], seasons: [2025] }).rows as PickPlayerRow[];
    expect(allen).toMatchObject({ n: 1, dr: 1, kc: 0, top: { season: 2025, pick: 22 }, franchises: [{ id: 16 }] });
  });

  test("keepers can't be told from drafted picks until the season's keepers are recorded", () => {
    const { notes } = run({ subject: 'pick', seasons: [2025] });
    expect(notes).toContainEqual({ kind: 'drafts', firstSeason: 2025 });
    // data/keepers.csv records no 2025 keepers yet.
    expect(notes).toContainEqual({ kind: 'keepersUnrecorded', seasons: [2025] });
    expect(picks({ kept: 'kept' })).toEqual([]);
  });

  test('an NFL.com-era scope has no picks, and explains why', () => {
    expect(run({ subject: 'pick', seasons: [2015] })).toEqual({ rows: [], notes: [{ kind: 'drafts', firstSeason: 2025 }] });
  });

  test('the NFL-player subject counts drafted and kept', () => {
    const [allen] = run({ subject: 'player', seasons: [2025], players: [ALLEN] }).rows as PlayerRow[];
    expect(allen).toMatchObject({ dr: 1, kc: 0 });
  });
});

describe('lineups only exist from 2025 (¶)', () => {
  test('a query over Sleeper-era seasons says so', () => {
    expect(run({ subject: 'player' }).notes).toEqual([{ kind: 'lineups' }]);
    expect(run({ view: 'pos', seasons: [2024, 2025] }).notes).toEqual([{ kind: 'lineups' }]);
  });

  test('an NFL.com-era scope has no rows, and explains why', () => {
    for (const patch of [{ subject: 'player' }, { view: 'pos' }] as Partial<Query>[]) {
      const result = run({ ...patch, seasons: [2015, 2016] });
      expect(result).toEqual({ rows: [], notes: [{ kind: 'beforeLineups', firstSeason: 2025 }] });
    }
  });
});
