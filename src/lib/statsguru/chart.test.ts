import { describe, expect, test } from 'vitest';
import type { GameRow, GapRow, GroupRow, PickGroupRow, PickPlayerRow, PickRow, QueryResult } from './engine';
import type { NflPlayer, PerformanceRow, PlayerRow, PositionRow } from './lineups';
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
const position = (pos: string | null, spts: number, franchise = SERP): PositionRow => ({
  kind: 'position', franchise, pos, gp: 17, st: spts ? 17 : 0, spts, ppg: spts / 17, avg: spts ? spts / 17 : null,
  share: null, rank: 1, bpts: pos === 'FLEX' ? null : 0, best: null,
});
const MAHOMES: NflPlayer = { id: '4046', name: 'Patrick Mahomes', position: 'QB' };
const CHASE: NflPlayer = { id: '7564', name: "Ja'Marr Chase", position: 'WR' };
const player = (patch: Partial<PlayerRow>): PlayerRow => ({
  kind: 'player', player: MAHOMES, franchise: null, season: null,
  ro: 17, st: 16, spts: 350.5, avg: 21.91, bpts: 18.2, best: 38.1, nfr: 1, dr: 1, kc: 0, ...patch,
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

  test('an average ranks its series by their mean, so a franchise with more seasons isn’t bigger for it', () => {
    // Franchise n averages n points a game; franchises 1 and 2 have played 10 seasons, the rest 1.
    const fr = (n: number) => ({ id: n, name: `Franchise ${n}` });
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((n) =>
      Array.from({ length: n <= 2 ? 10 : 1 }, (_, i) => group({ franchise: fr(n), season: 2012 + i, apf: 100 + n })),
    );
    const chart = chartOf(result(rows), q({ view: 'season' }))!;
    expect(chart.coloured).toEqual([10, 9, 8, 7, 6, 5, 4, 3].map((n) => `Franchise ${n}`));
  });

  test('a figure that adds up ranks its series by their sum', () => {
    // Franchise 1 wins little each season but has played many; franchise 2 wins more in one.
    const fr = (n: number) => ({ id: n, name: `Franchise ${n}` });
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => group({ franchise: fr(1), season: 2012 + i, w: 4 })),
      group({ franchise: fr(2), season: 2012, w: 10 }),
    ];
    const chart = chartOf(result(rows), q({ view: 'season', chartChoice: { y: 'w' } }))!;
    expect(chart.coloured).toEqual(['Franchise 1', 'Franchise 2']);
  });

  test('a fraction ranks its series by their mean', () => {
    const fr = (n: number) => ({ id: n, name: `Franchise ${n}` });
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => group({ franchise: fr(1), season: 2012 + i, pct: 0.4 })),
      group({ franchise: fr(2), season: 2012, pct: 0.9 }),
    ];
    const chart = chartOf(result(rows), q({ view: 'season', chartChoice: { y: 'pct' } }))!;
    expect(chart.coloured).toEqual(['Franchise 2', 'Franchise 1']);
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

  test('by position opens on each franchise’s points as a 100% bar split into positions, in lineup order', () => {
    // One franchise, one season, sorted by points as the table might be.
    const rows = [position('WR', 500), position('QB', 300), position('DEF', 100), position('RB', 100)];
    expect(chartOf(result(rows), q({ view: 'pos', seasons: [2025] }))).toEqual({
      mark: 'share',
      x: { key: 'f', label: 'Franchise' },
      y: { key: 'spts', label: 'Pts started' },
      series: { key: 'pos', label: 'Position' },
      points: [
        { x: 'SERPION', y: 0.3, series: 'QB', value: 300 },
        { x: 'SERPION', y: 0.1, series: 'RB', value: 100 },
        { x: 'SERPION', y: 0.5, series: 'WR', value: 500 },
        { x: 'SERPION', y: 0.1, series: 'DEF', value: 100 },
      ],
      coloured: ['QB', 'RB', 'WR', 'DEF'],
    });
  });

  test('grouped by lineup slot, FLEX is a segment of its own', () => {
    const rows = [position('FLEX', 150), position('WR', 350), position('K', 100), position('RB', 200), position('QB', 200)];
    const chart = chartOf(result(rows), q({ view: 'pos', grouping: 'slot' }))!;
    expect(chart.series).toEqual({ key: 'pos', label: 'Slot' });
    expect(chart.points.map((p) => [p.series, p.y])).toEqual([
      ['QB', 0.2], ['RB', 0.2], ['WR', 0.35], ['FLEX', 0.15], ['K', 0.1],
    ]);
  });

  test('each bar is scaled to its own franchise, and a position with no starts is 0% of it', () => {
    const HOGS = { id: 3, name: 'Hogs' };
    const rows = [
      position('QB', 300, CATS),
      position('RB', 100, CATS),
      // Only benched NFL players at K: no starts, no points.
      position('K', 0, CATS),
      position('QB', 120),
      position('WR', 40),
      // An NFL player Sleeper knows no position for.
      position(null, 40),
      // Never started anyone: a bar of nothing.
      position('QB', 0, HOGS),
    ];
    const chart = chartOf(result(rows), q({ view: 'pos' }))!;
    // Colours go to the positions in lineup order, whichever franchise first has them.
    expect(chart.coloured).toEqual(['QB', 'RB', 'WR', 'K', 'Unknown']);
    expect(chart.points).toEqual([
      { x: 'Not Enough Cooks', y: 0.75, series: 'QB', value: 300 },
      { x: 'Not Enough Cooks', y: 0.25, series: 'RB', value: 100 },
      { x: 'Not Enough Cooks', y: 0, series: 'K', value: 0 },
      { x: 'SERPION', y: 0.6, series: 'QB', value: 120 },
      { x: 'SERPION', y: 0.2, series: 'WR', value: 40 },
      { x: 'SERPION', y: 0.2, series: 'Unknown', value: 40 },
      { x: 'Hogs', y: 0, series: 'QB', value: 0 },
    ]);
  });

  test('by position before 2025 draws no chart, leaving the view’s message', () => {
    const before: QueryResult = { rows: [], notes: [{ kind: 'beforeLineups', firstSeason: 2025 }] };
    expect(chartOf(before, q({ view: 'pos', seasons: [2015] }))).toBeNull();
  });

  test('no rows, no chart', () => {
    expect(chartOf(result([]), q({}))).toBeNull();
  });
});

