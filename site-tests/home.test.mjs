// The home page and the season in progress (#35) against the database. Holds
// in any phase: the real season moves daily (src/components/Home.test.ts pins
// each phase with fixtures). Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const home = readFileSync(join('dist', 'index.html'), 'utf8');
const row = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}`));
  if (at < 0) return '';
  const end = html.indexOf('<section', at + 1);
  return html.slice(at, end < 0 ? html.indexOf('</main>', at) : end);
};
const season = Number(home.match(/<h1>(\d{4})<\/h1>/)?.[1]);
const finalWeek = db.prepare('select max(week) as w from games where season = ?').get(season)?.w ?? null;

test('the home page names the current season with its updated line and has no JS', () => {
  assert.ok(season >= db.prepare('select max(season) as s from games').get().s);
  assert.match(home, finalWeek === null ? /Updated \d+ \w+ \d{4}, week 1 not yet final/ : new RegExp(`Updated \\d+ \\w+ \\d{4}, through week ${finalWeek}<`));
  assert.doesNotMatch(home, /<script/i);
});

test('the week being played shows its matchups with no scores', () => {
  const now = row(home, `Week ${(finalWeek ?? 0) + 1}`);
  if (!now) return;
  assert.doesNotMatch(now, /\d+\.\d\d/);
});

test('no week still to be played shows a score on its season page', () => {
  const weeks = db
    .prepare(`select distinct season, week from upcoming_games union select distinct season, week from upcoming_bracket_pairings`)
    .all();
  for (const { season: s, week } of weeks) {
    const page = readFileSync(join('dist', 'seasons', String(s), 'index.html'), 'utf8');
    const at = page.indexOf(`<tr id="week-${week}"`);
    if (at < 0) continue;
    const tr = page.slice(at, page.indexOf('</tr>', at));
    assert.doesNotMatch(tr, /\d+\.\d\d/, `${s} week ${week}`);
  }
});

test('during the regular season the season page shows award leaders and when the brackets are set', () => {
  if (!/<small>Regular season<\/small>/.test(home)) return;
  const page = readFileSync(join('dist', 'seasons', String(season), 'index.html'), 'utf8');
  const last = db.prepare('select regular_season_last_week as w from season_formats where season = ?').get(season).w;
  assert.match(row(page, 'Brackets'), new RegExp(`Brackets are set after week ${last}\\.`));
  assert.match(page, /<h2 class="lab"[^>]*>Award leaders<small>So far/);
  assert.match(page, /<h2 class="lab"[^>]*>Highs and lows<small>Games with a score, so far/);
  assert.match(page, /<h2 class="lab"[^>]*>Standings<small>Playoff picture by division/);
});

test('a season in progress says so under its title, through its latest final week', () => {
  const inProgress = db
    .prepare(`select season from upcoming_games union select season from upcoming_bracket_pairings`)
    .all()
    .map((r) => r.season)
    .filter((s) => s === season);
  for (const s of inProgress) {
    const page = readFileSync(join('dist', 'seasons', String(s), 'index.html'), 'utf8');
    const w = db.prepare('select max(week) as w from games where season = ?').get(s).w;
    if (w === null) continue;
    assert.match(page, new RegExp(`In progress, through week ${w} · updated \\d+ \\w+ \\d{4}`));
  }
});
