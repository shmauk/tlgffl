// Statsguru (#28): the island, the database it loads, and the links into it.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const DB_PATH = process.env.TLGFFL_DB ?? 'build/league.sqlite';
const db = new DatabaseSync(DB_PATH, { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(DIST);
const read = (path) => decode(readFileSync(join(DIST, path), 'utf8'));
const STATSGURU = join(DIST, 'statsguru', 'index.html');

// Every script a page loads, following static imports between chunks.
function scripts(html) {
  const seen = new Set();
  const queue = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  while (queue.length) {
    const src = queue.pop();
    if (seen.has(src) || !src.startsWith('/')) continue;
    seen.add(src);
    const js = readFileSync(join(DIST, src), 'utf8');
    for (const m of js.matchAll(/(?:^|[;\s])import\s*(?:[^'"()]*?from\s*)?["']([^"']+)["']/g))
      queue.push(new URL(m[1], `http://x${src}`).pathname);
  }
  return [...seen];
}

test('the database ships under a content-hashed name, byte for byte the build’s', () => {
  const shipped = files.filter((f) => /data\/league-[0-9a-f]{8,}\.sqlite$/.test(f));
  assert.equal(shipped.length, 1);
  assert.ok(readFileSync(shipped[0]).equals(readFileSync(DB_PATH)));
  const name = shipped[0].slice(DIST.length);
  assert.ok(readFileSync(STATSGURU, 'utf8').includes(`data-db="${name}"`));
});

test('the SQLite engine ships as WebAssembly', () => {
  assert.ok(files.some((f) => f.endsWith('.wasm')));
});

test('other pages download neither SQLite nor WebAssembly', () => {
  const pages = files.filter((f) => f.endsWith('.html') && f !== STATSGURU);
  assert.ok(pages.length > 20);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.doesNotMatch(html, /\.sqlite|\.wasm|sql-wasm/i, page);
    for (const src of scripts(html)) {
      const js = readFileSync(join(DIST, src), 'utf8');
      assert.doesNotMatch(js, /\.sqlite|\.wasm|WebAssembly/, `${page} loads ${src}`);
    }
  }
});

test('the form lists every franchise for both franchise and opposition, and every season', () => {
  const html = read('statsguru/index.html');
  for (const { id, name } of db.prepare('select id, name from franchises').all()) {
    for (const field of ['f', 'opp']) {
      const select = html.match(new RegExp(`<select[^>]*name="${field}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? '';
      assert.match(select, new RegExp(`<option value="${id}"[^>]*>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${field} ${name}`);
    }
  }
  for (const { year } of db.prepare('select year from seasons').all())
    assert.match(html, new RegExp(`<option value="${year}"`), String(year));
  for (const label of ['Regular season', 'Playoffs', 'Shit Bowl and Mediocre Bowl', 'Reset form'])
    assert.ok(html.includes(label), label);
  assert.equal([...html.matchAll(/data-clear="(f|opp)"/g)].length, 2);
});

test('franchise profiles open their franchise in Statsguru', () => {
  for (const { id } of db.prepare('select id from franchises').all())
    assert.match(read(`franchises/${id}/index.html`), new RegExp(`href="/statsguru/\\?f=${id}"[^>]*>Open in Statsguru`), String(id));
});

test('season pages open their season, season by season, in Statsguru', () => {
  for (const { year } of db.prepare('select year from seasons').all()) {
    const path = `seasons/${year}/index.html`;
    if (!existsSync(join(DIST, path))) continue;
    assert.match(read(path), new RegExp(`href="/statsguru/\\?s=${year}&view=season"[^>]*>Open in Statsguru`), String(year));
  }
});

test('head-to-head pages open the pair in Statsguru', () => {
  const pairs = db.prepare('select lo_franchise_id as a, hi_franchise_id as b from head_to_head').all();
  assert.ok(pairs.length > 0);
  for (const { a, b } of pairs)
    assert.match(read(`head-to-head/${a}-${b}/index.html`), new RegExp(`href="/statsguru/\\?f=${a}&(amp;)?opp=${b}"[^>]*>Open in Statsguru`), `${a}-${b}`);
});

test('the form has an era and a League size choice beside the season span', () => {
  const html = read('statsguru/index.html');
  const options = (name) =>
    [...(html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? '').matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)]
      .map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(options('era').map(([v]) => v), ['', 'nfl.com', 'sleeper']);
  assert.deepEqual(options('size'), [
    ['', 'all sizes'],
    ['10', '10 teams (2012)'],
    ['12', '12 teams (2013–14)'],
    ['16', '16 teams (2015 on)'],
  ]);
});

test('the form has all three subjects, each with its own views and filters', () => {
  const html = read('statsguru/index.html');
  assert.match(html, /<input[^>]*name="subject"[^>]*value="franchise"/);
  assert.match(html, /<input[^>]*name="subject"[^>]*value="player"/);
  assert.match(html, /<input[^>]*name="subject"[^>]*value="pick"/);
  for (const v of ['list', 'fr', 'pl'])
    assert.match(html, new RegExp(`<input[^>]*name="kview"[^>]*value="${v}"`), v);
  for (const field of ['rdFrom', 'rdTo', 'pkFrom', 'pkTo']) assert.match(html, new RegExp(`<input[^>]*name="${field}"`), field);
  assert.match(html, /<select[^>]*name="kd"[^>]*>[\s\S]*value="kept"[\s\S]*value="drafted"/);
  assert.match(html, /<select[^>]*name="fby"[^>]*>[\s\S]*value="slot"/);
  assert.match(html, /<select[^>]*name="kby"[^>]*>[\s\S]*value="round"/);
  for (const v of ['totals', 'season', 'opp', 'phase', 'pos', 'games'])
    assert.match(html, new RegExp(`<input[^>]*name="view"[^>]*value="${v}"`), v);
  for (const v of ['totals', 'fr', 'season', 'log'])
    assert.match(html, new RegExp(`<input[^>]*name="pview"[^>]*value="${v}"`), v);
  assert.match(html, /<select[^>]*name="by"[^>]*>[\s\S]*value="slot"/);
  assert.match(html, /<select[^>]*name="lu"[^>]*>[\s\S]*value="start"[\s\S]*value="bench"/);
  for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    assert.match(html, new RegExp(`<input[^>]*name="pos"[^>]*value="${pos}"`), pos);
  const select = html.match(/<select[^>]*name="p"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';
  const inLineups = db.prepare('select distinct nfl_player_id as id from lineups where nfl_player_id is not null').all();
  assert.ok(inLineups.length > 0);
  for (const { id } of inLineups) assert.match(select, new RegExp(`<option value="${id}"`), id);
  for (const { id } of db.prepare('select distinct nfl_player_id as id from draft_picks').all())
    assert.match(select, new RegExp(`<option value="${id}"`), id);
});

test('every NFL player mention on the site links to their Statsguru query', () => {
  const players = db.prepare("select id, name from nfl_players where name is not null and position != 'DEF'").all();
  assert.ok(players.length > 0);
  const names = new Map(players.map((p) => [p.name, p.id]));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(${players.map((p) => escape(p.name)).join('|')})\\b`, 'g');
  // Team names may borrow an NFL player's name ("My Ball Zach Ertz"); that isn't a mention.
  const teamNames = db.prepare('select team_name as n from team_names union select name from franchises').all().map((r) => r.n);
  const teamPattern = new RegExp(teamNames.sort((a, b) => b.length - a.length).map(escape).join('|'), 'g');
  for (const page of files.filter((f) => f.endsWith('.html'))) {
    // The Statsguru form's own lists aren't mentions either.
    let html = decode(readFileSync(page, 'utf8'))
      .replace(/<option[^>]*>[\s\S]*?<\/option>/g, '')
      .replace(/data-context="[^"]*"/g, '')
      .replace(teamPattern, '');
    html = html.replace(/<a class="pl" href="([^"]*)"[^>]*>([^<]*)<\/a>/g, (_, href, text) => {
      if (names.has(text)) assert.equal(href, `/statsguru/?sub=player&p=${names.get(text)}`, `${page}: ${text}`);
      return '';
    });
    const unlinked = html.match(pattern);
    assert.equal(unlinked, null, `${page} names ${unlinked?.join(', ')} without linking them`);
  }
});
