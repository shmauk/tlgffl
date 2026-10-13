// The Statsguru engine against the build's own database (run the Python build
// first), so its figures can be checked against what the static pages show.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { runQuery, type Db, type GroupRow } from './engine';
import { sqlJsDb } from './sqljs';
import { DEFAULT_QUERY, type Query } from './query';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db: Db = { all: (sql, params = []) => sqlite.prepare(sql).all(...params) as Record<string, any>[] };
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
