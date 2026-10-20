import { describe, expect, test } from 'vitest';
import type {
  GameRow, GapRow, GroupRow, PerformanceRow, PickGroupRow, PickPlayerRow, PickRow, PlayerRow, PositionRow, Row,
} from './engine';
import { allColumns, columnsOf } from './query';
import { columnKind, columnValue } from './values';

const SERP = { id: 8, name: 'SERPION' };
const CATS = { id: 17, name: 'Not Enough Cooks' };
const ALLEN = { id: '4984', name: 'Josh Allen', position: 'QB' };
const read = (r: Row, cols: string[]) => Object.fromEntries(cols.map((key) => [key, columnValue(r, key)]));

const group = (patch: Partial<GroupRow>): GroupRow => ({
  kind: 'group', franchise: SERP, season: null, opponent: null, phase: null,
  gp: 14, w: 12, l: 2, t: 0, pct: 0.75, pf: 1464.98, pa: 1258.82, apf: 104.64, apa: 89.92, hi: 138.02, lo: 65.84,
  reported: false, lostScores: 0, partialHighs: false, unchecked: 0, ...patch,
});

describe('a franchise group row', () => {
  test('reads every figure as a number, and names as labels', () => {
    expect(read(group({ season: 2015 }), columnsOf({ subject: 'franchise', view: 'season' }))).toEqual({
      f: 'SERPION', s: 2015, gp: 14, w: 12, l: 2, t: 0, pct: 0.75,
      pf: 1464.98, pa: 1258.82, apf: 104.64, apa: 89.92, hi: 138.02, lo: 65.84,
    });
    expect(columnValue(group({ opponent: CATS }), 'o')).toBe('Not Enough Cooks');
    expect(columnValue(group({ phase: 'C' }), 'ph')).toBe('Shit Bowl and Mediocre Bowl');
  });

  test('a row with no games reads empty, not zero', () => {
    const empty = group({ gp: 0, w: 0, l: 0, t: 0, pct: null, pf: null, pa: null, apf: null, apa: null, hi: null, lo: null });
    expect(read(empty, ['pct', 'pf', 'apf', 'hi', 'lo'])).toEqual({ pct: null, pf: null, apf: null, hi: null, lo: null });
    expect(columnValue(group({}), 'o')).toBeNull();
  });
});

describe('a game log', () => {
  const GAMES = columnsOf({ subject: 'franchise', view: 'games' });
  const game: GameRow = {
    kind: 'game', season: 2015, week: 3, phase: 'P', franchise: SERP, opponent: CATS, pf: 100, pa: 90.5, result: 'W', margin: 9.5,
  };

  test('a game reads its week, its score and its result', () => {
    expect(read(game, GAMES)).toEqual({
      s: 2015, wk: 3, ph: 'Playoffs', f: 'SERPION', pf: 100, pa: 90.5, o: 'Not Enough Cooks', res: 'W', mar: 9.5,
    });
  });

  test('a game whose score is lost reads empty points and margin, but keeps its result', () => {
    expect(read({ ...game, pf: null, pa: null, margin: null }, ['pf', 'pa', 'mar', 'res'])).toEqual({ pf: null, pa: null, mar: null, res: 'W' });
  });

  test('weeks with no scores read their season, phase and franchise, and nothing else', () => {
    const gap: GapRow = { kind: 'reported', season: 2012, weeks: [1, 2, 3], phase: 'R', franchise: SERP, gp: 3, w: 2, l: 1, t: 0, pf: 300, pa: 280 };
    const expected = { s: 2012, wk: null, ph: 'Regular season', f: 'SERPION', pf: null, pa: null, o: null, res: null, mar: null };
    expect(read(gap, GAMES)).toEqual(expected);
    expect(read({ ...gap, kind: 'unchecked', w: null, l: null, t: null, pf: null, pa: null }, GAMES)).toEqual(expected);
  });
});

