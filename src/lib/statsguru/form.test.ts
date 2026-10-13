import { describe, expect, test } from 'vitest';
import { formValues, queryFromForm, type FormContext } from './form';
import { DEFAULT_QUERY, decodeQuery, type Query } from './query';

const CTX: FormContext = {
  seasons: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) => ({
    year,
    era: year < 2025 ? 'nfl.com' : 'sleeper',
  })),
  lastWeek: 17,
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
    ]) {
      const q = decodeQuery(search);
      expect(queryFromForm(formValues(q, CTX), CTX), search).toEqual(q);
    }
  });

  test('an era narrows the season span', () => {
    expect(queryFromForm(fields({ era: ['sleeper'] }), CTX).seasons).toEqual([2025, 2026]);
    expect(queryFromForm(fields({ from: ['2020'], era: ['nfl.com'] }), CTX).seasons).toEqual([2020, 2021, 2022, 2023, 2024]);
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
});
