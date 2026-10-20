// Awards (#33): reads of the tables recordbook/awards.py writes. Like db.ts,
// nothing here derives a figure; it only groups and formats them.
import { seasonFranchise, type SeasonFranchise } from './db';
import type { Db } from './database';
import { figure } from './figures';

export type AwardUnit = 'points' | 'count' | 'share' | 'dollars';

export interface Award {
  slug: string;
  name: string;
  definition: string;
  /** What a value is, in a few words, with its unit where it has one: "Average margin (points)". */
  measure: string;
  unit: AwardUnit;
  lowestWins: boolean;
}

export interface AwardResult {
  award: string;
  season: number;
  franchise: SeasonFranchise;
  value: number;
  rank: number;
}

export interface AwardUnknown {
  award: string;
  season: number;
  reason: string;
}

/** The nine awards, in the order the site lists them. */
export function awards(db: Db): Award[] {
  return db
    .all('select slug, name, definition, measure, unit, lowest_wins as lowestWins from awards order by position')
    .map((r: any) => ({ ...r, lowestWins: Boolean(r.lowestWins) }));
}

/** Every award's winners (rank 1, so co-winners too), by award, season and name. */
export function awardWinners(db: Db, where: { award?: string; season?: number; franchiseId?: number } = {}): AwardResult[] {
  const franchise = seasonFranchise(db);
  return db
    .all(
      `select r.award, r.season, r.value, r.rank, r.franchise_id as fid
       from award_results r join franchises f on f.id = r.franchise_id
       join awards a on a.slug = r.award
       where r.rank = 1 and (?1 is null or r.award = ?1) and (?2 is null or r.season = ?2)
         and (?3 is null or r.franchise_id = ?3)
       order by a.position, r.season, f.name`,
      [where.award ?? null, where.season ?? null, where.franchiseId ?? null],
    )
    .map(({ fid, ...r }: any) => ({ ...r, franchise: franchise(r.season, fid) }));
}

/** Seasons an award is due for but can't be decided from the data yet. */
export function awardUnknowns(db: Db): AwardUnknown[] {
  return db
    .all('select award, season, reason from award_unknowns order by award, season') as unknown as AwardUnknown[];
}

/** The seasons an award was given in, oldest first. */
export function awardSeasons(db: Db, slug: string): number[] {
  return db
    .all('select distinct season from award_results where award = ? order by season', [slug])
    .map((r: any) => r.season);
}

/** An award result's value as it reads: 12.34 points, 7, 24.0%, $22. */
export const awardValue = (unit: AwardUnit, value: number): string => figure(unit, value);

/** Seasons as runs: [2012, ..., 2021, 2025] -> "2012–2021, 2025". */
export function seasonRuns(seasons: number[]): string {
  const runs: [number, number][] = [];
  for (const s of [...seasons].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && s === last[1] + 1) last[1] = s;
    else runs.push([s, s]);
  }
  return runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ');
}

/** A regular season still being played: each award's leaders so far (rank 1, so level leaders too). */
export function awardLeaders(db: Db, season: number): AwardResult[] {
  const franchise = seasonFranchise(db);
  return db
    .all(
      `select r.award, r.season, r.value, r.rank, r.franchise_id as fid
       from award_leaders r join franchises f on f.id = r.franchise_id
       join awards a on a.slug = r.award
       where r.rank = 1 and r.season = ?
       order by a.position, f.name`,
      [season],
    )
    .map(({ fid, ...r }: any) => ({ ...r, franchise: franchise(r.season, fid) }));
}
