// Franchise profiles and head-to-head pages (#27): reads of the tables
// recordbook/profiles.py writes. Like db.ts, nothing here derives a figure.
import { open, type BracketName, type Game, type SeasonFranchise } from './db';

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

export function career(franchiseId: number): Career {
  return open()
    .prepare(
      `select seasons, current_division as currentDivision, wins, losses, ties, win_pct as winPct,
              points_for_per_game as pointsForPerGame, points_against_per_game as pointsAgainstPerGame,
              breakdown_seasons as breakdownSeasons, breakdown_pct as breakdownPct, championships,
              shit_bowls as shitBowls
       from franchise_careers where franchise_id = ?`,
    )
    .get(franchiseId) as unknown as Career;
}

const GAMES = `select g.id, g.season, g.week, g.phase, g.bracket, g.round, g.home_points as homePoints,
    g.away_points as awayPoints, g.winner_franchise_id as winnerId,
    h.id as homeId, h.name as homeName, coalesce(ht.team_name, h.name) as homeTeam,
    a.id as awayId, a.name as awayName, coalesce(at.team_name, a.name) as awayTeam
  from games g
  join franchises h on h.id = g.home_franchise_id
  left join team_names ht on ht.franchise_id = h.id and ht.season = g.season
  join franchises a on a.id = g.away_franchise_id
  left join team_names at on at.franchise_id = a.id and at.season = g.season`;

export interface DatedGame extends Game {
  season: number;
}

const side = (r: any, p: string): SeasonFranchise => ({ id: r[`${p}Id`], name: r[`${p}Name`], teamName: r[`${p}Team`] });
const toGame = (r: any): DatedGame => ({
  id: r.id,
  season: r.season,
  week: r.week,
  phase: r.phase,
  bracket: r.bracket,
  round: r.round,
  home: side(r, 'home'),
  homePoints: r.homePoints,
  away: side(r, 'away'),
  awayPoints: r.awayPoints,
  winnerId: r.winnerId,
});

/** A franchise's games, oldest first. */
export function franchiseGames(franchiseId: number): DatedGame[] {
  return open()
    .prepare(`${GAMES} where ? in (g.home_franchise_id, g.away_franchise_id) order by g.season, g.week`)
    .all(franchiseId)
    .map(toGame);
}

/** Every game two franchises played against each other, oldest first. */
export function pairGames(lo: number, hi: number): DatedGame[] {
  return open()
    .prepare(
      `${GAMES} where (g.home_franchise_id = ? and g.away_franchise_id = ?)
                   or (g.home_franchise_id = ? and g.away_franchise_id = ?) order by g.season, g.week`,
    )
    .all(lo, hi, hi, lo)
    .map(toGame);
}

/** Rounds in each season's bracket, keyed `${season}-${bracket}`. */
export function bracketRounds(): Map<string, number> {
  return new Map(
    open()
      .prepare(`select season, bracket, max(round) as rounds from games where bracket is not null group by season, bracket`)
      .all()
      .map((r: any) => [`${r.season}-${r.bracket}`, r.rounds]),
  );
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
export function headToHeads(franchiseId?: number): HeadToHead[] {
  return open()
    .prepare(
      `select p.*, l.name as loName, h.name as hiName from head_to_head p
       join franchises l on l.id = p.lo_franchise_id join franchises h on h.id = p.hi_franchise_id
       where ?1 is null or ?1 in (p.lo_franchise_id, p.hi_franchise_id)
       order by p.lo_franchise_id, p.hi_franchise_id`,
    )
    .all(franchiseId ?? null)
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
export function bestAndWorst(franchiseId: number): BestWorst[] {
  const games = new Map(franchiseGames(franchiseId).map((g) => [g.id, g]));
  return open()
    .prepare(
      `select measure, rank, points, game_id as gameId from franchise_best_worst
       where franchise_id = ? order by measure, rank, game_id`,
    )
    .all(franchiseId)
    .map((r: any) => ({ measure: r.measure, rank: r.rank, points: r.points, game: games.get(r.gameId)! }));
}

export interface Crown {
  season: number;
  bracket: BracketName;
  source: 'derived' | 'confirmed' | 'recalled' | 'disputed';
}

/** The brackets a franchise won, or is one candidate of a disputed outcome for. */
export function crowns(franchiseId: number): Crown[] {
  return open()
    .prepare('select season, bracket, source from bracket_winners where franchise_id = ? order by season, bracket')
    .all(franchiseId) as unknown as Crown[];
}

/** Seasons whose regular season has weeks with no game scores. */
export function gapSeasons(): Set<number> {
  return new Set(
    open()
      .prepare("select distinct season from coverage where phase = 'regular' and not complete")
      .all()
      .map((r: any) => r.season),
  );
}
