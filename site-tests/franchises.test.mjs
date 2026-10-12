// Checks the built site in dist/ against the database it was built from.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

test('the site ships no client-side JS', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(DIST);
  assert.deepEqual(files.filter((f) => /\.m?js$/.test(f)), []);
  for (const f of files.filter((f) => f.endsWith('.html'))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /<script/i, f);
  }
});
