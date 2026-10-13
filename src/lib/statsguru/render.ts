// Statsguru's results page as HTML: the one-line query summary, one dense
// table whose every column header sorts, and the notes for the markers used.
// Plain strings, so it renders the same in the browser and in tests.
import { weekList } from '../format';
import { franchiseUrl, seasonUrl } from '../urls';
import type { GameRow, GapRow, GroupRow, Named, QueryResult, Row } from './engine';
import { COLUMNS, encodeQuery, seasonList, sortOf, type Phase, type Query, type View } from './query';

export interface Context {
  franchises: Named[];
  /** Every season, to tell "all seasons" from a span. */
  seasons: number[];
}

export const PHASE_NAMES: Record<Phase, string> = {
  R: 'Regular season',
  P: 'Playoffs',
  C: 'Shit Bowl and Mediocre Bowl',
};
export const VIEW_NAMES: Record<View, string> = {
  totals: 'Totals per franchise',
  season: 'Season by season',
  opp: 'By opponent',
  phase: 'By phase',
  games: 'Game log',
};
const RESULT_NAMES = { W: 'won', L: 'lost', T: 'tied' } as const;

export const HEADINGS: Record<string, string> = {
  f: 'Franchise', o: 'Opponent', s: 'Season', wk: 'Week', ph: 'Phase', gp: 'GP', w: 'W', l: 'L', t: 'T',
  pct: 'Win %', pf: 'PF', pa: 'PA', apf: 'Avg PF', apa: 'Avg PA', hi: 'High', lo: 'Low', res: 'Result', mar: 'Margin',
};
/** Columns that read A-Z (or oldest first) before they read the other way. */
const ASCENDING_FIRST = new Set(['f', 'o', 's', 'wk', 'ph', 'res']);
const TEXT_COLUMNS = new Set(['f', 'o', 'ph', 'res']);

const MARKERS = {
  '†': 'Includes the season totals NFL.com reported for weeks with no game scores.',
  '‡': 'The result is known but the score is lost, so it is left out of points.',
  '*': 'High and low come only from games with a score.',
  '§': "Games with no score can't be checked against a week, opposition or result filter, so they are left out, never estimated.",
} as const;
type Glyph = keyof typeof MARKERS;

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);
const and = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
const years = (seasons: number[]) => seasonList(seasons).replace(/-/g, '–').replace(/,/g, ', ');

/** The query in one line of words. */
export function summary(q: Query, ctx: Context): string {
  const name = (id: number) => ctx.franchises.find((f) => f.id === id)?.name ?? `#${id}`;
  const seasons = q.seasons.filter((y) => ctx.seasons.includes(y));
  const allSeasons = !q.seasons.length || ctx.seasons.every((y) => q.seasons.includes(y));
  const phases = q.phases.map((p) => (p === 'R' ? 'regular season' : PHASE_NAMES[p]));
  return [
    q.franchises.length ? q.franchises.map(name).join(', ') : 'All franchises',
    q.opponents.length ? `v ${q.opponents.map(name).join(', ')}` : null,
    allSeasons ? 'all seasons' : seasons.length === 1 ? `season ${seasons[0]}` : `seasons ${years(seasons)}`,
    phases.length === 3 ? 'every phase' : and(phases),
    q.weeks ? (q.weeks[0] === q.weeks[1] ? `week ${q.weeks[0]}` : `weeks ${q.weeks[0]}–${q.weeks[1]}`) : null,
    q.result ? RESULT_NAMES[q.result] : null,
    q.active ? 'active franchises only' : null,
    q.minGames ? `at least ${q.minGames} games` : null,
    VIEW_NAMES[q.view].toLowerCase(),
  ]
    .filter(Boolean)
    .join(' · ');
}

const fr = (f: Named) => `<a class="fr" href="${franchiseUrl(f.id)}">${esc(f.name)}</a>`;
const season = (y: number) => `<a href="${seasonUrl(y)}">${y}</a>`;
const fixed = (n: number | null) => (n == null ? '' : n.toFixed(2));

