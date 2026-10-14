// Records held (#32) against the build's own database (run the Python build
// first). Expected holders come from plain SQL, not from the code under test.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { open } from '../database';
import { RECORDS } from './catalogue';
import { recordsHeld } from './held';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db = open();
const all = (sql: string) => sqlite.prepare(sql).all() as any[];
const ids = all('select id from franchises').map((r) => r.id as number);
const held = (id: number, slug: string) => recordsHeld(db, id).filter((h) => h.def.slug === slug).map((h) => h.rank);

describe('records held', () => {
  test('the franchise with the highest score holds it at rank 1', () => {
    const top = all(`select f, p from (select home_franchise_id f, home_points p from games
                     union all select away_franchise_id, away_points from games) where p is not null order by p desc limit 1`)[0];
    expect(held(top.f, 'highest-score')[0]).toBe(1);
  });

  test('both franchises of the most-played pairing hold it', () => {
    const top = all('select lo_franchise_id lo, hi_franchise_id hi from head_to_head where games = (select max(games) from head_to_head)');
    for (const p of top) {
      expect(held(p.lo, 'most-played-pairing')[0]).toBe(1);
      expect(held(p.hi, 'most-played-pairing')[0]).toBe(1);
    }
  });

  test('every franchise of the Group of Death holds it', () => {
    const top = all('select season, division from record_divisions order by points_for desc limit 1')[0];
    const members = all(`select franchise_id f from season_lines where season = ${top.season} and division = '${top.division}'`);
    expect(members).toHaveLength(4);
    for (const m of members) expect(held(m.f, 'group-of-death')[0]).toBe(1);
  });

  test('every record with entries is held by someone, at ranks 1 to 10; unranked lists hold nothing', () => {
    const holdings = ids.flatMap((id) => recordsHeld(db, id));
    for (const def of RECORDS.filter((d) => !d.all)) {
      const ranks = holdings.filter((h) => h.def.slug === def.slug).map((h) => h.rank);
      if (ranks.length) {
        expect(Math.min(...ranks), def.slug).toBe(1);
        expect(Math.max(...ranks), def.slug).toBeLessThanOrEqual(10);
      }
    }
    expect(holdings.some((h) => h.def.all)).toBe(false);
    // One record from each category beyond scoring and results.
    for (const slug of ['most-wins', 'luckiest-season', 'championships', 'most-lopsided-rivalry', 'group-of-death', 'weakest-division-by-wins', 'best-nfl-player-score',
      'most-bench-points-in-a-game', 'most-bench-points-in-a-season'])
      expect(holdings.some((h) => h.def.slug === slug), slug).toBe(true);
  });

  test('a franchise’s records come in catalogue order', () => {
    const order = RECORDS.map((d) => d.slug);
    for (const id of ids) {
      const slugs = recordsHeld(db, id).map((h) => order.indexOf(h.def.slug));
      expect(slugs).toEqual([...slugs].sort((a, b) => a - b));
    }
  });
});
