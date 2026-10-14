// The current season's brackets as Swiss-style columns (#16, #35): one
// column per bracket week, round by round, with seeds from the seeding module
// (ADR 0005). Final games come from the database with their hand-kept
// bracket; pairings still to play come from Sleeper, placed here by the seeds
// and results when no maintainer has assigned them yet. Pure.
import type { BracketKey, FranchiseId, Place } from './seeding';

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

/** A bracket-week pairing still to play: its bracket and round, or null if nobody has assigned it. */
export interface Pairing {
  week: number;
  home: FranchiseId;
  away: FranchiseId;
  bracket: BracketKey | null;
  round: number | null;
}

const roundOf = (spec: BracketSpec, week: number) => (spec.series ? 1 : week - spec.firstWeek + 1);

/**
 * The pairings that are bracket games, each with its bracket and round. An
 * unassigned pairing belongs to a bracket when both franchises are seeded in
 * it and still in it (a loser is out, or in the Shit Bowl a winner; a series
 * keeps both), and the bracket plays that week. Any other pairing is filler.
 */
export function placePairings(
  pairings: Pairing[],
  places: Place[],
  played: PlayedGame[],
  specs: BracketSpec[],
): (Pairing & { bracket: BracketKey; round: number })[] {
  const bracketOf = new Map(places.map((p) => [p.franchise, p.bracket]));
  const out = new Set<FranchiseId>();
  for (const g of played) {
    const spec = specs.find((s) => s.bracket === g.bracket);
    if (!spec || spec.series || g.winner === null) continue;
    const loser = g.winner === g.home ? g.away : g.home;
    out.add(g.bracket === 'shit_bowl' ? g.winner : loser);
  }
  return pairings.flatMap((p) => {
    if (p.bracket) return [{ ...p, bracket: p.bracket, round: p.round ?? 1 }];
    const bracket = bracketOf.get(p.home);
    const spec = specs.find((s) => s.bracket === bracket);
    if (!bracket || !spec || bracketOf.get(p.away) !== bracket || out.has(p.home) || out.has(p.away)) return [];
    if (p.week < spec.firstWeek || p.week > spec.lastWeek) return [];
    return [{ ...p, bracket, round: roundOf(spec, p.week) }];
  });
}

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
