// The playoff predictor (#36): picks of the remaining regular-season games,
// scissors-paper-rock orders and the projection they give, all held in the URL.
import { describe, expect, test } from 'vitest';
import { decodeScenario, encodeScenario, project, type PredictorData, type Scenario } from './predictor';
import { playoffPicture } from './seeding';

// Two divisions of four (A: 1-4, B: 5-8), weeks 1-4, weeks 1-2 played. A
// 3-team Playoffs, a 2-team Mediocre Bowl and a 3-team Shit Bowl.
const names = (id: number) => ({ id, name: `Franchise ${id}`, teamName: `Team ${id}` });
function fixture(): PredictorData {
  return {
    season: 2030,
    weeks: [1, 4],
    franchises: [1, 2, 3, 4, 5, 6, 7, 8].map(names),
    input: {
      franchises: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, division: id <= 4 ? 'A' : 'B' })),
      played: [
        // Week 1
        { home: 1, away: 2, winner: 1 }, { home: 3, away: 4, winner: 3 },
        { home: 5, away: 6, winner: 5 }, { home: 7, away: 8, winner: 7 },
        // Week 2
        { home: 1, away: 5, winner: 1 }, { home: 2, away: 6, winner: 6 },
        { home: 3, away: 7, winner: 7 }, { home: 4, away: 8, winner: 4 },
      ],
      remaining: [
        { week: 3, home: 1, away: 3 }, { week: 3, home: 2, away: 4 },
        { week: 3, home: 5, away: 7 }, { week: 3, home: 6, away: 8 },
        { week: 4, home: 1, away: 4 }, { week: 4, home: 2, away: 3 },
        { week: 4, home: 5, away: 8 }, { week: 4, home: 6, away: 7 },
      ],
      breakdown: { 1: 0.8, 2: 0.3, 3: 0.6, 4: 0.2, 5: 0.7, 6: 0.5, 7: 0.55, 8: 0.1 },
      brackets: { playoffs: 3, mediocre_bowl: 2, shit_bowl: 3 },
      spr: [],
    },
    marks: {},
  };
}

describe('the URL', () => {
  test('picks and scissors-paper-rock orders round-trip in a short, canonical form', () => {
    const data = fixture();
    const search = '?w4=8,2&w3=3&spr=7.3';
    const { scenario, dropped } = decodeScenario(search, data);
    expect(scenario.picks).toEqual([{ week: 3, winner: 3 }, { week: 4, winner: 2 }, { week: 4, winner: 8 }]);
    expect(scenario.spr).toEqual([[7, 3]]);
    expect(dropped).toBe(0);
    expect(encodeScenario(scenario)).toBe('w3=3&w4=2,8&spr=7.3');
    expect(decodeScenario(`?${encodeScenario(scenario)}`, data).scenario).toEqual(scenario);
  });

  test('no picks is an empty query', () => {
    const { scenario } = decodeScenario('', fixture());
    expect(encodeScenario(scenario)).toBe('');
  });

  test('picks for weeks played since the link was made are dropped and counted', () => {
    // Week 2 is now played: a link made before then still picks 6 and 4.
    const { scenario, dropped } = decodeScenario('?w2=6,4&w3=1', fixture());
    expect(scenario.picks).toEqual([{ week: 3, winner: 1 }]);
    expect(dropped).toBe(2);
  });

  test('a pick of a franchise with no game left that week, or of both sides of a game, is ignored', () => {
    const { scenario, dropped } = decodeScenario('?w3=1,3,9,x&w4=1', fixture());
    expect(scenario.picks).toEqual([{ week: 4, winner: 1 }]);
    expect(dropped).toBe(0);
  });
});

describe('the projection', () => {
  const none: Scenario = { picks: [], spr: [] };

  test('with no picks it is exactly the playoff picture', () => {
    const data = fixture();
    expect(project(data, none).places).toEqual(playoffPicture(data.input));
  });

  test('a pick adds a win or loss and head-to-head, while Breakdown stays real', () => {
    // 3 beats 1 in week 3, then 1 beats 4 and 3 beats 2 in week 4: 1 and 3 both finish 3-1, and 3
    // takes division A on head-to-head even though 1's Breakdown (0.8) is better than 3's (0.6).
    const data = fixture();
    const { scenario } = decodeScenario('?w3=3&w4=1,3', data);
    const p = project(data, scenario);
    const at = (id: number) => p.places.find((x) => x.franchise === id)!;
    expect([at(7).seed, at(3).seed, at(1).seed]).toEqual([1, 2, 3]);
    expect(at(1).bracket).toBe('playoffs');
    expect(p.records[3]).toEqual([3, 1, 0]);
    expect(p.records[1]).toEqual([3, 1, 0]);
    expect(p.records[6]).toEqual([1, 1, 0]);
    // Picked games are played; the rest still remain.
    expect(p.input.played).toHaveLength(11);
    expect(p.input.remaining).toHaveLength(5);
  });

  test('franchises level after every tiebreak but scissors-paper-rock share a slot until the visitor orders them', () => {
    // 4 (A) and 6 (B) are both 1-1 with Breakdown 0.5 and never meet: the worst wildcard
    // (Shit Bowl seed 3) is one of them, the other is the Mediocre Bowl's seed 5.
    const data = fixture();
    data.input.breakdown[6] = 0.5;
    data.input.breakdown[4] = 0.5;
    const open = project(data, none);
    expect(open.groups).toEqual([{ members: [4, 6], order: null }]);
    expect(open.brackets).toEqual([
      { bracket: 'playoffs', byes: [{ seed: 1, franchises: [1] }], pairs: [[{ seed: 2, franchises: [7] }, { seed: 3, franchises: [5] }]] },
      { bracket: 'mediocre_bowl', byes: [], pairs: [[{ seed: 4, franchises: [3] }, { seed: 5, franchises: [4, 6] }]] },
      { bracket: 'shit_bowl', byes: [{ seed: 1, franchises: [8] }], pairs: [[{ seed: 2, franchises: [2] }, { seed: 3, franchises: [4, 6] }]] },
    ]);

    // 4 wins the scissors-paper-rock, so 6 is the worse and goes to the Shit Bowl.
    const ordered = project(data, decodeScenario('?spr=4.6', data).scenario);
    expect(ordered.groups).toEqual([{ members: [4, 6], order: [4, 6] }]);
    expect(ordered.brackets[1].pairs[0][1]).toEqual({ seed: 5, franchises: [4] });
    expect(ordered.brackets[2].pairs[0][1]).toEqual({ seed: 3, franchises: [6] });
    expect(ordered.scenario.spr).toEqual([[4, 6]]);
  });

  test('an order for franchises no longer level is left out of the scenario', () => {
    const data = fixture();
    expect(project(data, decodeScenario('?spr=4.6', data).scenario).scenario.spr).toEqual([]);
  });
});
