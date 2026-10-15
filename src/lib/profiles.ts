// Franchise profiles and head-to-head pages (#27): reads of the tables
// recordbook/profiles.py writes. Like db.ts, nothing here derives a figure.
import { byBracket, type BracketRun } from './brackets';
import { GAME_COLUMNS, seasonFranchise, toGame, type Game } from './db';
import type { Db } from './database';

export interface Career {
  seasons: number;
  currentDivision: string | null;
  wins: number;
  losses: number;
  ties: number;
  winPct: number | null;
  pointsForPerGame: number | null;
  pointsAgainstPerGame: number | null;
  breakdownSeasons: number;
  breakdownPct: number | null;
  championships: number;
  shitBowls: number;
}

export function career(db: Db, franchiseId: number): Career {
  return db
    .all(
      `select seasons, current_division as currentDivision, wins, losses, ties, win_pct as winPct,
              points_for_per_game as pointsForPerGame, points_against_per_game as pointsAgainstPerGame,
              breakdown_seasons as breakdownSeasons, breakdown_pct as breakdownPct, championships,
              shit_bowls as shitBowls
       from franchise_careers where franchise_id = ?`,
      [franchiseId],
    )[0] as unknown as Career;
}

export interface DatedGame extends Game {
  season: number;
}

/** A franchise's games, oldest first. */
export function franchiseGames(db: Db, franchiseId: number): DatedGame[] {
  return db
    .all(
      `select ${GAME_COLUMNS} from games g where ? in (g.home_franchise_id, g.away_franchise_id)
       order by g.season, g.week`,
      [franchiseId],
    )
    .map(toGame(seasonFranchise(db)));
}

/** Every game two franchises played against each other, oldest first. */
export function pairGames(db: Db, lo: number, hi: number): DatedGame[] {
  return db
    .all(
      `select ${GAME_COLUMNS} from games g
       where (g.home_franchise_id = ? and g.away_franchise_id = ?)
          or (g.home_franchise_id = ? and g.away_franchise_id = ?) order by g.season, g.week`,
      [lo, hi, hi, lo],
    )
    .map(toGame(seasonFranchise(db)));
}

export interface HeadToHead {
  lo: { id: number; name: string };
  hi: { id: number; name: string };
  games: number;
  loWins: number;
  hiWins: number;
  ties: number;
  loPoints: number;
  hiPoints: number;
  scoredGames: number;
  bracketGames: number;
  /** Both played a season with regular-season games missing (ADR 0001). */
  gamesMissing: boolean;
}

/** Every pair that has met, lower id first; or only those of one franchise. */
export function headToHeads(db: Db, franchiseId?: number): HeadToHead[] {
  return db
    .all(
      `select p.*, l.name as loName, h.name as hiName from head_to_head p
       join franchises l on l.id = p.lo_franchise_id join franchises h on h.id = p.hi_franchise_id
       where ?1 is null or ?1 in (p.lo_franchise_id, p.hi_franchise_id)
       order by p.lo_franchise_id, p.hi_franchise_id`,
      [franchiseId ?? null],
    )
    .map((r: any) => ({
      lo: { id: r.lo_franchise_id, name: r.loName },
      hi: { id: r.hi_franchise_id, name: r.hiName },
      games: r.games,
      loWins: r.lo_wins,
      hiWins: r.hi_wins,
      ties: r.ties,
      loPoints: r.lo_points,
      hiPoints: r.hi_points,
      scoredGames: r.scored_games,
      bracketGames: r.bracket_games,
      gamesMissing: Boolean(r.games_missing),
    }));
}

export interface BestWorst {
  measure: 'best' | 'worst';
  rank: number;
  points: number;
  game: DatedGame;
}

/** A franchise's highest and lowest scores, ranked. */
export function bestAndWorst(db: Db, franchiseId: number): BestWorst[] {
  const games = new Map(franchiseGames(db, franchiseId).map((g) => [g.id, g]));
  return db
    .all(
      `select measure, rank, points, game_id as gameId from franchise_best_worst
       where franchise_id = ? order by measure, rank, game_id`,
      [franchiseId],
    )
    .map((r: any) => ({ measure: r.measure, rank: r.rank, points: r.points, game: games.get(r.gameId)! }));
}

export interface SeasonRun extends BracketRun {
  season: number;
}

/** A franchise's bracket runs (#43), oldest season first, its brackets in BRACKET_ORDER. */
export function bracketRuns(db: Db, franchiseId: number): SeasonRun[] {
  return (
    db.all(
      `select season, bracket, round_reached as roundReached, result, source
       from bracket_runs where franchise_id = ?`,
      [franchiseId],
    ) as unknown as SeasonRun[]
  ).sort((a, b) => a.season - b.season || byBracket((r: SeasonRun) => r.bracket)(a, b));
}

/** Seasons whose regular season has weeks with no game scores. */
export function gapSeasons(db: Db): Set<number> {
  return new Set(
    db
      .all("select distinct season from coverage where phase = 'regular' and not complete")
      .map((r: any) => r.season),
  );
}
