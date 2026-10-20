// A Statsguru query and its URL. The URL is the query's only state: short `&`
// params with comma lists, writing only what differs from the defaults (#28).
// Two subjects (#29): franchises, and NFL players (`sub=player`), whose own
// filters and views only have data from 2025, when lineups start. A third
// (#37), draft picks (`sub=pick`), has its own filters and views and none of
// the game filters (opposition, phase, weeks, result, minimum games).
import { ERAS, LEAGUE_SIZES, type Era, type LeagueSize, type ScopedSeason, type SeasonScope } from '../season-sets';

/** R: regular season, P: the Playoffs, C: the Shit Bowl and the Mediocre Bowl. */
export type Phase = 'R' | 'P' | 'C';
export type Result = 'W' | 'L' | 'T';
export type Subject = 'franchise' | 'player' | 'pick';
export type FranchiseView = 'totals' | 'season' | 'opp' | 'phase' | 'pos' | 'games';
export type PlayerView = 'totals' | 'fr' | 'season' | 'log';
/** The pick list, per franchise (by position or round), per NFL player. */
export type PickView = 'list' | 'fr' | 'pl';
export type View = FranchiseView | PlayerView | PickView;
/** The by-position view's rows: NFL player positions (FLEX folded in) or lineup slots;
 * draft picks per franchise: NFL player positions or rounds. */
export type Grouping = 'pos' | 'slot' | 'round';
/** Which franchise a draft pick belongs to: the one that made it, or the one whose slot it was. */
export type PickSide = 'pick' | 'slot';
/** Keepers, or NFL players drafted (every pick not recorded as a keeper). */
export type Kept = 'kept' | 'drafted';
/** Started or benched NFL players only. */
export type Lineup = 'start' | 'bench';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: string;
  dir: SortDir;
}

export interface Query {
  subject: Subject;
  /** Empty means every franchise; for NFL players, rostered by any franchise; for draft picks, see franchiseAs. */
  franchises: number[];
  /** Empty means any opposition. */
  opponents: number[];
  /** The from/to range; empty means every season. */
  seasons: number[];
  /** Null means either era. Kept as the era, not its seasons, so a link covers seasons still to come. */
  era: Era | null;
  /** Null means every League size. Kept as the size, like the era. */
  size: LeagueSize | null;
  phases: Phase[];
  /** First and last week, inclusive; null means every week. */
  weeks: [number, number] | null;
  /** Franchise subject only. */
  result: Result | null;
  /** Franchise subject only. */
  active: boolean;
  /** Games played; for NFL players, games rostered. */
  minGames: number;
  view: View;
  /** The by-position view only. */
  grouping: Grouping;
  /** NFL-player and draft-pick subjects: Sleeper ids; empty means every NFL player. */
  players: string[];
  /** NFL-player and draft-pick subjects: empty means every position. */
  positions: string[];
  /** NFL-player subject only: null means started or benched. */
  lineup: Lineup | null;
  /** Draft-pick subject only: the franchise filter's side. */
  franchiseAs: PickSide;
  /** Draft-pick subject only: first and last round, inclusive; null means every round. */
  rounds: [number, number] | null;
  /** Draft-pick subject only: first and last overall pick, inclusive; null means every pick. */
  picks: [number, number] | null;
  /** Draft-pick subject only: null means kept or drafted. */
  kept: Kept | null;
  /** Null means the view's own default order. */
  sort: Sort | null;
  /** A chart above the results table (ADR 0006): the view's own chart, changed by chartChoice. */
  chart: boolean;
  /** The chart builder's choices that differ from the view's own chart. */
  chartChoice: ChartChoice;
}

/** How a chart's points are drawn; a bar with a series is a grouped bar, and a share bar is split by its series and scaled to 100%. */
export type Mark = 'bar' | 'line' | 'scatter' | 'share';
export const MARKS: Mark[] = ['bar', 'line', 'scatter', 'share'];

/** What a chart shows, by column sort key, before any rows. */
export interface ChartSpec {
  mark: Mark;
  /** A line over 'wk' runs through the games in order, season after season. */
  x: string;
  y: string;
  series?: string;
}

