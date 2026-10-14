// The roll of honour (#24): /seasons/ against the database it was built from.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const html = decode(readFileSync(join('dist', 'seasons', 'index.html'), 'utf8'));
const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
const COLUMNS = ['Season', 'Champion', 'Runner-up', 'Shit Bowl winner', 'Mediocre Bowl winner'];

// {year: [cell, ...]} for the roll of honour's body rows.
const rows = new Map(
  [...table.slice(table.indexOf('<tbody')).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    return [Number(cells[0].replace(/<[^>]*>/g, '').trim()), cells];
  }),
);
const cell = (year, column) => rows.get(year)[COLUMNS.indexOf(column)];
const links = (s) => [...s.matchAll(/href="\/franchises\/(\d+)\/"/g)].map((m) => Number(m[1]));

// The finished seasons, as the build decided them (recordbook/current.py): a user decision
// keeps the season in progress off the roll of honour.
const finished = db.prepare('select year from seasons where finished = 1 order by year desc').all().map((r) => r.year);

test('one row per finished season from 2012, newest first, each linking to its season page', () => {
  const years = finished;
  assert.equal(years.at(-1), 2012);
  assert.deepEqual([...rows.keys()], years);
  for (const year of years) assert.match(cell(year, 'Season'), new RegExp(`href="/seasons/${year}/"`), String(year));
  const heads = [...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, COLUMNS);
});

const franchiseId = new Map(db.prepare('select id, name from franchises').all().map((f) => [f.name, f.id]));
const finals = JSON.parse(readFileSync('golden/league_records.json', 'utf8')).meta.finals.filter(
  (f) => f.platform === 'NFL.com',
);

test('the champion and runner-up link to their franchises, as ff-data-project published them', () => {
  assert.equal(finals.length, 13);
  for (const f of finals) {
    const year = Number(f.year);
    assert.deepEqual(links(cell(year, 'Champion')), [franchiseId.get(f.champion)], `${year} champion`);
    assert.deepEqual(links(cell(year, 'Runner-up')), [franchiseId.get(f.runnerUp)], `${year} runner-up`);
  }
});

test('the Shit Bowl winner links to its franchise; a disputed one names every candidate', () => {
  for (const f of finals) {
    const year = Number(f.year);
    const shown = links(cell(year, 'Shit Bowl winner')).sort();
    assert.deepEqual(shown, f.shitbowlCandidates.map((n) => franchiseId.get(n)).sort(), String(year));
  }
});

test('disputed and recalled outcomes are marked with their source, and disputed is explained', () => {
  for (const f of finals) {
    const year = Number(f.year);
    const shown = cell(year, 'Shit Bowl winner');
    const source = f.shitbowlDisputed ? 'disputed' : f.shitbowlSource;
    if (source === 'disputed') assert.match(shown, /class="src disp"[^>]*>Disputed</, String(year));
    else if (source === 'recalled') assert.match(shown, /class="src"[^>]*>recalled</, String(year));
    else assert.doesNotMatch(shown, /class="src/, String(year));
  }
  assert.match(html.slice(html.indexOf('</table>')), /Disputed: [^<]*counts for nobody/);
  assert.match(html.slice(html.indexOf('</table>')), /Recalled: [^<]*memory/);
});

test('a season still in progress has no row until it has finished, and nothing reads "To come"', () => {
  const all = db.prepare('select year from seasons').all().map((r) => r.year);
  for (const year of all.filter((y) => !finished.includes(y))) assert.equal(rows.has(year), false, String(year));
  assert.doesNotMatch(html, /To come/);
});

test('the Mediocre Bowl is blank before 2015, and unknown where nobody recorded its winner', () => {
  for (const year of [2012, 2013, 2014]) assert.equal(cell(year, 'Mediocre Bowl winner').trim(), '', String(year));
  const unrecorded = db
    .prepare("select season from bracket_winners where bracket = 'mediocre_bowl' and source = 'unknown'")
    .all();
  assert.ok(unrecorded.length > 0);
  for (const { season } of unrecorded) assert.match(cell(season, 'Mediocre Bowl winner'), /Unknown/, String(season));
});
