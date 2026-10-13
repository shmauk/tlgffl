// The seeding and clinch module (ADR 0005, #34): playoffs.md's seeding and
// tiebreaks, the playoff picture, clinch marks and the seed check.
import { describe, expect, test } from 'vitest';
import { checkSeeds, clinchMarks, playoffPicture, type Mark, type Place, type SeedingInput } from './seeding';

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

// ---------- clinch and elimination marks ----------

/** A seeded pseudo-random generator, so a failing case can be replayed. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A round-robin schedule (the circle method) for an even number of franchises, week by week. */
function roundRobin(ids: number[], weeks: number) {
  const out: { home: number; away: number }[][] = [];
  const ring = ids.slice(1);
  for (let w = 0; w < weeks; w++) {
    const order = [ids[0], ...ring];
    out.push(Array.from({ length: ids.length / 2 }, (_, i) => ({ home: order[i], away: order[order.length - 1 - i] })));
    ring.unshift(ring.pop()!);
  }
  return out;
}

const SIXTEEN = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, division: 'ABCD'[Math.floor(i / 4)] }));
const FORMAT_2026 = { playoffs: 7, mediocre_bowl: 2, shit_bowl: 7 };

/**
 * A season part-played at random, `left` of its weeks still to play. The
 * stronger franchise usually wins, so some seasons are lopsided enough for
 * marks to show.
 */
function partPlayed(
  rand: () => number,
  franchises: SeedingInput['franchises'],
  brackets: SeedingInput['brackets'],
  weeks: number,
  left: number,
): SeedingInput {
  const strength = new Map(franchises.map((f) => [f.id, rand()]));
  const schedule = roundRobin(franchises.map((f) => f.id), weeks);
  const played = schedule
    .slice(0, weeks - left)
    .flat()
    .map((g) => {
      const favourite = strength.get(g.home)! > strength.get(g.away)! ? g.home : g.away;
      return { ...g, winner: rand() < 0.85 ? favourite : favourite === g.home ? g.away : g.home };
    });
  const breakdown = Object.fromEntries(franchises.map((f) => [f.id, Math.round(rand() * 4) / 4]));
  return { franchises, played, remaining: schedule.slice(weeks - left).flat(), breakdown, brackets };
}

/** One way the season could end: each remaining game won or lost, any Breakdown, any scissors-paper-rock. */
function completion(rand: () => number, input: SeedingInput): SeedingInput {
  const ids = input.franchises.map((f) => f.id);
  return {
    ...input,
    played: [...input.played, ...input.remaining.map((g) => ({ ...g, winner: rand() < 0.5 ? g.home : g.away }))],
    remaining: [],
    // Breakdown moves with every remaining week's scores; once none remain it is final.
    breakdown: input.remaining.length
      ? Object.fromEntries(ids.map((f) => [f, Math.round(rand() * 4) / 4]))
      : input.breakdown,
    spr: [ids.map((f) => [f, rand()] as const).sort((a, b) => a[1] - b[1]).map(([f]) => f)],
  };
}

/** The marks a completed season contradicts. */
function contradictions(marks: Record<number, Mark[]>, done: SeedingInput) {
  const divisions = new Set(done.franchises.map((f) => f.division)).size;
  const byes = 2 ** Math.ceil(Math.log2(done.brackets.playoffs)) - done.brackets.playoffs;
  const holds: Record<Mark, (p: Place) => boolean> = {
    PLAYOFFS: (p) => p.bracket === 'playoffs',
    DIVISION: (p) => p.bracket === 'playoffs' && p.seed <= divisions,
    BYE: (p) => p.bracket === 'playoffs' && p.seed <= byes,
    OUT: (p) => p.bracket !== 'playoffs',
    SAFE: (p) => p.bracket !== 'shit_bowl',
    'SHIT BOWL': (p) => p.bracket === 'shit_bowl',
  };
  return playoffPicture(done).flatMap((p) =>
    (marks[p.franchise] ?? []).filter((m) => !holds[m](p)).map((m) => `${p.franchise} ${m} but ${p.bracket} ${p.seed}`),
  );
}

