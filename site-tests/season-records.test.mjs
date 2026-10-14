// Season, luck and bracket record pages (#31) against the database they were
// built from. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const read = (path) => decode(readFileSync(join(DIST, path, 'index.html'), 'utf8'));
const rows = (html) => [...(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const figures = (html) => rows(html).map((r) => r.match(/<td class="num fig">([^<]*)/)?.[1]);
const current = db.prepare('select season as y from current_season').get().y;

const ERAS = ['all', 'nfl-com', 'sleeper'];
const SEASONS = ['most-wins', 'fewest-wins', 'most-points-for', 'fewest-points-for', 'most-points-against',
  'fewest-points-against', 'best-points-per-game', 'worst-points-per-game', 'best-breakdown-pct', 'worst-breakdown-pct',
  'luckiest-season', 'unluckiest-season'];
const BRACKETS = ['championships', 'finals-reached', 'playoff-appearances', 'shit-bowl-titles', 'mediocre-bowl-titles',
  'longest-playoff-drought', 'longest-playoff-appearance-streak'];

test('season records are pre-rendered for each era, regular season only', () => {
  for (const slug of SEASONS) {
    assert.ok(existsSync(join(DIST, 'records', slug, 'index.html')), slug);
    for (const era of ERAS.slice(1)) assert.ok(existsSync(join(DIST, 'records', slug, era, 'regular', 'index.html')), slug);
    assert.ok(!existsSync(join(DIST, 'records', slug, 'all', 'all')), slug);
  }
});

test('bracket records are pre-rendered for each era with no phase filter; Shit Bowl appearances only for Sleeper', () => {
  for (const slug of BRACKETS) {
    for (const era of ERAS.slice(1)) assert.ok(existsSync(join(DIST, 'records', slug, era, 'all', 'index.html')), slug);
    assert.doesNotMatch(read(`records/${slug}`), /Regular season|All games/, slug);
  }
  assert.ok(existsSync(join(DIST, 'records', 'shit-bowl-appearances', 'index.html')));
  assert.ok(!existsSync(join(DIST, 'records', 'shit-bowl-appearances', 'nfl-com')));
});

test('most points for: the top season totals, with per game and season length alongside', () => {
  const pf = db.prepare('select points_for p from record_seasons order by 1 desc').all().map((r) => r.p);
  const html = read('records/most-points-for');
  assert.deepEqual(figures(html), pf.filter((p) => p >= pf[9]).map((p) => p.toFixed(2)));
  assert.match(html, /<th class="num">PF per game<\/th><th class="num">GP<\/th>/);
  for (const r of rows(html)) assert.match(r, /href="\/seasons\/\d{4}\/"/);
});

test('the season in progress is left out of season records until its regular season ends', () => {
  const ranked = db.prepare('select count(*) as n from record_seasons where season = ?').get(current).n;
  if (ranked) return;
  for (const slug of SEASONS) {
    const html = read(`records/${slug}`);
    assert.ok(!rows(html).some((r) => r.includes(`href="/seasons/${current}/"`)), slug);
    assert.match(html, new RegExp(`${current} joins once its regular season ends`), slug);
  }
});

test('luck is shown signed', () => {
  assert.match(figures(read('records/luckiest-season'))[0], /^\+\d+\.\d$/);
  assert.match(figures(read('records/unluckiest-season'))[0], /^-\d+\.\d$/);
});

test('championships list each franchise’s seasons; disputed and unknown outcomes are noted', () => {
  const html = read('records/championships');
  for (const r of rows(html)) assert.match(r, /href="\/seasons\/\d{4}\/"/);
  const disputed = db.prepare(`select distinct season from bracket_winners where bracket = 'shit_bowl' and source = 'disputed'`).all();
  for (const { season } of disputed) assert.match(read('records/shit-bowl-titles'), new RegExp(`${season} is disputed between`));
  if (db.prepare(`select 1 from bracket_winners where bracket = 'mediocre_bowl' and source = 'unknown'`).get())
    assert.match(read('records/mediocre-bowl-titles'), /Mediocre Bowl winner is unknown for/);
});

test('the Brackets category links the roll of honour first', () => {
  const html = read('records');
  const brackets = html.split('<section').find((s) => s.includes('>Brackets<'));
  assert.match(brackets, /<li><a href="\/seasons\/">Roll of honour<\/a><\/li><li><a href="\/records\/championships\/">/);
});
