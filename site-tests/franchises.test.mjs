// Checks the built site in dist/ against the database it was built from.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const franchises = db.prepare('select id, name, active from franchises order by id').all();
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('/franchises/ links every franchise by its id, active and departed apart', () => {
  const page = decode(readFileSync(join(DIST, 'franchises/index.html'), 'utf8'));
  const [active, departed] = page.split(/<h2[^>]*>Departed/);
  assert.ok(departed, 'has a Departed section');
  for (const f of franchises) {
    const section = f.active ? active : departed;
    const link = new RegExp(`<a [^>]*href="/franchises/${f.id}/"[^>]*>([^<]*)</a>`);
    assert.equal(section.match(link)?.[1], f.name, `franchise ${f.id}`);
  }
});

test('every franchise has a page at /franchises/<id>/', () => {
  for (const f of franchises) {
    const html = decode(readFileSync(join(DIST, 'franchises', String(f.id), 'index.html'), 'utf8'));
    assert.match(html, new RegExp(`<h1[^>]*>${escape(f.name)}</h1>`));
  }
});

test('static pages ship no client-side JS: only the islands, Statsguru and the current season’s predictor, have any', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(DIST);
  // The predictor is an island only for the current season, while its regular season is on (#36).
  const current = db.prepare('select season from current_season').get()?.season;
  const islands = [join(DIST, 'statsguru', 'index.html'), join(DIST, 'seasons', String(current), 'predictor', 'index.html')]
    .filter((f) => existsSync(f));
  for (const f of files.filter((f) => f.endsWith('.html') && !islands.includes(f))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /<script/i, f);
  }
  // Every script belongs to an island: one it loads, a chunk those import, or a worker they start.
  const reached = new Set();
  const queue = islands.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]));
  while (queue.length) {
    const src = queue.pop();
    if (reached.has(src) || !src.startsWith('/')) continue;
    reached.add(src);
    const js = readFileSync(join(DIST, src), 'utf8');
    for (const m of js.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\(\s*)[`"']([^`"']+\.js)[`"']/g))
      queue.push(new URL(m[1], `http://x${src}`).pathname);
  }
  for (const js of files.filter((f) => /\.m?js$/.test(f))) {
    assert.ok(reached.has(js.slice(DIST.length)), `${js} belongs to an island`);
  }
});
