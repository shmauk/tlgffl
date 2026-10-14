// The playoff picture (#16, #34): standings by division, sorted by seed as it
// stands, with cut-off lines between brackets, shared seeds and clinch marks.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, expect, test } from 'vitest';
import PlayoffPicture from './PlayoffPicture.astro';
import type { Place } from '../lib/seeding';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const line = (id: number, division: string, wins: number) => ({
  franchise: { id, name: `Franchise ${id}`, teamName: `Franchise ${id}` },
  division,
  wins,
  losses: 4 - wins,
  ties: 0,
  pointsFor: 100 + id,
  pointsAgainst: 90,
});
const place = (franchise: number, bracket: Place['bracket'], seed: number, level: number[] = []): Place => ({
  franchise, bracket, seed, shared: level.length > 0, level,
});

// Two divisions: A holds 1-3, B 4-6. Playoffs 1, 4 and 2; Mediocre Bowl 5; 3 and 6 level in the
// Shit Bowl, sharing seed 2.
const standings = [line(1, 'A', 4), line(2, 'A', 3), line(3, 'A', 0), line(4, 'B', 3), line(5, 'B', 2), line(6, 'B', 1)];
const picture = {
  places: [
    place(1, 'playoffs', 1), place(4, 'playoffs', 2), place(2, 'playoffs', 3),
    place(5, 'mediocre_bowl', 4),
    place(3, 'shit_bowl', 2, [6]), place(6, 'shit_bowl', 2, [3]),
  ],
  marks: { 1: ['BYE'], 3: ['SHIT BOWL'], 5: ['OUT', 'SAFE'] } as Record<number, any>,
  inProgress: true,
};
const render = () => container.renderToString(PlayoffPicture, { props: { standings, picture } });

test('each division is sorted by seed as it stands, with a cut-off line where the bracket changes', async () => {
  const html = await render();
  const tables = html.split('<table').slice(1);
  expect(tables).toHaveLength(2);
  const order = (t: string) => [...t.matchAll(/href="\/franchises\/(\d+)\/"/g)].map((m) => Number(m[1]));
  expect(order(tables[0])).toEqual([1, 2, 3]);
  expect(order(tables[1])).toEqual([4, 5, 6]);
  // B: Playoffs, then the Mediocre Bowl below a cut, then the Shit Bowl below another.
  expect(tables[1].match(/<tr class="cut"/g)).toHaveLength(2);
  expect(tables[0]).toMatch(/<caption>A<\/caption>/);
});

test('level franchises share a seed, explained in a footnote', async () => {
  const html = await render();
  expect(html.match(/>=2</g)).toHaveLength(2);
  expect(html).toMatch(/scissors-paper-rock decides/);
});

test('clinch marks are red badges, elimination marks grey', async () => {
  const html = await render();
  expect(html).toMatch(/<span class="bd now"[^>]*>BYE<\/span>/);
  expect(html).toMatch(/<span class="bd dep"[^>]*>SHIT BOWL<\/span>/);
  expect(html).toMatch(/<span class="bd dep"[^>]*>OUT<\/span>\s*<span class="bd now"[^>]*>SAFE<\/span>/);
});

test('a finished regular season shows no marks and no clinch note', async () => {
  const html = await container.renderToString(PlayoffPicture, {
    props: { standings, picture: { ...picture, marks: {}, inProgress: false } },
  });
  expect(html).not.toMatch(/class="bd/);
  expect(html).not.toMatch(/whatever happens/);
});
