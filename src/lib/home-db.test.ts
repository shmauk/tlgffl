// The home page's data from the build's database (#35). Reads
// build/league.sqlite: run the Python build first. The real season moves
// daily, so these checks hold in any phase; Home.test.ts pins each phase
// with synthetic fixtures. Expected values come from plain SQL.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { homeData, seasonStates } from './home-db';

const sqlite = new DatabaseSync(process.env.TLGFFL_DB ?? 'build/league.sqlite', { readOnly: true });
const all = (sql: string, ...p: any[]) => sqlite.prepare(sql).all(...p) as any[];

describe('season states', () => {
  test('each season’s final weeks are the weeks with games', () => {
    const s2025 = seasonStates().find((s) => s.season === 2025)!;
    const weeks = all('select distinct week from games where season = 2025 order by week').map((r) => r.week);
    expect(s2025.finalWeeks).toEqual(weeks);
    expect(s2025.crowned).toBe(s2025.brackets);
  });
});

describe('the home page on the build date', () => {
  const data = homeData(new Date())!;
  const final = (week: number | null) =>
    all('select home_franchise_id h, away_franchise_id a from games where season = ? and week = ?', data.season, week ?? -1);

  test('the current season is the latest with a final game or week 1 behind it', () => {
    const latest = all('select max(season) s from games')[0].s;
    expect(data.season).toBeGreaterThanOrEqual(latest);
  });

  test('this week’s matchups are not final games, and last week’s results are', () => {
    const done = final(data.playing).map((g) => `${g.h}-${g.a}`);
    for (const m of data.thisWeek) expect(done).not.toContain(`${m.home.id}-${m.away.id}`);
    if (data.lastWeek) {
      const last = final(data.through).map((g) => `${g.h}-${g.a}`).sort();
      expect(data.lastWeek.results).toHaveLength(last.length);
      for (const r of data.lastWeek.results) expect(last).toContain(`${r.home.id}-${r.away.id}`);
      const scores = all(
        `select max(max(home_points, away_points)) hi, min(min(home_points, away_points)) lo from games
         where season = ? and week = ?`, data.season, data.through,
      )[0];
      expect(data.lastWeek.highest?.points).toBe(scores.hi);
      expect(data.lastWeek.lowest?.points).toBe(scores.lo);
    }
  });

  test('the playoff picture is only shown in the regular season, with every franchise once', () => {
    if (data.phase !== 'regular') return expect(data.picture).toBeNull();
    const lines = all('select franchise_id f from season_lines where season = ?', data.season).map((r) => r.f);
    expect(data.picture!.map((l) => l.franchise.id).sort((a, b) => a - b)).toEqual(lines.sort((a, b) => a - b));
  });

  test('award lines are the leaders during the regular season and the winners after', () => {
    const table = data.phase === 'regular' ? 'award_leaders' : 'award_results';
    const firsts = all(`select distinct award from ${table} where season = ? and rank = 1`, data.season).map((r) => r.award);
    expect(data.awards.map((a) => a.award.slug).sort()).toEqual(firsts.sort());
  });
});