// The seeding module fed from the database (#34). Reads build/league.sqlite:
// run the Python build first.
import { describe, expect, test } from 'vitest';
import { bracketGames, seasonPicture, seedProblems } from './seeding-db';

describe('2025, the first Sleeper season', () => {
  test('is seeded by playoffs.md', () => {
    // Worked by hand from the 2025 games. Division winners: Bearnaise Dynamics (10) at 10-4, then
    // The Puffins (3), The Piggies (13) and The Dirty Birds (7) at 9-5 on Breakdown (140, 133, 111;
    // the Piggies and Dirty Birds never met). Wildcards: The Beer Barons (1) beat Seamen (20).
    // Shit Bowl: The Fishies (18) at 3-11, then Kurlewless (11) on Breakdown, then Yorkshire Puddings
    // (19, lost to SERPION) and SERPION (8); wildcards AT Football Team (15, lost to Not Enough Cooks)
    // and Not Enough Cooks (17). Mediocre Bowl: Standard Deviations (2) and The Aligators (6) at 8-6
    // split their games and were both 3-3 in the division, so Breakdown (116 to 114) puts Standard
    // Deviations first; then Leeannacondas (16) and The Hatters (12).
    const seeds = seasonPicture(2025)!.places.map((p) => `${p.bracket}:${p.seed}:${p.franchise}`);
    expect(seeds).toEqual([
      'playoffs:1:10', 'playoffs:2:3', 'playoffs:3:13', 'playoffs:4:7', 'playoffs:5:1', 'playoffs:6:20',
      'mediocre_bowl:7:2', 'mediocre_bowl:8:6', 'mediocre_bowl:9:16', 'mediocre_bowl:10:12',
      'shit_bowl:6:17', 'shit_bowl:5:15', 'shit_bowl:4:8', 'shit_bowl:3:19', 'shit_bowl:2:11', 'shit_bowl:1:18',
    ]);
  });

  test('its seeds match the brackets played', () => {
    expect(seedProblems(2025)).toEqual([]);
  });

  test('a planted mismatch fails the check', () => {
    // Swap who The Piggies (13) and The Dirty Birds (7) met in the Playoffs' first round.
    const planted = bracketGames(2025).map((g) =>
      g.bracket === 'playoffs' && g.round === 1
        ? { ...g, home: g.home === 13 ? 7 : g.home === 7 ? 13 : g.home, away: g.away === 13 ? 7 : g.away === 7 ? 13 : g.away }
        : g,
    );
    expect(seedProblems(2025, planted).join('\n')).toMatch(/Playoffs round 1: the seeds pair .*The Piggies/);
  });
});

test('NFL.com-era seasons are not seeded by anyone: their seeds are as reported', () => {
  expect(seasonPicture(2024)).toBeNull();
});
