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

/** Win % by every measure the tiebreaks use, kept in arrays: clinch marks build one per outcome. */
class Table {
  readonly index = new Map<FranchiseId, number>();
  readonly division: string[] = [];
  // Points then games for each franchise (and each ordered pair), a win 1 and a tie a half.
  private rec: Float64Array;
  private div: Float64Array;
  private pair: Float64Array;

  /** Breakdown %, or null while it isn't known yet. */
  readonly breakdown: ((f: FranchiseId) => number) | null;

  /** from copies another table's results. */
  constructor(input: SeedingInput, breakdown: ((f: FranchiseId) => number) | null, from?: Table) {
    this.breakdown = breakdown;
    input.franchises.forEach((f, i) => {
      this.index.set(f.id, i);
      this.division.push(f.division);
    });
    const n = input.franchises.length;
    this.rec = from ? from.rec.slice() : new Float64Array(2 * n);
    this.div = from ? from.div.slice() : new Float64Array(2 * n);
    this.pair = from ? from.pair.slice() : new Float64Array(2 * n * n);
  }

  add(home: FranchiseId, away: FranchiseId, winner: FranchiseId | null) {
    const n = this.division.length;
    const h = this.index.get(home);
    const a = this.index.get(away);
    for (const [me, them, id] of [[h, a, home], [a, h, away]] as const) {
      if (me === undefined) continue;
      const pts = winner === id ? 1 : winner === null ? 0.5 : 0;
      this.rec[2 * me] += pts;
      this.rec[2 * me + 1]++;
      if (them === undefined) continue;
      if (this.division[me] === this.division[them]) {
        this.div[2 * me] += pts;
        this.div[2 * me + 1]++;
      }
      this.pair[2 * (me * n + them)] += pts;
      this.pair[2 * (me * n + them) + 1]++;
    }
  }

  private static ratio(a: Float64Array, k: number) {
    return a[2 * k + 1] ? a[2 * k] / a[2 * k + 1] : 0;
  }
  pct(f: FranchiseId) {
    return Table.ratio(this.rec, this.index.get(f)!);
  }
  divPct(f: FranchiseId) {
    return Table.ratio(this.div, this.index.get(f)!);
  }
  divisionOf(f: FranchiseId) {
    return this.division[this.index.get(f)!];
  }
  /** a's win % against b, or null if they never met. */
  h2h(a: FranchiseId, b: FranchiseId) {
    const k = this.index.get(a)! * this.division.length + this.index.get(b)!;
    return this.pair[2 * k + 1] ? this.pair[2 * k] / this.pair[2 * k + 1] : null;
  }
}

function table(input: SeedingInput, breakdownKnown = true): Table {
  const t = new Table(input, breakdownKnown ? (f) => input.breakdown[f] ?? 0 : null);
  for (const g of input.played) t.add(g.home, g.away, g.winner);
  return t;
}

/** The clubs of a level group (same win %) that come first by the known tiebreaks. */
function first(t: Table, group: FranchiseId[], dir: Dir): FranchiseId[] {
  if (group.length < 2) return group;
  const better = (x: number, y: number) => (dir === 'top' ? x > y : x < y);
  // The clubs with the best value, or null if the value separates nobody.
  const keep = (value: (f: FranchiseId) => number) => {
    let best = value(group[0]);
    for (const f of group) if (better(value(f), best)) best = value(f);
    const ahead = group.filter((f) => value(f) === best);
    return ahead.length < group.length ? ahead : null;
  };
  const sameDivision = group.every((f) => t.divisionOf(f) === t.divisionOf(group[0]));
  if (group.length === 2) {
    const [a, b] = group;
    const p = t.h2h(a, b);
    if (p !== null && p !== 0.5) return [better(p, 1 - p) ? a : b];
  }
  const ahead =
    (sameDivision ? keep((f) => t.divPct(f)) : null) ?? (t.breakdown ? keep(t.breakdown) : null);
  return ahead ? first(t, ahead, dir) : group;
}

/**
 * The group ranked best-first (top) or worst-first (bottom), as tiers of
 * franchises that stay level. With cuts (positions, from 0, where a bracket
 * place changes hands), level clubs that don't span a cut are left as one
 * unsettled tier: their order can't change anyone's place.
 */
