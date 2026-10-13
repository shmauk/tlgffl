// A Statsguru query and its URL. The URL is the query's only state: short `&`
// params with comma lists, writing only what differs from the defaults (#28).
// Two subjects (#29): franchises, and NFL players (`sub=player`), whose own
// filters and views only have data from 2025, when lineups start.

/** R: regular season, P: the Playoffs, C: the Shit Bowl and the Mediocre Bowl. */
export type Phase = 'R' | 'P' | 'C';
export type Result = 'W' | 'L' | 'T';
export type Subject = 'franchise' | 'player';
export type FranchiseView = 'totals' | 'season' | 'opp' | 'phase' | 'pos' | 'games';
export type PlayerView = 'totals' | 'fr' | 'season' | 'log';
export type View = FranchiseView | PlayerView;
/** The by-position view's rows: NFL player positions (FLEX folded in) or lineup slots. */
export type Grouping = 'pos' | 'slot';
/** Started or benched NFL players only. */
export type Lineup = 'start' | 'bench';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: string;
  dir: SortDir;
}

export interface Query {
  subject: Subject;
  /** Empty means every franchise; for NFL players, rostered by any franchise. */
  franchises: number[];
  /** Empty means any opposition. */
  opponents: number[];
  /** Empty means every season. */
  seasons: number[];
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
  /** NFL-player subject only: Sleeper ids; empty means every NFL player. */
  players: string[];
  /** NFL-player subject only: empty means every position. */
  positions: string[];
  /** NFL-player subject only: null means started or benched. */
  lineup: Lineup | null;
  /** Null means the view's own default order. */
  sort: Sort | null;
}

export const PHASES: Phase[] = ['R', 'P', 'C'];
export const RESULTS: Result[] = ['W', 'L', 'T'];
export const FRANCHISE_VIEWS: FranchiseView[] = ['totals', 'season', 'opp', 'phase', 'pos', 'games'];
export const PLAYER_VIEWS: PlayerView[] = ['totals', 'fr', 'season', 'log'];
export const viewsOf = (subject: Subject): View[] => (subject === 'player' ? PLAYER_VIEWS : FRANCHISE_VIEWS);

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
const PLAYER_FIGURES = ['ro', 'st', 'spts', 'avg', 'bpts', 'best'];
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
/** The columns a query's view shows, by sort key, in order. */
export const columnsOf = (q: Pick<Query, 'subject' | 'view'>): string[] =>
  q.subject === 'player' ? PLAYER_COLUMNS[q.view as PlayerView] : FRANCHISE_COLUMNS[q.view as FranchiseView];
/** Every column of a subject, for the form's order list. */
export const allColumns = (subject: Subject): string[] => [
  ...new Set(viewsOf(subject).flatMap((view) => columnsOf({ subject, view }))),
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
const viewSort = (q: Pick<Query, 'subject' | 'view'>): Sort =>
  q.subject === 'player' ? PLAYER_SORT[q.view as PlayerView] : FRANCHISE_SORT[q.view as FranchiseView];

export const DEFAULT_QUERY: Query = {
  subject: 'franchise',
  franchises: [],
  opponents: [],
  seasons: [],
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
  sort: null,
};

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

export function encodeQuery(q: Query): string {
  const p: string[] = [];
  const player = q.subject === 'player';
  if (player) p.push('sub=player');
  if (player && q.players.length) p.push(`p=${playerIds(q.players).join(',')}`);
  if (q.franchises.length) p.push(`f=${ids(q.franchises).join(',')}`);
  if (q.opponents.length) p.push(`opp=${ids(q.opponents).join(',')}`);
  if (q.seasons.length) p.push(`s=${seasonList(q.seasons)}`);
  if (player && q.positions.length) p.push(`pos=${byPosition(q.positions).join(',')}`);
  if (player && q.lineup) p.push(`lu=${q.lineup}`);
  const phases = PHASES.filter((ph) => q.phases.includes(ph));
  if (phases.join() !== DEFAULT_QUERY.phases.join()) p.push(`ph=${phases.join(',')}`);
  if (q.weeks) p.push(`wk=${q.weeks[0]}-${q.weeks[1]}`);
  if (!player && q.result) p.push(`res=${q.result}`);
  if (!player && q.active) p.push('act=1');
  if (q.minGames > 0) p.push(`min=${q.minGames}`);
  if (q.view !== DEFAULT_QUERY.view) p.push(`view=${q.view}`);
  if (!player && q.view === 'pos' && q.grouping !== DEFAULT_QUERY.grouping) p.push(`by=${q.grouping}`);
  if (q.sort && !sameSort(q.sort, viewSort(q))) p.push(`sort=${q.sort.key}.${q.sort.dir}`);
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

export function decodeQuery(search: string): Query {
  const p = new URLSearchParams(search);
  const q: Query = { ...DEFAULT_QUERY };
  const player = p.get('sub') === 'player';
  if (player) {
    q.subject = 'player';
    q.players = playerIds(wordList(p.get('p'), /^[A-Za-z0-9]+$/));
    q.positions = byPosition(wordList(p.get('pos'), /^[A-Z]+$/));
    const lu = p.get('lu');
    if (lu === 'start' || lu === 'bench') q.lineup = lu;
  }
  q.franchises = idList(p.get('f'));
  q.opponents = idList(p.get('opp'));
  q.seasons = seasonsOf(p.get('s'));
  const phases = (p.get('ph') ?? '').split(',');
  if (phases.every((ph) => PHASES.includes(ph as Phase))) q.phases = PHASES.filter((ph) => phases.includes(ph));
  const wk = (p.get('wk') ?? '').match(/^(\d+)-(\d+)$/);
  if (wk && Number(wk[1]) <= Number(wk[2])) q.weeks = [Number(wk[1]), Number(wk[2])];
  if (!player) {
    const res = p.get('res');
    if (RESULTS.includes(res as Result)) q.result = res as Result;
    q.active = p.get('act') === '1';
  }
  q.minGames = whole(p.get('min') ?? '') ?? 0;
  const view = p.get('view');
  if (viewsOf(q.subject).includes(view as View)) q.view = view as View;
  if (!player && q.view === 'pos' && p.get('by') === 'slot') q.grouping = 'slot';
  const [key, dir] = (p.get('sort') ?? '').split('.');
  if (columnsOf(q).includes(key) && (dir === 'asc' || dir === 'desc') && !sameSort({ key, dir }, viewSort(q)))
    q.sort = { key, dir };
  return q;
}
