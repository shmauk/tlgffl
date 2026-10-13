// The seeding and clinch module (ADR 0005, #34): playoffs.md's seeding and
// tiebreaks, the playoff picture, clinch marks and the seed check.
import { describe, expect, test } from 'vitest';
import { playoffPicture, type SeedingInput } from './seeding';

// Two divisions of four (A: 1-4, B: 5-8), a 3-team Playoffs (2 division
// winners and 1 wildcard), a 2-team Mediocre Bowl and a 3-team Shit Bowl.
const SMALL = { playoffs: 3, mediocre_bowl: 2, shit_bowl: 3 };
const twoDivisions = () => [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id, division: id <= 4 ? 'A' : 'B' }));

/**
 * Results as [winner, loser] pairs. Franchise 0 is a filler opponent: it
 * gives a franchise a win or a loss without meeting anyone in the league.
 */
function league(results: [number, number][], extra: Partial<SeedingInput> = {}): SeedingInput {
  return {
    franchises: twoDivisions(),
    played: results.map(([w, l]) => ({ home: w, away: l, winner: w })),
    remaining: [],
    breakdown: {},
    brackets: SMALL,
    ...extra,
  };
}

const seeds = (input: SeedingInput) =>
  playoffPicture(input).map((p) => `${p.bracket}:${p.seed}${p.shared ? '=' : ''}:${p.franchise}`);

const at = (input: SeedingInput, id: number) => {
  const p = playoffPicture(input).find((x) => x.franchise === id)!;
  return `${p.bracket}:${p.seed}${p.shared ? '=' : ''}`;
};