function rank(t: Table, group: FranchiseId[], dir: Dir, resolve: Resolve, cuts?: number[]): FranchiseId[][] {
  const sign = dir === 'top' ? -1 : 1;
  const pct = new Map(group.map((f) => [f, t.pct(f)]));
  const sorted = [...group].sort((a, b) => sign * (pct.get(a)! - pct.get(b)!) || a - b);
  const tiers: FranchiseId[][] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && pct.get(sorted[j]) === pct.get(sorted[i])) j++;
    tiers.push(...settle(t, sorted.slice(i, j), dir, resolve, i, cuts));
    i = j;
  }
  return tiers;
}

function settle(
  t: Table,
  group: FranchiseId[],
  dir: Dir,
  resolve: Resolve,
  at: number,
  cuts?: number[],
): FranchiseId[][] {
  if (group.length === 0) return [];
  if (group.length === 1) return [group];
  if (cuts && !cuts.some((c) => at < c && c < at + group.length)) return [group];
  const ahead = first(t, group, dir);
  const pick = ahead.length === 1 ? ahead[0] : resolve(ahead, dir);
  if (pick !== null) return [[pick], ...settle(t, without(group, [pick]), dir, resolve, at + 1, cuts)];
  return [ahead, ...settle(t, without(group, ahead), dir, resolve, at + ahead.length, cuts)];
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

/** Seeds every franchise. With prune, only what decides a bracket place, a division or a bye is settled. */
function seed(input: SeedingInput, t: Table, resolve: Resolve, prune = false): Seeding {
  const level = new Map<FranchiseId, Set<FranchiseId>>();
  const note = (tiers: FranchiseId[][]) => {
    if (prune) return tiers;
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
  const { playoffs, mediocre_bowl: mediocre, shit_bowl: shit } = input.brackets;
  const cut = (...at: number[]) => (prune ? at : undefined);
  for (const members of divisions.values()) {
    winners.push(head(note(rank(t, members, 'top', resolve, cut(1)))));
    if (members.length > 1) losers.push(head(note(rank(t, members, 'bottom', resolve, cut(1)))));
  }
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
  const rest = (...out: FranchiseId[][]) => {
    const gone = new Set(out.flat());
    return input.franchises.map((f) => f.id).filter((f) => !gone.has(f));
  };
  const wild = playoffs - winners.length;
  const worstWild = shit - losers.length;
  place(note(rank(t, winners, 'top', resolve, cut(byes(playoffs)))), 'playoffs', 1);
  const wildcards = place(note(rank(t, rest(winners, losers), 'top', resolve, cut(wild))), 'playoffs', winners.length + 1, wild);
  place(note(rank(t, losers, 'bottom', resolve, cut())), 'shit_bowl', 1);
  const pool = rest(winners, losers, wildcards);
  const worst = place(note(rank(t, pool, 'bottom', resolve, cut(worstWild))), 'shit_bowl', losers.length + 1, worstWild);
  place(note(rank(t, rest(winners, losers, wildcards, worst), 'top', resolve, cut())), 'mediocre_bowl', playoffs + 1, mediocre);
  if (prune) return { places, divisionWinners: new Set(winners) };
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

// ---------- placing a bracket's opening pairings ----------

/** A bracket-week pairing still to play: its bracket and round, or null if the build couldn't place it. */
export interface UpcomingPairing {
  week: number;
  home: FranchiseId;
  away: FranchiseId;
  bracket: BracketKey | null;
  round: number | null;
}

/**
 * The pairings that are bracket games. The Python build places every pairing
 * it can, from the hand-kept assignment and the bracket games already played
 * (recordbook/sleeper.py); before either franchise has played a bracket game,
 * only the seeds can. Such a pairing is round 1 of the bracket both franchises
 * are seeded in, in that bracket's opening week. Any other is filler.
 */
export function placeOpeningPairings(
  pairings: UpcomingPairing[],
  places: Place[],
  openings: { bracket: BracketKey; firstWeek: number }[],
): (UpcomingPairing & { bracket: BracketKey; round: number })[] {
  const bracketOf = new Map(places.map((p) => [p.franchise, p.bracket]));
  return pairings.flatMap((p) => {
    if (p.bracket) return [{ ...p, bracket: p.bracket, round: p.round ?? 1 }];
    const bracket = bracketOf.get(p.home);
    const opening = openings.find((o) => o.bracket === bracket);
    if (!bracket || !opening || bracketOf.get(p.away) !== bracket || p.week !== opening.firstWeek) return [];
    return [{ ...p, bracket, round: 1 }];
  });
}

// ---------- the seed check ----------

export interface BracketGame {
  bracket: BracketKey;
  round: number;
  home: FranchiseId;
  away: FranchiseId;
  /** Null for a tie. */
  winner: FranchiseId | null;
}

const BRACKET_NAMES: Record<BracketKey, string> = {
  playoffs: 'Playoffs',
  mediocre_bowl: 'Mediocre Bowl',
  shit_bowl: 'Shit Bowl',
};

/**
 * Where a finished season's brackets, as played, disagree with its computed
 * seeds, each a sentence (empty when they agree). Each bracket must hold
 * exactly the franchises its seeds give it. Its first round must pair them
 * by seed: the top seeds bye up to the next power of two and the rest meet
 * outside-in (3 v 6 and 4 v 5 of six). After byes, the second round is
 * re-seeded: the top seed meets the lowest left. The Shit Bowl's seed 1 is
 * its worst franchise, and losing advances. Franchises still level after
 * every tiebreak but scissors-paper-rock fail the check until a ruling is
 * recorded. name shows a franchise in the sentences.
 */
export function checkSeeds(
  picture: Place[],
  played: BracketGame[],
  options: { name?: (f: FranchiseId) => string } = {},
): string[] {
  const name = options.name ?? String;
  const problems: string[] = [];
  const level = picture.filter((p) => p.level.length);
  if (level.length)
    problems.push(
      `${level.map((p) => name(p.franchise)).join(', ')} are level after every tiebreak but ` +
        'scissors-paper-rock: record the ruling in data/scissors_paper_rock.csv',
    );
  const pair = (a: FranchiseId, b: FranchiseId) => [a, b].sort((x, y) => x - y).join(' v ');
  const show = (pairs: string[]) =>
    pairs.map((p) => p.split(' v ').map((f) => name(Number(f))).join(' v ')).join(', ') || 'none';
  for (const bracket of Object.keys(BRACKET_NAMES) as BracketKey[]) {
    const title = BRACKET_NAMES[bracket];
    const seeded = picture.filter((p) => p.bracket === bracket).sort((a, b) => a.seed - b.seed).map((p) => p.franchise);
    const games = played.filter((g) => g.bracket === bracket);
    const players = new Set(games.flatMap((g) => [g.home, g.away]));
    const missing = seeded.filter((f) => !players.has(f));
    const extra = [...players].filter((f) => !seeded.includes(f));
    if (missing.length || extra.length) {
      problems.push(
        `${title}: the seeds put ${seeded.map(name).join(', ') || 'nobody'} in it, but ` +
          `${[...players].map(name).join(', ') || 'nobody'} played in it`,
      );
      continue;
    }
    if (!games.length) continue;
    const bye = byes(seeded.length);
    const outsideIn = (order: FranchiseId[]) =>
      Array.from({ length: Math.floor(order.length / 2) }, (_, i) => pair(order[i], order[order.length - 1 - i]));
    const round = (r: number) => [...new Set(games.filter((g) => g.round === r).map((g) => pair(g.home, g.away)))].sort();
    const expected = outsideIn(seeded.slice(bye)).sort();
    if (round(1).join() !== expected.join()) {
      problems.push(`${title} round 1: the seeds pair ${show(expected)}, but ${show(round(1))} played`);
      continue;
    }
    if (!bye || !games.some((g) => g.round === 2)) continue;
    // Who goes on from round 1: its winners, but in the Shit Bowl its losers.
    const on = games
      .filter((g) => g.round === 1)
      .map((g) => (bracket === 'shit_bowl' ? (g.winner === g.home ? g.away : g.home) : g.winner))
      .filter((f): f is FranchiseId => f !== null);
    const left = seeded.filter((f) => seeded.indexOf(f) < bye || on.includes(f));
    const second = outsideIn(left).sort();
    if (round(2).join() !== second.join())
      problems.push(`${title} round 2: re-seeding pairs ${show(second)}, but ${show(round(2))} played`);
  }
  return problems;
}

// ---------- clinch and elimination marks ----------

/**
 * PLAYOFFS: a Playoffs place; DIVISION: a division winner's seed; BYE: a bye
 * seed; OUT: no Playoffs place; SAFE: no Shit Bowl place; SHIT BOWL: a Shit
 * Bowl place. The Mediocre Bowl shows OUT and SAFE.
 */
export type Mark = 'PLAYOFFS' | 'DIVISION' | 'BYE' | 'OUT' | 'SAFE' | 'SHIT BOWL';

/** Up to this many remaining games, every win/loss outcome is tried. */
export const EXACT_LIMIT = 16;

/** The Playoffs' bye seeds: the first round is cut to the next power of two. */
export const byes = (size: number) => 2 ** Math.ceil(Math.log2(size)) - size;

/** What each franchise has been seen doing across the outcomes tried: [it happened, it didn't]. */
type Seen = Record<'playoffs' | 'division' | 'bye' | 'shit', [boolean, boolean]>;

/**
 * Each franchise's clinch and elimination marks, the most telling ones only
 * (BYE rather than DIVISION and PLAYOFFS; SHIT BOWL rather than OUT).
 *
 * Conservative: a mark shows only if it holds for every win/loss outcome of
 * the remaining games, however the tiebreaks beyond head-to-head and
 * divisional record fall (Breakdown moves with every remaining week's scores,
 * and scissors-paper-rock is anyone's). With EXACT_LIMIT or fewer remaining
 * games every outcome is tried; before that, each franchise's best and worst
 * possible records bound what can happen. Once no games remain, Breakdown is
 * final and only an unruled scissors-paper-rock is open.
 */
export function clinchMarks(input: SeedingInput): Record<FranchiseId, Mark[]> {
  const seen = input.remaining.length <= EXACT_LIMIT ? exact(input) : bounds(input);
  const out: Record<FranchiseId, Mark[]> = {};
  for (const { id } of input.franchises) {
    const s = seen.get(id)!;
    const always = (k: keyof Seen) => !s[k][1];
    const never = (k: keyof Seen) => !s[k][0];
    const marks: Mark[] = [];
    if (always('bye')) marks.push('BYE');
    else if (always('division')) marks.push('DIVISION');
    else if (always('playoffs')) marks.push('PLAYOFFS');
    if (always('shit')) marks.push('SHIT BOWL');
    else {
      if (never('playoffs')) marks.push('OUT');
      if (never('shit') && !always('playoffs')) marks.push('SAFE');
    }
    out[id] = marks;
  }
  return out;
}

const unseen = (): Seen => ({ playoffs: [false, false], division: [false, false], bye: [false, false], shit: [false, false] });

const FACTS = ['playoffs', 'division', 'bye', 'shit'] as const;

/**
 * Every win/loss outcome of the remaining games, and every way the open
 * tiebreaks could fall, searched game by game. What the win bounds rule out
 * can't happen, so a part of the search where the bounds rule out everything
 * not yet seen is skipped, and the search stops once everything is seen.
 */
function exact(input: SeedingInput): Map<FranchiseId, Seen> {
  const seen = new Map(input.franchises.map((f) => [f.id, unseen()]));
  const final = input.remaining.length === 0;
  const ruled = sprResolve(input.spr ?? []);
  const bye = byes(input.brackets.playoffs);
  const base = table(input, final);
  // Whether anything not yet seen could still happen, given these bounds.
  const anyNew = (possible: Map<FranchiseId, Seen>) =>
    [...seen].some(([f, s]) => FACTS.some((k) => (!s[k][0] && possible.get(f)![k][0]) || (!s[k][1] && possible.get(f)![k][1])));

  const leaf = (decided: SeedingInput['played']) => {
    const t = new Table(input, base.breakdown, base);
    for (const g of decided) t.add(g.home, g.away, g.winner);
    // Walk every sequence of tiebreak choices, depth first: `path` holds the choice made at each open
    // tiebreak met so far, `arity` how many clubs each one had to choose from.
    let path: number[] = [];
    for (;;) {
      const arity: number[] = [];
      const resolve: Resolve = (level, dir) => {
        if (final) {
          const pick = ruled(level, dir);
          if (pick !== null) return pick;
        }
        const i = arity.length;
        arity.push(level.length);
        if (i === path.length) path.push(0);
        return level[path[i]];
      };
      const { places, divisionWinners } = seed(input, t, resolve, true);
      for (const p of places) {
        const s = seen.get(p.franchise)!;
        s.playoffs[p.bracket === 'playoffs' ? 0 : 1] = true;
        s.division[divisionWinners.has(p.franchise) ? 0 : 1] = true;
        s.bye[p.bracket === 'playoffs' && p.seed <= bye ? 0 : 1] = true;
        s.shit[p.bracket === 'shit_bowl' ? 0 : 1] = true;
      }
      path = path.slice(0, arity.length);
      while (path.length && path[path.length - 1] + 1 >= arity[path.length - 1]) path.pop();
      if (!path.length) break;
      path[path.length - 1]++;
    }
  };

  const search = (decided: SeedingInput['played']) => {
    const i = decided.length;
    if (i === input.remaining.length) return leaf(decided);
    const possible = bounds({ ...input, played: [...input.played, ...decided], remaining: input.remaining.slice(i) });
    if (!anyNew(possible)) return;
    const g = input.remaining[i];
    search([...decided, { ...g, winner: g.home }]);
    search([...decided, { ...g, winner: g.away }]);
  };
  search([]);
  return seen;
}

/**
 * Before the last EXACT_LIMIT games, bounds on each franchise's final win %:
 * the worst if it loses every remaining game, the best if it wins them all.
 * A rival "could finish level or above" X when its best reaches X's worst, and
 * is "sure to finish above" X when its worst beats X's best (and the mirror
 * images below). In any outcome the division's winner is at or above every
 * club of its division, and its loser at or below, which bounds how many
 * wildcards can finish ahead of (or behind) X.
 */
function bounds(input: SeedingInput): Map<FranchiseId, Seen> {
  const games = new Map<FranchiseId, number>();
  const points = new Map<FranchiseId, number>();
  const left = new Map<FranchiseId, number>();
  const add = (m: Map<FranchiseId, number>, f: FranchiseId, n: number) => m.set(f, (m.get(f) ?? 0) + n);
  for (const g of input.played)
    for (const f of [g.home, g.away]) {
      add(games, f, 1);
      add(points, f, g.winner === f ? 1 : g.winner === null ? 0.5 : 0);
    }
  for (const g of input.remaining)
    for (const f of [g.home, g.away]) {
      add(games, f, 1);
      add(left, f, 1);
    }
  const worst = (f: FranchiseId) => (games.get(f) ? (points.get(f) ?? 0) / games.get(f)! : 0);
  const best = (f: FranchiseId) => (games.get(f) ? ((points.get(f) ?? 0) + (left.get(f) ?? 0)) / games.get(f)! : 0);
  const divisions = new Map<string, FranchiseId[]>();
  for (const f of input.franchises) divisions.set(f.division, [...(divisions.get(f.division) ?? []), f.id]);
  const D = divisions.size;
  const { playoffs: P, shit_bowl: S } = input.brackets;
  const seen = new Map<FranchiseId, Seen>();
  for (const { id: x, division } of input.franchises) {
    const rivals = divisions.get(division)!.filter((f) => f !== x);
    const others = [...divisions.entries()].filter(([d]) => d !== division).map(([, m]) => m);
    const couldAbove = (y: FranchiseId) => best(y) >= worst(x);
    const sureAbove = (y: FranchiseId) => worst(y) > best(x);
    const couldBelow = (y: FranchiseId) => worst(y) <= best(x);
    const sureBelow = (y: FranchiseId) => best(y) < worst(x);
    const count = (m: FranchiseId[], p: (y: FranchiseId) => boolean) => m.filter(p).length;
    // Wildcards that could finish level with or above X: in each division, all but its winner.
    const wildcardsAbove = [rivals, ...others].reduce((n, m) => n + Math.max(0, count(m, couldAbove) - 1), 0);
    const wildcardsBelow = [rivals, ...others].reduce((n, m) => n + Math.max(0, count(m, couldBelow) - 1), 0);
    // Wildcards sure to finish above X: all but the division's winner, and its loser too if the whole
    // division is above X. X's own division can't be wholly above X unless X is its loser.
    const sure = (m: FranchiseId[], p: (y: FranchiseId) => boolean, whole: boolean) => {
      const n = count(m, p);
      return Math.max(0, n - 1 - (whole && n === m.length ? 1 : 0));
    };
    const wildcardsSureAbove = sure(rivals, sureAbove, false) + others.reduce((n, m) => n + sure(m, sureAbove, true), 0);
    const wildcardsSureBelow = sure(rivals, sureBelow, false) + others.reduce((n, m) => n + sure(m, sureBelow, true), 0);
    const wins = rivals.every((y) => !couldAbove(y));
    const loser = rivals.length > 0 && rivals.every(sureAbove);
    const notWinner = rivals.some(sureAbove);
    const notLoser = rivals.some(sureBelow);
    const playoffs = wins || (notLoser && wildcardsAbove < P - D);
    const out = loser || (notWinner && wildcardsSureAbove >= P - D);
    const bye = wins && others.filter((m) => m.some(couldAbove)).length < byes(P);
    const shit = loser || (notWinner && wildcardsBelow < S - D);
    const safe = playoffs || (notLoser && wildcardsSureBelow >= S - D);
    seen.set(x, {
      playoffs: [!out, !playoffs],
      division: [!notWinner, !wins],
      bye: [!out && !notWinner, !bye],
      shit: [!safe, !shit],
    });
  }
  return seen;
}
