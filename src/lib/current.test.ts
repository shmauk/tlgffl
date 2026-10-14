// The current season and its phase (#16, #35), chosen from the data and the
// date: the season being played, or between seasons the one that finished
// most recently, until the next season's week 1 (GLOSSARY.md).
import { describe, expect, test } from 'vitest';
import { currentSeason, type SeasonState } from './current';

const weeks = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const DRAFT_2026 = Date.UTC(2026, 8, 1, 18);

// 2025 finished: 14 regular weeks and three bracket weeks, all three brackets crowned.
const done2025: SeasonState = {
  season: 2025, week1: null, draftStart: null, regularWeeks: [1, 14], finalWeeks: weeks(1, 17), brackets: 3, crowned: 3,
};
const pre2026: SeasonState = {
  season: 2026, week1: '2026-09-09', draftStart: DRAFT_2026, regularWeeks: [1, 14], finalWeeks: [], brackets: 3, crowned: 0,
};

describe('the current season', () => {
  test('during the regular season: through the latest final week, the next one being played', () => {
    const s2026 = { ...pre2026, finalWeeks: weeks(1, 4) };
    expect(currentSeason([done2025, s2026], '2026-10-14')).toEqual({
      season: 2026, phase: 'regular', through: 4, playing: 5, next: null,
    });
  });

  test('between seasons it is the one that finished, with the next draft, until the next week 1', () => {
    expect(currentSeason([done2025, pre2026], '2026-09-08')).toEqual({
      season: 2025, phase: 'off-season', through: 17, playing: null, next: { season: 2026, draftStart: DRAFT_2026 },
    });
    expect(currentSeason([done2025, pre2026], '2026-09-09')).toEqual({
      season: 2026, phase: 'regular', through: null, playing: 1, next: null,
    });
  });

  test('a next season with no draft date yet says so with a null draft', () => {
    const noDraft = { ...pre2026, draftStart: null };
    expect(currentSeason([done2025, noDraft], '2026-03-01')?.next).toEqual({ season: 2026, draftStart: null });
    expect(currentSeason([done2025], '2026-03-01')?.next).toBeNull();
  });

  test('once every regular-season week is final and a bracket is still to be crowned, the brackets are on', () => {
    const brackets = { ...pre2026, finalWeeks: weeks(1, 15), crowned: 0 };
    expect(currentSeason([done2025, brackets], '2026-12-22')).toMatchObject({
      season: 2026, phase: 'brackets', through: 15, playing: 16,
    });
    // The last bracket game crowns the last bracket: the off-season starts.
    const over = { ...brackets, finalWeeks: weeks(1, 17), crowned: 3 };
    expect(currentSeason([done2025, over], '2027-01-06')).toMatchObject({ season: 2026, phase: 'off-season', playing: null });
  });

  test('a season with final games has started even if no week 1 date was recorded', () => {
    const undated = { ...pre2026, week1: null, finalWeeks: [1] };
    expect(currentSeason([done2025, undated], '2026-09-01')).toMatchObject({ season: 2026, phase: 'regular', through: 1 });
    expect(currentSeason([done2025, { ...pre2026, week1: null }], '2026-12-01')?.season).toBe(2025);
  });

  test('with no season started there is no current season', () => {
    expect(currentSeason([pre2026], '2026-08-01')).toBeNull();
  });
});
