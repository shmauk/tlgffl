// The home page's data (#35) in each of its phases, from the scenario
// databases the real Python build makes (tests/scenarios.py, which describes
// the season). Every expected value is worked by hand from that description:
// the lower id always wins, roster r scores 130 - 10r + week, and the
// regular season is weeks 1-5. site-tests/home.test.mjs checks the real site.
import { describe, expect, inject, test } from 'vitest';
import { open } from './database';
import { homeData } from './home-db';

const team = (id: number) => ({ id, name: `Team ${id}`, teamName: `Team ${id}` });
const ALL = [1, 2, 3, 4, 5, 6].map(team);
const highestScore = (figure: string) => ({
  record: { slug: 'highest-score', name: 'Highest score' }, rank: 1, franchises: [{ id: 1, name: 'Team 1' }], figure,
});
// After week 5 (the whole regular season): 1 and 6 average a 30-point margin, 2 and 5 22, 3 and 4
// 18; every franchise's scores are 1-5 above its own base (standard deviation 1.58); 4 averaged
// 92.67 in its three losses (weeks 1, 3, 4), and 3 averaged 103 in its three wins (weeks 1, 3, 5).
// Nobody made a move.
const SEASON_AWARDS = [
  { award: { slug: 'nail-biter', name: 'Nail Biter' }, franchises: [team(3), team(4)], value: '18.00', measure: 'Average margin (points)' },
  { award: { slug: 'standard-deviation', name: 'Standard Deviation' }, franchises: ALL, value: '1.58', measure: 'Spread of scores (points)' },
  { award: { slug: 'heartbreaker', name: 'Heartbreaker' }, franchises: [team(4)], value: '92.67', measure: 'Average score in losses (points)' },
  { award: { slug: 'lucky-duck', name: 'Lucky Duck' }, franchises: [team(3)], value: '103.00', measure: 'Average score in wins (points)' },
  { award: { slug: 'pick-a-lane', name: 'Pick a Lane' }, franchises: ALL, value: '0', measure: 'Adds plus trades' },
];

describe('the regular season, week 3 final and week 4 being played', () => {
  const data = homeData(open(inject('scenarios').regular))!;

  test('is 2025’s regular season, through week 3', () => {
    expect(data).toMatchObject({ season: 2025, phase: 'regular', through: 3, playing: 4, updated: 'Updated 24 September 2025' });
  });

  test('has neither this week’s games nor last week’s results: Sleeper shows those (#53)', () => {
    expect(data).not.toHaveProperty('thisWeek');
    expect(data).not.toHaveProperty('lastWeek');
  });

  test('the playoff picture seeds the table and marks who is sure of a bracket', () => {
    // 3-0, 3-0, 2-1, 1-2, 0-3, 0-3. Division winners 1 (Group A) and 2 (Group B), split on
    // Breakdown; 5 and 6 likewise. Each division's loser is in the Shit Bowl and everyone else
    // in the Playoffs. With two weeks left, Group A's loser can only be 5: 3 can do no worse
    // than 2-3, 5 no better, and 3 beat 5. In Group B, 4 or 6 could still finish last.
    const line = (id: number, bracket: string, seed: number, wins: number, breakdown: number, marks: string[]) =>
      ({ franchise: team(id), bracket, seed, shared: false, wins, losses: 3 - wins, ties: 0, breakdown, marks });
    expect(data.picture).toEqual([
      line(1, 'playoffs', 1, 3, 1, ['PLAYOFFS']),
      line(2, 'playoffs', 2, 3, 0.8, ['PLAYOFFS']),
      line(3, 'playoffs', 3, 2, 0.6, ['PLAYOFFS']),
      line(4, 'playoffs', 4, 1, 0.4, []),
      line(5, 'shit_bowl', 2, 0, 0.2, ['SHIT BOWL']),
      line(6, 'shit_bowl', 1, 0, 0, []),
    ]);
  });

  test('award lines are the leaders so far', () => {
    // After week 3: 3 has the smallest average margin (10, 10, 20); everyone's scores are 1, 2 and 3
    // above their base; 5 and 6 are the only ones with three losses, and 1 and 2 with three wins.
    expect(data.awards).toEqual([
      { award: { slug: 'nail-biter', name: 'Nail Biter' }, franchises: [team(3)], value: '13.33', measure: 'Average margin (points)' },
      { award: { slug: 'standard-deviation', name: 'Standard Deviation' }, franchises: ALL, value: '1.00', measure: 'Spread of scores (points)' },
      { award: { slug: 'heartbreaker', name: 'Heartbreaker' }, franchises: [team(5)], value: '82.00', measure: 'Average score in losses (points)' },
      { award: { slug: 'lucky-duck', name: 'Lucky Duck' }, franchises: [team(2)], value: '112.00', measure: 'Average score in wins (points)' },
      { award: { slug: 'pick-a-lane', name: 'Pick a Lane' }, franchises: ALL, value: '0', measure: 'Adds plus trades' },
    ]);
  });

  test('records set this season include the highest score', () => {
    expect(data.records).toContainEqual(highestScore('123.00'));
  });

  test('has no brackets or honours yet, and links the predictor', () => {
    expect(data).toMatchObject({ brackets: [], honours: null, next: null, predictor: '/seasons/2025/predictor/' });
  });
});