/** Changes to a view's own chart, each one missing left as the view's; a null series is none. */
export interface ChartChoice {
  mark?: Mark;
  x?: string;
  y?: string;
  series?: string | null;
}

export const PHASES: Phase[] = ['R', 'P', 'C'];
export const RESULTS: Result[] = ['W', 'L', 'T'];
export const FRANCHISE_VIEWS: FranchiseView[] = ['totals', 'season', 'opp', 'phase', 'pos', 'games'];
export const PLAYER_VIEWS: PlayerView[] = ['totals', 'fr', 'season', 'log'];
export const PICK_VIEWS: PickView[] = ['list', 'fr', 'pl'];
export const viewsOf = (subject: Subject): View[] =>
  subject === 'player' ? PLAYER_VIEWS : subject === 'pick' ? PICK_VIEWS : FRANCHISE_VIEWS;
/** A subject's first view, the one a query without a view opens on. */
export const defaultView = (subject: Subject): View => viewsOf(subject)[0];
/** The query's view, or its subject's default if the view isn't the subject's. */
export const viewOf = (q: Pick<Query, 'subject' | 'view'>): View =>
  viewsOf(q.subject).includes(q.view) ? q.view : defaultView(q.subject);

/** Positions and lineup slots in the order a lineup lists them; any others follow, A-Z. */
export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
export const positionRank = (p: string | null): string => {
  const i = POSITIONS.indexOf(p ?? '');
  return i >= 0 ? `${i}` : `9${p ?? '~'}`;
};
const byPosition = (list: string[]) =>
  [...new Set(list)].sort((a, b) => positionRank(a).localeCompare(positionRank(b)));

/** Every column a view shows, by sort key, in order. */
const FIGURES = ['gp', 'w', 'l', 't', 'pct', 'pf', 'pa', 'apf', 'apa', 'hi', 'lo'];
const PLAYER_FIGURES = ['ro', 'st', 'spts', 'avg', 'bpts', 'best', 'dr', 'kc'];
const FRANCHISE_COLUMNS: Record<FranchiseView, string[]> = {
  totals: ['f', ...FIGURES],
  season: ['f', 's', ...FIGURES],
  opp: ['f', 'o', ...FIGURES],
  phase: ['f', 'ph', ...FIGURES],
  pos: ['f', 'pos', 'gp', 'st', 'spts', 'ppg', 'avg', 'share', 'rank', 'bpts', 'best'],
  games: ['s', 'wk', 'ph', 'f', 'pf', 'pa', 'o', 'res', 'mar'],
};
const PLAYER_COLUMNS: Record<PlayerView, string[]> = {
  totals: ['pl', 'pos', ...PLAYER_FIGURES, 'nfr'],
  fr: ['pl', 'pos', 'f', ...PLAYER_FIGURES],
  season: ['pl', 'pos', 's', ...PLAYER_FIGURES, 'nfr'],
  log: ['s', 'wk', 'ph', 'pl', 'pos', 'f', 'o', 'slot', 'pts'],
};
const PICK_COLUMNS: Record<PickView, string[]> = {
  list: ['s', 'pk', 'rd', 'f', 'sf', 'pl', 'pos', 'kd', 'val'],
  fr: ['f', 'pos', 'n', 'dr', 'kc', 'top', 'val'],
  pl: ['pl', 'pos', 'n', 'dr', 'kc', 'top', 'frs', 'val'],
};
/** The columns a query's view shows, by sort key, in order. */
export const columnsOf = (q: Pick<Query, 'subject' | 'view'> & { grouping?: Grouping }): string[] => {
  if (q.subject === 'player') return PLAYER_COLUMNS[q.view as PlayerView];
  if (q.subject !== 'pick') return FRANCHISE_COLUMNS[q.view as FranchiseView];
  const view = viewOf(q) as PickView;
  return view === 'fr' && q.grouping === 'round' ? PICK_COLUMNS.fr.map((k) => (k === 'pos' ? 'rd' : k)) : PICK_COLUMNS[view];
};
/** Every column of a subject, for the form's order list. */
export const allColumns = (subject: Subject): string[] => [
  ...new Set(
    viewsOf(subject).flatMap((view) => [...columnsOf({ subject, view }), ...columnsOf({ subject, view, grouping: 'round' })]),
  ),
];

