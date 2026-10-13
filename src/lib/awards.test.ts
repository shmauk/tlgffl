import { describe, expect, test } from 'vitest';
import { awardValue, seasonRuns } from './awards';

describe('an award value reads in its unit', () => {
  test('points to two places, counts whole, shares as a percentage, bids in dollars', () => {
    expect(awardValue('points', 19.8857)).toBe('19.89');
    expect(awardValue('count', 7)).toBe('7');
    expect(awardValue('share', 0.2403)).toBe('24.0%');
    expect(awardValue('dollars', 22)).toBe('$22');
  });
});

describe('seasons as runs', () => {
  test('consecutive seasons join, gaps split', () => {
    expect(seasonRuns([2025, 2012, 2013, 2014, 2021, 2020])).toBe('2012–2014, 2020–2021, 2025');
    expect(seasonRuns([2025])).toBe('2025');
    expect(seasonRuns([])).toBe('');
  });
});