describe('the brackets, week 6 final and week 7 being played', () => {
  const data = homeData(open(inject('scenarios').brackets))!;
  const side = (id: number, seed: number) => ({ id, seed });

  test('is 2025’s brackets, through week 6', () => {
    expect(data).toMatchObject({ season: 2025, phase: 'brackets', through: 6, playing: 7, updated: 'Updated 15 October 2025' });
  });

  test('has neither this week’s games nor last week’s results', () => {
    expect(data).not.toHaveProperty('thisWeek');
    expect(data).not.toHaveProperty('lastWeek');
  });

  // The Playoffs final, week 7, is being played; filler is left out.
  test('each bracket’s columns name its rounds from the format, not the rounds played so far', () => {
    expect(data.brackets).toEqual([
      {
        key: 'playoffs',
        columns: [
          {
            week: 6, title: 'Semi-finals', byes: [],
            games: [
              { home: side(1, 1), away: side(4, 4), homePoints: 126, awayPoints: 96, winner: 1 },
              { home: side(2, 2), away: side(3, 3), homePoints: 116, awayPoints: 106, winner: 2 },
            ],
          },
          {
            week: 7, title: 'Final', byes: [],
            games: [{ home: side(1, 1), away: side(2, 2), homePoints: null, awayPoints: null, winner: null }],
          },
        ],
        winner: null,
      },
      {
        key: 'shit_bowl',
        columns: [
          {
            week: 6, title: 'Final', byes: [],
            games: [{ home: side(5, 2), away: side(6, 1), homePoints: 86, awayPoints: 76, winner: 5 }],
          },
        ],
        // The Shit Bowl's loser is crowned.
        winner: team(6),
      },
    ]);
  });

  test('award lines are the season’s winners', () => {
    expect(data.awards).toEqual(SEASON_AWARDS);
  });

  test('records set this season include the highest score', () => {
    expect(data.records).toContainEqual(highestScore('126.00'));
  });

  test('has no playoff picture, honours or predictor', () => {
    expect(data).toMatchObject({ picture: null, honours: null, next: null, predictor: null });
  });
});

describe('the off-season, before 2026’s week 1', () => {
  const data = homeData(open(inject('scenarios')['off-season']))!;

  test('is still 2025, through its last week, with nothing being played', () => {
    expect(data).toMatchObject({ season: 2025, phase: 'off-season', through: 7, playing: null, updated: 'Updated 1 August 2026' });
  });

  test('has neither this week’s games nor last week’s results', () => {
    expect(data).not.toHaveProperty('thisWeek');
    expect(data).not.toHaveProperty('lastWeek');
  });

  test('honours who each bracket crowned', () => {
    expect(data.honours).toEqual({ playoffs: team(1), shit_bowl: team(6), mediocre_bowl: null });
  });

  test('names next season and its draft', () => {
    expect(data.next).toEqual({ season: 2026, draft: '1 September 2026' });
  });

  test('award lines are the season’s winners', () => {
    expect(data.awards).toEqual(SEASON_AWARDS);
  });

  test('records set this season include the highest score', () => {
    expect(data.records).toContainEqual(highestScore('127.00'));
  });

  test('has no playoff picture, brackets or predictor', () => {
    expect(data).toMatchObject({ picture: null, brackets: [], predictor: null });
  });
});