const FRANCHISE_SORT: Record<FranchiseView, Sort> = {
  totals: { key: 'pct', dir: 'desc' },
  season: { key: 's', dir: 'asc' },
  opp: { key: 'f', dir: 'asc' },
  phase: { key: 'f', dir: 'asc' },
  pos: { key: 'f', dir: 'asc' },
  games: { key: 's', dir: 'asc' },
};
const PLAYER_SORT: Record<PlayerView, Sort> = {
  totals: { key: 'spts', dir: 'desc' },
  fr: { key: 'spts', dir: 'desc' },
  season: { key: 's', dir: 'asc' },
  log: { key: 's', dir: 'asc' },
};
const PICK_SORT: Record<PickView, Sort> = {
  list: { key: 's', dir: 'asc' },
  fr: { key: 'f', dir: 'asc' },
  pl: { key: 'n', dir: 'desc' },
};
const viewSort = (q: Pick<Query, 'subject' | 'view'>): Sort =>
  q.subject === 'player'
    ? PLAYER_SORT[q.view as PlayerView]
    : q.subject === 'pick'
      ? PICK_SORT[viewOf(q) as PickView]
      : FRANCHISE_SORT[q.view as FranchiseView];

export const DEFAULT_QUERY: Query = {
  subject: 'franchise',
  franchises: [],
  opponents: [],
  seasons: [],
  era: null,
  size: null,
  phases: ['R'],
  weeks: null,
  result: null,
  active: false,
  minGames: 0,
  view: 'totals',
  grouping: 'pos',
  players: [],
  positions: [],
  lineup: null,
  franchiseAs: 'pick',
  rounds: null,
  picks: null,
  kept: null,
  sort: null,
  chart: false,
  chartChoice: {},
};

/** A view's own chart, or null for a view with none (yet). */
export function defaultChart(q: Pick<Query, 'subject' | 'view'>): ChartSpec | null {
  if (q.subject !== 'franchise') return null;
  switch (viewOf(q) as FranchiseView) {
    case 'totals': return { mark: 'bar', x: 'f', y: 'w' };
    case 'season': return { mark: 'line', x: 's', y: 'apf', series: 'f' };
    // Win % against each opponent, a bar per franchise; one franchise's record when filtered to it.
    case 'opp': return { mark: 'bar', x: 'o', y: 'pct', series: 'f' };
    case 'phase': return { mark: 'bar', x: 'f', y: 'pct', series: 'ph' };
    // Each franchise's starter points split into positions (or lineup slots).
    case 'pos': return { mark: 'share', x: 'f', y: 'spts', series: 'pos' };
    case 'games': return { mark: 'line', x: 'wk', y: 'pf', series: 'f' };
    default: return null;
  }
}

/** Columns that name or place a row rather than count something: a chart's series, never its y. */
const LABELS = new Set(['f', 'o', 's', 'wk', 'ph', 'res', 'pl', 'pos', 'slot', 'sf', 'kd', 'frs', 'pk', 'rd']);
/** The columns a query's chart can take on each axis: any of the view's on x, figures on y, labels as the series. */
export const chartColumns = (q: Pick<Query, 'subject' | 'view' | 'grouping'>) => {
  const columns = columnsOf(q);
  return { x: columns, y: columns.filter((k) => !LABELS.has(k)), series: columns.filter((k) => LABELS.has(k)) };
};

/** The query's chart: the view's own with the builder's choices over it, or null for a view with none. */
export function chartSpecOf(q: Query): ChartSpec | null {
  const own = defaultChart(q);
  if (!own) return null;
  const { series, ...choice } = q.chartChoice;
  const spec: ChartSpec = { ...own, ...choice };
  if (series !== undefined) spec.series = series ?? undefined;
  // A series of x's own values would be one point per line.
  if (!spec.series || spec.series === spec.x) delete spec.series;
  return spec;
}

