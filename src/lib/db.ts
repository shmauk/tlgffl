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
