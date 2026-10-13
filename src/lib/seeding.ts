// Seeding and clinches for the Sleeper era (ADR 0005): the one implementation,
// used by the Astro build (playoff picture, clinch marks, the seed check) and
// by the predictor in the browser. Pure: no database, no Node.
//
// The rules are playoffs.md's, with the bracket sizes from the season's format:
// the division winners take the top Playoffs seeds and the best wildcards the
// rest; the division losers take the top Shit Bowl seeds (the worst franchise
// first) and the worst wildcards the rest; everyone else is in the Mediocre
// Bowl, seeded on from the Playoffs. Franchises are ranked by win % (a tie
// counting half), then:
//   two clubs:           head-to-head (if they met), divisional record (if they
//                        share a division), Breakdown, scissors-paper-rock;
//   three or more clubs: divisional record (if all share a division),
//                        Breakdown, scissors-paper-rock.
// As soon as a step separates some clubs from the rest, the ones still level
// start again from the first step (so three clubs can come down to two, and
// head-to-head). The Shit Bowl uses the same steps the other way round: it
// picks the worst club first, and the worse value wins each step.

export type FranchiseId = number;
export type BracketKey = 'playoffs' | 'mediocre_bowl' | 'shit_bowl';

export interface SeedingInput {
  franchises: { id: FranchiseId; division: string }[];
  /** Regular-season games played (or picked): winner null for a tie. */
  played: { home: FranchiseId; away: FranchiseId; winner: FranchiseId | null }[];
  /** Regular-season games still to play. */
  remaining: { home: FranchiseId; away: FranchiseId }[];
  /** Each franchise's Breakdown % (a tie counting half), as a fraction. */
  breakdown: Record<FranchiseId, number>;
  /** Each bracket's size, from the season's format. */
  brackets: Record<BracketKey, number>;
  /** Scissors-paper-rock rulings, each an order of franchises, winner first. */
  spr?: FranchiseId[][];
}

export interface Place {
  franchise: FranchiseId;
  bracket: BracketKey;
  /** The seed within the bracket; the Mediocre Bowl is numbered on from the Playoffs. */
  seed: number;
  /** Shares its seed with a franchise level after every tiebreak but scissors-paper-rock. */
  shared: boolean;
  /** The franchises it is level with after every tiebreak but scissors-paper-rock. */
  level: FranchiseId[];
}

type Dir = 'top' | 'bottom';

/** How a level group is settled once the known tiebreaks are used up: one club, or null to leave it shared. */
type Resolve = (level: FranchiseId[], dir: Dir) => FranchiseId | null;

interface Table {
  pct: Map<FranchiseId, number>;
  division: Map<FranchiseId, string>;
  /** [points, games] of a against b, a win 1 and a tie a half. */
  h2h: (a: FranchiseId, b: FranchiseId) => [number, number];
  divPct: Map<FranchiseId, number>;
  /** Breakdown %, or null where it isn't known yet. */
  breakdown: ((f: FranchiseId) => number) | null;
}

function table(input: SeedingInput, played = input.played, breakdownKnown = true): Table {
  const division = new Map(input.franchises.map((f) => [f.id, f.division]));
  const rec = new Map<FranchiseId, [number, number]>();
  const div = new Map<FranchiseId, [number, number]>();
  const pair = new Map<string, [number, number]>();
  for (const f of input.franchises) {
    rec.set(f.id, [0, 0]);
    div.set(f.id, [0, 0]);
  }
  const add = (m: Map<any, [number, number]>, k: any, pts: number) => {
    const r = m.get(k) ?? [0, 0];
    m.set(k, [r[0] + pts, r[1] + 1]);
  };
  for (const g of played) {
    for (const [me, them] of [[g.home, g.away], [g.away, g.home]]) {
      const pts = g.winner === me ? 1 : g.winner === null ? 0.5 : 0;
      if (rec.has(me)) add(rec, me, pts);
      if (division.has(them) && division.get(me) === division.get(them)) add(div, me, pts);
      add(pair, `${me}-${them}`, pts);
    }
  }
  const pctOf = (m: Map<FranchiseId, [number, number]>) =>
    new Map([...m].map(([k, [p, n]]) => [k, n ? p / n : 0]));
  return {
    pct: pctOf(rec),
    division,
    h2h: (a, b) => pair.get(`${a}-${b}`) ?? [0, 0],
    divPct: pctOf(div),
    breakdown: breakdownKnown ? (f) => input.breakdown[f] ?? 0 : null,
  };
}

type Step = (group: FranchiseId[]) => Map<FranchiseId, number> | null;

function steps(t: Table, group: FranchiseId[]): Step[] {
  const sameDivision = new Set(group.map((f) => t.division.get(f))).size === 1;
  const h2h: Step = ([a, b]) => {
    const [p, n] = t.h2h(a, b);
    return n ? new Map([[a, p / n], [b, (n - p) / n]]) : null;
  };
  const divisional: Step = (g) => new Map(g.map((f) => [f, t.divPct.get(f) ?? 0]));
  const breakdown: Step = (g) => (t.breakdown ? new Map(g.map((f) => [f, t.breakdown!(f)])) : null);
  if (group.length === 2) return sameDivision ? [h2h, divisional, breakdown] : [h2h, breakdown];
  return sameDivision ? [divisional, breakdown] : [breakdown];
}

/** The clubs of a level group (same win %) that come first by the known tiebreaks. */
function first(t: Table, group: FranchiseId[], dir: Dir): FranchiseId[] {
  if (group.length < 2) return group;
  for (const step of steps(t, group)) {
    const values = step(group);
    if (!values) continue;
    const best = (dir === 'top' ? Math.max : Math.min)(...values.values());
    const ahead = group.filter((f) => values.get(f) === best);
    if (ahead.length < group.length) return first(t, ahead, dir);
  }
  return group;
}

