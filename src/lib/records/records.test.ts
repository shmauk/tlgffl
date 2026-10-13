// Records (#30) against the build's own database (run the Python build first).
// Expected figures come from plain SQL over the tables, not from the code
// under test.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import type { Db, GroupRow } from '../statsguru/engine';
import { runQuery } from '../statsguru/engine';
import { DEFAULT_QUERY, decodeQuery, encodeQuery } from '../statsguru/query';
import { CATEGORIES, RECORDS, recordDef, variants } from './catalogue';
import { recordView } from './records';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db: Db = { all: (sql, params = []) => sqlite.prepare(sql).all(...params) as Record<string, any>[] };
const one = (sql: string, ...params: (number | string)[]) => sqlite.prepare(sql).get(...params) as any;
const view = (slug: string, era = 'all', phase?: string) =>
  recordView(db, recordDef(slug)!, era as any, (phase ?? recordDef(slug)!.phases[0]) as any);
const values = (slug: string, era?: string, phase?: string) => view(slug, era, phase).entries.map((e) => e.value);
const current = one('select max(year) as y from seasons').y;

describe('the catalogue', () => {
  test('has the eight categories, two of them built', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Scoring', 'Results and streaks', 'Seasons', 'Luck', 'Brackets', 'Head-to-head', 'Divisions', 'Sleeper era',
    ]);
    expect(CATEGORIES.filter((c) => c.built).map((c) => c.name)).toEqual(['Scoring', 'Results and streaks']);
  });

  test('every built record has a fixed qualification and its sensible variants', () => {
    expect(RECORDS).toHaveLength(15);
    for (const r of RECORDS) {
      expect(r.qualification.length, r.slug).toBeGreaterThan(10);
      expect(variants(r).length, r.slug).toBe(r.eras.length * r.phases.length);
    }
    // Streaks are regular season only.
    expect(recordDef('longest-winning-streak')!.phases).toEqual(['regular']);
  });
});

describe('scoring', () => {
  test('highest score is the top of every final game score, each side ranked', () => {
    const top = one(`select max(p) as p from (select home_points p from games union all select away_points from games)`).p;
    const v = view('highest-score');
    expect(v.entries[0].value).toBe(top);
    expect(v.entries[0].rank).toBe(1);
    expect(v.entries.length).toBeGreaterThanOrEqual(10);
    expect(values('highest-score')).toEqual([...values('highest-score')].sort((a, b) => b - a));
  });

  test('lowest score in a win', () => {
    const low = one(`select min(case when winner_franchise_id = home_franchise_id then home_points else away_points end) as p
                     from games where winner_franchise_id is not null and home_points is not null`).p;
    expect(values('lowest-score-in-a-win')[0]).toBe(low);
  });

  test('highest score in a loss, regular season only', () => {
    const high = one(`select max(case when winner_franchise_id = home_franchise_id then away_points else home_points end) as p
                      from games where winner_franchise_id is not null and phase = 'regular'`).p;
    expect(values('highest-score-in-a-loss', 'all', 'regular')[0]).toBe(high);
  });

  test('biggest and narrowest margins', () => {
    const m = one(`select max(abs(home_points - away_points)) as hi, min(abs(home_points - away_points)) as lo
                   from games where home_points is not null and home_points <> away_points`);
    expect(values('biggest-margin')[0]).toBeCloseTo(m.hi, 2);
    expect(values('narrowest-margin')[0]).toBeCloseTo(m.lo, 2);
  });

  test('combined scores, and the Playoffs leave out games whose score is lost', () => {
    const m = one(`select max(home_points + away_points) as hi, min(home_points + away_points) as lo from games`);
    expect(values('highest-combined-score')[0]).toBeCloseTo(m.hi, 2);
    expect(values('lowest-combined-score')[0]).toBeCloseTo(m.lo, 2);
    const playoffs = view('highest-combined-score', 'all', 'playoffs');
    const scored = one(`select count(*) as n from games where bracket = 'playoffs' and home_points is not null`).n;
    expect(playoffs.entries.length).toBe(Math.min(scored, 10));
    expect(playoffs.notes.map((n) => n.glyph)).toContain('‡');
  });

  test('all ties lists every tie, unranked', () => {
    const n = one('select count(*) as n from games where home_points = away_points').n;
    const v = view('all-ties');
    expect(v.entries).toHaveLength(n);
    expect(v.all).toBe(true);
  });

  test('every entry links to its franchise and game week, and carries the badges', () => {
    const active = new Map(sqlite.prepare('select id, active from franchises').all().map((r: any) => [r.id, !!r.active]));
    for (const slug of ['highest-score', 'lowest-score', 'biggest-margin', 'highest-combined-score']) {
      for (const e of view(slug).entries) {
        expect(e.franchise.id).toBeGreaterThan(0);
        expect(e.at?.week).toBeGreaterThan(0);
        expect(e.franchise.departed).toBe(!active.get(e.franchise.id));
        expect(e.thisSeason).toBe(e.at!.season === current);
      }
    }
  });

  test('game-based records carry * for the weeks with no scores, but not in the Sleeper era', () => {
    const star = view('highest-score').notes.find((n) => n.glyph === '*');
    expect(star?.text).toMatch(/2022 weeks 10–14, 2023 and 2024/);
    expect(view('highest-score', 'sleeper').notes.find((n) => n.glyph === '*')).toBeUndefined();
  });

  test('era filters keep to their seasons', () => {
    for (const e of view('highest-score', 'nfl-com').entries) expect(e.at!.season).toBeLessThanOrEqual(2024);
    for (const e of view('highest-score', 'sleeper').entries) expect(e.at!.season).toBeGreaterThanOrEqual(2025);
  });
});

