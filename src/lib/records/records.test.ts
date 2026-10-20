// Records (#30) against the build's own database (run the Python build first).
// Expected figures come from plain SQL over the tables, not from the code
// under test.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import type { GroupRow } from '../statsguru/engine';
import { open } from '../database';
import { runQuery } from '../statsguru/engine';
import { DEFAULT_QUERY, decodeQuery, encodeQuery } from '../statsguru/query';
import { CATEGORIES, PHASES, RECORDS, SEASON_SETS, recordDef, variants, variantUrl } from './catalogue';
import { recordView } from './records';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db = open();
const one = (sql: string, ...params: (number | string)[]) => sqlite.prepare(sql).get(...params) as any;
const view = (slug: string, seasonSet = 'all-seasons', phase?: string) =>
  recordView(db, recordDef(slug)!, seasonSet as any, (phase ?? recordDef(slug)!.phases[0]) as any);
const values = (slug: string, seasonSet?: string, phase?: string) => view(slug, seasonSet, phase).entries.map((e) => e.value);
const current = one('select season as y from current_season').y;
// The games the league leaves out of the records: the SQL below leaves them out too.
const KEPT = 'id not in (select game_id from record_exclusions)';
const left = sqlite
  .prepare('select g.season, g.week, g.home_franchise_id as h, g.away_franchise_id as a from record_exclusions e join games g on g.id = e.game_id')
  .all() as any[];
const leftOut = (r: { season?: number | null; week?: number; franchise: { id: number } }) =>
  left.some((x) => x.season === r.season && x.week === r.week && [x.h, x.a].includes(r.franchise.id));

describe('the catalogue', () => {
  test('has the eight categories, all built', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Scoring', 'Results and streaks', 'Seasons', 'Luck', 'Brackets', 'Head-to-head', 'Divisions', 'Sleeper era',
    ]);
    expect(CATEGORIES.every((c) => c.built)).toBe(true);
  });

  test('every built record has a fixed qualification and its sensible variants', () => {
    expect(RECORDS).toHaveLength(45);
    // Every built category's records are RECORDS, in catalogue order.
    expect(RECORDS.map((r) => r.slug)).toEqual(
      CATEGORIES.filter((c) => c.built).flatMap((c) => c.records.flatMap((r) => (r.slug ? [r.slug] : []))),
    );
    for (const r of RECORDS) {
      expect(r.qualification.length, r.slug).toBeGreaterThan(10);
      expect(variants(r).length, r.slug).toBe(r.seasonSets.length * r.phases.length);
    }
    // Streaks are regular season only.
    expect(recordDef('longest-winning-streak')!.phases).toEqual(['regular']);
  });

  test('every variant has one URL: its season set, then its phase, defaults left out (#54)', () => {
    const url = (slug: string, seasonSet: string, phase: string) =>
      variantUrl(recordDef(slug)!, { seasonSet: seasonSet as any, phase: phase as any });
    expect(url('highest-score', 'all-seasons', 'all')).toBe('/records/highest-score/');
    expect(url('highest-score', 'sleeper', 'all')).toBe('/records/highest-score/sleeper/');
    expect(url('highest-score', 'all-seasons', 'regular')).toBe('/records/highest-score/regular/');
    expect(url('highest-score', 'nfl-com', 'playoffs')).toBe('/records/highest-score/nfl-com/playoffs/');
    // A regular-season-only record's default phase is the regular season.
    expect(url('longest-winning-streak', 'sleeper', 'regular')).toBe('/records/longest-winning-streak/sleeper/');
    // A Sleeper-era-only record's default season set is the Sleeper era.
    expect(url('best-nfl-player-score', 'sleeper', 'playoffs')).toBe('/records/best-nfl-player-score/playoffs/');
    const urls = RECORDS.flatMap((def) => variants(def).map((v) => variantUrl(def, v)));
    expect(new Set(urls).size).toBe(urls.length);
    // A segment is a season set or a phase, never both.
    expect(SEASON_SETS.filter((s) => (PHASES as string[]).includes(s))).toEqual([]);
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
    expect(values('highest-score-in-a-loss', 'all-seasons', 'regular')[0]).toBe(high);
  });

  test('biggest and narrowest margins', () => {
    const m = one(`select max(abs(home_points - away_points)) as hi, min(abs(home_points - away_points)) as lo
                   from games where home_points is not null and home_points <> away_points and ${KEPT}`);
    expect(values('biggest-margin')[0]).toBeCloseTo(m.hi, 2);
    expect(values('narrowest-margin')[0]).toBeCloseTo(m.lo, 2);
  });

  test('combined scores, and the Playoffs leave out games whose score is lost', () => {
    const m = one(`select max(home_points + away_points) as hi, min(home_points + away_points) as lo from games where ${KEPT}`);
    expect(values('highest-combined-score')[0]).toBeCloseTo(m.hi, 2);
    expect(values('lowest-combined-score')[0]).toBeCloseTo(m.lo, 2);
    const playoffs = view('highest-combined-score', 'all-seasons', 'playoffs');
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
  test("an era variant's full list in Statsguru names the era, not its seasons", () => {
    for (const [slug, era, name] of [
      ['highest-score', 'nfl-com', 'nfl.com'],
      ['highest-score', 'sleeper', 'sleeper'],
      ['career-win-pct', 'nfl-com', 'nfl.com'],
      ['most-wins', 'nfl-com', 'nfl.com'],
    ]) {
      const search = encodeQuery({ ...DEFAULT_QUERY, ...view(slug, era).statsguru! });
      expect(search, `${slug} ${era}`).toContain(`era=${name}`);
      expect(search, `${slug} ${era}`).not.toMatch(/(^|&)s=/);
    }
    expect(encodeQuery({ ...DEFAULT_QUERY, ...view('highest-score').statsguru! })).not.toContain('era=');
  });

  test('a game left out of the records is in no game-based record, and each says why', () => {
    const x = one(`select g.season, g.week, g.home_franchise_id as h, g.away_franchise_id as a, e.reason
                   from record_exclusions e join games g on g.id = e.game_id`);
    for (const slug of ['lowest-score', 'biggest-margin', 'lowest-combined-score']) {
      const v = view(slug);
      expect(
        v.entries.some((e) => e.at?.season === x.season && e.at?.week === x.week && [x.h, x.a].includes(e.franchise.id)),
        slug,
      ).toBe(false);
      expect(v.notes.some((n) => n.text.includes(x.reason)), slug).toBe(true);
    }
    // Outside its era the note doesn't apply.
    expect(view('lowest-score', 'sleeper').notes.some((n) => n.text.includes(x.reason))).toBe(false);
  });
});