/** The group ranked best-first (top) or worst-first (bottom), as tiers of franchises that stay level. */
function rank(t: Table, group: FranchiseId[], dir: Dir, resolve: Resolve): FranchiseId[][] {
  const sign = dir === 'top' ? -1 : 1;
  const sorted = [...group].sort((a, b) => sign * (t.pct.get(a)! - t.pct.get(b)!) || a - b);
  const tiers: FranchiseId[][] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && t.pct.get(sorted[j]) === t.pct.get(sorted[i])) j++;
    tiers.push(...settle(t, sorted.slice(i, j), dir, resolve));
    i = j;
  }
  return tiers;
}

function settle(t: Table, group: FranchiseId[], dir: Dir, resolve: Resolve): FranchiseId[][] {
  if (group.length === 0) return [];
  if (group.length === 1) return [group];
  const ahead = first(t, group, dir);
  if (ahead.length === 1) return [ahead, ...settle(t, without(group, ahead), dir, resolve)];
  const pick = resolve(ahead, dir);
  if (pick !== null) return [[pick], ...settle(t, without(group, [pick]), dir, resolve)];
  return [ahead, ...settle(t, without(group, ahead), dir, resolve)];
}

const without = (group: FranchiseId[], out: FranchiseId[]) => group.filter((f) => !out.includes(f));

/** Scissors-paper-rock as ruled: the first ruling that orders the whole group. */
function sprResolve(rulings: FranchiseId[][]): Resolve {
  return (level, dir) => {
    const ruling = rulings.find((r) => level.every((f) => r.includes(f)));
    if (!ruling) return null;
    const ordered = ruling.filter((f) => level.includes(f));
    return dir === 'top' ? ordered[0] : ordered[ordered.length - 1];
  };
}

interface Seeding {
  places: Place[];
  divisionWinners: Set<FranchiseId>;
}

function seed(input: SeedingInput, t: Table, resolve: Resolve): Seeding {
  const level = new Map<FranchiseId, Set<FranchiseId>>();
  const note = (tiers: FranchiseId[][]) => {
    for (const tier of tiers)
      if (tier.length > 1)
        for (const f of tier) {
          const s = level.get(f) ?? new Set();
          tier.filter((g) => g !== f).forEach((g) => s.add(g));
          level.set(f, s);
        }
    return tiers;
  };
  const head = (tiers: FranchiseId[][]) => tiers[0][0];
  const divisions = new Map<string, FranchiseId[]>();
  for (const f of input.franchises) divisions.set(f.division, [...(divisions.get(f.division) ?? []), f.id]);
  const winners: FranchiseId[] = [];
  const losers: FranchiseId[] = [];
  for (const members of divisions.values()) {
    winners.push(head(note(rank(t, members, 'top', resolve))));
    if (members.length > 1) losers.push(head(note(rank(t, members, 'bottom', resolve))));
  }
  const { playoffs, mediocre_bowl: mediocre, shit_bowl: shit } = input.brackets;
  const places: Place[] = [];
  // Seeds follow the tiers: a tier shares the seed of its first place.
  const place = (tiers: FranchiseId[][], bracket: BracketKey, from: number, count = Infinity) => {
    const out: Place[] = [];
    let n = from;
    for (const tier of tiers) {
      for (const f of tier) {
        if (out.length >= count) break;
        out.push({ franchise: f, bracket, seed: n, shared: tier.length > 1, level: [] });
      }
      n += tier.length;
    }
    places.push(...out);
    return out.map((p) => p.franchise);
  };
  const rest = (...out: FranchiseId[][]) => input.franchises.map((f) => f.id).filter((f) => !out.flat().includes(f));
  place(note(rank(t, winners, 'top', resolve)), 'playoffs', 1);
  const wildcards = place(note(rank(t, rest(winners, losers), 'top', resolve)), 'playoffs', winners.length + 1, playoffs - winners.length);
  place(note(rank(t, losers, 'bottom', resolve)), 'shit_bowl', 1);
  const worst = place(note(rank(t, rest(winners, losers, wildcards), 'bottom', resolve)), 'shit_bowl', losers.length + 1, shit - losers.length);
  place(note(rank(t, rest(winners, losers, wildcards, worst), 'top', resolve)), 'mediocre_bowl', playoffs + 1, mediocre);
  // A tier cut short by the bracket's size, or split between brackets, shares nothing.
  for (const p of places) {
    p.level = [...(level.get(p.franchise) ?? [])].sort((a, b) => a - b);
    p.shared = p.shared && places.some((q) => q !== p && q.bracket === p.bracket && q.seed === p.seed);
  }
  const order: BracketKey[] = ['playoffs', 'mediocre_bowl', 'shit_bowl'];
  places.sort((a, b) =>
    order.indexOf(a.bracket) - order.indexOf(b.bracket) ||
    (a.bracket === 'shit_bowl' ? b.seed - a.seed : a.seed - b.seed) ||
    a.franchise - b.franchise,
  );
  return { places, divisionWinners: new Set(winners) };
}

/**
 * The playoff picture: every franchise's bracket and seed if the regular
 * season ended with the games played, Playoffs first and the Shit Bowl's
 * seed 1 last. Franchises level after every tiebreak but scissors-paper-rock
 * share a seed unless a ruling orders them; their order here is by id.
 */
export function playoffPicture(input: SeedingInput): Place[] {
  return seed(input, table(input), sprResolve(input.spr ?? [])).places;
}
