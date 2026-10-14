// The playoff predictor (#17, #36): what-if picks of the current season's
// remaining regular-season games, run through the seeding module (ADR 0005).
// Pure, shared by the build (the page as it stands, with no picks) and the
// browser. The URL is the only state, in Statsguru's short style:
//   ?w9=3,12&w10=5&spr=7.3
// picks the winners 3 and 12 in week 9 and 5 in week 10, and orders the
// level franchises 7 and 3 by scissors-paper-rock, 7 first.
import { franchiseUrl, predictorUrl } from './urls';
import { BRACKET_NAMES, BRACKET_ORDER, type BracketKey } from './brackets';
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

const sameSet = (a: FranchiseId[], b: FranchiseId[]) => a.length === b.length && a.every((f) => b.includes(f));

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

// ---------- the page ----------

const ELIMINATED: Mark[] = ['OUT', 'SHIT BOWL'];
/** Level groups this size or smaller can be ordered on the page (every order is a link). */
const ORDERABLE = 4;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const row = (label: string, body: string, sub = '') =>
  `<section class="row"><h2 class="lab">${label}${sub ? `<small>${sub}</small>` : ''}</h2><div class="con">${body}</div></section>`;

const permutations = (list: FranchiseId[]): FranchiseId[][] =>
  list.length <= 1 ? [list] : list.flatMap((f) => permutations(list.filter((g) => g !== f)).map((p) => [f, ...p]));

/** The predictor's page URL for a scenario. */
export const predictorHref = (season: number, scenario: Scenario) => {
  const q = encodeScenario(scenario);
  return `${predictorUrl(season)}${q ? `?${q}` : ''}`;
};

/**
 * The predictor's content: the stale-pick note, the standings as they would
 * stand, the scissors-paper-rock orders, the projected first rounds and the
 * games left to pick. marks is null while the clinch marks are worked out.
 * Every choice is a link to the URL it makes.
 */