describe('results and streaks', () => {
  test('career wins over the regular season are the season lines summed', () => {
    const totals = sqlite.prepare('select franchise_id as f, sum(wins) as w from season_lines group by 1').all() as any[];
    const most = Math.max(...totals.map((t) => t.w));
    const leaders = view('career-wins', 'all-seasons', 'regular').entries.filter((e) => e.rank === 1);
    expect(leaders.map((e) => e.value)).toEqual(leaders.map(() => most));
    expect(new Set(leaders.map((e) => e.franchise.id))).toEqual(new Set(totals.filter((t) => t.w === most).map((t) => t.f)));
  });

  test('career rates need at least 2 completed seasons', () => {
    const qualified = new Set(
      sqlite.prepare("select franchise_id as f from completed_seasons where season_set = 'all-seasons' and seasons >= 2").all().map((r: any) => r.f),
    );
    for (const slug of ['career-win-pct', 'career-points-per-game'])
      for (const e of view(slug).entries) expect(qualified.has(e.franchise.id), slug).toBe(true);
    // Nobody has completed 2 Sleeper-era seasons yet.
    const done = one("select max(seasons) as n from completed_seasons where season_set = 'sleeper'").n;
    if (done < 2) expect(view('career-win-pct', 'sleeper').entries).toEqual([]);
  });

  test('the longest winning streak is the longest run in the streaks table', () => {
    const top = one("select max(length) as n from record_streaks where record = 'winning' and season_set = 'all-seasons'").n;
    const v = view('longest-winning-streak');
    expect(v.entries[0].value).toBe(top);
    expect(v.entries[0].from!.season).toBeGreaterThan(2011);
  });

  test('a streak that reaches a gap says it may continue', () => {
    const open = one("select count(*) as n from record_streaks where record = 'losing' and season_set = 'all-seasons' and gap_after = 1").n;
    expect(open).toBeGreaterThan(0);
    const all = [...['longest-winning-streak', 'longest-losing-streak', 'longest-top-half-run']].flatMap((s) => view(s).entries);
    const flagged = all.filter((e) => e.gapAfter);
    if (flagged.length)
      expect(view('longest-losing-streak').notes.map((n) => n.text).join(' ')).toMatch(/may continue into weeks with no scores/);
  });
});

describe('Statsguru gives the same figures', () => {
  // Rivalries list each pair once: rivalries-divisions-sleeper.test.ts checks them.
  for (const def of RECORDS.filter((r) => r.statsguru && r.kind !== 'rivalry'))
    for (const { seasonSet, phase } of variants(def))
      test(`${def.slug} ${seasonSet} ${phase}`, () => {
        const v = recordView(db, def, seasonSet, phase);
        // The link's own query, as Statsguru would read it back from the URL.
        const q = decodeQuery(encodeQuery({ ...DEFAULT_QUERY, ...v.statsguru! }));
        const rows = runQuery(db, q).rows;
        const figures = rows
          .filter((r) => r.kind === 'game' || r.kind === 'group')
          .filter((r) => v.entries.some((e) => e.franchise.id === r.franchise.id))
          // Statsguru lists every game; the records leave some out, each with a note.
          .filter((r) => r.kind !== 'game' || !leftOut(r as any))
          .map((r) => def.figure(r as any))
          .filter((x) => x !== null);
        expect(v.entries.map((e) => e.value)).toEqual(figures.slice(0, v.entries.length));
      });
});
