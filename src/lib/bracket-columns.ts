// The current season's brackets as Swiss-style columns (#16, #35): one
// column per bracket week, round by round, with seeds from the seeding module
// (ADR 0005). Final games come from the database with their hand-kept
// bracket; pairings still to play come from Sleeper, already placed by the
// build (recordbook/sleeper.py) or, in a bracket's opening week, by the
// seeding module. This only lays them out. Pure.
import type { BracketKey } from './brackets';
import type { FranchiseId, Place, UpcomingPairing } from './seeding';

export interface BracketSpec {
  bracket: BracketKey;
  firstWeek: number;
  lastWeek: number;
  /** A series ("best of three") is the same two franchises every week. */
  series: string | null;
}

/** A final bracket game. */
export interface PlayedGame {
  bracket: BracketKey;
  week: number;
  round: number;
  home: FranchiseId;
  away: FranchiseId;
  homePoints: number | null;
  awayPoints: number | null;
  /** Null for a tie. */
  winner: FranchiseId | null;
}

/** A placed bracket-week pairing still to play. */
export type Pairing = UpcomingPairing & { bracket: BracketKey };

export interface Side {
  id: FranchiseId;
  seed: number | null;
}

export interface ColumnGame {
  home: Side;
  away: Side;
  /** Null until the game is final. */
  homePoints: number | null;
  awayPoints: number | null;
  winner: FranchiseId | null;
}

export interface Column {
  week: number;
  title: string;
  games: ColumnGame[];
  /** Round one's byes, once its games are drawn. */
  byes: Side[];
}

const roundName = (round: number, rounds: number) =>
  round === rounds ? 'Final' : round === rounds - 1 ? 'Semi-finals' : `Round ${round}`;

/** One bracket's columns, a week each, from its final games and its placed pairings to play. */
export function bracketColumns(spec: BracketSpec, places: Place[], played: PlayedGame[], pairings: Pairing[]): Column[] {
  const seeds = new Map(places.filter((p) => p.bracket === spec.bracket).map((p) => [p.franchise, p.seed]));
  const side = (id: FranchiseId): Side => ({ id, seed: seeds.get(id) ?? null });
  const rounds = spec.lastWeek - spec.firstWeek + 1;
  const columns: Column[] = [];
  for (let week = spec.firstWeek; week <= spec.lastWeek; week++) {
    const games: ColumnGame[] = [
      ...played
        .filter((g) => g.bracket === spec.bracket && g.week === week)
        .map((g) => ({ home: side(g.home), away: side(g.away), homePoints: g.homePoints, awayPoints: g.awayPoints, winner: g.winner })),
      ...pairings
        .filter((p) => p.bracket === spec.bracket && p.week === week)
        .map((p) => ({ home: side(p.home), away: side(p.away), homePoints: null, awayPoints: null, winner: null })),
    ];
    const playing = new Set(games.flatMap((g) => [g.home.id, g.away.id]));
    const byes =
      week === spec.firstWeek && games.length
        ? [...seeds.keys()].filter((f) => !playing.has(f)).sort((a, b) => seeds.get(a)! - seeds.get(b)!).map(side)
        : [];
    const n = week - spec.firstWeek + 1;
    columns.push({ week, title: spec.series ? `Game ${n}` : roundName(n, rounds), games, byes });
  }
  return columns;
}
