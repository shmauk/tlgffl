import { describe, expect, test } from 'vitest';
import { DEFAULT_QUERY, decodeQuery, encodeQuery, type Query } from './query';

const q = (patch: Partial<Query>): Query => ({ ...DEFAULT_QUERY, ...patch });

describe('a Statsguru query in the URL', () => {
  test('the default query writes nothing', () => {
    expect(encodeQuery(DEFAULT_QUERY)).toBe('');
    expect(decodeQuery('')).toEqual(DEFAULT_QUERY);
  });

  test("the ticket's example round-trips, written in the same order", () => {
    const search = '?f=5&s=2015-2021&ph=R,P&wk=1-9&res=W&view=season&sort=pct.desc';
    const query = decodeQuery(search);
    expect(query).toEqual(
      q({
        franchises: [5],
        seasons: [2015, 2016, 2017, 2018, 2019, 2020, 2021],
        phases: ['R', 'P'],
        weeks: [1, 9],
        result: 'W',
        view: 'season',
        sort: { key: 'pct', dir: 'desc' },
      }),
    );
    expect(encodeQuery(query)).toBe(search.slice(1));
  });

  test('consecutive seasons are written as a range, the rest as a comma list', () => {
    expect(encodeQuery(q({ seasons: [2016, 2012, 2013, 2014, 2025] }))).toBe('s=2012-2014,2016,2025');
    expect(decodeQuery('s=2012-2014,2016,2025').seasons).toEqual([2012, 2013, 2014, 2016, 2025]);
    expect(encodeQuery(q({ seasons: [2025] }))).toBe('s=2025');
  });

  test('opposition, active franchises only and minimum games round-trip', () => {
    const query = q({ franchises: [5, 2], opponents: [9], active: true, minGames: 10, view: 'opp' });
    expect(encodeQuery(query)).toBe('f=2,5&opp=9&act=1&min=10&view=opp');
    expect(decodeQuery(encodeQuery(query))).toEqual({ ...query, franchises: [2, 5] });
  });

  test('every phase, view and result round-trips', () => {
    for (const phases of [['R'], ['P'], ['C'], ['R', 'C'], ['R', 'P', 'C']] as Query['phases'][])
      expect(decodeQuery(encodeQuery(q({ phases }))).phases).toEqual(phases);
    for (const view of ['totals', 'season', 'opp', 'phase', 'games'] as const)
      expect(decodeQuery(encodeQuery(q({ view }))).view).toBe(view);
    for (const result of ['W', 'L', 'T'] as const) expect(decodeQuery(encodeQuery(q({ result }))).result).toBe(result);
  });

  test("a view's own default sort isn't written", () => {
    expect(encodeQuery(q({ sort: { key: 'pct', dir: 'desc' } }))).toBe('');
    expect(encodeQuery(q({ view: 'games', sort: { key: 'pf', dir: 'asc' } }))).toBe('view=games&sort=pf.asc');
  });

  test('nonsense in the URL falls back to the defaults', () => {
    expect(decodeQuery('?f=x&ph=Q&res=Z&view=nope&sort=zz.up&wk=9&min=-3')).toEqual(DEFAULT_QUERY);
  });
});

describe('the by-position view', () => {
  test('groups by NFL player position unless told to group by lineup slot', () => {
    expect(encodeQuery(q({ view: 'pos' }))).toBe('view=pos');
    expect(decodeQuery('view=pos').grouping).toBe('pos');
    const bySlot = q({ view: 'pos', grouping: 'slot', sort: { key: 'ppg', dir: 'desc' } });
    expect(encodeQuery(bySlot)).toBe('view=pos&by=slot&sort=ppg.desc');
    expect(decodeQuery(encodeQuery(bySlot))).toEqual(bySlot);
  });

  test('a grouping means nothing outside the view', () => {
    expect(encodeQuery(q({ grouping: 'slot' }))).toBe('');
    expect(decodeQuery('by=slot').grouping).toBe('pos');
  });
});

describe('the NFL-player subject', () => {
  test("an NFL player's own link", () => {
    const query = decodeQuery('?sub=player&p=4046');
    expect(query).toEqual(q({ subject: 'player', players: ['4046'] }));
    expect(encodeQuery(query)).toBe('sub=player&p=4046');
  });

  test('every filter and view round-trips, written in the same order', () => {
    const search = 'sub=player&p=4046,LV&f=2,5&opp=9&s=2025-2026&pos=QB,WR&lu=start&ph=R,P&wk=1-9&min=3&view=fr&sort=best.desc';
    const query = decodeQuery(search);
    expect(query).toEqual(
      q({
        subject: 'player',
        players: ['4046', 'LV'],
        franchises: [2, 5],
        opponents: [9],
        seasons: [2025, 2026],
        positions: ['QB', 'WR'],
        lineup: 'start',
        phases: ['R', 'P'],
        weeks: [1, 9],
        minGames: 3,
        view: 'fr',
        sort: { key: 'best', dir: 'desc' },
      }),
    );
    expect(encodeQuery(query)).toBe(search);
    for (const view of ['totals', 'fr', 'season', 'log'] as const)
      expect(decodeQuery(encodeQuery(q({ subject: 'player', view }))).view).toBe(view);
    expect(decodeQuery('sub=player&lu=bench').lineup).toBe('bench');
  });

  test("positions are written in the lineup's order", () => {
    expect(encodeQuery(q({ subject: 'player', positions: ['DEF', 'K', 'QB', 'TE'] }))).toBe('sub=player&pos=QB,TE,K,DEF');
  });

  test("a franchise view, or a franchise filter the subject lacks, isn't an NFL-player query's", () => {
    expect(decodeQuery('sub=player&view=opp&res=W&act=1')).toEqual(q({ subject: 'player' }));
    expect(decodeQuery('sub=player&sort=pct.desc').sort).toBeNull();
  });

  test('NFL-player filters mean nothing to the franchise subject', () => {
    expect(decodeQuery('p=4046&pos=QB&lu=start&view=log')).toEqual(DEFAULT_QUERY);
    expect(encodeQuery(q({ players: ['4046'], positions: ['QB'], lineup: 'start' }))).toBe('');
  });
});
