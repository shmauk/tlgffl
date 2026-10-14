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
const SECTIONS = ['Format', 'Standings', 'Brackets', 'Awards', 'Highs and lows', 'Breakdown', 'Weekly results', 'Draft', 'Documents'];
// Documents only where the season has some (#23): no empty heading.
const hasDocs = (year) => db.prepare('select count(*) as n from documents where season = ?').get(year).n > 0;
const sectionsOf = (year) => (hasDocs(year) ? SECTIONS : SECTIONS.filter((s) => s !== 'Documents'));

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
    assert.deepEqual(labels.slice(1), sectionsOf(year), String(year));
  }
});

test('a season with no documents has no Documents heading', () => {
  const years = db.prepare('select year from seasons').all().map((r) => r.year);
  const bare = years.filter((y) => !hasDocs(y));
  assert.ok(bare.length > 0);
  for (const year of bare) assert.doesNotMatch(page(year), /<h2 class="lab"[^>]*>Documents/, String(year));
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
  assert.match(html, /Shit Bowl winner[\s\S]*?Kurlewis/);
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

// 2025, the first Sleeper season (#25).
test('the 2025 page has all eight sections and nothing still to come but awards and drafts', () => {
  const html = page(2025);
  const labels = [...html.matchAll(/<h2 class="lab"[^>]*>([^<]*)/g)].map((m) => m[1]);
  assert.deepEqual(labels.slice(1), sectionsOf(2025));
  assert.doesNotMatch(html, /Sleeper games are still to come/);
  assert.match(html, /Played on Sleeper/);
});

test('2025 standings list all 16 franchises by group with the bracket each played in', () => {
  const html = section(page(2025), 'Standings');
  for (const g of ['Group A', 'Group B', 'Group C', 'Group D']) assert.ok(html.includes(`<caption>${g}</caption>`), g);
  assert.equal([...html.matchAll(/href="\/franchises\/\d+\/"/g)].length, 16);
  assert.equal([...html.matchAll(/<td>Playoffs<\/td>/g)].length, 6);
  assert.equal([...html.matchAll(/<td>Shit Bowl<\/td>/g)].length, 6);
  assert.equal([...html.matchAll(/<td>Mediocre Bowl<\/td>/g)].length, 4);
});

test('2025 brackets crown Seamen, Yorkshire Puddings and Standard Deviations, with every game', () => {
  const html = section(page(2025), 'Brackets');
  assert.match(html, /Champion:[\s\S]*?Seamen/);
  assert.match(html, /Shit Bowl winner:[\s\S]*?Yorkshire Puddings/);
  assert.match(html, /Mediocre Bowl winner:[\s\S]*?Standard Deviations/);
  assert.match(html, /93\.60–90\.14/);
  const n = db.prepare("select count(*) as n from games where season = 2025 and phase = 'bracket'").get().n;
  assert.equal(n, 13);
  assert.equal([...html.matchAll(/\d+\.\d\d–\d+\.\d\d/g)].length, n);
});

test('the 2025 weekly results grid runs from week 1 to week 17', () => {
  const html = section(page(2025), 'Weekly results');
  for (let week = 1; week <= 17; week++) assert.match(html, new RegExp(`id="week-${week}"`), String(week));
  assert.match(section(page(2025), 'Breakdown'), /\d+-\d+-\d+/);
});

// The draft (#37): keepers once recorded, and the draft board in Statsguru.
test('each season with a draft links its board and lists keepers or says they are not yet recorded', () => {
  const drafts = db.prepare('select season, max(kept is not null) as recorded from draft_picks group by season').all();
  assert.ok(drafts.some((d) => d.season === 2025));
  for (const { season, recorded } of drafts) {
    const html = section(page(season), 'Draft');
    assert.ok(html.includes(`href="/statsguru/?sub=pick&s=${season}"`), String(season));
    if (!recorded) assert.match(html, /Keepers not yet recorded for this season/, String(season));
    for (const k of db.prepare('select nfl_player_id as id from draft_picks where season = ? and kept = 1').all(season))
      assert.ok(html.includes(`p=${k.id}"`), `${season} keeper ${k.id}`);
  }
  for (const year of NFL_SEASONS) assert.match(section(page(year), 'Draft'), /drafts from 2025/, String(year));
});

// Games left out of the records (data/record_exclusions.csv) are left out of the season's highs and lows.
test("a season's highs and lows say which game is left out of the records, and why", () => {
  for (const x of db.prepare('select g.season, e.reason from record_exclusions e join games g on g.id = e.game_id').all()) {
    assert.ok(section(page(x.season), 'Highs and lows').includes(x.reason), String(x.season));
  }
});
