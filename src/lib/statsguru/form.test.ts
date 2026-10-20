import { describe, expect, test } from 'vitest';
import { formValues, queryFromForm, type FormContext } from './form';
import { leagueSizes } from '../season-sets';
import { DEFAULT_QUERY, decodeQuery, type Query } from './query';

const CTX: FormContext = {
  seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
    year,
    era: year < 2025 ? 'nfl.com' : 'sleeper',
    size: year === 2012 ? 10 : year < 2015 ? 12 : 16,
  })),
  lastWeek: 17,
  lastRound: 14,
  lastPick: 224,
};
const fields = (patch: Record<string, string[]>) => ({ ...formValues(DEFAULT_QUERY, CTX), ...patch });

describe('the query form', () => {
  test('an untouched form is the default query', () => {
    expect(queryFromForm(formValues(DEFAULT_QUERY, CTX), CTX)).toEqual(DEFAULT_QUERY);
  });

  test('every query the URL can hold survives the form', () => {
    for (const search of [
      'f=5&s=2015-2021&ph=R,P&wk=1-9&res=W&view=season&sort=pct.desc',
      'f=2,5&opp=9&act=1&min=10&view=opp',
      's=2025-2026&ph=C&view=phase&sort=gp.asc',
      'view=games&wk=3-3',
      'view=pos&by=slot&s=2025&sort=ppg.desc',
      'sub=player',
      'sub=player&p=4046,LV&f=2,5&opp=9&s=2025-2026&pos=QB,WR&lu=start&ph=R,P&wk=1-9&min=3&view=fr&sort=best.desc',
      'sub=player&lu=bench&view=log',
      'sub=pick',
      'sub=pick&p=4046&f=2,5&fby=slot&s=2025-2026&rd=1-3&pk=1-16&pos=QB,WR&kd=kept&view=fr&by=round&sort=n.desc',
      'sub=pick&kd=drafted&view=pl',
      'era=sleeper',
      's=2012-2018&size=16',
      'era=nfl.com&size=12&view=season',
    ]) {
      const q = decodeQuery(search);
      expect(queryFromForm(formValues(q, CTX), CTX), search).toEqual(q);
    }
  });

  test('era and League size are kept as chosen, not as their seasons, and the span narrows them', () => {
    expect(queryFromForm(fields({ era: ['sleeper'] }), CTX)).toMatchObject({ era: 'sleeper', size: null, seasons: [] });
    expect(queryFromForm(fields({ size: ['16'] }), CTX)).toMatchObject({ era: null, size: 16, seasons: [] });
    expect(queryFromForm(fields({ from: ['2012'], to: ['2018'], size: ['16'] }), CTX)).toMatchObject({
      size: 16,
      seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018],
    });
  });

  test('a link with an era and League size opens with them chosen', () => {
    expect(formValues(decodeQuery('era=nfl.com&size=12'), CTX)).toMatchObject({ era: ['nfl.com'], size: ['12'] });
    expect(formValues(DEFAULT_QUERY, CTX)).toMatchObject({ era: [''], size: [''] });
  });

  test('a span written backwards is turned round, and every week is no week filter', () => {
    const q: Query = queryFromForm(fields({ from: ['2016'], to: ['2014'], wkFrom: ['1'], wkTo: ['17'] }), CTX);
    expect(q.seasons).toEqual([2014, 2015, 2016]);
    expect(q.weeks).toBeNull();
  });

  test('no phase ticked counts the regular season, and a sort the view lacks falls back to its own', () => {
    expect(queryFromForm(fields({ ph: [] }), CTX).phases).toEqual(['R']);
    expect(queryFromForm(fields({ view: ['totals'], sort: ['mar'], dir: ['asc'] }), CTX).sort).toBeNull();
  });

  test("each subject keeps to its own filters and views", () => {
    const player = queryFromForm(fields({ subject: ['player'], res: ['W'], act: ['on'], view: ['opp'], pview: ['season'] }), CTX);
    expect(player).toMatchObject({ subject: 'player', result: null, active: false, view: 'season' });
    const franchise = queryFromForm(fields({ p: ['4046'], pos: ['QB'], lu: ['start'], view: ['pos'], by: ['slot'] }), CTX);
    expect(franchise).toMatchObject({ subject: 'franchise', players: [], positions: [], lineup: null, view: 'pos', grouping: 'slot' });
    const pick = queryFromForm(fields({ subject: ['pick'], opp: ['9'], res: ['W'], lu: ['start'], kview: ['pl'], rdFrom: ['2'] }), CTX);
    expect(pick).toMatchObject({ subject: 'pick', opponents: [], result: null, lineup: null, view: 'pl', rounds: [2, 14] });
    const notPick = queryFromForm(fields({ rdFrom: ['2'], kd: ['kept'], fby: ['slot'] }), CTX);
    expect(notPick).toMatchObject({ subject: 'franchise', rounds: null, kept: null, franchiseAs: 'pick' });
  });
});

describe('the League size choice', () => {
  test('names each size with its seasons, the current size open-ended', () => {
    expect(leagueSizes(CTX.seasons)).toEqual([
      { size: 10, label: '10 teams (2012)' },
      { size: 12, label: '12 teams (2013–14)' },
      { size: 16, label: '16 teams (2015 on)' },
    ]);
  });
});
