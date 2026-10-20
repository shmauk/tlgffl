// The home page (#16, #35): the current season's hub in each of its three
// phases, from synthetic fixtures (the real season moves daily).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, test } from 'vitest';
import Home from './Home.astro';
import type { HomeData } from '../lib/home';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (data: HomeData) => container.renderToString(Home, { props: { data } });

const fr = (id: number) => ({ id, name: `Franchise ${id}`, teamName: `Team ${id}` });
const names = Object.fromEntries([1, 2, 3, 4, 5, 6].map((id) => [id, fr(id)]));
/** The HTML of the row with this label, up to the next row. */
const row = (html: string, label: string) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}`));
  if (at < 0) return '';
  const end = html.indexOf('<section', at);
  return html.slice(at, end < 0 ? undefined : end);
};
const WEEK_ROW = /<h2 class="lab"[^>]*>Week/;

const base: HomeData = {
  season: 2026,
  phase: 'regular',
  through: 4,
  playing: 5,
  updated: 'Updated 14 October 2026',
  names,
  picture: null,
  brackets: [],
  awards: [],
  records: [],
  honours: null,
  next: null,
  predictor: null,
};

const regular: HomeData = {
  ...base,
  picture: [
    { franchise: fr(1), bracket: 'playoffs', seed: 1, shared: false, wins: 4, losses: 0, ties: 0, breakdown: 0.8125, marks: ['PLAYOFFS'] },
    { franchise: fr(2), bracket: 'playoffs', seed: 2, shared: false, wins: 3, losses: 1, ties: 0, breakdown: 0.6, marks: [] },
    { franchise: fr(4), bracket: 'shit_bowl', seed: 1, shared: false, wins: 0, losses: 4, ties: 0, breakdown: 0.1, marks: ['SHIT BOWL'] },
  ],
  awards: [
    { award: { slug: 'nail-biter', name: 'Nail Biter' }, franchises: [fr(2)], value: '9.54' },
    { award: { slug: 'highest-failed-bid', name: 'Highest failed bid' }, franchises: [fr(5), fr(6)], value: '$45' },
  ],
  records: [{ record: { slug: 'highest-score', name: 'Highest score' }, rank: 2, franchises: [fr(1)], figure: '190.12' }],
  predictor: '/seasons/2026/predictor/',
};

const brackets: HomeData = {
  ...base,
  phase: 'brackets',
  through: 15,
  playing: 16,
  updated: 'Updated 22 December 2026',
  brackets: [
    {
      key: 'playoffs',
      winner: null,
      columns: [
        {
          week: 15, title: 'Semi-finals', byes: [{ id: 1, seed: 1 }],
          games: [{ home: { id: 2, seed: 2 }, away: { id: 3, seed: 3 }, homePoints: 110, awayPoints: 100, winner: 2 }],
        },
        {
          week: 16, title: 'Final', byes: [],
          games: [{ home: { id: 1, seed: 1 }, away: { id: 2, seed: 2 }, homePoints: null, awayPoints: null, winner: null }],
        },
      ],
    },
    {
      key: 'shit_bowl',
      winner: fr(5),
      columns: [
        {
          week: 15, title: 'Final', byes: [],
          games: [{ home: { id: 4, seed: 2 }, away: { id: 5, seed: 1 }, homePoints: 90, awayPoints: 80, winner: 4 }],
        },
      ],
    },
  ],
  awards: [{ award: { slug: 'nail-biter', name: 'Nail Biter' }, franchises: [fr(2)], value: '8.10' }],
};

const offSeason: HomeData = {
  ...base,
  phase: 'off-season',
  through: 17,
  playing: null,
  updated: 'Updated 3 March 2027',
  awards: [{ award: { slug: 'nail-biter', name: 'Nail Biter' }, franchises: [fr(2)], value: '8.10' }],
  records: [{ record: { slug: 'most-wins', name: 'Most wins in a season' }, rank: 1, franchises: [fr(1)], figure: '13' }],
  honours: { playoffs: fr(1), shit_bowl: fr(5), mediocre_bowl: null },
  next: { season: 2027, draft: '1 September 2027' },
};

describe('during the regular season', () => {
  test('the header names the season and week, with the updated line', async () => {
    const html = await render(regular);
    expect(html).toMatch(/<h1>2026<\/h1>/);
    expect(html).toContain('Updated 14 October 2026, through week 4');
  });

  test('has no row for the week being played or last week’s results: Sleeper shows those (#53)', async () => {
    const html = await render(regular);
    expect(html).not.toMatch(WEEK_ROW);
    expect(html).not.toContain('Being played');
    expect(html).not.toMatch(/<small>Results<\/small>/);
    expect(html).not.toMatch(/Highest score:|Lowest score:|Every week of/);
  });

  test('the compact playoff picture has seeds, a Breakdown % column and clinch marks', async () => {
    const pic = row(await render(regular), 'Playoff picture');
    expect(pic).toMatch(/Breakdown %/);
    expect(pic).toContain('81.3%');
    expect(pic).toMatch(/<span class="bd now"[^>]*>PLAYOFFS<\/span>/);
    expect(pic).toMatch(/<span class="bd dep"[^>]*>SHIT BOWL<\/span>/);
    // The Shit Bowl starts below a cut-off line.
    expect(pic.match(/<tr class="cut"/g)).toHaveLength(1);
  });

  test('award leaders take one line each; records set this season carry the badge', async () => {
    const html = await render(regular);
    const awards = row(html, 'Award leaders');
    expect(awards.match(/<p>/g)).toHaveLength(2);
    expect(awards).toMatch(/Highest failed bid[\s\S]*Team 5[\s\S]*Team 6[\s\S]*\$45/);
    const records = row(html, 'Records');
    expect(records).toMatch(/Highest score[\s\S]*190\.12[\s\S]*● This season/);
  });

  test('links to the season page, the predictor and Statsguru for the season', async () => {
    const html = await render(regular);
    expect(html).toContain('href="/seasons/2026/"');
    expect(html).toContain('href="/seasons/2026/predictor/"');
    expect(html).toMatch(/href="\/statsguru\/\?[^"]*s=2026/);
  });
});

describe('during the brackets', () => {
  test('has no row for the week being played or last week’s results, and the playoff picture gives way to the brackets', async () => {
    const html = await render(brackets);
    expect(html).not.toMatch(WEEK_ROW);
    expect(html).not.toContain('Being played');
    expect(html).not.toMatch(/<small>Results<\/small>/);
    expect(row(html, 'Playoff picture')).toBe('');
  });

  test('each bracket is drawn in columns with seeds, winners in bold and its winner in red', async () => {
    const drawn = row(await render(brackets), 'Brackets');
    expect(drawn).toMatch(/Semi-finals[\s\S]*Final/);
    expect(drawn).toMatch(/<b class="win">[^]*?Team 2[^]*?<\/b>/);
    expect(drawn).toMatch(/1[\s\S]*Team 1[\s\S]*bye/);
    expect(drawn).toMatch(/class="crowned"[^>]*>[\s\S]*?Team 5/);
    expect(drawn).not.toMatch(/class="crowned"[^>]*>[\s\S]*?Team 1</);
  });

  test('award leaders have become award winners', async () => {
    const html = await render(brackets);
    expect(row(html, 'Award winners')).toContain('Nail Biter');
    expect(row(html, 'Award leaders')).toBe('');
    expect(html).not.toContain('/predictor/');
  });
});

describe('in the off-season', () => {
  test('a wrap-up of the champion, the Shit Bowl and Mediocre Bowl winners, awards and records', async () => {
    const html = await render(offSeason);
    const wrap = row(html, 'Wrap-up');
    expect(wrap).toMatch(/Champion[\s\S]*Team 1/);
    expect(wrap).toMatch(/Shit Bowl winner[\s\S]*Team 5/);
    expect(wrap).toMatch(/Mediocre Bowl winner[\s\S]*Unknown/);
    expect(row(html, 'Award winners')).toContain('Nail Biter');
    expect(row(html, 'Records')).toMatch(/Most wins in a season[\s\S]*● This season/);
    expect(html).not.toMatch(WEEK_ROW);
  });

  test('says when next season drafts, once Sleeper has a date', async () => {
    expect(await render(offSeason)).toContain('Next season: draft 1 September 2027');
    const undated = await render({ ...offSeason, next: { season: 2027, draft: null } });
    expect(undated).not.toContain('Next season');
  });

  test('the header still shows the updated line, and that the season is over', async () => {
    const html = await render(offSeason);
    expect(html).toContain('Updated 3 March 2027, through week 17');
    expect(html).toMatch(/<small>Season over<\/small>/);
  });
});
