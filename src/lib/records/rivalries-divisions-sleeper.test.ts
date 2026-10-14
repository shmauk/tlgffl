// Head-to-head, division and Sleeper-era records (#32) against the build's own
// database (run the Python build first). Expected figures come from plain SQL
// over the games, season lines and lineups, not from the code under test.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { open } from '../database';
import { runQuery } from '../statsguru/engine';
import { DEFAULT_QUERY, decodeQuery, encodeQuery } from '../statsguru/query';
import { CATEGORIES, RECORDS, recordDef, variants } from './catalogue';
import { recordView } from './records';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db = open();
const all = (sql: string, ...params: (number | string)[]) => sqlite.prepare(sql).all(...params) as any[];
const one = (sql: string, ...params: (number | string)[]) => sqlite.prepare(sql).get(...params) as any;
const view = (slug: string, era?: string, phase?: string) =>
  recordView(db, recordDef(slug)!, (era ?? recordDef(slug)!.eras[0]) as any, (phase ?? recordDef(slug)!.phases[0]) as any);
const current = one('select season as y from current_season').y;
const crowned = one(`select count(*) as n from bracket_winners where season = ? and bracket = 'playoffs' and franchise_id is not null`, current).n > 0;
const completed = (season: number) => season !== current || crowned;

// Every pair's games over the given SQL condition on games g, lower id first.
const pairs = (where = '1') =>
  all(`select min(home_franchise_id, away_franchise_id) as lo, max(home_franchise_id, away_franchise_id) as hi,
              count(*) as games,
              sum(case when winner_franchise_id = min(home_franchise_id, away_franchise_id) then 1.0
                       when winner_franchise_id is null then 0.5 else 0 end) as lo_score
       from games g where status = 'final' and ${where} group by 1, 2`);

describe('the catalogue', () => {
  test('head-to-head, divisions and the Sleeper era are built', () => {
    const built = CATEGORIES.filter((c) => c.built).map((c) => c.slug);
    for (const slug of ['head-to-head', 'divisions', 'sleeper']) expect(built).toContain(slug);
    expect(CATEGORIES.find((c) => c.slug === 'head-to-head')!.records.map((r) => r.slug)).toEqual([
      'most-lopsided-rivalry', 'most-played-pairing']);
    expect(CATEGORIES.find((c) => c.slug === 'divisions')!.records.map((r) => r.slug)).toEqual([
      'group-of-death', 'winningest-division', 'weakest-division-by-points-for', 'weakest-division-by-wins']);
    expect(CATEGORIES.find((c) => c.slug === 'sleeper')!.records.map((r) => r.slug)).toEqual([
      'best-nfl-player-score', 'most-bench-points-in-a-game', 'most-bench-points-in-a-season']);
  });

  test('Sleeper-era records have no era filter, and season records no phase filter', () => {
    for (const slug of ['best-nfl-player-score', 'most-bench-points-in-a-game', 'most-bench-points-in-a-season'])
      expect(recordDef(slug)!.eras, slug).toEqual(['sleeper']);
    expect(recordDef('most-bench-points-in-a-season')!.phases).toEqual(['regular']);
    for (const slug of ['group-of-death', 'weakest-division-by-wins']) expect(recordDef(slug)!.phases).toEqual(['regular']);
  });
});

