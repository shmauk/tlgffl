// Statsguru's results page as HTML: the one-line query summary, one dense
// table whose every column header sorts, and the notes for the markers used.
// Plain strings, so it renders the same in the browser and in tests.
import { esc } from '../html';
import { weekList } from '../format';
import { franchiseUrl, nflPlayerName, nflPlayerUrl, seasonUrl } from '../urls';
import type { GameRow, GapRow, Named, NflPlayer, PerformanceRow, PickPlayerRow, PickRow, QueryResult, Row } from './engine';
import { columnsOf, encodeQuery, seasonList, sortOf, viewOf, type FranchiseView, type PickView, type PlayerView, type Query } from './query';
import { ascendingFirst, columnKind, columnValue, isText, isWhole, PHASE_NAMES } from './values';
import type { Era } from '../season-sets';

export interface Context {
  franchises: Named[];
  /** Every season, to tell "all seasons" from a span. */
  seasons: number[];
  /** NFL players by Sleeper id, to name the ones a query asks for. */
  players?: { id: string; name: string | null }[];
}

export const ERA_NAMES: Record<Era, string> = { 'nfl.com': 'NFL.com era', sleeper: 'Sleeper era' };
export const VIEW_NAMES: Record<FranchiseView, string> = {
  totals: 'Totals per franchise',
  season: 'Season by season',
  opp: 'By opponent',
  phase: 'By phase',
  pos: 'By position',
  games: 'Game log',
};
export const PLAYER_VIEW_NAMES: Record<PlayerView, string> = {
  totals: 'Totals per NFL player',
  fr: 'Per NFL player per franchise',
  season: 'Season by season',
  log: 'Performance log',
};
export const PICK_VIEW_NAMES: Record<PickView, string> = {
  list: 'Pick list',
  fr: 'Per franchise',
  pl: 'Per NFL player',
};
export const viewName = (q: Query) =>
  q.subject === 'pick'
    ? viewOf(q) === 'fr'
      ? `Per franchise by ${q.grouping === 'round' ? 'round' : 'position'}`
      : PICK_VIEW_NAMES[viewOf(q) as PickView]
    : q.subject === 'player'
      ? PLAYER_VIEW_NAMES[q.view as PlayerView]
      : q.view === 'pos' && q.grouping === 'slot'
        ? 'By lineup slot'
        : VIEW_NAMES[q.view as FranchiseView];
const RESULT_NAMES = { W: 'won', L: 'lost', T: 'tied' } as const;

export const HEADINGS: Record<string, string> = {
  f: 'Franchise', o: 'Opponent', s: 'Season', wk: 'Week', ph: 'Phase', gp: 'GP', w: 'W', l: 'L', t: 'T',
  pct: 'Win %', pf: 'PF', pa: 'PA', apf: 'Avg PF', apa: 'Avg PA', hi: 'High', lo: 'Low', res: 'Result', mar: 'Margin',
  pl: 'NFL player', pos: 'Position', ro: 'Rostered', st: 'Starts', spts: 'Pts started', ppg: 'Pts/game',
  avg: 'Avg/start', share: 'Share %', rank: 'Lg rank', bpts: 'Pts benched', best: 'Best', nfr: 'Franchises',
  slot: 'Slot', pts: 'Points',
  pk: 'Pick', rd: 'Round', sf: 'From', kd: 'Kept or drafted', val: 'Value', n: 'Picks', dr: 'Drafted', kc: 'Kept',
  top: 'Top pick', frs: 'Picked by',
};
/** A column's heading in the query's view: By lineup slot's pos is the Slot. */
export const heading = (key: string, q: Query) => (key === 'pos' && q.view === 'pos' && q.grouping === 'slot' ? 'Slot' : HEADINGS[key]);

const MARKERS = {
  '†': 'Includes the season totals NFL.com reported for weeks with no game scores.',
  '‡': 'The result is known but the score is lost, so it is left out of points.',
  '*': 'High and low come only from games with a score.',
  '§': "Games with no score can't be checked against a week, opposition or result filter, so they are left out, never estimated.",
  '¶': 'Lineups and NFL players are only known from 2025 (the Sleeper era): earlier seasons contribute nothing.',
} as const;
/** Pick value, in words. */
const VALUE = "The points the NFL player went on to score in the picking franchise's starting lineups that season.";
type Glyph = keyof typeof MARKERS;

const and = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
const years = (seasons: number[]) => seasonList(seasons).replace(/-/g, '–').replace(/,/g, ', ');

