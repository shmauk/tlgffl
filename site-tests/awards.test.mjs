// Awards (#33): /seasons/awards/, each award's page, the season pages' awards
// section and the profiles' award tally, against the database they were built
// from. Run after `npm run build`: npm run test:site
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DIST = 'dist';
const db = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const decode = (s) => s.replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const read = (...path) => decode(readFileSync(join(DIST, ...path, 'index.html'), 'utf8'));
const awards = db.prepare('select slug, name, definition, measure from awards order by position').all();
const winners = db.prepare('select award, season, franchise_id as id from award_results where rank = 1').all();
const unknowns = db.prepare('select award, season from award_unknowns').all();

const section = (html, label) => {
  const at = html.search(new RegExp(`<h2 class="lab"[^>]*>${label}(<small|</h2>)`));
  assert.ok(at >= 0, `section ${label}`);
  const next = html.indexOf('<section', at);
  return html.slice(at, next < 0 ? undefined : next);
};
// The part of a section about one award: from its link to the next award's.
const about = (html, slug) => {
  const at = html.indexOf(`href="/seasons/awards/${slug}/"`);
  assert.ok(at >= 0, slug);
  const next = html.indexOf('href="/seasons/awards/', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
};
const seasonsOf = (slug) => [...new Set(winners.filter((w) => w.award === slug).map((w) => w.season))].sort();

test('the awards page defines all nine awards and links each to its page', () => {
  assert.equal(awards.length, 9);
  const html = read('seasons', 'awards');
  for (const a of awards) {
    const part = about(html, a.slug);
    assert.ok(part.includes(a.name), a.name);
    assert.ok(part.includes(a.definition), `${a.name} definition`);
  }
});

test('the awards page says which seasons each award was given in', () => {
  const html = read('seasons', 'awards');
  assert.match(about(html, 'nail-biter'), /2012–2021, 2025/);
  assert.match(about(html, 'pick-a-lane'), /2012–2025/);
  assert.match(about(html, 'one-man-army'), /2025/);
  assert.match(about(html, 'draft-dodger'), /Unknown: 2025/);
});

test('an award page lists every season’s winners, co-winners included, linked', () => {
  for (const a of awards) {
    const html = section(read('seasons', 'awards', a.slug), 'By season');
    for (const season of seasonsOf(a.slug)) {
      const row = html.match(new RegExp(`<tr[^>]*>\\s*<td><a href="/seasons/${season}/"[\\s\\S]*?</tr>`));
      assert.ok(row, `${a.slug} ${season}`);
      const shown = [...row[0].matchAll(/href="\/franchises\/(\d+)\/"/g)].map((m) => Number(m[1])).sort((x, y) => x - y);
      const expected = winners.filter((w) => w.award === a.slug && w.season === season).map((w) => w.id).sort((x, y) => x - y);
      assert.deepEqual(shown, expected, `${a.slug} ${season}`);
    }
  }
  // 2025's Highest failed bid is shared.
  assert.equal(winners.filter((w) => w.award === 'highest-failed-bid' && w.season === 2025).length, 2);
});

test('an award page heads its values with what they measure', () => {
  for (const a of awards) {
    const html = section(read('seasons', 'awards', a.slug), 'By season');
    assert.ok(html.includes(`<th class="num">${a.measure}</th>`), a.slug);
  }
});

test('an award page has an all-time tally of every winner', () => {
  for (const a of awards) {
    const html = section(read('seasons', 'awards', a.slug), 'All-time tally');
    const tally = new Map();
    for (const w of winners.filter((w) => w.award === a.slug)) tally.set(w.id, (tally.get(w.id) ?? 0) + 1);
    for (const [id, n] of tally) {
      assert.match(html, new RegExp(`href="/franchises/${id}/"[\\s\\S]*?<td class="num">${n}</td>`), `${a.slug} ${id}`);
    }
  }
});

test('an award with no winner for a season says why: unknown, not zero', () => {
  const html = section(read('seasons', 'awards', 'draft-dodger'), 'By season');
  for (const u of unknowns.filter((u) => u.award === 'draft-dodger')) {
    assert.match(html, new RegExp(`/seasons/${u.season}/[\\s\\S]*?Unknown`), String(u.season));
  }
});

test('a season page names each award’s winners and links the award', () => {
  for (const season of [2015, 2021, 2025]) {
    const html = section(read('seasons', String(season)), 'Awards');
    for (const a of awards.filter((a) => seasonsOf(a.slug).includes(season))) {
      const part = about(html, a.slug);
      for (const w of winners.filter((w) => w.award === a.slug && w.season === season)) {
        assert.match(part, new RegExp(`href="/franchises/${w.id}/"`), `${season} ${a.slug}`);
      }
    }
  }
  assert.match(about(section(read('seasons', '2025'), 'Awards'), 'draft-dodger'), /Unknown/);
});

test('a season page’s award values say, on hover, what they measure', () => {
  const html = section(read('seasons', '2025'), 'Awards');
  for (const a of awards.filter((a) => seasonsOf(a.slug).includes(2025))) {
    assert.ok(about(html, a.slug).includes(`<sup class="mk" title="${a.measure}">?</sup>`), a.slug);
  }
});

test('a season without every regular-season game has no game awards', () => {
  const html = section(read('seasons', '2023'), 'Awards');
  const [table, notes] = html.split('<div class="notes">');
  assert.ok(table.includes('href="/seasons/awards/pick-a-lane/"'));
  assert.ok(!table.includes('href="/seasons/awards/nail-biter/"'));
  assert.match(notes, /Not awarded this season:[\s\S]*Nail Biter/);
});

test('a franchise profile tallies its awards with the seasons won', () => {
  const franchises = db.prepare('select id from franchises').all().map((f) => f.id);
  for (const id of franchises) {
    const html = section(read('franchises', String(id)), 'Awards');
    const mine = winners.filter((w) => w.id === id);
    if (mine.length === 0) {
      assert.match(html, /No awards/, String(id));
      continue;
    }
    for (const a of awards) {
      const won = mine.filter((w) => w.award === a.slug).map((w) => w.season).sort();
      if (won.length === 0) continue;
      const part = about(html, a.slug);
      assert.match(part, new RegExp(`<td class="num">${won.length}</td>`), `${id} ${a.slug}`);
      for (const season of won) assert.ok(part.includes(`href="/seasons/${season}/"`), `${id} ${a.slug} ${season}`);
    }
  }
});