/** Raw choices (from the URL or the form) the query's view can draw and that differ from its own chart. */
export function chartChoiceOf(
  q: Pick<Query, 'subject' | 'view' | 'grouping' | 'chart'>,
  raw: { mark?: string | null; x?: string | null; y?: string | null; series?: string | null },
): ChartChoice {
  const own = q.chart ? defaultChart(q) : null;
  if (!own) return {};
  const columns = chartColumns(q);
  const choice: ChartChoice = {};
  if (MARKS.includes(raw.mark as Mark) && raw.mark !== own.mark) choice.mark = raw.mark as Mark;
  if (raw.x && columns.x.includes(raw.x) && raw.x !== own.x) choice.x = raw.x;
  if (raw.y && columns.y.includes(raw.y) && raw.y !== own.y) choice.y = raw.y;
  if (raw.series === 'none' && own.series) choice.series = null;
  else if (raw.series && columns.series.includes(raw.series) && raw.series !== own.series) choice.series = raw.series;
  return choice;
}

/** The seasons a query searches: its from/to range, era and League size, each narrowing the others. */
export const searchedSeasons = (q: SeasonScope & Pick<Query, 'seasons'>, seasons: ScopedSeason[]): number[] =>
  seasons
    .filter((s) => (!q.seasons.length || q.seasons.includes(s.year)) && (!q.era || s.era === q.era) && (!q.size || s.size === q.size))
    .map((s) => s.year)
    .sort((a, b) => a - b);

/** The order a query's rows come in. */
export const sortOf = (q: Query): Sort => q.sort ?? viewSort(q);

const sameSort = (a: Sort, b: Sort) => a.key === b.key && a.dir === b.dir;
const ids = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);
const playerIds = (list: string[]) => [...new Set(list)].sort();

