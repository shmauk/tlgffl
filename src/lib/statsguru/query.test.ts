import { describe, expect, test } from 'vitest';
import { DEFAULT_QUERY, decodeQuery, encodeQuery, searchedSeasons, type Query } from './query';

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
    expect(decodeQuery('?f=x&ph=Q&res=Z&view=nope&sort=zz.up&wk=9&min=-3&era=myspace&size=x')).toEqual(DEFAULT_QUERY);
  });

  test('era and League size are their own parameters, written only when set', () => {
    expect(encodeQuery(q({ era: 'sleeper' }))).toBe('era=sleeper');
    expect(encodeQuery(q({ size: 16, seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018] }))).toBe('s=2012-2018&size=16');
    expect(encodeQuery(q({ era: 'nfl.com', size: 12 }))).toBe('era=nfl.com&size=12');
    for (const search of ['era=nfl.com', 'era=sleeper', 'size=10', 's=2012-2018&size=16', 'era=nfl.com&size=12'])
      expect(encodeQuery(decodeQuery(search)), search).toBe(search);
  });
});

describe('the seasons a query searches', () => {
  const SEASONS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
    year,
    era: year < 2025 ? 'nfl.com' : 'sleeper',
    size: year === 2012 ? 10 : year < 2015 ? 12 : 16,
  }));

  test('the from/to range, era and League size narrow each other', () => {
    expect(searchedSeasons(q({}), SEASONS)).toEqual(SEASONS.map((s) => s.year));
    expect(searchedSeasons(q({ size: 12 }), SEASONS)).toEqual([2013, 2014]);
    expect(searchedSeasons(q({ size: 16, seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018] }), SEASONS)).toEqual([2015, 2016, 2017, 2018]);
    expect(searchedSeasons(q({ era: 'sleeper', size: 16 }), SEASONS)).toEqual([2025, 2026]);
  });

  test('a combination with no seasons searches none', () => {
    expect(searchedSeasons(q({ era: 'sleeper', size: 10 }), SEASONS)).toEqual([]);
    expect(searchedSeasons(q({ size: 16, seasons: [2012, 2013] }), SEASONS)).toEqual([]);
  });

  test('a League size link covers seasons played after it was made', () => {
    const later = [...SEASONS, { year: 2027, era: 'sleeper', size: 16 }];
    expect(searchedSeasons(decodeQuery('size=16'), later)).toContain(2027);
    expect(searchedSeasons(decodeQuery('era=sleeper'), later)).toEqual([2025, 2026, 2027]);
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

describe('the draft-picks subject (#37)', () => {
  test('opens on the pick list', () => {
    const query = decodeQuery('sub=pick');
    expect(query).toEqual(q({ subject: 'pick', view: 'list' }));
    expect(encodeQuery(query)).toBe('sub=pick');
    // A link built from the defaults still means the pick list.
    expect(encodeQuery(q({ subject: 'pick' }))).toBe('sub=pick');
  });

  test('every filter and view round-trips, written in the same order', () => {
    const search = 'sub=pick&p=4046&f=2,5&fby=slot&s=2025-2026&rd=1-3&pk=1-16&pos=QB,WR&kd=kept&view=fr&by=round&sort=n.desc';
    const query = decodeQuery(search);
    expect(query).toEqual(
      q({
        subject: 'pick',
        players: ['4046'],
        franchises: [2, 5],
        franchiseAs: 'slot',
        seasons: [2025, 2026],
        rounds: [1, 3],
        picks: [1, 16],
        positions: ['QB', 'WR'],
        kept: 'kept',
        view: 'fr',
        grouping: 'round',
        sort: { key: 'n', dir: 'desc' },
      }),
    );
    expect(encodeQuery(query)).toBe(search);
    for (const view of ['list', 'fr', 'pl'] as const)
      expect(decodeQuery(encodeQuery(q({ subject: 'pick', view }))).view).toBe(view);
    expect(decodeQuery('sub=pick&kd=drafted').kept).toBe('drafted');
  });

  test('per franchise groups by position unless told to group by round', () => {
    expect(encodeQuery(q({ subject: 'pick', view: 'fr' }))).toBe('sub=pick&view=fr');
    expect(decodeQuery('sub=pick&view=fr').grouping).toBe('pos');
  });

  test("game filters and the other subjects' filters mean nothing to draft picks", () => {
    expect(decodeQuery('sub=pick&opp=9&ph=P&wk=1-3&res=W&act=1&lu=start&min=3&view=totals')).toEqual(
      q({ subject: 'pick', view: 'list' }),
    );
    expect(decodeQuery('rd=1-2&pk=3-4&kd=kept&fby=slot')).toEqual(DEFAULT_QUERY);
  });
});
