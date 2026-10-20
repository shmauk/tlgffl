// Head-to-head, division and Sleeper-era record pages, and the profile's
// records held (#32), against the database they were built from. Run after
// `npm run build`: npm run test:site
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
const topTen = (values) => values.filter((v) => v >= values[Math.min(9, values.length - 1)]);
const section = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}(<small|</h2>)`));
  assert.ok(at >= 0, `section ${label}`);
  const next = html.indexOf('<section', at);
  return html.slice(at, next < 0 ? undefined : next);
};

const H2H = ['most-lopsided-rivalry', 'most-played-pairing'];
const DIVISIONS = ['group-of-death', 'winningest-division', 'weakest-division-by-points-for', 'weakest-division-by-wins'];
const SLEEPER = ['best-nfl-player-score', 'most-bench-points-in-a-game', 'most-bench-points-in-a-season'];
const SEASON_SETS = ['all-seasons', 'nfl-com', 'sleeper'];
const PHASES = ['all', 'regular', 'playoffs'];
const current = db.prepare('select season as y from current_season').get().y;
const crowned = db.prepare("select count(*) as n from bracket_winners where season = ? and bracket = 'playoffs' and franchise_id is not null").get(current).n > 0;

test('all nine records have their pages, linked from the index, with their sensible variants', () => {
  const index = read('records');
  for (const slug of [...H2H, ...DIVISIONS, ...SLEEPER]) {
    assert.ok(index.includes(`href="/records/${slug}/"`), slug);
    assert.ok(existsSync(join(DIST, 'records', slug, 'index.html')), slug);
  }
  // One URL per variant (#54): the season set, then the phase, defaults left out.
  for (const slug of H2H) for (const set of SEASON_SETS) for (const phase of PHASES) {
    const path = [set === 'all-seasons' ? [] : [set], phase === 'all' ? [] : [phase]].flat();
    assert.ok(existsSync(join(DIST, 'records', slug, ...path, 'index.html')), `${slug} ${set} ${phase}`);
  }
  for (const slug of DIVISIONS) {
    assert.ok(existsSync(join(DIST, 'records', slug, 'nfl-com', 'index.html')), slug);
    assert.ok(!existsSync(join(DIST, 'records', slug, 'nfl-com', 'regular')), slug);
    assert.ok(!existsSync(join(DIST, 'records', slug, 'regular')), slug);
  }
  // No era filter in the Sleeper era: the Sleeper era is these records' default.
  for (const slug of SLEEPER) {
    assert.ok(!existsSync(join(DIST, 'records', slug, 'sleeper')), slug);
    assert.doesNotMatch(read(`records/${slug}`), />NFL\.com era</, slug);
  }
  assert.ok(existsSync(join(DIST, 'records', 'best-nfl-player-score', 'playoffs', 'index.html')));
});

test('rivalries link their pair pages', () => {
  for (const slug of H2H) {
    for (const r of rows(read(`records/${slug}`))) {
      const pair = r.match(/href="\/head-to-head\/(\d+)-(\d+)\/"/);
      assert.ok(pair, slug);
      assert.ok(Number(pair[1]) < Number(pair[2]));
      assert.ok(existsSync(join(DIST, 'head-to-head', `${pair[1]}-${pair[2]}`, 'index.html')));
    }
  }
  const most = db.prepare('select games from head_to_head order by games desc').all().map((r) => r.games);
  assert.deepEqual(figures(read('records/most-played-pairing')), topTen(most).map(String));
});

test('division rows name the season’s division, its lineage and its franchises', () => {
  const pf = db
    .prepare('select season, round(sum(points_for), 2) as pf from season_lines where season >= 2015 group by season, division order by pf desc')
    .all()
    .filter((r) => r.season !== current || crowned)
    .map((r) => r.pf);
  const html = read('records/group-of-death');
  assert.deepEqual(figures(html), topTen(pf).map((p) => p.toFixed(2)));
  for (const r of rows(html)) {
    assert.equal([...r.matchAll(/href="\/franchises\/\d+\/"/g)].length, 4);
    assert.match(r, /<td>[^<]+, \d{4}(–\d{4})?<\/td>/);
  }
});

test('the best NFL player score names the player and the game', () => {
  const scores = db.prepare('select points from lineups where starter = 1 and points is not null order by points desc').all().map((r) => r.points);
  const html = read('records/best-nfl-player-score');
  assert.deepEqual(figures(html), topTen(scores).map((p) => p.toFixed(2)));
  for (const r of rows(html)) assert.match(r, /href="\/seasons\/\d{4}\/#week-\d+"/);
});

test('every profile lists its records held, with rank, instead of “still to come”', () => {
  const top = db
    .prepare(`select f from (select home_franchise_id f, home_points p from games union all
              select away_franchise_id, away_points from games) where p is not null order by p desc limit 1`)
    .get().f;
  const held = section(read(`franchises/${top}`), 'Records held');
  assert.match(held, /href="\/records\/highest-score\/">Highest score<\/a>[\s\S]*?<td class="num">1<\/td>/);
  const god = db.prepare('select season, division from record_divisions order by points_for desc limit 1').get();
  for (const { f } of db.prepare('select franchise_id f from season_lines where season = ? and division = ?').all(god.season, god.division))
    assert.match(section(read(`franchises/${f}`), 'Records held'), /href="\/records\/group-of-death\/"/, `franchise ${f}`);
  for (const { id } of db.prepare('select id from franchises').all())
    assert.doesNotMatch(section(read(`franchises/${id}`), 'Records held'), /still to come/, `franchise ${id}`);
});
