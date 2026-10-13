// Season pages (#23): /seasons/<year>/ against the database it was built from.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const page = (year) => decode(readFileSync(join(DIST, 'seasons', String(year), 'index.html'), 'utf8'));
const NFL_SEASONS = db.prepare("select year from seasons where era = 'nfl.com' order by year").all().map((r) => r.year);
const SECTIONS = ['Format', 'Standings', 'Brackets', 'Awards', 'Highs and lows', 'Breakdown', 'Weekly results', 'Documents'];

// The row a section's label heads, up to the next row.
const section = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}(<small|</h2>)`));
  assert.ok(at >= 0, `section ${label}`);
  const next = html.indexOf('<section', at);
  return html.slice(at, next < 0 ? undefined : next);
};

test('the NFL.com seasons run 2012-2024', () => {
  assert.deepEqual(NFL_SEASONS, Array.from({ length: 13 }, (_, i) => 2012 + i));
});

test('every NFL.com season page has all eight sections, in order', () => {
  for (const year of NFL_SEASONS) {
    const html = page(year);
    const labels = [...html.matchAll(/<h2 class="lab"[^>]*>([^<]*)/g)].map((m) => m[1]);
    assert.deepEqual(labels.slice(1), SECTIONS, String(year));
  }
});

test('standings list every franchise by division, linked to its profile', () => {
  for (const year of NFL_SEASONS) {
    const html = section(page(year), 'Standings');
    const lines = db.prepare('select franchise_id, division from season_lines where season = ?').all(year);
    const divisions = new Set(lines.map((l) => l.division));
    for (const { franchise_id, division } of lines) {
      assert.match(html, new RegExp(`href="/franchises/${franchise_id}/"`), `${year} franchise ${franchise_id}`);
      // A one-division season (2012-14) needs no division heading.
      if (divisions.size > 1) assert.ok(html.includes(`<caption>${division}</caption>`), `${year} division ${division}`);
    }
  }
});

test('gap seasons mark reported standings with † and say which weeks have no game scores', () => {
  const html = section(page(2022), 'Standings');
  assert.match(html, /<sup class="mk"[^>]*>†<\/sup>/);
  assert.match(html, /weeks 10–14 have no game scores/i);
  assert.match(section(page(2023), 'Standings'), /weeks 1–14 have no game scores/i);
  assert.doesNotMatch(section(page(2021), 'Standings'), /<sup class="mk"[^>]*>†/);
});

test('bracket games whose score is lost carry ‡, with a note', () => {
  const lost = db.prepare("select season, count(*) as n from games where phase = 'bracket' and home_points is null group by season").all();
  assert.deepEqual(lost.map((r) => r.season), [2021, 2022, 2023, 2024]);
  for (const { season, n } of lost) {
    const html = section(page(season), 'Brackets');
    assert.equal([...html.matchAll(/<sup class="mk"[^>]*>‡<\/sup>/g)].length, n, String(season));
    assert.match(html, /score is lost/i);
  }
  assert.doesNotMatch(section(page(2020), 'Brackets'), /‡/);
});

test('the champion and the Shit Bowl winner are named, with the Shit Bowl source', () => {
  const html = section(page(2016), 'Brackets');
  assert.match(html, /Champion[\s\S]*?href="\/franchises\/\d+\/"/);
  assert.match(html, /Shit Bowl winner[\s\S]*?Kurlewless/);
  assert.match(section(page(2019), 'Brackets'), /Shit Bowl winner[\s\S]*?recalled/);
});

test('a disputed Shit Bowl is shown as disputed, naming every candidate', () => {
  const html = section(page(2021), 'Brackets');
  assert.match(html, /Disputed/);
  assert.match(html, /London Tanqs/);
  assert.match(html, /The Dirty Birds/);
});

test('unrecorded Mediocre Bowl winners are shown as unknown', () => {
  assert.match(section(page(2018), 'Brackets'), /Mediocre Bowl winner[\s\S]*?Unknown/);
  assert.doesNotMatch(section(page(2014), 'Brackets'), /Mediocre Bowl/);
});

test('every week of the weekly results grid is an anchor, and games link franchises', () => {
  for (const year of NFL_SEASONS) {
    const html = section(page(year), 'Weekly results');
    const weeks = db.prepare('select distinct week from coverage where season = ? order by week').all(year);
    for (const { week } of weeks) assert.match(html, new RegExp(`id="week-${week}"`), `${year} week ${week}`);
  }
  assert.match(section(page(2015), 'Weekly results'), /href="\/franchises\/\d+\/"/);
});

test('highs and lows link each game to its week', () => {
  const html = section(page(2015), 'Highs and lows');
  assert.match(html, /Highest score/);
  assert.match(html, /href="\/seasons\/2015\/#week-\d+"/);
});

test('Breakdown standings appear where the season is fully covered', () => {
  assert.match(section(page(2015), 'Breakdown'), /\d+-\d+-\d+/);
  assert.match(section(page(2023), 'Breakdown'), /no game scores/i);
});

test('documents link the season’s AGM doc', () => {
  const docs = db.prepare("select season, url from documents where kind = 'agm' and season <= 2024").all();
  assert.ok(docs.length > 0);
  for (const d of docs) assert.ok(section(page(d.season), 'Documents').includes(`href="${d.url}"`), String(d.season));
});
