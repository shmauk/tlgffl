// A game from one franchise's side (#27), and the head-to-head URL.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, test } from 'vitest';
import GameLine from './GameLine.astro';
import { headToHeadUrl } from '../lib/urls';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const ant = { id: 1, name: 'Ant', teamName: 'Ant' };
const bee = { id: 2, name: 'Bee', teamName: 'Bee Team' };
const game = (homePoints: number | null, awayPoints: number | null, winnerId: number | null) => ({
  id: 7, season: 2015, week: 3, phase: 'regular', bracket: null, round: null,
  home: ant, homePoints, away: bee, awayPoints, winnerId, advancedId: null,
});
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

describe('a game from one side', () => {
  test('puts the franchise’s own score first and links the week', async () => {
    const html = await container.renderToString(GameLine, { props: { game: game(100, 120.5, 2), franchiseId: 2 } });
    expect(html).toContain('href="/seasons/2015/#week-3"');
    expect(text(html)).toBe('2015 week 3 W 120.50–100.00 v Ant');
  });

  test('a tie is a T, and the opponent shows the team name it played under', async () => {
    const html = await container.renderToString(GameLine, { props: { game: game(90, 90, null), franchiseId: 1 } });
    expect(text(html)).toBe('2015 week 3 T 90.00–90.00 v Bee Team (Bee)');
  });

  test('a lost score shows the result with ‡', async () => {
    const html = await container.renderToString(GameLine, { props: { game: game(null, null, 1), franchiseId: 1, label: 'Week 3' } });
    expect(text(html)).toBe('Week 3 W ‡ v Bee Team (Bee)');
  });
});

test('a head-to-head URL puts the lower franchise id first', () => {
  expect(headToHeadUrl(9, 5)).toBe('/head-to-head/5-9/');
  expect(headToHeadUrl(5, 9)).toBe('/head-to-head/5-9/');
});