describe('NFL player rows', () => {

  test('a position row reads its figures, with share as a fraction', () => {
    const r: PositionRow = {
      kind: 'position', franchise: SERP, pos: 'QB', gp: 14, st: 14, spts: 300.5, ppg: 21.46, avg: 21.46, share: 0.25, rank: 1, bpts: 12.3, best: 35.1,
    };
    expect(read(r, columnsOf({ subject: 'franchise', view: 'pos' }))).toEqual({
      f: 'SERPION', pos: 'QB', gp: 14, st: 14, spts: 300.5, ppg: 21.46, avg: 21.46, share: 0.25, rank: 1, bpts: 12.3, best: 35.1,
    });
    // Unknown position, no starts, and a slot no bench NFL player can fill.
    expect(read({ ...r, pos: null, st: 0, spts: 0, ppg: null, avg: null, share: null, bpts: null, best: null }, ['pos', 'st', 'ppg', 'avg', 'share', 'bpts', 'best']))
      .toEqual({ pos: null, st: 0, ppg: null, avg: null, share: null, bpts: null, best: null });
  });

  test('an NFL player row reads the NFL player, and their franchise and season when it has them', () => {
    const r: PlayerRow = {
      kind: 'player', player: ALLEN, franchise: SERP, season: 2025, ro: 17, st: 16, spts: 380.2, avg: 23.76, bpts: 18.4, best: 41.2, nfr: 1, dr: 1, kc: 0,
    };
    expect(read(r, columnsOf({ subject: 'player', view: 'fr' }))).toEqual({
      pl: 'Josh Allen', pos: 'QB', f: 'SERPION', ro: 17, st: 16, spts: 380.2, avg: 23.76, bpts: 18.4, best: 41.2, dr: 1, kc: 0,
    });
    const alone = { ...r, franchise: null, season: null, avg: null, best: null };
    expect(read(alone, ['f', 's', 'avg', 'best', 'nfr'])).toEqual({ f: null, s: null, avg: null, best: null, nfr: 1 });
  });

  test('an NFL player no snapshot knows reads by id, of unknown position', () => {
    const r: PlayerRow = {
      kind: 'player', player: { id: '9999', name: null, position: null }, franchise: null, season: null,
      ro: 1, st: 0, spts: 0, avg: null, bpts: 0, best: null, nfr: 1, dr: 0, kc: 0,
    };
    expect(read(r, ['pl', 'pos'])).toEqual({ pl: 'Unknown NFL player (Sleeper id 9999)', pos: null });
  });

  test('a performance reads its week, slot and points', () => {
    const r: PerformanceRow = {
      kind: 'performance', season: 2025, week: 4, phase: 'R', player: ALLEN, franchise: SERP, opponent: CATS, slot: 'QB', starter: true, points: 28.4,
    };
    expect(read(r, columnsOf({ subject: 'player', view: 'log' }))).toEqual({
      s: 2025, wk: 4, ph: 'Regular season', pl: 'Josh Allen', pos: 'QB', f: 'SERPION', o: 'Not Enough Cooks', slot: 'QB', pts: 28.4,
    });
    expect(read({ ...r, slot: 'BN', starter: false, points: null }, ['slot', 'pts'])).toEqual({ slot: 'Bench', pts: null });
  });
});

describe('draft-pick rows', () => {
  const pick: PickRow = {
    kind: 'pick', season: 2025, pick: 14, round: 2, franchise: SERP, slotFranchise: CATS, player: ALLEN, kept: false, value: 210.4,
  };

  test('a pick reads whose slot it was, kept or drafted, and its value', () => {
    expect(read(pick, columnsOf({ subject: 'pick', view: 'list' }))).toEqual({
      s: 2025, pk: 14, rd: 2, f: 'SERPION', sf: 'Not Enough Cooks', pl: 'Josh Allen', pos: 'QB', kd: 'Drafted', val: 210.4,
    });
    // A franchise's own slot names no other franchise; unrecorded keepers read empty.
    expect(read({ ...pick, slotFranchise: SERP, kept: null }, ['sf', 'kd'])).toEqual({ sf: null, kd: null });
    expect(columnValue({ ...pick, kept: true }, 'kd')).toBe('Kept');
  });

  test('a per-franchise row reads its position, or its round', () => {
    const r: PickGroupRow = { kind: 'pickGroup', franchise: SERP, group: 'RB', n: 4, dr: 3, kc: 1, top: 5, value: 512.3 };
    expect(read(r, columnsOf({ subject: 'pick', view: 'fr' }))).toEqual({ f: 'SERPION', pos: 'RB', n: 4, dr: 3, kc: 1, top: 5, val: 512.3 });
    expect(columnValue({ ...r, group: null }, 'pos')).toBeNull();
    expect(read({ ...r, group: 3 }, columnsOf({ subject: 'pick', view: 'fr', grouping: 'round' }))).toEqual({
      f: 'SERPION', rd: 3, n: 4, dr: 3, kc: 1, top: 5, val: 512.3,
    });
  });

  test('a per-NFL-player row reads its top pick and the franchises that picked them', () => {
    const r: PickPlayerRow = {
      kind: 'pickPlayer', player: ALLEN, n: 2, dr: 1, kc: 1, top: { season: 2025, pick: 3 }, franchises: [CATS, SERP], value: 700,
    };
    expect(read(r, columnsOf({ subject: 'pick', view: 'pl' }))).toEqual({
      pl: 'Josh Allen', pos: 'QB', n: 2, dr: 1, kc: 1, top: 3, frs: 'Not Enough Cooks, SERPION', val: 700,
    });
  });

  test('a column another kind of row has reads empty', () => {
    expect(read(pick, ['gp', 'wk', 'o'])).toEqual({ gp: null, wk: null, o: null });
  });
});

describe('column kinds', () => {
  test('every column of every subject says what it holds', () => {
    for (const subject of ['franchise', 'player', 'pick'] as const)
      for (const key of allColumns(subject)) expect(columnKind(key), key).toBeDefined();
  });
});
