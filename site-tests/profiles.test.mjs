// Franchise profiles and head-to-head pages (#27) against the database they
// were built from. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const read = (...path) => decode(readFileSync(join(DIST, ...path, 'index.html'), 'utf8'));
const profile = (id) => read('franchises', String(id));
const franchises = db.prepare('select id, name, active from franchises order by id').all();
const pairs = db.prepare('select * from head_to_head order by lo_franchise_id, hi_franchise_id').all();
const SECTIONS = ['Team names', 'Career', 'Season by season', 'Brackets', 'Awards', 'Records held',
  'Head-to-head', 'Best and worst games', 'Sleeper era'];

const section = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}(<small|</h2>)`));
  assert.ok(at >= 0, `section ${label}`);
  const next = html.indexOf('<section', at);
  return html.slice(at, next < 0 ? undefined : next);
};
// A franchise that played every season through the gap years (2022-24).
const gapFranchise = db
  .prepare("select franchise_id as id from season_lines where season = 2023 and source = 'reported' order by 1 limit 1")
  .get().id;

test('every franchise profile has its sections, in order', () => {
  for (const f of franchises) {
    const labels = [...profile(f.id).matchAll(/<h2 class="lab"[^>]*>([^<]*)/g)].map((m) => m[1]);
    assert.deepEqual(labels.slice(1), SECTIONS, `franchise ${f.id}`);
  }
});

test('the header says active or departed, seasons played and the current division', () => {
  for (const f of franchises) {
    const html = section(profile(f.id), 'Franchise');
    const career = db.prepare('select seasons from franchise_careers where franchise_id = ?').get(f.id);
    assert.match(html, new RegExp(`${career.seasons} seasons?`), `franchise ${f.id}`);
    if (f.active) assert.match(html, /Division/, `franchise ${f.id}`);
    else assert.match(html, /Departed/, `franchise ${f.id}`);
  }
});

test('team names are listed by season', () => {
  const names = db.prepare('select season, team_name from team_names where franchise_id = ? order by season').all(gapFranchise);
  const html = section(profile(gapFranchise), 'Team names');
  for (const n of names) assert.match(html, new RegExp(`${n.season}[\\s\\S]*?${n.team_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('the career summary shows W-L-T, win %, points per game, Breakdown % and titles', () => {
  for (const f of franchises) {
    const c = db.prepare('select * from franchise_careers where franchise_id = ?').get(f.id);
    const html = section(profile(f.id), 'Career');
    assert.ok(html.includes(`${c.wins}-${c.losses}-${c.ties}`), `franchise ${f.id} W-L-T`);
    if (c.win_pct !== null) assert.ok(html.includes((c.win_pct * 100).toFixed(1)), `franchise ${f.id} win %`);
    if (c.points_for_per_game !== null) assert.ok(html.includes(c.points_for_per_game.toFixed(2)), `franchise ${f.id} PF/G`);
    if (c.breakdown_pct !== null) assert.ok(html.includes((c.breakdown_pct * 100).toFixed(1)), `franchise ${f.id} Breakdown`);
    assert.match(html, new RegExp(`<dd>${c.championships}</dd><dt>Championships`), `franchise ${f.id}`);
    assert.match(html, new RegExp(`<dd>${c.shit_bowls}</dd><dt>Shit Bowl`), `franchise ${f.id}`);
  }
});

test('gap seasons carry markers on the profile', () => {
  const html = profile(gapFranchise);
  assert.match(section(html, 'Season by season'), /<sup class="mk"[^>]*>†<\/sup>/);
  assert.match(section(html, 'Best and worst games'), /<sup class="mk"[^>]*>\*<\/sup>|no game scores/i);
});

test('season by season lists every season line with its final placing', () => {
  const lines = db.prepare('select season, final_placing from season_lines where franchise_id = ?').all(gapFranchise);
  const html = section(profile(gapFranchise), 'Season by season');
  for (const l of lines) assert.match(html, new RegExp(`href="/seasons/${l.season}/"`));
});

test('bracket history links each bracket game to its week and names titles', () => {
  const champ = db.prepare("select franchise_id as id, season from bracket_winners where bracket = 'playoffs' and season = 2016").get();
  const html = section(profile(champ.id), 'Brackets');
  assert.match(html, /Champion/);
  assert.match(html, /href="\/seasons\/2016\/#week-\d+"/);
});

test('head-to-head lists every opponent, linking to the pair page lower id first', () => {
  for (const f of franchises) {
    const html = section(profile(f.id), 'Head-to-head');
    for (const p of pairs.filter((p) => p.lo_franchise_id === f.id || p.hi_franchise_id === f.id)) {
      assert.ok(html.includes(`href="/head-to-head/${p.lo_franchise_id}-${p.hi_franchise_id}/"`), `franchise ${f.id}`);
    }
  }
});

test('best and worst games link to their week on the season page', () => {
  const html = section(profile(gapFranchise), 'Best and worst games');
  assert.match(html, /href="\/seasons\/\d{4}\/#week-\d+"/);
});

test('pair pages exist only for pairs that have met', () => {
  const met = new Set(pairs.map((p) => `${p.lo_franchise_id}-${p.hi_franchise_id}`));
  const pages = readdirSync(join(DIST, 'head-to-head')).filter((n) => /^\d+-\d+$/.test(n));
  const canonical = pages.filter((n) => { const [a, b] = n.split('-').map(Number); return a < b; });
  assert.deepEqual(new Set(canonical), met);
  for (const lo of franchises) {
    for (const hi of franchises) {
      if (lo.id < hi.id && !met.has(`${lo.id}-${hi.id}`)) assert.ok(!existsSync(join(DIST, 'head-to-head', `${lo.id}-${hi.id}`)));
    }
  }
});

test('a pair page shows W-L-T, points and every game, each linking to its week', () => {
  for (const p of pairs) {
    const html = read('head-to-head', `${p.lo_franchise_id}-${p.hi_franchise_id}`);
    assert.ok(html.includes(`${p.lo_wins}-${p.hi_wins}-${p.ties}`), `${p.lo_franchise_id}-${p.hi_franchise_id}`);
    assert.ok(html.includes(p.lo_points.toFixed(2)), `${p.lo_franchise_id}-${p.hi_franchise_id} points`);
    const weeks = db
      .prepare(`select season, week from games where (home_franchise_id = ? and away_franchise_id = ?)
                or (home_franchise_id = ? and away_franchise_id = ?)`)
      .all(p.lo_franchise_id, p.hi_franchise_id, p.hi_franchise_id, p.lo_franchise_id);
    assert.equal(weeks.length, p.games);
    for (const g of weeks) assert.ok(html.includes(`href="/seasons/${g.season}/#week-${g.week}"`), `${g.season} wk ${g.week}`);
    if (p.games_missing) assert.match(html, /<sup class="mk"[^>]*>†<\/sup>/);
    if (p.bracket_games) assert.match(html, /Bracket meetings/);
  }
});

test('the reversed pair redirects to the lower id first', () => {
  const p = pairs.find((p) => p.lo_franchise_id === 5 && p.hi_franchise_id === 9) ?? pairs[0];
  const html = readFileSync(join(DIST, 'head-to-head', `${p.hi_franchise_id}-${p.lo_franchise_id}`, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`http-equiv="refresh" content="0;\\s*url=/head-to-head/${p.lo_franchise_id}-${p.hi_franchise_id}/"`));
});

test('no manager is named on a profile or pair page', () => {
  // Owner ids are the managers' platform ids; names never reach the database.
  const owners = readFileSync('data/franchises.csv', 'utf8')
    .split('\n')
    .filter((l) => /^\d+,nfl\.com,/.test(l))
    .map((l) => l.split(',')[3])
    .filter((id) => id.length >= 5);
  const pages = [...franchises.map((f) => profile(f.id)), ...pairs.map((p) => read('head-to-head', `${p.lo_franchise_id}-${p.hi_franchise_id}`))];
  for (const html of pages) {
    assert.doesNotMatch(html, /manager|owner/i);
    for (const id of owners) assert.ok(!new RegExp(`\\b${id}\\b`).test(html), `owner id ${id}`);
  }
});