describe('clinch marks', () => {
  test('a franchise sure of seed 1 whatever happens shows BYE', () => {
    // One game left, 1 v 5. 1 is 4-0 and every A rival 1-2; 5 (2-1) at best finishes 3-1, behind 1's 4-1.
    const input = league(
      [[1, 2], [1, 3], [1, 4], [1, 0], [2, 0], [0, 2], [3, 0], [0, 3], [4, 0], [0, 4],
       [5, 0], [5, 0], [0, 5], [6, 0], [0, 6], [0, 7], [0, 7], [0, 8], [0, 8]],
      { remaining: [{ home: 1, away: 5 }] },
    );
    expect(clinchMarks(input)[1]).toEqual(['BYE']);
  });

  test('on week 1 nothing is decided', () => {
    const input = partPlayed(random(1), SIXTEEN, FORMAT_2026, 14, 14);
    expect(Object.values(clinchMarks(input)).flat()).toEqual([]);
  });

  test('a finished regular season marks every franchise for the bracket it is in', () => {
    const input = { ...partPlayed(random(2), SIXTEEN, FORMAT_2026, 14, 0), spr: [SIXTEEN.map((f) => f.id)] };
    const marks = clinchMarks(input);
    for (const p of playoffPicture(input)) {
      const shown = marks[p.franchise];
      if (p.bracket === 'playoffs') expect(shown).toEqual([p.seed === 1 ? 'BYE' : p.seed <= 4 ? 'DIVISION' : 'PLAYOFFS']);
      else expect(shown).toEqual(p.bracket === 'shit_bowl' ? ['SHIT BOWL'] : ['OUT', 'SAFE']);
    }
  });

  // The property: no mark is ever contradicted by any way the season could end.
  const cases: [string, SeedingInput['franchises'], SeedingInput['brackets'], number, number, number][] = [
    // name, franchises, brackets, regular-season weeks, weeks left, seasons to try
    ['8 franchises, 1 week left, every outcome tried', twoDivisions(), SMALL, 7, 1, 60],
    ['8 franchises, 2 weeks left, every outcome tried', twoDivisions(), SMALL, 7, 2, 60],
    ['8 franchises, 4 weeks left, every outcome tried', twoDivisions(), SMALL, 14, 4, 10],
    ['8 franchises, 5 weeks left, win bounds', twoDivisions(), SMALL, 14, 5, 60],
    ['16 franchises, 1 week left, every outcome tried', SIXTEEN, FORMAT_2026, 14, 1, 30],
    ['16 franchises, 2 weeks left, every outcome tried', SIXTEEN, FORMAT_2026, 14, 2, 3],
    ['16 franchises, 3 weeks left, win bounds', SIXTEEN, FORMAT_2026, 14, 3, 60],
    ['16 franchises, 4 weeks left, win bounds', SIXTEEN, FORMAT_2026, 14, 4, 60],
  ];
  test.each(cases)('no mark is ever contradicted: %s', (_name, franchises, brackets, weeks, left, seasons) => {
    const rand = random(weeks * 100 + left);
    let marked = 0;
    for (let s = 0; s < seasons; s++) {
      const input = partPlayed(rand, franchises, brackets, weeks, left);
      const marks = clinchMarks(input);
      marked += Object.values(marks).flat().length;
      for (let c = 0; c < 200; c++) {
        expect(contradictions(marks, completion(rand, input)), `season ${s}`).toEqual([]);
      }
    }
    // The property says nothing if no franchise is ever marked.
    expect(marked).toBeGreaterThan(0);
  }, 120_000);
});

// ---------- the seed check against the brackets played ----------

describe('the seed check', () => {
  // The first seeding test's season: Playoffs 1, 5, 6; Mediocre Bowl 2, 3; Shit Bowl 8 (seed 1), 4, 7.
  const season = league([
    [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
    [5, 6], [5, 7], [5, 8], [6, 7], [6, 8], [7, 8],
    [1, 5], [6, 2], [2, 7], [3, 8], [4, 7],
  ]);
  const picture = playoffPicture(season);
  const game = (bracket: 'playoffs' | 'mediocre_bowl' | 'shit_bowl', round: number, home: number, away: number, winner: number) =>
    ({ bracket, round, home, away, winner });
  // Seed 1 byes, 2 v 3, then 1 meets the survivor. The Shit Bowl mirrors it: 4 v 7 and the loser, 7,
  // goes on to meet 8.
  const played = [
    game('playoffs', 1, 5, 6, 5), game('playoffs', 2, 1, 5, 1),
    game('shit_bowl', 1, 4, 7, 4), game('shit_bowl', 2, 8, 7, 8),
    game('mediocre_bowl', 1, 2, 3, 2),
  ];

  test('passes when the brackets played follow the seeds', () => {
    expect(checkSeeds(picture, played)).toEqual([]);
  });

  test('fails a first round that pairs the wrong seeds', () => {
    const wrong = [game('playoffs', 1, 1, 6, 1), game('playoffs', 2, 1, 5, 1), ...played.slice(2)];
    expect(checkSeeds(picture, wrong).join('\n')).toMatch(/Playoffs round 1/);
  });

  test('fails a second round that was not re-seeded', () => {
    // 4 lost the Shit Bowl's first round, so 4 should have gone on, not 7.
    const wrong = [...played.slice(0, 2), game('shit_bowl', 1, 4, 7, 7), game('shit_bowl', 2, 8, 7, 8), played[4]];
    expect(checkSeeds(picture, wrong).join('\n')).toMatch(/Shit Bowl round 2/);
  });

  test('fails a franchise playing in a bracket its seed does not give it', () => {
    const wrong = [...played.slice(0, 4), game('mediocre_bowl', 1, 2, 7, 2)];
    expect(checkSeeds(picture, wrong).join('\n')).toMatch(/Mediocre Bowl/);
  });

  test('a bracket whose pairings were not by seed is checked for who played in it only', () => {
    const swapped = [...played.slice(0, 4), game('mediocre_bowl', 1, 3, 2, 3)];
    expect(checkSeeds(picture, swapped, { pairingsNotBySeed: ['mediocre_bowl'] })).toEqual([]);
    const wrong = [...played.slice(0, 4), game('mediocre_bowl', 1, 2, 7, 2)];
    expect(checkSeeds(picture, wrong, { pairingsNotBySeed: ['mediocre_bowl'] })).not.toEqual([]);
  });

  test('fails a season whose seeds still wait on scissors-paper-rock', () => {
    const level = playoffPicture(league(levelPairForCheck, { breakdown: { 2: 0.9, 4: 0.1, 8: 0.2 } }));
    expect(checkSeeds(level, []).join('\n')).toMatch(/scissors-paper-rock/);
  });
});

// The seeding tests' level pair: 6 and 7 share a Mediocre Bowl seed.
const levelPairForCheck: [number, number][] = [
  [1, 0], [1, 0], [1, 0], [2, 0], [2, 0], [0, 2], [3, 0], [0, 3], [0, 3], [0, 4], [0, 4], [0, 4],
  [5, 0], [5, 0], [5, 0], [6, 0], [6, 0], [0, 6], [7, 0], [7, 0], [0, 7], [0, 8], [0, 8], [0, 8],
];
