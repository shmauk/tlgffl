// The site's only way into the league database. Pages read it at build time
// and never derive figures of their own (ADR 0004).
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.TLGFFL_DB ?? 'build/league.sqlite';

let db: DatabaseSync | undefined;
function open(): DatabaseSync {
  db ??= new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

export interface Franchise {
  id: number;
  name: string;
  active: boolean;
  firstSeason: number;
  lastSeason: number;
}

export interface TeamName {
  season: number;
  teamName: string;
}

export interface SeasonLine {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  division: string | null;
  seed: number | null;
  finalPlacing: number | null;
}

export function franchises(): Franchise[] {
  return open()
    .prepare(
      `select id, name, active, first_season as firstSeason, last_season as lastSeason
       from franchises order by name collate nocase`,
    )
    .all()
    .map((r) => ({ ...(r as unknown as Franchise), active: Boolean(r.active) }));
}

export function teamNames(franchiseId: number): TeamName[] {
  return open()
    .prepare(
      `select season, team_name as teamName from team_names
       where franchise_id = ? order by season`,
    )
    .all(franchiseId) as unknown as TeamName[];
}

export interface Season {
  year: number;
  era: 'nfl.com' | 'sleeper';
  teamCount: number;
}

/** Every season, newest first. */
export function seasons(): Season[] {
  return open()
    .prepare('select year, era, team_count as teamCount from seasons order by year desc')
    .all() as unknown as Season[];
}

export interface SeasonFormat {
  season: number;
  teams: number;
  divisions: number;
  regularSeason: [number, number];
  brackets: {
    bracket: 'playoffs' | 'shit_bowl' | 'mediocre_bowl';
    size: number;
    firstWeek: number;
    lastWeek: number;
    series: string | null;
  }[];
}

/** Every season's format (#11), oldest first. */
export function seasonFormats(): SeasonFormat[] {
  const brackets = open()
    .prepare(
      `select season, bracket, size, first_week as firstWeek, last_week as lastWeek, series
       from season_brackets`,
    )
    .all() as unknown as (SeasonFormat['brackets'][number] & { season: number })[];
  return open()
    .prepare(
      `select f.season, s.team_count as teams, f.divisions,
              f.regular_season_first_week as first, f.regular_season_last_week as last
       from season_formats f join seasons s on s.year = f.season order by f.season`,
    )
    .all()
    .map((r: any) => ({
      season: r.season,
      teams: r.teams,
      divisions: r.divisions,
      regularSeason: [r.first, r.last],
      brackets: brackets.filter((b) => b.season === r.season).map(({ season, ...b }) => b),
    }));
}

export interface LeagueDocument {
  kind: 'constitution' | 'agm';
  season: number | null;
  title: string;
  url: string;
}

/** The constitution and the AGM docs, in the order they are kept. */
export function documents(): LeagueDocument[] {
  return open()
    .prepare('select kind, season, title, url from documents order by rowid')
    .all() as unknown as LeagueDocument[];
}

/** NFL.com's reported season lines (ADR 0001). */
export function reportedSeasonLines(franchiseId: number): SeasonLine[] {
  return open()
    .prepare(
      `select season, wins, losses, ties, points_for as pointsFor,
              points_against as pointsAgainst, division, seed,
              final_placing as finalPlacing
       from reported_season_lines where franchise_id = ? order by season`,
    )
    .all(franchiseId) as unknown as SeasonLine[];
}