describe('the chart of NFL players', () => {
  const nfl = (patch: Partial<Query>) => q({ subject: 'player', ...patch });

  test('totals per NFL player opens on points started, a bar per NFL player', () => {
    const rows = [player({}), player({ player: CHASE, spts: 280 })];
    expect(chartOf(result(rows), nfl({ view: 'totals' }))).toEqual({
      mark: 'bar',
      x: { key: 'pl', label: 'NFL player' },
      y: { key: 'spts', label: 'Pts started' },
      points: [
        { x: 'Patrick Mahomes', y: 350.5 },
        { x: "Ja'Marr Chase", y: 280 },
      ],
    });
  });

  test('past 30 bars, only the first 30 in the table’s order are drawn, and a note says how to see others', () => {
    // Hundreds of NFL players get rostered in a season; the table is sorted by points.
    const rows = Array.from({ length: 35 }, (_, i) =>
      player({ player: { id: `${i}`, name: `Player ${i}`, position: 'RB' }, spts: 400 - i }),
    );
    const chart = chartOf(result(rows), nfl({ view: 'totals' }))!;
    expect(chart.points.map((p) => p.x)).toEqual(Array.from({ length: 30 }, (_, i) => `Player ${i}`));
    expect(chart.note).toBe('Only the first 30 of 35 NFL players are drawn, in the table’s order: sort or filter the table to chart others.');
  });

  test('per NFL player per franchise opens on each NFL player’s points as a 100% bar split into the franchises that started them', () => {
    const rows = [player({ franchise: SERP, spts: 300 }), player({ player: CHASE, franchise: CATS, spts: 280 }), player({ franchise: CATS, spts: 100 })];
    const chart = chartOf(result(rows), nfl({ view: 'fr' }))!;
    expect(chart.mark).toBe('share');
    expect(chart.x).toEqual({ key: 'pl', label: 'NFL player' });
    expect(chart.series).toEqual({ key: 'f', label: 'Franchise' });
    expect(chart.points).toEqual([
      { x: 'Patrick Mahomes', y: 0.75, series: 'SERPION', value: 300 },
      { x: 'Patrick Mahomes', y: 0.25, series: 'Not Enough Cooks', value: 100 },
      { x: "Ja'Marr Chase", y: 1, series: 'Not Enough Cooks', value: 280 },
    ]);
  });

  test('season by season draws a line of points started per NFL player, and past 8 the note points to the NFL player filter', () => {
    const rows = [2025, 2026].flatMap((season) =>
      Array.from({ length: 9 }, (_, i) => player({ player: { id: `${i}`, name: `Player ${i}`, position: 'WR' }, season, spts: 100 - i })),
    );
    const chart = chartOf(result(rows), nfl({ view: 'season' }))!;
    expect(chart.mark).toBe('line');
    expect([chart.x.key, chart.y.key, chart.series?.key]).toEqual(['s', 'spts', 'pl']);
    expect(chart.points.slice(0, 2)).toEqual([
      { x: 2025, y: 100, series: 'Player 0' },
      { x: 2025, y: 99, series: 'Player 1' },
    ]);
    expect(chart.note).toBe('Only the 8 biggest of 9 NFL players are in colour. Choose the NFL players to compare with the NFL player filter.');
  });

  test('the performance log lines up each NFL player’s points game by game, leaving out weeks with no points', () => {
    const played = (season: number, week: number, points: number | null, p = MAHOMES): PerformanceRow => ({
      kind: 'performance', season, week, phase: 'R', player: p, franchise: SERP, opponent: CATS,
      slot: p.position!, starter: true, points,
    });
    const rows = [played(2025, 1, 20.5), played(2025, 1, 14, CHASE), played(2025, 2, null), played(2025, 3, 31.2)];
    const chart = chartOf(result(rows), nfl({ view: 'log' }))!;
    expect(chart.mark).toBe('line');
    expect(chart.y).toEqual({ key: 'pts', label: 'Points' });
    expect(chart.series).toEqual({ key: 'pl', label: 'NFL player' });
    expect(chart.points).toEqual([
      { x: 0, y: 20.5, series: 'Patrick Mahomes', at: '2025 week 1' },
      { x: 0, y: 14, series: "Ja'Marr Chase", at: '2025 week 1' },
      { x: 1, y: 31.2, series: 'Patrick Mahomes', at: '2025 week 3' },
    ]);
    expect(chart.ticks).toEqual([{ x: 0, label: '2025' }]);
  });

  test('before 2025 no NFL-player view draws a chart, leaving the view’s message', () => {
    const before: QueryResult = { rows: [], notes: [{ kind: 'beforeLineups', firstSeason: 2025 }] };
    for (const view of ['totals', 'fr', 'season', 'log'] as const) {
      expect(chartOf(before, nfl({ view, seasons: [2015] }))).toBeNull();
    }
  });
});

