// The playoff predictor (#17, #36): what-if picks of the current season's
// remaining regular-season games, run through the seeding module (ADR 0005).
// This is the scenario and its projection; src/lib/predictor-page.ts renders
// them. Pure, shared by the build (the page as it stands, with no picks) and
// the browser. The URL is the only state, in Statsguru's short style:
//   ?w9=3,12&w10=5&spr=7.3
// picks the winners 3 and 12 in week 9 and 5 in week 10, and orders the
// level franchises 7 and 3 by scissors-paper-rock, 7 first.
import { predictorUrl } from './urls';
import { BRACKET_ORDER, type BracketKey } from './brackets';
import { byes, playoffPicture, type FranchiseId, type Mark, type Place, type SeedingInput } from './seeding';

export interface RemainingGame {
  week: number;
  home: FranchiseId;
  away: FranchiseId;
}

/** Everything the predictor needs, shipped to the browser as JSON. */
export interface PredictorData {
  season: number;
  /** The regular season's first and last week. */
  weeks: [number, number];
  franchises: { id: FranchiseId; name: string; teamName: string }[];
  /** The real results: Breakdown stays at its real value whatever is picked. */
  input: SeedingInput & { remaining: RemainingGame[] };
  /** The real clinch marks, for the page with no picks. */
  marks: Record<FranchiseId, Mark[]>;
}

export interface Pick {
  week: number;
  winner: FranchiseId;
}

export interface Scenario {
  /** By week, then winner. */
  picks: Pick[];
  /** Scissors-paper-rock orders, each winner first. */
  spr: FranchiseId[][];
}

const gameOf = (data: PredictorData, p: Pick) =>
  data.input.remaining.find((g) => g.week === p.week && (g.home === p.winner || g.away === p.winner));

/**
 * The scenario a URL's query holds. Picks for weeks played since are
 * dropped and counted; a pick that names no remaining game, or both sides
 * of one, is ignored.
 */
export function decodeScenario(search: string, data: PredictorData): { scenario: Scenario; dropped: number } {
  const params = new URLSearchParams(search);
  const left = new Set(data.input.remaining.map((g) => g.week));
  const picks: Pick[] = [];
  let dropped = 0;
  for (const [key, value] of params) {
    const week = /^w(\d+)$/.exec(key)?.[1];
    if (week === undefined) continue;
    const w = Number(week);
    const winners = value.split(',').filter((v) => /^\d+$/.test(v)).map(Number);
    if (!left.has(w)) {
      if (w >= data.weeks[0] && w <= data.weeks[1]) dropped += winners.length;
      continue;
    }
    const valid = winners.filter((winner) => gameOf(data, { week: w, winner }));
    for (const winner of valid) {
      const g = gameOf(data, { week: w, winner })!;
      const other = g.home === winner ? g.away : g.home;
      if (valid.includes(other) || picks.some((p) => p.week === w && p.winner === winner)) continue;
      picks.push({ week: w, winner });
    }
  }
  picks.sort((a, b) => a.week - b.week || a.winner - b.winner);
  const spr = (params.get('spr') ?? '')
    .split(',')
    .map((r) => r.split('.').filter((v) => /^\d+$/.test(v)).map(Number))
    .filter((r) => r.length > 1 && new Set(r).size === r.length);
  return { scenario: { picks, spr }, dropped };
}

/** The seeding module's input with the picked games played: a pick is a win and a loss, never a score. */
export function scenarioInput(data: PredictorData, scenario: Scenario): SeedingInput {
  const picked = new Map(scenario.picks.map((p) => [gameOf(data, p)!, p.winner]));
  const { remaining, ...real } = data.input;
  return {
    ...real,
    played: [...real.played, ...[...picked].map(([g, winner]) => ({ home: g.home, away: g.away, winner }))],
    remaining: remaining.filter((g) => !picked.has(g)).map(({ home, away }) => ({ home, away })),
  };
}

/** A bracket slot: one franchise, or every franchise it could be until scissors-paper-rock decides. */
export interface Slot {
  seed: number;
  franchises: FranchiseId[];
}

/** A bracket's first round: the bye seeds, then the games, outside-in. */
export interface FirstRound {
  bracket: BracketKey;
  byes: Slot[];
  pairs: [Slot, Slot][];
}