/** Seasons as a comma list, with each run of consecutive seasons as a range. */
export function seasonList(seasons: number[]): string {
  const runs: [number, number][] = [];
  for (const y of ids(seasons)) {
    const last = runs.at(-1);
    if (last && y === last[1] + 1) last[1] = y;
    else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
}

const span = (s: [number, number]) => `${s[0]}-${s[1]}`;

export function encodeQuery(q: Query): string {
  const p: string[] = [];
  const player = q.subject === 'player';
  const pick = q.subject === 'pick';
  const franchise = q.subject === 'franchise';
  const view = viewOf(q);
  if (!franchise) p.push(`sub=${q.subject}`);
  if (!franchise && q.players.length) p.push(`p=${playerIds(q.players).join(',')}`);
  if (q.franchises.length) p.push(`f=${ids(q.franchises).join(',')}`);
  if (pick && q.franchiseAs === 'slot') p.push('fby=slot');
  if (!pick && q.opponents.length) p.push(`opp=${ids(q.opponents).join(',')}`);
  if (q.seasons.length) p.push(`s=${seasonList(q.seasons)}`);
  if (q.era) p.push(`era=${q.era}`);
  if (q.size) p.push(`size=${q.size}`);
  if (pick && q.rounds) p.push(`rd=${span(q.rounds)}`);
  if (pick && q.picks) p.push(`pk=${span(q.picks)}`);
  if (!franchise && q.positions.length) p.push(`pos=${byPosition(q.positions).join(',')}`);
  if (player && q.lineup) p.push(`lu=${q.lineup}`);
  if (pick && q.kept) p.push(`kd=${q.kept}`);
  const phases = PHASES.filter((ph) => q.phases.includes(ph));
  if (!pick && phases.join() !== DEFAULT_QUERY.phases.join()) p.push(`ph=${phases.join(',')}`);
  if (!pick && q.weeks) p.push(`wk=${span(q.weeks)}`);
  if (franchise && q.result) p.push(`res=${q.result}`);
  if (franchise && q.active) p.push('act=1');
  if (!pick && q.minGames > 0) p.push(`min=${q.minGames}`);
  if (view !== defaultView(q.subject)) p.push(`view=${view}`);
  if (franchise && view === 'pos' && q.grouping === 'slot') p.push('by=slot');
  if (pick && view === 'fr' && q.grouping === 'round') p.push('by=round');
  if (q.sort && !sameSort(q.sort, viewSort(q))) p.push(`sort=${q.sort.key}.${q.sort.dir}`);
  if (q.chart) {
    p.push('chart=1');
    // Through the same check as a decoded URL, so a choice that is the view's own (or no use to it) isn't written.
    const raw = q.chartChoice;
    const choice = chartChoiceOf(q, { ...raw, series: raw.series === null ? 'none' : raw.series });
    if (choice.mark) p.push(`mark=${choice.mark}`);
    if (choice.x) p.push(`x=${choice.x}`);
    if (choice.y) p.push(`y=${choice.y}`);
    if (choice.series !== undefined) p.push(`series=${choice.series ?? 'none'}`);
  }
  return p.join('&');
}

const whole = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
const idList = (v: string | null) => {
  const list = (v ?? '').split(',').map(whole);
  return v && list.every((n) => n !== null) ? ids(list as number[]) : [];
};
const wordList = (v: string | null, pattern: RegExp) => {
  const list = (v ?? '').split(',');
  return v && list.every((s) => pattern.test(s)) ? list : [];
};
function seasonsOf(v: string | null): number[] {
  if (!v) return [];
  const out: number[] = [];
  for (const part of v.split(',')) {
    const m = part.match(/^(\d{4})(?:-(\d{4}))?$/);
    if (!m) return [];
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    for (let y = a; y <= b; y++) out.push(y);
  }
  return ids(out);
}

function spanOf(v: string | null): [number, number] | null {
  const m = (v ?? '').match(/^(\d+)-(\d+)$/);
  return m && Number(m[1]) <= Number(m[2]) ? [Number(m[1]), Number(m[2])] : null;
}

export function decodeQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const q: Query = { ...DEFAULT_QUERY };
  const sub = p.get('sub');
  if (sub === 'player' || sub === 'pick') q.subject = sub;
  const player = q.subject === 'player';
  const pick = q.subject === 'pick';
  const franchise = q.subject === 'franchise';
  if (!franchise) {
    q.players = playerIds(wordList(p.get('p'), /^[A-Za-z0-9]+$/));
    q.positions = byPosition(wordList(p.get('pos'), /^[A-Z]+$/));
  }
  if (player) {
    const lu = p.get('lu');
    if (lu === 'start' || lu === 'bench') q.lineup = lu;
  }
  if (pick) {
    if (p.get('fby') === 'slot') q.franchiseAs = 'slot';
    q.rounds = spanOf(p.get('rd'));
    q.picks = spanOf(p.get('pk'));
    const kd = p.get('kd');
    if (kd === 'kept' || kd === 'drafted') q.kept = kd;
  }
  q.franchises = idList(p.get('f'));
  q.seasons = seasonsOf(p.get('s'));
  const era = p.get('era');
  if (ERAS.includes(era as Era)) q.era = era as Era;
  const size = whole(p.get('size') ?? '');
  if (LEAGUE_SIZES.includes(size as LeagueSize)) q.size = size as LeagueSize;
  if (!pick) {
    q.opponents = idList(p.get('opp'));
    const phases = (p.get('ph') ?? '').split(',');
    if (phases.every((ph) => PHASES.includes(ph as Phase))) q.phases = PHASES.filter((ph) => phases.includes(ph));
    q.weeks = spanOf(p.get('wk'));
    q.minGames = whole(p.get('min') ?? '') ?? 0;
  }
  if (franchise) {
    const res = p.get('res');
    if (RESULTS.includes(res as Result)) q.result = res as Result;
    q.active = p.get('act') === '1';
  }
  const view = p.get('view');
  q.view = viewsOf(q.subject).includes(view as View) ? (view as View) : defaultView(q.subject);
  if (franchise && q.view === 'pos' && p.get('by') === 'slot') q.grouping = 'slot';
  if (pick && q.view === 'fr' && p.get('by') === 'round') q.grouping = 'round';
  const [key, dir] = (p.get('sort') ?? '').split('.');
  if (columnsOf(q).includes(key) && (dir === 'asc' || dir === 'desc') && !sameSort({ key, dir }, viewSort(q)))
    q.sort = { key, dir };
  q.chart = p.get('chart') === '1';
  q.chartChoice = chartChoiceOf(q, { mark: p.get('mark'), x: p.get('x'), y: p.get('y'), series: p.get('series') });
  return q;
}