describe('the chart of draft picks', () => {
  const picks = (patch: Partial<Query>) => q({ subject: 'pick', ...patch });
  const pick = (season: number, no: number, value: number, p = MAHOMES): PickRow => ({
    kind: 'pick', season, pick: no, round: Math.ceil(no / 12), franchise: SERP, slotFranchise: SERP, player: p, kept: false, value,
  });
  const pickGroup = (group: string | number | null, n: number, franchise = SERP): PickGroupRow => ({
    kind: 'pickGroup', franchise, group, n, dr: n, kc: 0, top: 1, value: 100,
  });

  test('the pick list opens on each pick’s value against where it went, a dot per pick coloured by position', () => {
    const rows = [pick(2025, 1, 350.5), pick(2025, 2, 120, CHASE), pick(2026, 1, 80, CHASE)];
    expect(chartOf(result(rows), picks({ view: 'list' }))).toEqual({
      mark: 'scatter',
      x: { key: 'pk', label: 'Pick' },
      y: { key: 'val', label: 'Value' },
      series: { key: 'pos', label: 'Position' },
      points: [
        { x: 1, y: 350.5, series: 'QB' },
        { x: 2, y: 120, series: 'WR' },
        { x: 1, y: 80, series: 'WR' },
      ],
      coloured: ['QB', 'WR'],
    });
  });

  test('per franchise opens on each franchise’s picks as a 100% bar split into positions, in lineup order', () => {
    const rows = [pickGroup('WR', 3), pickGroup('QB', 1), pickGroup(null, 1), pickGroup('RB', 3)];
    const chart = chartOf(result(rows), picks({ view: 'fr' }))!;
    expect(chart.mark).toBe('share');
    expect([chart.x.key, chart.y.key, chart.series?.key]).toEqual(['f', 'n', 'pos']);
    expect(chart.points.map((p) => [p.series, p.y, p.value])).toEqual([
      ['QB', 0.125, 1], ['RB', 0.375, 3], ['WR', 0.375, 3], ['Unknown', 0.125, 1],
    ]);
  });

  test('per franchise by round splits each bar into rounds, first round first', () => {
    // CATS have no first-round pick, so rounds first come out of order.
    const rows = [pickGroup(2, 1, CATS), pickGroup(10, 1, CATS), pickGroup(1, 1), pickGroup(2, 1), pickGroup(10, 2)];
    const chart = chartOf(result(rows), picks({ view: 'fr', grouping: 'round' }))!;
    expect(chart.series).toEqual({ key: 'rd', label: 'Round' });
    expect(chart.coloured).toEqual(['1', '2', '10']);
    expect(chart.points.map((p) => [p.x, p.series, p.y])).toEqual([
      ['Not Enough Cooks', '2', 0.5], ['Not Enough Cooks', '10', 0.5],
      ['SERPION', '1', 0.25], ['SERPION', '2', 0.25], ['SERPION', '10', 0.5],
    ]);
  });

  test('past 8 segments, only the first 8 get colour, and a note says the rest are grey', () => {
    const rows = Array.from({ length: 10 }, (_, i) => pickGroup(i + 1, 1));
    const chart = chartOf(result(rows), picks({ view: 'fr', grouping: 'round' }))!;
    expect(chart.coloured).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(chart.note).toBe('Only the first 8 of 10 rounds, in the legend’s order, are in colour; the rest are grey.');
  });

  test('per NFL player opens on times drafted, a bar per NFL player', () => {
    const drafted = (p: NflPlayer, n: number): PickPlayerRow => ({
      kind: 'pickPlayer', player: p, n, dr: n, kc: 0, top: { season: 2025, pick: 1 }, franchises: [SERP], value: 100,
    });
    expect(chartOf(result([drafted(CHASE, 2), drafted(MAHOMES, 1)]), picks({ view: 'pl' }))).toEqual({
      mark: 'bar',
      x: { key: 'pl', label: 'NFL player' },
      y: { key: 'n', label: 'Picks' },
      points: [
        { x: "Ja'Marr Chase", y: 2 },
        { x: 'Patrick Mahomes', y: 1 },
      ],
    });
  });

  test('before the first draft no draft-pick view draws a chart, leaving the view’s message', () => {
    const before: QueryResult = { rows: [], notes: [{ kind: 'beforeDrafts', firstSeason: 2025 }] };
    for (const view of ['list', 'fr', 'pl'] as const) {
      expect(chartOf(before, picks({ view, seasons: [2015] }))).toBeNull();
    }
  });
});
