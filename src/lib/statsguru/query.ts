// A Statsguru query and its URL. The URL is the query's only state: short `&`
// params with comma lists, writing only what differs from the defaults (#28).

/** R: regular season, P: the Playoffs, C: the Shit Bowl and the Mediocre Bowl. */
export type Phase = 'R' | 'P' | 'C';
export type Result = 'W' | 'L' | 'T';
export type View = 'totals' | 'season' | 'opp' | 'phase' | 'games';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: string;
  dir: SortDir;
}

export interface Query {
  /** Empty means every franchise. */
  franchises: number[];
  /** Empty means any opposition. */
  opponents: number[];
  /** Empty means every season. */
  seasons: number[];
  phases: Phase[];
  /** First and last week, inclusive; null means every week. */
  weeks: [number, number] | null;
  result: Result | null;
  active: boolean;
  minGames: number;
  view: View;
  /** Null means the view's own default order. */
  sort: Sort | null;
}

export const PHASES: Phase[] = ['R', 'P', 'C'];
export const RESULTS: Result[] = ['W', 'L', 'T'];
export const VIEWS: View[] = ['totals', 'season', 'opp', 'phase', 'games'];

/** Every column a view shows, by sort key, in order. */
const FIGURES = ['gp', 'w', 'l', 't', 'pct', 'pf', 'pa', 'apf', 'apa', 'hi', 'lo'];
export const COLUMNS: Record<View, string[]> = {
  totals: ['f', ...FIGURES],
  season: ['f', 's', ...FIGURES],
  opp: ['f', 'o', ...FIGURES],
  phase: ['f', 'ph', ...FIGURES],
  games: ['s', 'wk', 'ph', 'f', 'pf', 'pa', 'o', 'res', 'mar'],
};

const VIEW_SORT: Record<View, Sort> = {
  totals: { key: 'pct', dir: 'desc' },
  season: { key: 's', dir: 'asc' },
  opp: { key: 'f', dir: 'asc' },
  phase: { key: 'f', dir: 'asc' },
  games: { key: 's', dir: 'asc' },
};

export const DEFAULT_QUERY: Query = {
  franchises: [],
  opponents: [],
  seasons: [],
  phases: ['R'],
  weeks: null,
  result: null,
  active: false,
  minGames: 0,
  view: 'totals',
  sort: null,
};

/** The order a query's rows come in. */
export const sortOf = (q: Query): Sort => q.sort ?? VIEW_SORT[q.view];

const sameSort = (a: Sort, b: Sort) => a.key === b.key && a.dir === b.dir;
const ids = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);

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
  if (q.franchises.length) p.push(`f=${ids(q.franchises).join(',')}`);
  if (q.opponents.length) p.push(`opp=${ids(q.opponents).join(',')}`);
  if (q.seasons.length) p.push(`s=${seasonList(q.seasons)}`);
  const phases = PHASES.filter((ph) => q.phases.includes(ph));
  if (phases.join() !== DEFAULT_QUERY.phases.join()) p.push(`ph=${phases.join(',')}`);
  if (q.weeks) p.push(`wk=${q.weeks[0]}-${q.weeks[1]}`);
  if (q.result) p.push(`res=${q.result}`);
  if (q.active) p.push('act=1');
  if (q.minGames > 0) p.push(`min=${q.minGames}`);
  if (q.view !== DEFAULT_QUERY.view) p.push(`view=${q.view}`);
  if (q.sort && !sameSort(q.sort, VIEW_SORT[q.view])) p.push(`sort=${q.sort.key}.${q.sort.dir}`);
  return p.join('&');
}

const whole = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
const idList = (v: string | null) => {
  const list = (v ?? '').split(',').map(whole);
  return v && list.every((n) => n !== null) ? ids(list as number[]) : [];
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
  q.franchises = idList(p.get('f'));
  q.opponents = idList(p.get('opp'));
  q.seasons = seasonsOf(p.get('s'));
  const phases = (p.get('ph') ?? '').split(',');
  if (phases.every((ph) => PHASES.includes(ph as Phase))) q.phases = PHASES.filter((ph) => phases.includes(ph));
  const wk = (p.get('wk') ?? '').match(/^(\d+)-(\d+)$/);
  if (wk && Number(wk[1]) <= Number(wk[2])) q.weeks = [Number(wk[1]), Number(wk[2])];
  const res = p.get('res');
  if (RESULTS.includes(res as Result)) q.result = res as Result;
  q.active = p.get('act') === '1';
  q.minGames = whole(p.get('min') ?? '') ?? 0;
  const view = p.get('view');
  if (VIEWS.includes(view as View)) q.view = view as View;
  const [key, dir] = (p.get('sort') ?? '').split('.');
  if (COLUMNS[q.view].includes(key) && (dir === 'asc' || dir === 'desc') && !sameSort({ key, dir }, VIEW_SORT[q.view]))
    q.sort = { key, dir };
  return q;
}
