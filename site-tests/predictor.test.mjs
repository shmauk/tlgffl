// The playoff predictor (#36) against the database: it exists only for the
// current season's regular season, and with no picks it shows the playoff
// picture. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');

// The current season, if its regular season is still being played on Sleeper.
const current = db
  .prepare(`select c.season as year, s.era, c.phase, c.through, b.today from current_season c
            join seasons s on s.year = c.season, build_date b`)
  .get();
const live =
  current?.era === 'sleeper' && current.phase === 'regular' &&
  db.prepare('select count(*) as n from upcoming_games where season = ?').get(current.year).n > 0
    ? current.year
    : null;
const PREDICTOR = live && join(DIST, 'seasons', String(live), 'predictor', 'index.html');

test('the predictor is generated for the current season’s regular season only', () => {
  const made = readdirSync(join(DIST, 'seasons')).filter((d) => existsSync(join(DIST, 'seasons', d, 'predictor', 'index.html')));
  assert.deepEqual(made, live ? [String(live)] : []);
});

test('the predictor says when it was updated and through which week, like every current-season view', () => {
  if (!live) return;
  const html = readFileSync(PREDICTOR, 'utf8');
  const [y, m, d] = current.today.split('-').map(Number);
  const date = `${d} ${new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y}`;
  const week = current.through === null ? 'week 1 not yet final' : `through week ${current.through}`;
  assert.match(html, new RegExp(`<p class="sub">Updated ${date}, ${week}</p>`));
});

// Each franchise's row of a standings table: W-L-T, seed, bracket and marks.
const rows = (html, wlt, seed, bracket) =>
  new Map(
    [...html.matchAll(/<tr[^>]*>\s*<td><a class="fr" href="\/franchises\/(\d+)\/"[\s\S]*?<\/tr>/g)].map((m) => {
      const cells = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
      const marks = [...cells[0].matchAll(/<span class="bd[^"]*"[^>]*>([^<]*)<\/span>/g)].map((b) => b[1]);
      return [Number(m[1]), [cells[wlt], cells[seed], cells[bracket], marks].map(String).join(' | ')];
    }),
  );
const section = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}`));
  return html.slice(at, html.indexOf('</section>', at));
};

test('with no picks, the predictor shows exactly the playoff picture', { skip: !live && 'no season in progress' }, () => {
  const season = decode(readFileSync(join(DIST, 'seasons', String(live), 'index.html'), 'utf8'));
  const predictor = decode(readFileSync(PREDICTOR, 'utf8'));
  const picture = rows(section(season, 'Standings'), 1, 4, 5);
  const predicted = rows(section(predictor, 'Standings'), 1, 2, 3);
  assert.ok(picture.size > 0);
  assert.deepEqual(predicted, picture);
});

test('the season page links to its predictor', { skip: !live && 'no season in progress' }, () => {
  const html = readFileSync(join(DIST, 'seasons', String(live), 'index.html'), 'utf8');
  assert.match(html, new RegExp(`href="/seasons/${live}/predictor/"`));
});

test('the predictor ships its inputs and starts its clinch search in a Web Worker', { skip: !live && 'no season in progress' }, () => {
  const html = readFileSync(PREDICTOR, 'utf8');
  const data = JSON.parse(html.match(/data-predictor="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
  assert.equal(data.season, live);
  const upcoming = db.prepare('select count(*) as n from upcoming_games where season = ?').get(live).n;
  assert.equal(data.input.remaining.length, upcoming);
  assert.ok(walk(DIST).some((f) => /predictor-worker[^/]*\.js$/.test(f)));
});
