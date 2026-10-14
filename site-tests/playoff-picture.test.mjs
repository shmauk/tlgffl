// The playoff picture (#34) on Sleeper-era season pages, against the database.
// Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const page = (year) => readFileSync(join('dist', 'seasons', String(year), 'index.html'), 'utf8');
const standings = (html) => {
  const at = html.search(/<h2 class="lab"[^>]*>Standings/);
  return html.slice(at, html.indexOf('<section', at));
};
// Each table row as [franchise id, seed, bracket].
const rows = (html) =>
  [...html.matchAll(/<tr[^>]*>\s*<td><a class="fr" href="\/franchises\/(\d+)\/"[\s\S]*?<\/tr>/g)].map((m) => {
    const cells = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    return [Number(m[1]), cells[4], cells[5]];
  });
const SLEEPER = db.prepare(`select distinct season from season_lines l join seasons s on s.year = l.season
                            where s.era = 'sleeper'`).all().map((r) => r.season);

test('every Sleeper season with games shows each franchise once, with a seed and a bracket', () => {
  assert.ok(SLEEPER.length > 0);
  for (const year of SLEEPER) {
    const shown = rows(standings(page(year)));
    const lines = db.prepare('select franchise_id from season_lines where season = ?').all(year);
    assert.deepEqual(shown.map(([f]) => f).sort((a, b) => a - b), lines.map((l) => l.franchise_id).sort((a, b) => a - b), String(year));
    for (const [f, seed, bracket] of shown) {
      assert.match(seed, /^=?\d+$/, `${year} franchise ${f}`);
      assert.match(bracket, /^(Playoffs|Mediocre Bowl|Shit Bowl)$/, `${year} franchise ${f}`);
    }
  }
});

test('a finished Sleeper season seeds each bracket with the franchises that played in it', () => {
  const NAMES = { playoffs: 'Playoffs', mediocre_bowl: 'Mediocre Bowl', shit_bowl: 'Shit Bowl' };
  const finished = db.prepare(`select distinct season from games g join seasons s on s.year = g.season
                               where s.era = 'sleeper' and g.phase = 'bracket'`).all().map((r) => r.season);
  assert.ok(finished.includes(2025));
  for (const year of finished) {
    const shown = new Map(rows(standings(page(year))).map(([f, , bracket]) => [f, bracket]));
    for (const { bracket, f } of db.prepare(`select bracket, home_franchise_id as f from games where season = ? and phase = 'bracket'
                                             union select bracket, away_franchise_id from games where season = ? and phase = 'bracket'`).all(year, year)) {
      assert.equal(shown.get(f), NAMES[bracket], `${year} franchise ${f}`);
    }
  }
});

test('a season whose regular season is still on is headed as the playoff picture, with cut-off lines', () => {
  const current = db.prepare(`select distinct season from upcoming_games`).all().map((r) => r.season);
  for (const year of current) {
    const html = standings(page(year));
    assert.match(html, /Playoff picture by division/, String(year));
    assert.match(html, /<tr class="cut"/, String(year));
  }
});
