import { describe, expect, test } from 'vitest';
import { formatSummary, weekList } from './format';

describe('a season format summary', () => {
  test('a one-division season with two brackets', () => {
    expect(
      formatSummary({
        season: 2012,
        teams: 10,
        divisions: 1,
        regularSeason: [1, 14],
        brackets: [
          { bracket: 'playoffs', size: 4, firstWeek: 15, lastWeek: 16, series: null },
          { bracket: 'shit_bowl', size: 4, firstWeek: 15, lastWeek: 16, series: null },
        ],
      }),
    ).toEqual(['10 teams in one division', 'Regular season weeks 1–14', 'Playoffs: top 4, weeks 15–16', 'Shit Bowl: bottom 4, weeks 15–16']);
  });

  test('the Mediocre Bowl takes the middle, and a series says how it is won', () => {
    expect(
      formatSummary({
        season: 2026,
        teams: 16,
        divisions: 4,
        regularSeason: [1, 14],
        brackets: [
          { bracket: 'mediocre_bowl', size: 2, firstWeek: 15, lastWeek: 17, series: 'best of three' },
          { bracket: 'shit_bowl', size: 7, firstWeek: 15, lastWeek: 17, series: null },
          { bracket: 'playoffs', size: 7, firstWeek: 15, lastWeek: 17, series: null },
        ],
      }),
    ).toEqual([
      '16 teams in 4 divisions',
      'Regular season weeks 1–14',
      'Playoffs: top 7, weeks 15–17',
      'Shit Bowl: bottom 7, weeks 15–17',
      'Mediocre Bowl: middle 2, best of three, weeks 15–17',
    ]);
  });
});

describe('a list of weeks in words', () => {
  test('one week, a run of weeks, and runs with gaps', () => {
    expect(weekList([3])).toBe('week 3');
    expect(weekList([10, 11, 12, 13, 14])).toBe('weeks 10–14');
    expect(weekList([1, 2, 5, 7, 8])).toBe('weeks 1–2, 5 and 7–8');
  });
});
