// The query form's fields and the query they make, both ways, so the form can
// show any query from the URL and submit it back unchanged.
import { COLUMNS, DEFAULT_QUERY, PHASES, RESULTS, VIEWS, sortOf, type Phase, type Query, type Result, type View } from './query';

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
  return {
    f: q.franchises.map(String),
    opp: q.opponents.map(String),
    from: [String(Math.min(...seasons))],
    to: [String(Math.max(...seasons))],
    era: [''],
    ph: q.phases,
    wkFrom: [String(q.weeks?.[0] ?? 1)],
    wkTo: [String(q.weeks?.[1] ?? ctx.lastWeek)],
    res: [q.result ?? ''],
    act: q.active ? ['on'] : [],
    min: [String(q.minGames)],
    view: [q.view],
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
  const res = one(fields, 'res');
  const view = (VIEWS.includes(one(fields, 'view') as View) ? one(fields, 'view') : DEFAULT_QUERY.view) as View;
  const key = one(fields, 'sort');
  const dir = one(fields, 'dir') === 'asc' ? 'asc' : 'desc';
  const q: Query = {
    franchises: (fields.f ?? []).map(Number).sort((x, y) => x - y),
    opponents: (fields.opp ?? []).map(Number).sort((x, y) => x - y),
    seasons: picked.length === years.length ? [] : picked,
    phases: phases.length ? (phases as Phase[]) : DEFAULT_QUERY.phases,
    weeks: w0 <= 1 && w1 >= ctx.lastWeek ? null : [w0, w1],
    result: RESULTS.includes(res as Result) ? (res as Result) : null,
    active: (fields.act ?? []).length > 0,
    minGames: num(one(fields, 'min')) ?? 0,
    view,
    sort: null,
  };
  if (COLUMNS[view].includes(key)) {
    const sort = { key, dir } as const;
    const own = sortOf({ ...q, sort: null });
    q.sort = own.key === key && own.dir === dir ? null : sort;
  }
  return q;
}
