// The brackets as Swiss-style columns (#16, #35): one column a week, round by
// round, filled game by game. Pairings still to play show with no score.
import { describe, expect, test } from 'vitest';
import { bracketColumns, type BracketSpec, type PlayedGame } from './bracket-columns';
import type { Place } from './seeding';

const place = (franchise: number, bracket: Place['bracket'], seed: number): Place => ({
  franchise, bracket, seed, shared: false, level: [],
});
// A 3-team Playoffs (1 byes), a 3-team Shit Bowl (3 byes) and a best-of-three Mediocre Bowl.
const places = [
  place(1, 'playoffs', 1), place(2, 'playoffs', 2), place(3, 'playoffs', 3),
  place(4, 'mediocre_bowl', 4), place(5, 'mediocre_bowl', 5),
  place(6, 'shit_bowl', 3), place(7, 'shit_bowl', 2), place(8, 'shit_bowl', 1),
];
const PLAYOFFS: BracketSpec = { bracket: 'playoffs', firstWeek: 15, lastWeek: 16, series: null };
const SHIT: BracketSpec = { bracket: 'shit_bowl', firstWeek: 15, lastWeek: 16, series: null };
const MEDIOCRE: BracketSpec = { bracket: 'mediocre_bowl', firstWeek: 15, lastWeek: 17, series: 'best of three' };
const game = (bracket: PlayedGame['bracket'], week: number, round: number, home: number, hp: number, away: number, ap: number): PlayedGame => ({
  bracket, week, round, home, away, homePoints: hp, awayPoints: ap, winner: hp > ap ? home : ap > hp ? away : null,
});

describe('a bracket’s columns', () => {
  test('one column a week, named by round, with seeds, scores, winners and round-one byes', () => {
    const columns = bracketColumns(PLAYOFFS, places, [game('playoffs', 15, 1, 2, 110, 3, 100)], [
      { week: 16, home: 1, away: 2, bracket: 'playoffs', round: 2 },
    ]);
    expect(columns).toEqual([
      {
        week: 15, title: 'Semi-finals',
        games: [{ home: { id: 2, seed: 2 }, away: { id: 3, seed: 3 }, homePoints: 110, awayPoints: 100, winner: 2 }],
        byes: [{ id: 1, seed: 1 }],
      },
      {
        week: 16, title: 'Final',
        games: [{ home: { id: 1, seed: 1 }, away: { id: 2, seed: 2 }, homePoints: null, awayPoints: null, winner: null }],
        byes: [],
      },
    ]);
  });

  test('a series is numbered by game; a week not yet drawn is an empty column', () => {
    const columns = bracketColumns(MEDIOCRE, places, [game('mediocre_bowl', 15, 1, 4, 100, 5, 95)], []);
    expect(columns.map((c) => [c.title, c.games.length, c.byes.length])).toEqual([
      ['Game 1', 1, 0], ['Game 2', 0, 0], ['Game 3', 0, 0],
    ]);
  });

  test('before round one is drawn nobody is listed as on a bye', () => {
    expect(bracketColumns(SHIT, places, [], [])[0].byes).toEqual([]);
  });
});
