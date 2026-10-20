import { describe, expect, test } from 'vitest';
import type { GroupRow, QueryResult } from './engine';
import { chartOf } from './chart';
import { DEFAULT_QUERY, type Query } from './query';

const SERP = { id: 8, name: 'SERPION' };
const CATS = { id: 17, name: 'Not Enough Cooks' };
const q = (patch: Partial<Query>): Query => ({ ...DEFAULT_QUERY, chart: true, ...patch });
const group = (patch: Partial<GroupRow>): GroupRow => ({
  kind: 'group', franchise: SERP, season: null, opponent: null, phase: null,
  gp: 14, w: 12, l: 2, t: 0, pct: 12 / 14, pf: 1464.98, pa: 1258.82, apf: 104.64, apa: 89.92, hi: 138.02, lo: 65.84,
  reported: false, lostScores: 0, partialHighs: false, unchecked: 0, ...patch,
});
const result = (rows: QueryResult['rows']): QueryResult => ({ rows, notes: [] });

describe('the chart above the results', () => {
  test('totals per franchise opens on wins per franchise, as bars', () => {
    const rows = [group({}), group({ franchise: CATS, w: 3, l: 11, pct: 3 / 14 })];
    expect(chartOf(result(rows), q({}))).toEqual({
      mark: 'bar',
      x: { key: 'f', label: 'Franchise' },
      y: { key: 'w', label: 'W' },
      points: [
        { x: 'SERPION', y: 12 },
        { x: 'Not Enough Cooks', y: 3 },
      ],
    });
  });

  test("the bars come in the table's order, so a new sort reorders them", () => {
    const rows = [group({ franchise: CATS, w: 3 }), group({})];
    const chart = chartOf(result(rows), q({ sort: { key: 'w', dir: 'asc' } }))!;
    expect(chart.points.map((p) => p.x)).toEqual(['Not Enough Cooks', 'SERPION']);
  });

  test('views without a chart yet draw none', () => {
    for (const view of ['season', 'opp', 'phase', 'pos', 'games'] as const)
      expect(chartOf(result([group({})]), q({ view })), view).toBeNull();
    expect(chartOf(result([]), q({ subject: 'player', view: 'totals' }))).toBeNull();
    expect(chartOf(result([]), q({ subject: 'pick', view: 'list' }))).toBeNull();
  });

  test('no rows, no chart', () => {
    expect(chartOf(result([]), q({}))).toBeNull();
  });
});