describe('results and streaks', () => {
  test('career wins over the regular season are the season lines summed', () => {
    const totals = sqlite.prepare('select franchise_id as f, sum(wins) as w from season_lines group by 1').all() as any[];
    const most = Math.max(...totals.map((t) => t.w));
    const leaders = view('career-wins', 'all', 'regular').entries.filter((e) => e.rank === 1);
    expect(leaders.map((e) => e.value)).toEqual(leaders.map(() => most));
    expect(new Set(leaders.map((e) => e.franchise.id))).toEqual(new Set(totals.filter((t) => t.w === most).map((t) => t.f)));
  });

  test('career rates need at least 2 completed seasons', () => {
    const qualified = new Set(
      sqlite.prepare("select franchise_id as f from completed_seasons where era = 'all' and seasons >= 2").all().map((r: any) => r.f),
    );
    for (const slug of ['career-win-pct', 'career-points-per-game'])
      for (const e of view(slug).entries) expect(qualified.has(e.franchise.id), slug).toBe(true);
    // Nobody has completed 2 Sleeper-era seasons yet.
    const done = one("select max(seasons) as n from completed_seasons where era = 'sleeper'").n;
    if (done < 2) expect(view('career-win-pct', 'sleeper').entries).toEqual([]);
  });

  test('the longest winning streak is the longest run in the streaks table', () => {
    const top = one("select max(length) as n from record_streaks where record = 'winning' and era = 'all'").n;
    const v = view('longest-winning-streak');
    expect(v.entries[0].value).toBe(top);
    expect(v.entries[0].from!.season).toBeGreaterThan(2011);
  });

  test('a streak that reaches a gap says it may continue', () => {
    const open = one("select count(*) as n from record_streaks where record = 'losing' and era = 'all' and gap_after = 1").n;
    expect(open).toBeGreaterThan(0);
    const all = [...['longest-winning-streak', 'longest-losing-streak', 'longest-top-half-run']].flatMap((s) => view(s).entries);
    const flagged = all.filter((e) => e.gapAfter);
    if (flagged.length)
      expect(view('longest-losing-streak').notes.map((n) => n.text).join(' ')).toMatch(/may continue into weeks with no scores/);
  });
});

describe('Statsguru gives the same figures', () => {
  for (const def of RECORDS.filter((r) => r.statsguru))
    for (const { era, phase } of variants(def))
      test(`${def.slug} ${era} ${phase}`, () => {
        const v = recordView(db, def, era, phase);
        // The link's own query, as Statsguru would read it back from the URL.
        const q = decodeQuery(encodeQuery({ ...DEFAULT_QUERY, ...v.statsguru! }));
        const rows = runQuery(db, q).rows;
        const figures = rows
          .filter((r) => r.kind === 'game' || r.kind === 'group')
          .filter((r) => v.entries.some((e) => e.franchise.id === r.franchise.id))
          .map((r) => def.figure(r as any))
          .filter((x) => x !== null);
        expect(v.entries.map((e) => e.value)).toEqual(figures.slice(0, v.entries.length));
      });
});