export function renderPredictor(
  data: PredictorData,
  p: Projection,
  marks: Record<FranchiseId, Mark[]> | null,
  dropped: number,
): string {
  const franchise = new Map(data.franchises.map((f) => [f.id, f]));
  const team = (id: FranchiseId) => esc(franchise.get(id)?.teamName || franchise.get(id)?.name || String(id));
  const link = (id: FranchiseId) => {
    const f = franchise.get(id);
    const shown = f?.teamName || f?.name || String(id);
    return `<a class="fr" href="${franchiseUrl(id)}">${esc(shown)}</a>${f && shown !== f.name ? ` <span class="alias">(${esc(f.name)})</span>` : ''}`;
  };
  const href = (s: Scenario) => esc(predictorHref(data.season, s));
  const parts: string[] = [];

  if (dropped)
    parts.push(
      `<p class="stale">${dropped === 1 ? '1 pick was for a week' : `${dropped} picks were for weeks`} played since, and ${dropped === 1 ? 'was' : 'were'} dropped.</p>`,
    );

  // The standings, by division, sorted by seed.
  const order = new Map(p.places.map((x, i) => [x.franchise, i]));
  const placeOf = new Map(p.places.map((x) => [x.franchise, x]));
  const divisions = [...new Set(data.input.franchises.map((f) => f.division))].sort();
  const tables = divisions.map((d) => {
    const members = data.input.franchises
      .filter((f) => f.division === d)
      .map((f) => f.id)
      .sort((a, b) => order.get(a)! - order.get(b)!);
    const body = members
      .map((id, i) => {
        const x = placeOf.get(id)!;
        const cut = i > 0 && placeOf.get(members[i - 1])!.bracket !== x.bracket;
        const badges = (marks?.[id] ?? [])
          .map((m) => `<span class="bd ${ELIMINATED.includes(m) ? 'dep' : 'now'}">${m}</span>`)
          .join('');
        const [w, l, t] = p.records[id];
        return `<tr${cut ? ' class="cut"' : ''}><td>${link(id)}${badges}</td><td class="num">${w}-${l}-${t}</td><td class="num">${x.level.length ? '=' : ''}${x.seed}</td><td>${BRACKET_NAMES[x.bracket]}</td></tr>`;
      })
      .join('');
    return `<table class="t">${divisions.length > 1 ? `<caption>${esc(d)}</caption>` : ''}<thead><tr><th>Franchise</th><th class="num">W-L-T</th><th class="num">Seed</th><th>Bracket</th></tr></thead><tbody>${body}</tbody></table>`;
  });
  const notes = [
    'Picked games count as played: a win and a loss, with Breakdown at its real value. Unpicked games count as not played.',
    ...(p.groups.some((g) => !g.order) ? ['=: level after every tiebreak but scissors-paper-rock. Pick an order below.'] : []),
    marks === null
      ? 'Working out clinches…'
      : 'Marks hold whatever happens in the games not picked: BYE, DIVISION (a division winner’s seed) and PLAYOFFS are places won, SAFE means out of reach of the Shit Bowl, and OUT and SHIT BOWL are places lost.',
  ];
  parts.push(
    row(
      'Standings',
      `${tables.join('')}<div class="notes">${notes.map((n) => `<p><span class="g"></span>${n}</p>`).join('')}</div>`,
      'As they would stand',
    ),
  );

  // Scissors-paper-rock orders.
  if (p.groups.length) {
    const lines = p.groups.map((g) => {
      const names = g.members.map(team).join(' / ');
      if (g.members.length > ORDERABLE) return `<p>${names}: level after every tiebreak but scissors-paper-rock.</p>`;
      const others = p.scenario.spr.filter((r) => !sameSet(r, g.members));
      const options = permutations(g.members).map((perm) => {
        const chosen = g.order !== null && perm.every((f, i) => g.order![i] === f);
        const to = { ...p.scenario, spr: chosen ? others : [...others, perm] };
        return `<a class="pk" href="${href(to)}" aria-pressed="${chosen}">${perm.map(team).join(', ')}</a>`;
      });
      return `<p>${names}: ${options.join(' · ')}</p>`;
    });
    parts.push(
      row(
        'Scissors-paper-rock',
        `${lines.join('')}<div class="notes"><p><span class="g"></span>Who wins, in order: the winner takes the better place, and in the Shit Bowl the last takes the worse.</p></div>`,
      ),
    );
  }

  // The projected first rounds.
  const slot = (s: Slot) => `<span class="seed">${s.seed}</span> ${s.franchises.map(team).join(' / ')}`;
  const rounds = p.brackets.map((b) => {
    const items = [
      ...b.byes.map((s) => `<li>${slot(s)}: bye</li>`),
      ...b.pairs.map(([x, y]) => `<li>${slot(x)} v ${slot(y)}</li>`),
    ];
    return `<h3>${BRACKET_NAMES[b.bracket]}</h3><ul class="bracket">${items.join('')}</ul>`;
  });
  parts.push(
    row(
      'Brackets',
      `${rounds.join('')}<div class="notes"><p><span class="g"></span>The first round of each bracket. The Shit Bowl’s seed 1 is the worst franchise; the Mediocre Bowl is numbered on from the Playoffs.</p></div>`,
      'First round',
    ),
  );

  // The games left to pick.
  const picked = (week: number, f: FranchiseId) => p.scenario.picks.some((x) => x.week === week && x.winner === f);
  const weeks = [...new Set(data.input.remaining.map((g) => g.week))].sort((a, b) => a - b);
  const choice = (g: RemainingGame, f: FranchiseId) => {
    const other = g.home === f ? g.away : g.home;
    const on = picked(g.week, f);
    const rest = p.scenario.picks.filter((x) => !(x.week === g.week && (x.winner === f || x.winner === other)));
    const picks = on ? rest : [...rest, { week: g.week, winner: f }];
    return `<a class="pk" href="${href({ ...p.scenario, picks })}" aria-pressed="${on}">${team(f)}</a>`;
  };
  const games = weeks.map((w) => {
    const items = data.input.remaining
      .filter((g) => g.week === w)
      .map((g) => `<li>${choice(g, g.home)} v ${choice(g, g.away)}</li>`);
    return `<h3>Week ${w}</h3><ul class="games">${items.join('')}</ul>`;
  });
  const clear =
    p.scenario.picks.length || p.scenario.spr.length
      ? `<p><a class="more" href="${href({ picks: [], spr: [] })}">Clear every pick</a></p>`
      : '';
  parts.push(
    row(
      'Games left',
      `${games.join('')}${clear}<div class="notes"><p><span class="g"></span>Pick the winner of any game; pick it again to unpick it.</p></div>`,
      'Pick the winners',
    ),
  );

  return parts.join('');
}