/** The query in one line of words. */
export function summary(q: Query, ctx: Context): string {
  const name = (id: number) => ctx.franchises.find((f) => f.id === id)?.name ?? `#${id}`;
  const playerName = (id: string) => nflPlayerName(ctx.players?.find((p) => p.id === id) ?? { id, name: null });
  const seasons = q.seasons.filter((y) => ctx.seasons.includes(y));
  const allSeasons = !q.seasons.length || ctx.seasons.every((y) => q.seasons.includes(y));
  const span = allSeasons ? 'all seasons' : seasons.length === 1 ? `season ${seasons[0]}` : `seasons ${years(seasons)}`;
  // An era or League size says which seasons on its own; "all seasons" would only contradict it.
  const seasonWords = [
    allSeasons && (q.era || q.size) ? null : span,
    q.era ? ERA_NAMES[q.era] : null,
    q.size ? `${q.size}-team seasons` : null,
  ];
  const phases = q.phases.map((p) => (p === 'R' ? 'regular season' : PHASE_NAMES[p]));
  const player = q.subject === 'player';
  if (q.subject === 'pick') {
    const range = (word: string, s: [number, number] | null) =>
      s ? (s[0] === s[1] ? `${word} ${s[0]}` : `${word}s ${s[0]}–${s[1]}`) : null;
    const franchises = q.franchises.map(name).join(', ');
    return [
      q.players.length ? `Draft picks of ${q.players.map(playerName).join(', ')}` : 'Draft picks',
      q.positions.length ? q.positions.join(', ') : null,
      q.kept,
      q.franchises.length ? (q.franchiseAs === 'slot' ? `${franchises}'s slots` : `picked by ${franchises}`) : null,
      range('round', q.rounds),
      range('pick', q.picks),
      ...seasonWords,
      viewName(q).replace(/^./, (c) => c.toLowerCase()),
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return [
    ...(player
      ? [
          q.players.length ? q.players.map(playerName).join(', ') : 'NFL players',
          q.positions.length ? q.positions.join(', ') : null,
          q.lineup ? { start: 'started', bench: 'benched' }[q.lineup] : null,
          q.franchises.length ? `rostered by ${q.franchises.map(name).join(', ')}` : null,
        ]
      : [q.franchises.length ? q.franchises.map(name).join(', ') : 'All franchises']),
    q.opponents.length ? `v ${q.opponents.map(name).join(', ')}` : null,
    ...seasonWords,
    phases.length === 3 ? 'every phase' : and(phases),
    q.weeks ? (q.weeks[0] === q.weeks[1] ? `week ${q.weeks[0]}` : `weeks ${q.weeks[0]}–${q.weeks[1]}`) : null,
    q.result ? RESULT_NAMES[q.result] : null,
    q.active ? 'active franchises only' : null,
    q.minGames ? `at least ${q.minGames} games${player ? ' rostered' : ''}` : null,
    viewName(q).replace(/^./, (c) => c.toLowerCase()),
  ]
    .filter(Boolean)
    .join(' · ');
}

const fr = (f: Named) => `<a class="fr" href="${franchiseUrl(f.id)}">${esc(f.name)}</a>`;
const season = (y: number) => `<a href="${seasonUrl(y)}">${y}</a>`;
const fixed = (n: number | null) => (n == null ? '' : n.toFixed(2));
const pos = (p: string | null) => (p == null ? 'Unknown' : esc(p));

export function renderResults(result: QueryResult, q: Query): string {
  const used = new Set<Glyph>();
  const mk = (g: Glyph) => {
    used.add(g);
    return `<sup class="mk" title="${esc(MARKERS[g])}">${g}</sup>`;
  };
  if (result.notes.some((n) => n.kind === 'beforeLineups')) {
    const first = result.notes.find((n) => n.kind === 'beforeLineups')!.firstSeason;
    return `<p class="sub">Lineups, and with them NFL player data, are only known from the Sleeper era: NFL player data starts in ${first ?? 'the Sleeper era'}. Choose a season from ${first ?? 'the Sleeper era'} on.</p>`;
  }
  const drafts = result.notes.find((n) => n.kind === 'beforeDrafts');
  if (drafts)
    return `<p class="sub">Draft picks are only known from the Sleeper era: drafts from ${drafts.firstSeason ?? 'the first Sleeper draft'}. Choose a season from ${drafts.firstSeason ?? 'then'} on.</p>`;
  const cols = columnsOf(q);
  const sort = sortOf(q);
  const head = cols
    .map((key) => {
      const sorted = sort.key === key;
      const dir = sorted ? (sort.dir === 'asc' ? 'desc' : 'asc') : ascendingFirst(key) ? 'asc' : 'desc';
      const href = `?${encodeQuery({ ...q, sort: { key, dir } })}`;
      const cls = [isText(key) ? '' : 'num', sorted ? 'sorted' : ''].filter(Boolean).join(' ');
      const arrow = sorted ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th${cls ? ` class="${cls}"` : ''}${sorted ? ` aria-sort="${sort.dir}ending"` : ''}><a href="${esc(href)}">${heading(key, q)}${arrow}</a></th>`;
    })
    .join('');

  const td = (key: string, html: string) => `<td${isText(key) ? '' : ' class="num"'}>${html}</td>`;
  /** A cell: the column's value, from the one accessor charts read too, linked and marked by its row. */
  const cell = (r: Row, key: string) => {
    const v = columnValue(r, key);
    const group = r.kind === 'group' ? r : null;
    switch (key) {
      case 'f': return v == null ? '' : fr({ id: (r as { franchise: Named }).franchise.id, name: v as string });
      case 'o':
        return v == null ? '<span class="alias">Not recorded</span>' : fr({ id: (r as { opponent: Named }).opponent.id, name: v as string });
      case 'sf': return v == null ? '' : fr({ id: (r as PickRow).slotFranchise.id, name: v as string });
      case 's': return v == null ? '' : season(v as number);
      case 'wk': return `<a href="${seasonUrl((r as GameRow | PerformanceRow).season, v as number)}">${v}</a>`;
      case 'pl': return `<a class="pl" href="${esc(nflPlayerUrl((r as { player: NflPlayer }).player.id))}">${esc(v as string)}</a>`;
      case 'pos': return pos(v as string | null);
      case 'ph':
      case 'res': return v == null ? '' : String(v);
      case 'slot': return esc(v as string);
      case 'kd': return v == null ? '<span class="alias">Not recorded</span>' : (v as string);
      case 'frs': return (r as PickPlayerRow).franchises.map(fr).join(', ');
      case 'top': return r.kind === 'pickPlayer' ? `${v} (${season(r.top.season)})` : String(v);
      case 'val': return `<span title="${esc(VALUE)}">${fixed(v as number)}</span>`;
      case 'mar': return v == null ? '' : `${(v as number) > 0 ? '+' : ''}${(v as number).toFixed(2)}`;
      case 'gp': return `${v}${group?.unchecked ? mk('§') : ''}`;
      case 'hi':
      case 'lo': return `${fixed(v as number | null)}${group?.partialHighs ? mk('*') : ''}`;
      case 'pf':
      case 'pa':
      case 'apf':
      case 'apa':
        // A game whose score is lost shows only its marker.
        if (r.kind === 'game' && v == null) return mk('‡');
        return `${fixed(v as number | null)}${group?.reported ? mk('†') : ''}${group?.lostScores ? mk('‡') : ''}`;
      default:
        if (v == null) return '';
        if (columnKind(key) === 'fraction') return ((v as number) * 100).toFixed(1);
        return isWhole(key) ? String(v) : fixed(v as number);
    }
  };
  const gapRow = (r: GapRow) => {
    const what =
      r.kind === 'reported'
        ? `${r.gp} games with no scores, as NFL.com reported them: ${r.w}-${r.l}-${r.t}, PF ${fixed(r.pf)}, PA ${fixed(r.pa)}${mk('†')}`
        : `${r.gp} games with no scores, left out${mk('§')}`;
    return `${td('s', cell(r, 's'))}${td('wk', weekList(r.weeks))}${td('ph', cell(r, 'ph'))}${td('f', cell(r, 'f'))}<td colspan="${cols.length - 4}" class="alias">${what}</td>`;
  };
  const row = (r: Row) =>
    `<tr>${r.kind === 'reported' || r.kind === 'unchecked' ? gapRow(r) : cols.map((key) => td(key, cell(r, key))).join('')}</tr>`;
  const lineups = result.notes.some((n) => n.kind === 'lineups');
  const scope = lineups ? `<p class="sub">Sleeper era, 2025 on${mk('¶')}</p>` : '';
  const body = result.rows.length
    ? result.rows.map(row).join('')
    : `<tr><td colspan="${cols.length}">${
        q.subject === 'player' ? 'No NFL players match the query.' : q.subject === 'pick' ? 'No draft picks match the query.' : 'No games match the query.'
      }</td></tr>`;

  const notes = [
    ...(Object.keys(MARKERS) as Glyph[]).filter((g) => used.has(g)).map((g) => [g, MARKERS[g]]),
    ...result.notes.flatMap((n) =>
      n.kind === 'unrecorded'
        ? [['', `Shit Bowl and Mediocre Bowl games were never recorded for ${years(n.seasons)}.`]]
        : n.kind === 'mixed'
          ? [['', "The Shit Bowl and the Mediocre Bowl are counted together: the data doesn't separate them."]]
          : n.kind === 'drafts'
            ? [['', `Draft picks are only known from the Sleeper era: drafts from ${n.firstSeason ?? 'the first Sleeper draft'}. Value: ${VALUE}`]]
            : n.kind === 'keepersUnrecorded'
              ? [['', `Keepers not yet recorded for ${n.seasons.join(', ')}: their keepers can't be told from drafted NFL players, so they count as drafted.`]]
              : [],
    ),
  ];
  const notesHtml = notes.length
    ? `<div class="notes">${notes.map(([g, text]) => `<p><span class="g">${g}</span>${esc(text)}</p>`).join('')}</div>`
    : '';
  return `${scope}<table class="t sg"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${notesHtml}`;
}
