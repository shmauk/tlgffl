// Season, luck and bracket records (#31) against the build's own database
// (run the Python build first). Expected figures come from plain SQL over the
// tables, not from the code under test, and never pin live-season figures.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { runQuery, type Db, type GroupRow } from '../statsguru/engine';
import { DEFAULT_QUERY, decodeQuery, encodeQuery } from '../statsguru/query';
import { CATEGORIES, RECORDS, recordDef, variants } from './catalogue';
import { recordView } from './records';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const db: Db = { all: (sql, params = []) => sqlite.prepare(sql).all(...params) as Record<string, any>[] };
const one = (sql: string, ...params: (number | string)[]) => sqlite.prepare(sql).get(...params) as any;
const view = (slug: string, era?: string) => {
  const def = recordDef(slug)!;
  expect(def, slug).toBeDefined();
  return recordView(db, def, (era ?? def.eras[0]) as any, def.phases[0]);
};
const current = one('select season as y from current_season').y;

const SEASONS = ['most-wins', 'fewest-wins', 'most-points-for', 'fewest-points-for', 'most-points-against',
  'fewest-points-against', 'best-points-per-game', 'worst-points-per-game', 'best-breakdown-pct', 'worst-breakdown-pct'];
const LUCK = ['luckiest-season', 'unluckiest-season', 'career-points-against-per-game'];
const BRACKETS = ['championships', 'finals-reached', 'playoff-appearances', 'shit-bowl-titles', 'shit-bowl-appearances',
  'mediocre-bowl-titles', 'longest-playoff-drought', 'longest-playoff-appearance-streak'];

describe('the catalogue', () => {
  test('seasons, luck and brackets are built, brackets linking the roll of honour', () => {
    for (const slug of [...SEASONS, ...LUCK, ...BRACKETS]) expect(recordDef(slug), slug).toBeDefined();
    for (const name of ['Seasons', 'Luck', 'Brackets']) expect(CATEGORIES.find((c) => c.name === name)!.built, name).toBe(true);
    const brackets = CATEGORIES.find((c) => c.slug === 'brackets')!;
    expect(brackets.records[0]).toEqual({ name: 'Roll of honour', href: '/seasons/' });
    expect(brackets.records.slice(1).map((r) => r.slug)).toEqual(BRACKETS);
  });

  test('season-line records are regular season only, over every era', () => {
    for (const slug of [...SEASONS, 'luckiest-season', 'unluckiest-season']) {
      expect(recordDef(slug)!.phases, slug).toEqual(['regular']);
      expect(variants(recordDef(slug)!).length, slug).toBe(3);
    }
  });
});

describe('the full list in Statsguru', () => {
  // Statsguru's per-season view has wins, points for, points against and points per game, but no
  // Breakdown or luck: those records have no full list there.
  const LINKED = SEASONS.filter((s) => !s.includes('breakdown'));
  const FIGURE: Record<string, string> = { wins: 'w', points_for: 'pf', points_against: 'pa', points_for_per_game: 'apf' };

  test('season-line records Statsguru can express link it; Breakdown and luck records don’t', () => {
    for (const slug of LINKED) expect(view(slug).statsguru, slug).not.toBeNull();
    for (const slug of [...SEASONS.filter((s) => !LINKED.includes(s)), 'luckiest-season', 'unluckiest-season'])
      expect(view(slug).statsguru, slug).toBeNull();
  });

  for (const slug of LINKED)
    for (const era of ['all', 'nfl-com', 'sleeper'])
      test(`${slug} ${era}: the link’s rows give the record’s figures, the season in progress left out`, () => {
        const v = view(slug, era);
        const q = decodeQuery(encodeQuery({ ...DEFAULT_QUERY, ...v.statsguru! }));
        expect(q.view).toBe('season');
        expect(q.phases).toEqual(['R']);
        const rows = runQuery(db, q).rows.filter((r) => r.kind === 'group') as GroupRow[];
        const key = FIGURE[v.def.column!];
        const figures = rows.map((r) => (r as any)[key]);
        expect(v.entries.map((e) => e.value)).toEqual(figures.slice(0, v.entries.length));
        const regular = one('select phase from current_season')?.phase === 'regular';
        if (regular) expect(rows.some((r) => r.season === current), slug).toBe(false);
      });
});