/** Franchises level after every tiebreak but scissors-paper-rock, and the visitor's order (winner first) if any. */
export interface LevelGroup {
  members: FranchiseId[];
  order: FranchiseId[] | null;
}

export interface Projection {
  /** The scenario as applied: orders for franchises no longer level are left out. */
  scenario: Scenario;
  input: SeedingInput;
  places: Place[];
  /** Each franchise's [wins, losses, ties], picks included. */
  records: Record<FranchiseId, [number, number, number]>;
  groups: LevelGroup[];
  brackets: FirstRound[];
}

/** Whether two lists hold the same franchises. */
export const sameSet = (a: FranchiseId[], b: FranchiseId[]) => a.length === b.length && a.every((f) => b.includes(f));

/** Each level group of a picture, as sorted ids. */
function levelGroups(places: Place[]): FranchiseId[][] {
  const groups: FranchiseId[][] = [];
  for (const p of places) {
    if (!p.level.length) continue;
    const g = [p.franchise, ...p.level].sort((a, b) => a - b);
    if (!groups.some((h) => sameSet(g, h))) groups.push(g);
  }
  return groups;
}

/**
 * The seeds, records, level groups and first rounds a scenario gives. A
 * visitor's scissors-paper-rock order applies once its franchises are level
 * (which an earlier order may bring about); the real rulings come first.
 */
export function project(data: PredictorData, scenario: Scenario): Projection {
  const base = scenarioInput(data, scenario);
  const real = base.spr ?? [];
  const applied: FranchiseId[][] = [];
  let places: Place[];
  let open: FranchiseId[][];
  for (;;) {
    places = playoffPicture({ ...base, spr: [...real, ...applied] });
    open = levelGroups(places);
    const next = scenario.spr.find((r) => !applied.includes(r) && open.some((g) => sameSet(g, r)));
    if (!next) break;
    applied.push(next);
  }
  const records: Projection['records'] = {};
  for (const f of base.franchises) records[f.id] = [0, 0, 0];
  for (const g of base.played)
    for (const f of [g.home, g.away]) {
      if (!records[f]) continue;
      records[f][g.winner === null ? 2 : g.winner === f ? 0 : 1]++;
    }
  const slot = (p: Place): Slot => ({
    seed: p.seed,
    franchises: p.level.length ? [p.franchise, ...p.level].sort((a, b) => a - b) : [p.franchise],
  });
  const brackets = BRACKET_ORDER.filter((b) => base.brackets[b] > 0).map((bracket): FirstRound => {
    const slots = places
      .filter((p) => p.bracket === bracket)
      .sort((a, b) => a.seed - b.seed || a.franchise - b.franchise)
      .map(slot);
    const bye = byes(slots.length);
    const rest = slots.slice(bye);
    return {
      bracket,
      byes: slots.slice(0, bye),
      pairs: Array.from({ length: Math.floor(rest.length / 2) }, (_, i) => [rest[i], rest[rest.length - 1 - i]]),
    };
  });
  return {
    scenario: { picks: scenario.picks, spr: applied },
    input: base,
    places,
    records,
    groups: [...applied.map((order) => ({ members: [...order].sort((a, b) => a - b), order })), ...open.map((members) => ({ members, order: null }))],
    brackets,
  };
}

/** A scenario's query, without the leading "?"; empty for no picks. */
export function encodeScenario(scenario: Scenario): string {
  const weeks = [...new Set(scenario.picks.map((p) => p.week))].sort((a, b) => a - b);
  const parts = weeks.map(
    (w) =>
      `w${w}=${scenario.picks
        .filter((p) => p.week === w)
        .map((p) => p.winner)
        .sort((a, b) => a - b)
        .join(',')}`,
  );
  if (scenario.spr.length) parts.push(`spr=${scenario.spr.map((r) => r.join('.')).join(',')}`);
  return parts.join('&');
}

/** The predictor's page URL for a scenario. */
export const predictorHref = (season: number, scenario: Scenario) => {
  const q = encodeScenario(scenario);
  return `${predictorUrl(season)}${q ? `?${q}` : ''}`;
};