describe('head-to-head', () => {
  test('most lopsided rivalry: the best win % against one opponent over at least 6 games', () => {
    const best = Math.max(
      ...pairs().filter((p) => p.games >= 6).map((p) => Math.max(p.lo_score, p.games - p.lo_score) / p.games),
    );
    const v = view('most-lopsided-rivalry');
    expect(v.entries[0].value).toBeCloseTo(best, 10);
    for (const e of v.entries) {
      expect(e.games!).toBeGreaterThanOrEqual(6);
      expect(e.opponent).toBeDefined();
      // The entry's franchise is the one on the right side of it.
      expect(e.value).toBeGreaterThanOrEqual(0.5);
    }
  });

  test('most-played pairing lists each pair once', () => {
    const most = Math.max(...pairs().map((p) => p.games));
    const v = view('most-played-pairing');
    expect(v.entries[0].value).toBe(most);
    const keys = v.entries.map((e) => [e.franchise.id, e.opponent!.id].sort((a, b) => a - b).join('-'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('the era and phase filters keep to their games', () => {
    const sleeper = pairs("season >= 2025 and phase = 'regular'");
    expect(view('most-played-pairing', 'sleeper', 'regular').entries[0].value).toBe(Math.max(...sleeper.map((p) => p.games)));
    const playoffs = pairs("bracket = 'playoffs'");
    expect(view('most-played-pairing', 'all', 'playoffs').entries[0].value).toBe(Math.max(...playoffs.map((p) => p.games)));
  });

  test('pairs who may have met in weeks with no game record carry †', () => {
    const v = view('most-played-pairing');
    const missing = new Set(all('select lo_franchise_id || \'-\' || hi_franchise_id as k from head_to_head where games_missing = 1').map((r) => r.k));
    for (const e of v.entries) {
      const k = [e.franchise.id, e.opponent!.id].sort((a, b) => a - b).join('-');
      expect(!!e.gamesMissing, k).toBe(missing.has(k));
    }
    if (v.entries.some((e) => e.gamesMissing)) expect(v.notes.map((n) => n.glyph)).toContain('†');
    expect(view('most-played-pairing', 'sleeper').entries.some((e) => e.gamesMissing)).toBe(false);
  });

  test('the full list in Statsguru gives the same figures', () => {
    for (const slug of ['most-lopsided-rivalry', 'most-played-pairing'])
      for (const { era, phase } of variants(recordDef(slug)!)) {
        const v = recordView(db, recordDef(slug)!, era, phase);
        const rows = runQuery(db, decodeQuery(encodeQuery({ ...DEFAULT_QUERY, ...v.statsguru! }))).rows as any[];
        const seen = new Set<string>();
        const figures: number[] = [];
        for (const r of rows) {
          if (r.kind !== 'group' || !r.opponent) continue;
          const k = [r.franchise.id, r.opponent.id].sort((a, b) => a - b).join('-');
          if (seen.has(k)) continue;
          seen.add(k);
          figures.push(slug === 'most-played-pairing' ? r.gp : r.pct);
        }
        expect(v.entries.map((e) => e.value), `${slug} ${era} ${phase}`).toEqual(figures.slice(0, v.entries.length));
      }
  });
});

describe('divisions', () => {
  // Each completed season's divisions, summed from the season lines (2015+).
  const divisions = all(`select season, division, sum(wins) as w, round(sum(points_for), 2) as pf, count(*) as n
                         from season_lines where season >= 2015 group by 1, 2`).filter((d) => completed(d.season));

  test('Group of Death: the most combined points for in a season', () => {
    const top = divisions.reduce((a, b) => (b.pf > a.pf ? b : a));
    const e = view('group-of-death').entries[0];
    expect(e.value).toBeCloseTo(top.pf, 2);
    expect([e.at!.season, e.division!.name]).toEqual([top.season, top.division]);
    expect(e.members).toHaveLength(top.n);
  });

  test('Winningest, and the weakest by wins and by points for', () => {
    expect(view('winningest-division').entries[0].value).toBe(Math.max(...divisions.map((d) => d.w)));
    expect(view('weakest-division-by-wins').entries[0].value).toBe(Math.min(...divisions.map((d) => d.w)));
    expect(view('weakest-division-by-points-for').entries[0].value).toBeCloseTo(Math.min(...divisions.map((d) => d.pf)), 2);
  });

  test('each row names its season’s division with its lineage', () => {
    for (const e of view('group-of-death').entries) {
      const l = one('select lineage from division_lineages where season = ? and division = ?', e.at!.season, e.division!.name);
      expect(l, `${e.at!.season} ${e.division!.name}`).toBeDefined();
      expect(e.division!.lineage).toMatch(/^.+, \d{4}(–\d{4})?$/);
    }
  });

  test('the era filter keeps to its seasons; nothing before 2015 or in progress', () => {
    for (const e of view('group-of-death', 'nfl-com').entries) expect(e.at!.season).toBeLessThanOrEqual(2024);
    for (const e of view('group-of-death', 'sleeper').entries) expect(e.at!.season).toBeGreaterThanOrEqual(2025);
    for (const e of view('weakest-division-by-wins').entries) {
      expect(e.at!.season).toBeGreaterThanOrEqual(2015);
      expect(completed(e.at!.season)).toBe(true);
    }
  });

  test('divisions summed from NFL.com’s reported season lines carry †', () => {
    const v = view('group-of-death', 'nfl-com');
    const reported = new Set(all(`select distinct season from season_lines where source = 'reported'`).map((r) => r.season));
    for (const e of v.entries) expect(!!e.reported).toBe(reported.has(e.at!.season));
    if (v.entries.some((e) => e.reported)) expect(v.notes.map((n) => n.glyph)).toContain('†');
  });
});

describe('Sleeper era', () => {
  test('best single NFL player score: the highest started player’s points', () => {
    const top = one('select max(points) as p from lineups where starter = 1').p;
    const v = view('best-nfl-player-score');
    expect(v.entries[0].value).toBe(top);
    for (const e of v.entries) {
      expect(e.player?.id).toBeTruthy();
      expect(e.at!.season).toBeGreaterThanOrEqual(2025);
      expect(e.thisSeason).toBe(e.at!.season === current);
    }
  });

  test('most bench points in a game: the most a franchise left on its bench', () => {
    const top = one(`select max(p) as p from (select round(sum(points), 2) as p from lineups where starter = 0
                     group by season, week, franchise_id)`).p;
    expect(view('most-bench-points-in-a-game').entries[0].value).toBeCloseTo(top, 2);
  });

  test('the Playoffs filter keeps to Playoffs games', () => {
    const top = one(`select max(l.points) as p from lineups l join games g on g.season = l.season and g.week = l.week
                       and l.franchise_id in (g.home_franchise_id, g.away_franchise_id)
                     where l.starter = 1 and g.bracket = 'playoffs'`).p;
    const v = view('best-nfl-player-score', 'sleeper', 'playoffs');
    if (top === null) expect(v.entries).toEqual([]);
    else expect(v.entries[0].value).toBe(top);
  });

  test('most bench points in a season: completed seasons’ regular seasons', () => {
    const rows = all(`select l.season, l.franchise_id, round(sum(l.points), 2) as p from lineups l
                      join games g on g.season = l.season and g.week = l.week
                        and l.franchise_id in (g.home_franchise_id, g.away_franchise_id)
                      where l.starter = 0 and g.phase = 'regular' group by 1, 2`).filter((r) => completed(r.season));
    const v = view('most-bench-points-in-a-season');
    expect(v.entries[0].value).toBeCloseTo(Math.max(...rows.map((r) => r.p)), 2);
    for (const e of v.entries) expect(completed(e.seasons![0])).toBe(true);
  });
});

test('every record of the catalogue is still one of RECORDS', () => {
  for (const c of CATEGORIES.filter((c) => c.built))
    for (const r of c.records) if (r.slug) expect(RECORDS.some((d) => d.slug === r.slug), r.slug).toBe(true);
});