describe('seasons', () => {
  test('most wins ranks the raw totals of the season lines, with games played alongside', () => {
    const top = one('select max(wins) as w from record_seasons').w;
    const v = view('most-wins');
    expect(v.entries[0].value).toBe(top);
    for (const e of v.entries) {
      const line = one('select games, wins, losses, ties from record_seasons where franchise_id = ? and season = ?',
        e.franchise.id, e.season!);
      expect(e.value).toBe(line.wins);
      expect(e.games).toBe(line.games);
      expect(e.wlt).toEqual([line.wins, line.losses, line.ties]);
    }
  });

  test('fewest points for ranks lowest first, with points per game alongside', () => {
    const low = one('select min(points_for) as p from record_seasons').p;
    const e = view('fewest-points-for').entries[0];
    expect(e.value).toBe(low);
    expect(e.alongside![0]).toBeCloseTo(low / e.games!, 2);
  });

  test('a season in progress never appears before its regular season ends', () => {
    const lastWeek = one('select regular_season_last_week as w from season_formats where season = ?', current).w;
    const over = one(`select count(*) as n from games where season = ? and phase = 'regular' and week = ? and status = 'final'`,
      current, lastWeek).n > 0;
    for (const slug of [...SEASONS, 'luckiest-season', 'unluckiest-season']) {
      const set = view(slug).entries.filter((e) => e.season === current);
      if (!over) expect(set, slug).toEqual([]);
    }
    if (!over) expect(view('most-wins').notes.map((n) => n.text).join(' ')).toContain(`${current} joins once its regular season ends`);
  });

  test('Breakdown records only cover fully covered seasons', () => {
    const covered = new Set(sqlite.prepare('select season from record_seasons where breakdown_pct is not null').all().map((r: any) => r.season));
    for (const slug of ['best-breakdown-pct', 'worst-breakdown-pct', 'luckiest-season', 'unluckiest-season'])
      for (const e of view(slug).entries) expect(covered.has(e.season!), `${slug} ${e.season}`).toBe(true);
    expect(view('best-breakdown-pct').notes.map((n) => n.text).join(' ')).toMatch(/no Breakdown for 2022, 2023 and 2024/);
  });

  test('era filters keep to their seasons', () => {
    for (const e of view('most-points-for', 'nfl-com').entries) expect(e.season!).toBeLessThanOrEqual(2024);
    for (const e of view('most-points-for', 'sleeper').entries) expect(e.season!).toBeGreaterThanOrEqual(2025);
  });
});

describe('luck', () => {
  test('luckiest and unluckiest seasons rank luck both ways', () => {
    const m = one('select max(luck) as hi, min(luck) as lo from record_seasons');
    expect(view('luckiest-season').entries[0].value).toBe(m.hi);
    expect(view('unluckiest-season').entries[0].value).toBe(m.lo);
  });

  test('career most points against per game is a Statsguru career rate', () => {
    const v = view('career-points-against-per-game');
    expect(v.statsguru).not.toBeNull();
    const values = v.entries.map((e) => e.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe('brackets', () => {
  test('championships count every champion but nobody for a disputed outcome', () => {
    const counts = sqlite
      .prepare(`select franchise_id as f, count(*) as n from bracket_winners
                where bracket = 'playoffs' and source <> 'disputed' and franchise_id is not null group by 1`)
      .all() as any[];
    const most = Math.max(...counts.map((c) => c.n));
    expect(view('championships').entries[0].value).toBe(most);
  });

  test('a disputed Shit Bowl counts for nobody, and says so', () => {
    const disputed = sqlite
      .prepare(`select season, franchise_id as f from bracket_winners where bracket = 'shit_bowl' and source = 'disputed'`)
      .all() as any[];
    const v = view('shit-bowl-titles');
    for (const d of disputed) {
      const e = v.entries.find((x) => x.franchise.id === d.f);
      if (e) expect(e.list, `${d.season}`).not.toContain(d.season);
      expect(v.notes.map((n) => n.text).join(' ')).toMatch(new RegExp(`${d.season} is disputed`));
    }
  });

  test('unknown Mediocre Bowl winners are noted, not guessed', () => {
    const unknown = sqlite
      .prepare(`select season from bracket_winners where bracket = 'mediocre_bowl' and source = 'unknown' order by 1`)
      .all() as any[];
    const v = view('mediocre-bowl-titles');
    for (const e of v.entries) for (const s of e.list!) expect(unknown.map((u) => u.season)).not.toContain(s);
    if (unknown.length) expect(v.notes.map((n) => n.text).join(' ')).toMatch(/Mediocre Bowl winner is unknown for/);
  });

  test('Shit Bowl appearances are Sleeper era only', () => {
    expect(recordDef('shit-bowl-appearances')!.eras).toEqual(['sleeper']);
    for (const e of view('shit-bowl-appearances').entries) for (const s of e.list!) expect(s).toBeGreaterThanOrEqual(2025);
  });

  test('the longest Playoff drought is the longest run in the runs table', () => {
    const top = one(`select max(length) as n from record_runs where record = 'drought' and era = 'all'`).n;
    const e = view('longest-playoff-drought').entries[0];
    expect(e.value).toBe(top);
    expect(e.span![1] - e.span![0] + 1).toBe(top);
  });

  test('bracket records have no phase filter', () => {
    for (const slug of BRACKETS) expect(recordDef(slug)!.phases, slug).toEqual(['all']);
  });
});

test('every new record renders for every variant', () => {
  for (const def of RECORDS.filter((r) => [...SEASONS, ...LUCK, ...BRACKETS].includes(r.slug)))
    for (const { era, phase } of variants(def)) expect(() => recordView(db, def, era, phase), def.slug).not.toThrow();
});
