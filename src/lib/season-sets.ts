// Eras, League sizes and season sets (#54, #55, #56). The build's season_sets
// table (recordbook/season_sets.py) is the one definition of each League
// size's seasons, as fixed years: record pages rank over it and Statsguru's
// size= searches it, so a record and its full list can't disagree (ADR 0002).
import type { Db } from './database';

/** An era: the platform a season was played on, as the seasons table names it. */
export type Era = 'nfl.com' | 'sleeper';
export const ERAS: Era[] = ['nfl.com', 'sleeper'];

/** A League size: how many franchises played, 10 in 2012, 12 in 2013–14 and 16 from 2015. */
export type LeagueSize = 10 | 12 | 16;
export const LEAGUE_SIZES: LeagueSize[] = [10, 12, 16];

/**
 * An era and a League size, each null for any: seasons named by what they
 * are rather than listed, so a link keeps up with seasons to come.
 */
export interface SeasonScope {
  era: Era | null;
  size: LeagueSize | null;
}

/**
 * A season set (#54): a named set of seasons a record can be ranked over, as it
 * appears in a record's URL and the build's tables. No season set is named like a phase.
 */
export type SeasonSet = 'all-seasons' | 'nfl-com' | 'sleeper' | '10-teams' | '12-teams' | '16-teams' | 'nfl-com-16-teams';

export interface SeasonSetDef extends SeasonScope {
  key: SeasonSet;
  /** As a record page names it. */
  name: string;
}

/**
 * Every season set, in the order records list them: all seasons, the eras,
 * each League size, and the one era and size pair no other set gives (the
 * Sleeper era is all 16 teams, and 10 and 12 teams are all NFL.com).
 * recordbook/season_sets.py lists the same sets.
 */
export const SEASON_SETS: SeasonSetDef[] = [
  // "All eras" beside the era choices, as record pages have always named it.
  { key: 'all-seasons', era: null, size: null, name: 'All eras' },
  { key: 'nfl-com', era: 'nfl.com', size: null, name: 'NFL.com era' },
  { key: 'sleeper', era: 'sleeper', size: null, name: 'Sleeper era' },
  { key: '10-teams', era: null, size: 10, name: '10 teams' },
  { key: '12-teams', era: null, size: 12, name: '12 teams' },
  { key: '16-teams', era: null, size: 16, name: '16 teams' },
  { key: 'nfl-com-16-teams', era: 'nfl.com', size: 16, name: 'NFL.com era, 16 teams' },
];

export const seasonSetDef = (key: SeasonSet): SeasonSetDef => SEASON_SETS.find((s) => s.key === key)!;

/** The season set an era and a League size name, if there is one. */
export const seasonSetOf = ({ era, size }: SeasonScope): SeasonSetDef | undefined =>
  SEASON_SETS.find((s) => s.era === era && s.size === size);

/** A season, with its era and its League size (null if no size's seasons include it). */
export interface ScopedSeason {
  year: number;
  era: Era;
  size: LeagueSize | null;
}

/** Every season, oldest first, with its era and its League size from the season_sets table. */
export function scopedSeasons(db: Db): ScopedSeason[] {
  const sizeSets = SEASON_SETS.filter((s) => s.era === null && s.size !== null);
  const rows = db.all(
    `select s.year, s.era, m.season_set from seasons s
     left join season_sets m on m.season = s.year and m.season_set in (${sizeSets.map(() => '?').join(', ')})
     order by s.year`,
    sizeSets.map((s) => s.key),
  );
  return rows.map((r) => ({ year: r.year, era: r.era, size: sizeSets.find((s) => s.key === r.season_set)?.size ?? null }));
}

/** Each League size with seasons, smallest first, named with its seasons: "16 teams (2015 on)". */
export function leagueSizes(seasons: ScopedSeason[]): { size: LeagueSize; label: string }[] {
  const latest = Math.max(...seasons.map((s) => s.year));
  return LEAGUE_SIZES.flatMap((size) => {
    const years = seasons.filter((s) => s.size === size).map((s) => s.year);
    if (!years.length) return [];
    const [first, last] = [Math.min(...years), Math.max(...years)];
    const span = last === latest && first !== last ? `${first} on` : first === last ? `${first}` : `${first}–${String(last).slice(-2)}`;
    return [{ size, label: `${size} teams (${span})` }];
  });
}
