// The query form's fields and the query they make, both ways, so the form can
// show any query from the URL and submit it back unchanged. Each subject has
// its own views (`view` for franchises, `pview` for NFL players) and filters;
// the other subject's fields are ignored.
import {
  DEFAULT_QUERY,
  FRANCHISE_VIEWS,
  PHASES,
  PLAYER_VIEWS,
  RESULTS,
  columnsOf,
  sortOf,
  type FranchiseView,
  type Phase,
  type PlayerView,
  type Query,
  type Result,
  type Subject,
} from './query';

export interface FormContext {
  seasons: { year: number; era: string }[];
  /** The last week any season has, for the week span's "to". */
  lastWeek: number;
}

/** Field name -> its values (several for a multi-select or checkboxes). */
export type Fields = Record<string, string[]>;

export function formValues(q: Query, ctx: FormContext): Fields {
  const years = ctx.seasons.map((s) => s.year);
  const seasons = q.seasons.length ? q.seasons : years;
  const sort = sortOf(q);
  const player = q.subject === 'player';
  return {
    subject: [q.subject],
    p: q.players,
    f: q.franchises.map(String),
    opp: q.opponents.map(String),
    from: [String(Math.min(...seasons))],
    to: [String(Math.max(...seasons))],
    era: [''],
    pos: q.positions,
    lu: [q.lineup ?? ''],
    ph: q.phases,
    wkFrom: [String(q.weeks?.[0] ?? 1)],
    wkTo: [String(q.weeks?.[1] ?? ctx.lastWeek)],
    res: [q.result ?? ''],
    act: q.active ? ['on'] : [],
    min: [String(q.minGames)],
    view: [player ? DEFAULT_QUERY.view : q.view],
    pview: [player ? q.view : DEFAULT_QUERY.view],
    by: [q.grouping],
    sort: [sort.key],
    dir: [sort.dir],
  };
}

const one = (fields: Fields, name: string) => fields[name]?.[0] ?? '';
const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null);

export function queryFromForm(fields: Fields, ctx: FormContext): Query {
  const years = ctx.seasons.map((s) => s.year);
  const [a, b] = [num(one(fields, 'from')) ?? years[0], num(one(fields, 'to')) ?? years.at(-1)!];
  const era = one(fields, 'era');
  const picked = ctx.seasons
    .filter((s) => s.year >= Math.min(a, b) && s.year <= Math.max(a, b) && (!era || s.era === era))
    .map((s) => s.year);
  const [w0, w1] = [num(one(fields, 'wkFrom')) ?? 1, num(one(fields, 'wkTo')) ?? ctx.lastWeek].sort((x, y) => x - y);
  const phases = PHASES.filter((p) => (fields.ph ?? []).includes(p));
  const subject: Subject = one(fields, 'subject') === 'player' ? 'player' : 'franchise';
  const player = subject === 'player';
  const res = one(fields, 'res');
  const view = player
    ? (PLAYER_VIEWS.find((v) => v === one(fields, 'pview')) ?? DEFAULT_QUERY.view)
    : (FRANCHISE_VIEWS.find((v) => v === one(fields, 'view')) ?? DEFAULT_QUERY.view);
  const lu = one(fields, 'lu');
  const key = one(fields, 'sort');
  const dir = one(fields, 'dir') === 'asc' ? 'asc' : 'desc';
  const q: Query = {
    subject,
    franchises: (fields.f ?? []).map(Number).sort((x, y) => x - y),
    opponents: (fields.opp ?? []).map(Number).sort((x, y) => x - y),
    seasons: picked.length === years.length ? [] : picked,
    phases: phases.length ? (phases as Phase[]) : DEFAULT_QUERY.phases,
    weeks: w0 <= 1 && w1 >= ctx.lastWeek ? null : [w0, w1],
    result: !player && RESULTS.includes(res as Result) ? (res as Result) : null,
    active: !player && (fields.act ?? []).length > 0,
    minGames: num(one(fields, 'min')) ?? 0,
    view: view as FranchiseView | PlayerView,
    grouping: !player && view === 'pos' && one(fields, 'by') === 'slot' ? 'slot' : 'pos',
    players: player ? [...new Set(fields.p ?? [])].sort() : [],
    positions: player ? [...(fields.pos ?? [])] : [],
    lineup: player && (lu === 'start' || lu === 'bench') ? lu : null,
    sort: null,
  };
  if (columnsOf(q).includes(key)) {
    const sort = { key, dir } as const;
    const own = sortOf({ ...q, sort: null });
    q.sort = own.key === key && own.dir === dir ? null : sort;
  }
  return q;
}
