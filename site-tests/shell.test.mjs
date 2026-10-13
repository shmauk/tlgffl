// The site shell (#21): the menu on every page, the reserved paths, /league/
// and the stylesheet. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
// Redirect pages (such as a reversed head-to-head pair) have no shell.
const isRedirect = (f) => /^<!doctype html><title>Redirecting to:/.test(readFileSync(f, 'utf8'));
const pages = walk(DIST).filter((f) => f.endsWith('.html') && !isRedirect(f));
const read = (path) => decode(readFileSync(join(DIST, path), 'utf8'));

const MENU = [
  ['/records/', 'Records'],
  ['/franchises/', 'Franchises'],
  ['/seasons/', 'Seasons'],
  ['/statsguru/', 'Statsguru'],
  ['/league/', 'League'],
];

test('every page has the site name linking home, then the menu in order', () => {
  assert.ok(pages.length > 20);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.match(html, /<a class="logo" href="\/"[^>]*>The Fantasy League<\/a>/, page);
    const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const links = [...nav.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(links, MENU, page);
  }
});

test('every page carries the build\'s "updated <date>" stamp, the same on every page', () => {
  const stamps = new Set();
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const m = html.match(/<time class="updated" datetime="(\d{4}-\d{2}-\d{2})">Updated (\d{1,2} [A-Z][a-z]+ \d{4})<\/time>/);
    assert.ok(m, page);
    stamps.add(m[1]);
  }
  assert.equal(stamps.size, 1);
});

test("the menu marks the section a page belongs to", () => {
  const current = (path) => read(path).match(/<a href="([^"]*)" aria-current="page"/)?.[1];
  assert.equal(current('franchises/index.html'), '/franchises/');
  assert.equal(current('franchises/1/index.html'), '/franchises/');
  assert.equal(current('league/index.html'), '/league/');
  assert.equal(current('index.html'), undefined);
});

test('every menu entry leads to a page', () => {
  for (const [href] of MENU) assert.ok(existsSync(join(DIST, href, 'index.html')), href);
});

test('/managers/ stays reserved', () => {
  assert.ok(!existsSync(join(DIST, 'managers')));
});

test('/league/ links the constitution and every AGM document', () => {
  const html = read('league/index.html');
  const docs = db.prepare('select kind, season, title, url from documents').all();
  assert.ok(docs.length > 0);
  for (const d of docs) {
    assert.ok(html.includes(`href="${d.url}"`), `${d.season ?? ''} ${d.title}`);
  }
});

test("/league/ summarises each season's format and links to its season page", () => {
  const html = read('league/index.html').split(/<h2[^>]*>Format by season/)[1] ?? '';
  const formats = db
    .prepare(
      `select f.season, s.team_count, f.regular_season_first_week as first, f.regular_season_last_week as last
       from season_formats f join seasons s on s.year = f.season order by f.season`,
    )
    .all();
  assert.ok(formats.length > 0);
  for (const f of formats) {
    const entry = html.match(new RegExp(`<a href="/seasons/${f.season}/"[^>]*>${f.season}</a>([\\s\\S]*?)</tr>`))?.[1];
    assert.ok(entry, `season ${f.season} links to its page`);
    assert.match(entry, new RegExp(`${f.team_count} teams`), `season ${f.season}`);
    assert.match(entry, new RegExp(`Regular season weeks ${f.first}–${f.last}`), `season ${f.season}`);
  }
});

test('the stylesheet follows the OS into dark mode and stacks labels on narrow screens', () => {
  const css = walk(DIST)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  assert.match(css, /prefers-color-scheme:\s*dark/);
  // The minifier may rewrite (max-width: 720px) as (width<=720px).
  assert.match(css, /\((?:max-width:\s*|width\s*<=\s*)\d+px\)\s*\{[^@]*?\.row\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)[;}]/);
});
