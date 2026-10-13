// The records index and record pages (#30) against the database they were
// built from. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const read = (path) => decode(readFileSync(join(DIST, path, 'index.html'), 'utf8'));
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const ERAS = ['all', 'nfl-com', 'sleeper'];
const PHASES = ['all', 'regular', 'playoffs'];
const SCORING = ['highest-score', 'lowest-score', 'highest-score-in-a-loss', 'lowest-score-in-a-win', 'biggest-margin',
  'narrowest-margin', 'highest-combined-score', 'lowest-combined-score', 'all-ties'];
const CAREERS = ['career-wins', 'career-win-pct', 'career-points-per-game'];
const STREAKS = ['longest-winning-streak', 'longest-losing-streak', 'longest-top-half-run'];
const RECORDS = [...SCORING, ...CAREERS, ...STREAKS];
const STATSGURU = [...SCORING.slice(0, 6), ...CAREERS];
const current = db.prepare('select max(year) as y from seasons').get().y;
const inactive = new Set(db.prepare('select id from franchises where active = 0').all().map((r) => r.id));

// The table rows of a record page.
const rows = (html) => [...(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const figures = (html) => rows(html).map((r) => r.match(/<td class="num fig">([^<]*)/)?.[1]);

test('the records index shows the eight categories, the six not yet built pending', () => {
  const html = read('records');
  const labels = [...html.matchAll(/<h2 class="lab"[^>]*>([^<]*)/g)].map((m) => m[1]);
  assert.deepEqual(labels.slice(1), ['Scoring', 'Results and streaks', 'Seasons', 'Luck', 'Brackets', 'Head-to-head',
    'Divisions', 'Sleeper era']);
  const sections = html.split('<section').slice(2);
  for (const [n, s] of sections.entries()) {
    if (n < 2) assert.doesNotMatch(s, /To come/);
    else assert.match(s, /To come/, labels[n + 1]);
  }
  for (const slug of RECORDS) assert.ok(html.includes(`href="/records/${slug}/"`), slug);
  assert.match(sections[4], /href="\/seasons\/"/);
});

test('each record and only its sensible era and phase variants are pre-rendered', () => {
  for (const slug of RECORDS) {
    assert.ok(existsSync(join(DIST, 'records', slug, 'index.html')), slug);
    const phases = STREAKS.includes(slug) ? ['regular'] : PHASES;
    for (const era of ERAS)
      for (const phase of PHASES) {
        const isDefault = era === 'all' && phase === phases[0];
        const page = existsSync(join(DIST, 'records', slug, era, phase, 'index.html'));
        assert.equal(page, phases.includes(phase) && !isDefault, `${slug} ${era} ${phase}`);
      }
  }
});

test('record pages ship no JavaScript', () => {
  for (const f of walk(join(DIST, 'records')).filter((f) => f.endsWith('.html')))
    assert.doesNotMatch(readFileSync(f, 'utf8'), /<script/i, f);
});

test('the filters link every variant, marking the one shown', () => {
  const html = read('records/highest-score/nfl-com/regular');
  assert.match(html, /<a href="\/records\/highest-score\/nfl-com\/regular\/" aria-current="page">Regular season/);
  assert.match(html, /<a href="\/records\/highest-score\/nfl-com\/regular\/" aria-current="page">NFL.com era/);
  assert.match(html, /href="\/records\/highest-score\/all\/regular\/">All eras/);
  assert.match(read('records/highest-score/all/regular'), /href="\/records\/highest-score\/">All games/);
  assert.ok(!read('records/longest-winning-streak').includes('Playoffs</a>'));
});

test('highest score: the top of every score, linked to franchise and week, ties at 10th included', () => {
  const scores = db
    .prepare(`select p from (select home_points p from games union all select away_points from games)
              where p is not null order by p desc`)
    .all()
    .map((r) => r.p);
  const expected = scores.filter((p) => p >= scores[9]);
  const html = read('records/highest-score');
  assert.deepEqual(figures(html), expected.map((p) => p.toFixed(2)));
  for (const r of rows(html)) {
    assert.match(r, /href="\/franchises\/\d+\/"/);
    assert.match(r, /href="\/seasons\/\d{4}\/#week-\d+"/);
  }
});

test('career wins over the regular season match the season lines, ties at 10th included', () => {
  const wins = db.prepare('select sum(wins) as w from season_lines group by franchise_id order by 1 desc').all().map((r) => r.w);
  const html = read('records/career-wins/all/regular');
  assert.deepEqual(figures(html), wins.filter((w) => w >= wins[9]).map(String));
});

test('departed franchises are marked, and entries set this season badged', () => {
  for (const slug of RECORDS) {
    for (const r of rows(read(`records/${slug}`))) {
      // A game's opponent doesn't hold the record; both franchises of a combined score or a tie do.
      const ids = [...r.matchAll(/href="\/franchises\/(\d+)\/"/g)].map((m) => Number(m[1]));
      const holders = ['highest-combined-score', 'lowest-combined-score', 'all-ties'].includes(slug) ? ids : ids.slice(0, 1);
      assert.equal((r.match(/Departed/g) ?? []).length, holders.filter((id) => inactive.has(id)).length, `${slug}: ${ids}`);
      const season = Number([...r.matchAll(/href="\/seasons\/(\d{4})\/(?:#week-\d+)?"/g)].at(-1)?.[1]);
      if (!CAREERS.includes(slug)) assert.equal(/This season/.test(r), season === current, `${slug} ${season}`);
    }
  }
});

test('game-based records carry * for the weeks with no scores', () => {
  for (const slug of SCORING) assert.match(read(`records/${slug}`), /there are none for 2022 weeks 10–14, 2023 and 2024/, slug);
  assert.doesNotMatch(read('records/highest-score/sleeper/all'), /there are none for/);
});

test('streaks that reach a gap say they may continue into weeks with no scores', () => {
  for (const [slug, record] of [['longest-winning-streak', 'winning'], ['longest-losing-streak', 'losing'], ['longest-top-half-run', 'top_half']]) {
    const lengths = db.prepare("select length, gap_after from record_streaks where record = ? and era = 'all' order by length desc").all(record);
    const top = lengths.filter((l) => l.length >= lengths[9].length);
    const html = read(`records/${slug}`);
    assert.deepEqual(figures(html), top.map((l) => String(l.length)), slug);
    if (top.some((l) => l.gap_after)) assert.match(html, /may continue into weeks with no scores/, slug);
  }
});

test('Statsguru-expressible records link their full list, the rest don’t', () => {
  for (const slug of RECORDS) {
    const link = read(`records/${slug}`).match(/<a class="more" href="([^"]*)">Full list in Statsguru/);
    assert.equal(Boolean(link), STATSGURU.includes(slug), slug);
  }
  const link = read('records/highest-score').match(/<a class="more" href="([^"]*)">Full list in Statsguru/)[1];
  assert.equal(link, '/statsguru/?ph=R,P,C&view=games&sort=pf.desc');
});