export function renderResults(result: QueryResult, q: Query): string {
  const used = new Set<Glyph>();
  const mk = (g: Glyph) => {
    used.add(g);
    return `<sup class="mk" title="${esc(MARKERS[g])}">${g}</sup>`;
  };
  const cols = COLUMNS[q.view];
  const sort = sortOf(q);
  const head = cols
    .map((key) => {
      const sorted = sort.key === key;
      const dir = sorted ? (sort.dir === 'asc' ? 'desc' : 'asc') : ASCENDING_FIRST.has(key) ? 'asc' : 'desc';
      const href = `?${encodeQuery({ ...q, sort: { key, dir } })}`;
      const cls = [TEXT_COLUMNS.has(key) ? '' : 'num', sorted ? 'sorted' : ''].filter(Boolean).join(' ');
      const arrow = sorted ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th${cls ? ` class="${cls}"` : ''}${sorted ? ` aria-sort="${sort.dir}ending"` : ''}><a href="${esc(href)}">${HEADINGS[key]}${arrow}</a></th>`;
    })
    .join('');

  const td = (key: string, html: string) => `<td${TEXT_COLUMNS.has(key) ? '' : ' class="num"'}>${html}</td>`;
  const groupRow = (r: GroupRow) =>
    cols
      .map((key) => {
        const points = ['pf', 'pa', 'apf', 'apa'].includes(key);
        switch (key) {
          case 'f': return td(key, fr(r.franchise));
          case 'o': return td(key, r.opponent ? fr(r.opponent) : '<span class="alias">Not recorded</span>');
          case 's': return td(key, r.season == null ? '' : season(r.season));
          case 'ph': return td(key, r.phase ? PHASE_NAMES[r.phase] : '');
          case 'gp': return td(key, `${r.gp}${r.unchecked ? mk('§') : ''}`);
          case 'pct': return td(key, r.pct == null ? '' : (r.pct * 100).toFixed(1));
          case 'hi':
          case 'lo': return td(key, `${fixed(r[key])}${r.partialHighs ? mk('*') : ''}`);
          default: {
            const v = (r as any)[key];
            const text = points ? fixed(v) : String(v);
            return td(key, `${text}${points && r.reported ? mk('†') : ''}${points && r.lostScores ? mk('‡') : ''}`);
          }
        }
      })
      .join('');
  const gameRow = (r: GameRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 's': return td(key, season(r.season));
          case 'wk': return td(key, `<a href="${seasonUrl(r.season, r.week)}">${r.week}</a>`);
          case 'ph': return td(key, PHASE_NAMES[r.phase]);
          case 'f': return td(key, fr(r.franchise));
          case 'o': return td(key, fr(r.opponent));
          case 'pf':
          case 'pa': return td(key, r[key] == null ? mk('‡') : fixed(r[key]));
          case 'res': return td(key, r.result);
          case 'mar': return td(key, r.margin == null ? '' : `${r.margin > 0 ? '+' : ''}${r.margin.toFixed(2)}`);
          default: return td(key, '');
        }
      })
      .join('');
  const gapRow = (r: GapRow) => {
    const what =
      r.kind === 'reported'
        ? `${r.gp} games with no scores, as NFL.com reported them: ${r.w}-${r.l}-${r.t}, PF ${fixed(r.pf)}, PA ${fixed(r.pa)}${mk('†')}`
        : `${r.gp} games with no scores, left out${mk('§')}`;
    return `${td('s', season(r.season))}${td('wk', weekList(r.weeks))}${td('ph', PHASE_NAMES.R)}${td('f', fr(r.franchise))}<td colspan="${cols.length - 4}" class="alias">${what}</td>`;
  };
  const row = (r: Row) => `<tr>${r.kind === 'group' ? groupRow(r) : r.kind === 'game' ? gameRow(r) : gapRow(r)}</tr>`;
  const body = result.rows.length
    ? result.rows.map(row).join('')
    : `<tr><td colspan="${cols.length}">No games match the query.</td></tr>`;

  const notes = [
    ...(Object.keys(MARKERS) as Glyph[]).filter((g) => used.has(g)).map((g) => [g, MARKERS[g]]),
    ...result.notes.map((n) => [
      '',
      n.kind === 'unrecorded'
        ? `Shit Bowl and Mediocre Bowl games were never recorded for ${years(n.seasons)}.`
        : "The Shit Bowl and the Mediocre Bowl are counted together: the data doesn't separate them.",
    ]),
  ];
  const notesHtml = notes.length
    ? `<div class="notes">${notes.map(([g, text]) => `<p><span class="g">${g}</span>${esc(text)}</p>`).join('')}</div>`
    : '';
  return `<table class="t sg"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${notesHtml}`;
}
