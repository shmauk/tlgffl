import { describe, expect, test } from 'vitest';
import type { GameRow, GapRow, GroupRow, QueryResult } from './engine';
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
const game = (season: number, week: number, pf: number | null, franchise = SERP): GameRow => ({
  kind: 'game', season, week, phase: 'R', franchise, opponent: franchise === SERP ? CATS : SERP,
  pf, pa: 90, result: 'W', margin: pf == null ? null : pf - 90,
});
const reported = (season: number): GapRow => ({
  kind: 'reported', season, weeks: [1, 2], phase: 'R', franchise: SERP, gp: 2, w: 1, l: 1, t: 0, pf: 200, pa: 210,
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

  test('season by season draws a line of average points for per franchise, in season order', () => {
    const rows = [
      group({ season: 2013, apf: 110 }),
      group({ season: 2012, apf: 100 }),
      group({ franchise: CATS, season: 2012, apf: 90 }),
      group({ franchise: CATS, season: 2013, apf: null }),
    ];
    const chart = chartOf(result(rows), q({ view: 'season' }))!;
    expect(chart.mark).toBe('line');
    expect(chart.x).toEqual({ key: 's', label: 'Season' });
    expect(chart.y).toEqual({ key: 'apf', label: 'Avg PF' });
    expect(chart.series).toEqual({ key: 'f', label: 'Franchise' });
    expect(chart.points).toEqual([
      { x: 2012, y: 100, series: 'SERPION' },
      { x: 2012, y: 90, series: 'Not Enough Cooks' },
      { x: 2013, y: 110, series: 'SERPION' },
    ]);
    expect(chart.coloured).toEqual(['SERPION', 'Not Enough Cooks']);
    expect(chart.note).toBeUndefined();
  });

  test('past 8 lines, only the 8 biggest get colour, and a note points to the franchise filter', () => {
    // Franchise n scores n points a game in both seasons, so the biggest are 10 down to 3.
    const fr = (n: number) => ({ id: n, name: `Franchise ${n}` });
    const rows = [2012, 2013].flatMap((season) =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => group({ franchise: fr(n), season, apf: n })),
    );
    const chart = chartOf(result(rows), q({ view: 'season' }))!;
    expect(chart.coloured).toEqual([10, 9, 8, 7, 6, 5, 4, 3].map((n) => `Franchise ${n}`));
    expect(chart.points.filter((p) => p.series === 'Franchise 1')).toHaveLength(2);
    expect(chart.note).toBe('Only the 8 biggest of 10 franchises are in colour. Choose the franchises to compare with the Franchise filter.');
  });

  test('the game log lines up games in order, with no off-season gaps, labelled at each season start', () => {
    // Sorted by points, as the table might be; 2013 has only reported totals and 2014 a lost score.
    const rows = [
      game(2015, 1, 130),
      game(2012, 2, 120),
      game(2012, 1, 80, CATS),
      reported(2013),
      game(2014, 1, null),
      game(2012, 1, 100),
      game(2015, 1, 95, CATS),
    ];
    const chart = chartOf(result(rows), q({ view: 'games' }))!;
    expect(chart.mark).toBe('line');
    expect(chart.y).toEqual({ key: 'pf', label: 'PF' });
    expect(chart.series).toEqual({ key: 'f', label: 'Franchise' });
    expect(chart.points).toEqual([
      { x: 0, y: 80, series: 'Not Enough Cooks', at: '2012 week 1' },
      { x: 0, y: 100, series: 'SERPION', at: '2012 week 1' },
      { x: 1, y: 120, series: 'SERPION', at: '2012 week 2' },
      { x: 2, y: 130, series: 'SERPION', at: '2015 week 1' },
      { x: 2, y: 95, series: 'Not Enough Cooks', at: '2015 week 1' },
    ]);
    expect(chart.ticks).toEqual([
      { x: 0, label: '2012' },
      { x: 2, label: '2015' },
    ]);
  });

  test('a line or bar with more than one row per point draws nothing, and names the view that groups that way', () => {
    // The game log by season: several games per franchise each season.
    const rows = [game(2012, 1, 100), game(2012, 2, 120), game(2013, 1, 90)];
    const chart = chartOf(result(rows), q({ view: 'games', chartChoice: { x: 's' } }))!;
    expect(chart.points).toEqual([]);
    expect(chart.note).toBe(
      'More than one row per season and franchise, and a line chart doesn’t add rows up. Use Season by season instead, or a scatter, which draws every row.',
    );
    // Bars of franchises from Season by season: the totals are a view of their own.
    const seasons = [group({ season: 2012 }), group({ season: 2013 })];
    expect(chartOf(result(seasons), q({ view: 'season', chartChoice: { mark: 'bar', x: 'f', series: null } }))!.note).toBe(
      'More than one row per franchise, and a bar chart doesn’t add rows up. Use Totals per franchise instead, or a scatter, which draws every row.',
    );
  });

  test('with no view grouping that way, the note says what to change', () => {
    // Opponents only, but By opponent has a row per franchise and opponent.
    const rows = [group({ opponent: CATS }), group({ franchise: CATS, opponent: SERP }), group({ franchise: { id: 3, name: 'Hogs' }, opponent: CATS })];
    expect(chartOf(result(rows), q({ view: 'opp', chartChoice: { series: null } }))!.note).toBe(
      'More than one row per opponent, and a bar chart doesn’t add rows up. Use a franchise series, or a scatter, which draws every row.',
    );
    // Wins on x: nothing groups by a figure.
    const totals = [group({}), group({ franchise: CATS })];
    expect(chartOf(result(totals), q({ chartChoice: { x: 'w', y: 'pf' } }))!.note).toBe(
      'More than one row per W, and a bar chart doesn’t add rows up. Use a scatter, which draws every row.',
    );
  });

  test('a scatter draws every row, even many to a point', () => {
    const rows = [group({ season: 2012, pf: 1400, pa: 1300 }), group({ season: 2013, pf: 1400, pa: 1300 })];
    const chart = chartOf(result(rows), q({ view: 'season', chartChoice: { mark: 'scatter', x: 'pf', y: 'pa', series: null } }))!;
    expect(chart).toEqual({
      mark: 'scatter',
      x: { key: 'pf', label: 'PF' },
      y: { key: 'pa', label: 'PA' },
      points: [
        { x: 1400, y: 1300 },
        { x: 1400, y: 1300 },
      ],
    });
  });

  test('by opponent opens on win % against each opponent, a bar per franchise in each group', () => {
    const rows = [
      group({ opponent: CATS, pct: 0.75 }),
      group({ franchise: CATS, opponent: SERP, pct: 0.25 }),
    ];
    expect(chartOf(result(rows), q({ view: 'opp' }))).toEqual({
      mark: 'bar',
      x: { key: 'o', label: 'Opponent' },
      y: { key: 'pct', label: 'Win %', percent: true },
      series: { key: 'f', label: 'Franchise' },
      points: [
        { x: 'Not Enough Cooks', y: 0.75, series: 'SERPION' },
        { x: 'SERPION', y: 0.25, series: 'Not Enough Cooks' },
      ],
      coloured: ['SERPION', 'Not Enough Cooks'],
    });
  });

  test('by phase opens on win % per franchise, a bar per phase in each group', () => {
    const rows = [group({ phase: 'R', pct: 0.6 }), group({ phase: 'P', pct: 0.8 })];
    const chart = chartOf(result(rows), q({ view: 'phase' }))!;
    expect(chart.x.key).toBe('f');
    expect(chart.series).toEqual({ key: 'ph', label: 'Phase' });
    expect(chart.points).toEqual([
      { x: 'SERPION', y: 0.6, series: 'Regular season' },
      { x: 'SERPION', y: 0.8, series: 'Playoffs' },
    ]);
  });

  test('views without a chart yet draw none', () => {
    expect(chartOf(result([group({})]), q({ view: 'pos' }))).toBeNull();
    expect(chartOf(result([]), q({ subject: 'player', view: 'totals' }))).toBeNull();
    expect(chartOf(result([]), q({ subject: 'pick', view: 'list' }))).toBeNull();
  });

  test('no rows, no chart', () => {
    expect(chartOf(result([]), q({}))).toBeNull();
  });
});