describe('seeding', () => {
  test('division winners take the top seeds, then wildcards; the bottom of each division goes to the Shit Bowl', () => {
    const input = league([
      [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
      [5, 6], [5, 7], [5, 8], [6, 7], [6, 8], [7, 8],
      [1, 5], [6, 2], [2, 7], [3, 8], [4, 7],
    ]);
    // 1: 4-0, 2: 3-2, 3: 2-2, 4: 1-3, 5: 3-1, 6: 3-1, 7: 1-4, 8: 0-4. B's winner is 5 (beat 6).
    // Wildcard: the best of 2, 3, 6 and 7 (4 and 8 are division losers): 6. Shit Bowl: the losers
    // worst first, 8 then 4, and the worst of the rest, 7. The Mediocre Bowl is numbered on from the Playoffs.
    expect(seeds(input)).toEqual([
      'playoffs:1:1', 'playoffs:2:5', 'playoffs:3:6',
      'mediocre_bowl:4:2', 'mediocre_bowl:5:3',
      'shit_bowl:3:7', 'shit_bowl:2:4', 'shit_bowl:1:8',
    ]);
  });

  test('two clubs in a division: head-to-head first', () => {
    // 1 and 2 both 1-1; 2 beat 1.
    const input = league([[2, 1], [1, 0], [0, 2]]);
    expect(at(input, 2)).toBe('playoffs:1');
    expect(at(input, 1)).toBe('playoffs:3');
  });

  test('two clubs in a division, head-to-head split: divisional record, then Breakdown', () => {
    // 1 and 2 both 2-2 and split their games; 1 beat 3 and 2 lost to 3.
    const byDivision = league([[1, 2], [2, 1], [1, 3], [3, 2], [2, 0], [0, 1]]);
    expect(at(byDivision, 1)).toBe('playoffs:1');
    // Both beat 3 as well, so only Breakdown separates them.
    const byBreakdown = league([[1, 2], [2, 1], [1, 3], [2, 3]], { breakdown: { 1: 0.4, 2: 0.6 } });
    expect(at(byBreakdown, 2)).toBe('playoffs:1');
  });

  test('three clubs in a division: divisional record; once one is out in front, the other two start again', () => {
    // 1, 2 and 3 are all 2-1. Divisional records: 3 1-0, 1 2-1, 2 1-1, so 3 wins the division. Then
    // 1 and 2 are two clubs again, and 2 beat 1 head-to-head, so 2 takes the wildcard.
    const input = league([
      [2, 1], [1, 4], [1, 4], [3, 2], [2, 0], [3, 0], [0, 3],
      [5, 0], [5, 0], [5, 0], [6, 0], [0, 6], [0, 7], [0, 8], [0, 8],
    ]);
    expect(at(input, 3)).toBe('playoffs:2');
    expect(at(input, 2)).toBe('playoffs:3');
    expect(at(input, 1)).toBe('mediocre_bowl:4');
  });

  test('two clubs from different divisions: head-to-head if they met, else Breakdown', () => {
    // Division winners 1 and 5 are both 2-1, and 5 beat 1, whatever their Breakdown.
    const met = league([[1, 0], [1, 0], [5, 0], [0, 5], [5, 1]], { breakdown: { 1: 0.9, 5: 0.1 } });
    expect(at(met, 5)).toBe('playoffs:1');
    expect(at(met, 1)).toBe('playoffs:2');
    const apart = league([[1, 0], [5, 0]], { breakdown: { 1: 0.9, 5: 0.1 } });
    expect(at(apart, 1)).toBe('playoffs:1');
  });

  test('three or more clubs from different divisions: Breakdown, then the last two start again', () => {
    // 2, 6 and 7 are 1-1 in the wildcard race. Breakdown puts 7 first; then 2 and 6 are two clubs
    // again, and 6 beat 2, though 2's Breakdown is better.
    const input = league(
      [[1, 0], [1, 0], [5, 0], [5, 0], [6, 2], [0, 6], [2, 0], [7, 0], [0, 7]],
      { breakdown: { 2: 0.8, 6: 0.2, 7: 0.9 } },
    );
    expect(at(input, 7)).toBe('playoffs:3');
    expect(at(input, 6)).toBe('mediocre_bowl:4');
    expect(at(input, 2)).toBe('mediocre_bowl:5');
  });

  test('the Shit Bowl turns every tiebreak round: the worse value takes the worse seed', () => {
    // Division losers 4 and 8 are both 0-1 and never met; 4 has the worse Breakdown, so 4 is the worst.
    const input = league([[1, 4], [5, 8], [2, 0], [3, 0], [6, 0], [7, 0]], { breakdown: { 4: 0.1, 8: 0.2 } });
    expect(at(input, 4)).toBe('shit_bowl:1');
    expect(at(input, 8)).toBe('shit_bowl:2');
  });

  // 6 and 7 are both 2-1 against fillers with nothing to separate them; 2, at 2-1 too, has the best
  // Breakdown and takes the wildcard. 3 is the worst of the rest, so 6 and 7 are the Mediocre Bowl.
  const levelPair: [number, number][] = [
    [1, 0], [1, 0], [1, 0], [2, 0], [2, 0], [0, 2], [3, 0], [0, 3], [0, 3], [0, 4], [0, 4], [0, 4],
    [5, 0], [5, 0], [5, 0], [6, 0], [6, 0], [0, 6], [7, 0], [7, 0], [0, 7], [0, 8], [0, 8], [0, 8],
  ];
  const breakdown = { 2: 0.9, 4: 0.1, 8: 0.2 };

  test('clubs level after every tiebreak but scissors-paper-rock share a seed', () => {
    const input = league(levelPair, { breakdown });
    expect(at(input, 6)).toBe('mediocre_bowl:4=');
    expect(at(input, 7)).toBe('mediocre_bowl:4=');
    expect(playoffPicture(input).find((p) => p.franchise === 6)!.level).toEqual([7]);
    expect(at(input, 3)).toBe('shit_bowl:3');
  });

  test('a scissors-paper-rock ruling orders the clubs it names', () => {
    const input = league(levelPair, { breakdown, spr: [[7, 6]] });
    expect(at(input, 7)).toBe('mediocre_bowl:4');
    expect(at(input, 6)).toBe('mediocre_bowl:5');
  });
});

describe('the 2026 format', () => {
  test('4 division winners take seeds 1-4, 3 wildcards 5-7, seeds 8 and 9 the Mediocre Bowl, the bottom 7 the Shit Bowl', () => {
    const franchises = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, division: 'ABCD'[Math.floor(i / 4)] }));
    // Franchise f wins 17 - f of 17 games against fillers: 1 is best, 16 worst. Division A holds 1-4,
    // B 5-8, C 9-12 and D 13-16.
    const played = franchises.flatMap(({ id }) =>
      Array.from({ length: 17 }, (_, k) => ({ home: id, away: 0, winner: k < 17 - id ? id : 0 })),
    );
    const picture = playoffPicture({
      franchises, played, remaining: [], breakdown: {},
      brackets: { playoffs: 7, mediocre_bowl: 2, shit_bowl: 7 },
    });
    expect(picture.map((p) => `${p.bracket}:${p.seed}:${p.franchise}`)).toEqual([
      // Division winners 1, 5, 9 and 13; the 3 best wildcards that aren't division losers.
      'playoffs:1:1', 'playoffs:2:5', 'playoffs:3:9', 'playoffs:4:13',
      'playoffs:5:2', 'playoffs:6:3', 'playoffs:7:6',
      'mediocre_bowl:8:7', 'mediocre_bowl:9:10',
      // Division losers 16, 12, 8 and 4, worst first, then the 3 worst wildcards 15, 14 and 11.
      'shit_bowl:7:11', 'shit_bowl:6:14', 'shit_bowl:5:15',
      'shit_bowl:4:4', 'shit_bowl:3:8', 'shit_bowl:2:12', 'shit_bowl:1:16',
    ]);
  });
});
