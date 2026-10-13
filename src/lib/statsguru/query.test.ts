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
