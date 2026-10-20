// The query form's fields and the query they make, both ways, so the form can
// show any query from the URL and submit it back unchanged. Each subject has
// its own views (`view` for franchises, `pview` for NFL players, `kview` for
// draft picks) and filters; the other subjects' fields are ignored.
import {
  DEFAULT_QUERY,
  ERAS,
  FRANCHISE_VIEWS,
  PHASES,
  PICK_VIEWS,
  PLAYER_VIEWS,
  RESULTS,
  columnsOf,
  defaultView,
  viewOf,
  sortOf,
  type FranchiseView,
  type Phase,
  type PickView,
  type PlayerView,
  type Query,
  type Era,
  type Result,
  type SeasonScope,
  type Subject,
} from './query';

export interface FormContext {
  seasons: SeasonScope[];
  /** The last week any season has, for the week span's "to". */
  lastWeek: number;
  /** The last round and overall pick any draft has, for the draft-pick spans' "to". */
  lastRound: number;
  lastPick: number;
}

/** The League size choice's options, smallest first, each named with its seasons: "16 teams (2015 on)". */
export function leagueSizes(seasons: SeasonScope[]): { size: number; label: string }[] {
  const latest = Math.max(...seasons.map((s) => s.year));
  return [...new Set(seasons.map((s) => s.size))]
    .sort((a, b) => a - b)
    .map((size) => {
      const years = seasons.filter((s) => s.size === size).map((s) => s.year);
      const [first, last] = [Math.min(...years), Math.max(...years)];
      const span =
        last === latest && first !== last ? `${first} on` : first === last ? `${first}` : `${first}–${String(last).slice(-2)}`;
      return { size, label: `${size} teams (${span})` };
    });
}

/** Field name -> its values (several for a multi-select or checkboxes). */
export type Fields = Record<string, string[]>;

export function formValues(q: Query, ctx: FormContext): Fields {
  const years = ctx.seasons.map((s) => s.year);
  const seasons = q.seasons.length ? q.seasons : years;
  const sort = sortOf(q);
  const player = q.subject === 'player';
  const view = viewOf(q);
  return {
    subject: [q.subject],
    p: q.players,
    f: q.franchises.map(String),
    opp: q.opponents.map(String),
    from: [String(Math.min(...seasons))],
    to: [String(Math.max(...seasons))],
    era: [q.era ?? ''],
    size: [q.size ? String(q.size) : ''],
    pos: q.positions,
    lu: [q.lineup ?? ''],
    ph: q.phases,
    wkFrom: [String(q.weeks?.[0] ?? 1)],
    wkTo: [String(q.weeks?.[1] ?? ctx.lastWeek)],
    res: [q.result ?? ''],
    act: q.active ? ['on'] : [],
    min: [String(q.minGames)],
    view: [q.subject === 'franchise' ? view : defaultView('franchise')],
    pview: [player ? view : defaultView('player')],
    kview: [q.subject === 'pick' ? view : defaultView('pick')],
    by: [q.grouping],
    kby: [q.grouping === 'round' ? 'round' : 'pos'],
    fby: [q.franchiseAs],
    rdFrom: [String(q.rounds?.[0] ?? 1)],
    rdTo: [String(q.rounds?.[1] ?? ctx.lastRound)],
    pkFrom: [String(q.picks?.[0] ?? 1)],
    pkTo: [String(q.picks?.[1] ?? ctx.lastPick)],
    kd: [q.kept ?? ''],
    sort: [sort.key],
    dir: [sort.dir],
  };
}

const one = (fields: Fields, name: string) => fields[name]?.[0] ?? '';
const num = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null);
/** A span from two fields, turned round if written backwards; first to last is no span at all. */
function spanFrom(fields: Fields, from: string, to: string, last: number): [number, number] | null {
  const [a, b] = [num(one(fields, from)) ?? 1, num(one(fields, to)) ?? last].sort((x, y) => x - y);
  return a <= 1 && b >= last ? null : [a, b];
}

export function queryFromForm(fields: Fields, ctx: FormContext): Query {
  const years = ctx.seasons.map((s) => s.year);
  const [a, b] = [num(one(fields, 'from')) ?? years[0], num(one(fields, 'to')) ?? years.at(-1)!];
  // The span alone: the era and League size stay as chosen, so a link keeps up with new seasons.
  const picked = years.filter((y) => y >= Math.min(a, b) && y <= Math.max(a, b));
  const era = one(fields, 'era');
  const [w0, w1] = [num(one(fields, 'wkFrom')) ?? 1, num(one(fields, 'wkTo')) ?? ctx.lastWeek].sort((x, y) => x - y);
  const phases = PHASES.filter((p) => (fields.ph ?? []).includes(p));
  const sub = one(fields, 'subject');
  const subject: Subject = sub === 'player' || sub === 'pick' ? sub : 'franchise';
  const player = subject === 'player';
  const pick = subject === 'pick';
  const franchise = subject === 'franchise';
  const res = one(fields, 'res');
  const view = player
    ? (PLAYER_VIEWS.find((v) => v === one(fields, 'pview')) ?? defaultView(subject))
    : pick
      ? (PICK_VIEWS.find((v) => v === one(fields, 'kview')) ?? defaultView(subject))
      : (FRANCHISE_VIEWS.find((v) => v === one(fields, 'view')) ?? defaultView(subject));
  const kd = one(fields, 'kd');
  const lu = one(fields, 'lu');
  const key = one(fields, 'sort');
  const dir = one(fields, 'dir') === 'asc' ? 'asc' : 'desc';
  const q: Query = {
    subject,
    franchises: (fields.f ?? []).map(Number).sort((x, y) => x - y),
    opponents: pick ? [] : (fields.opp ?? []).map(Number).sort((x, y) => x - y),
    seasons: picked.length === years.length ? [] : picked,
    era: ERAS.includes(era as Era) ? (era as Era) : null,
    size: num(one(fields, 'size')) || null,
    phases: phases.length && !pick ? (phases as Phase[]) : DEFAULT_QUERY.phases,
    weeks: pick || (w0 <= 1 && w1 >= ctx.lastWeek) ? null : [w0, w1],
    result: franchise && RESULTS.includes(res as Result) ? (res as Result) : null,
    active: franchise && (fields.act ?? []).length > 0,
    minGames: pick ? 0 : (num(one(fields, 'min')) ?? 0),
    view: view as FranchiseView | PlayerView | PickView,
    grouping:
      franchise && view === 'pos' && one(fields, 'by') === 'slot'
        ? 'slot'
        : pick && view === 'fr' && one(fields, 'kby') === 'round'
          ? 'round'
          : 'pos',
    players: franchise ? [] : [...new Set(fields.p ?? [])].sort(),
    positions: franchise ? [] : [...(fields.pos ?? [])],
    lineup: player && (lu === 'start' || lu === 'bench') ? lu : null,
    franchiseAs: pick && one(fields, 'fby') === 'slot' ? 'slot' : 'pick',
    rounds: pick ? spanFrom(fields, 'rdFrom', 'rdTo', ctx.lastRound) : null,
    picks: pick ? spanFrom(fields, 'pkFrom', 'pkTo', ctx.lastPick) : null,
    kept: pick && (kd === 'kept' || kd === 'drafted') ? kd : null,
    sort: null,
  };
  if (columnsOf(q).includes(key)) {
    const sort = { key, dir } as const;
    const own = sortOf({ ...q, sort: null });
    q.sort = own.key === key && own.dir === dir ? null : sort;
  }
  return q;
}
