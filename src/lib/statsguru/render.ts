// Statsguru's results page as HTML: the one-line query summary, one dense
// table whose every column header sorts, and the notes for the markers used.
// Plain strings, so it renders the same in the browser and in tests.
import { esc } from '../html';
import { weekList } from '../format';
import { franchiseUrl, nflPlayerName, nflPlayerUrl, seasonUrl } from '../urls';
import type {
  GameRow, GapRow, GroupRow, Named, NflPlayer, PerformanceRow, PickGroupRow, PickPlayerRow, PickRow, PlayerRow, PositionRow,
  QueryResult, Row,
} from './engine';
import { columnsOf, encodeQuery, seasonList, sortOf, viewOf, type Era, type FranchiseView, type Phase, type PickView, type PlayerView, type Query } from './query';

export interface Context {
  franchises: Named[];
  /** Every season, to tell "all seasons" from a span. */
  seasons: number[];
  /** NFL players by Sleeper id, to name the ones a query asks for. */
  players?: { id: string; name: string | null }[];
}

export const ERA_NAMES: Record<Era, string> = { 'nfl.com': 'NFL.com era', sleeper: 'Sleeper era' };
export const PHASE_NAMES: Record<Phase, string> = {
  R: 'Regular season',
  P: 'Playoffs',
  C: 'Shit Bowl and Mediocre Bowl',
};
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
const viewName = (q: Query) =>
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
/** Columns that read A-Z (or oldest first, or best first) before they read the other way. */
const ASCENDING_FIRST = new Set(['f', 'o', 's', 'wk', 'ph', 'res', 'pl', 'pos', 'slot', 'rank', 'pk', 'rd', 'sf', 'top']);
const TEXT_COLUMNS = new Set(['f', 'o', 'ph', 'res', 'pl', 'pos', 'slot', 'sf', 'kd', 'frs']);
const heading = (key: string, q: Query) => (key === 'pos' && q.view === 'pos' && q.grouping === 'slot' ? 'Slot' : HEADINGS[key]);

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
  const scope = [
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
      ...scope,
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
    ...scope,
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
const pl = (p: NflPlayer) => `<a class="pl" href="${esc(nflPlayerUrl(p.id))}">${esc(nflPlayerName(p))}</a>`;
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
      const dir = sorted ? (sort.dir === 'asc' ? 'desc' : 'asc') : ASCENDING_FIRST.has(key) ? 'asc' : 'desc';
      const href = `?${encodeQuery({ ...q, sort: { key, dir } })}`;
      const cls = [TEXT_COLUMNS.has(key) ? '' : 'num', sorted ? 'sorted' : ''].filter(Boolean).join(' ');
      const arrow = sorted ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th${cls ? ` class="${cls}"` : ''}${sorted ? ` aria-sort="${sort.dir}ending"` : ''}><a href="${esc(href)}">${heading(key, q)}${arrow}</a></th>`;
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
  const positionRow = (r: PositionRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 'f': return td(key, fr(r.franchise));
          case 'pos': return td(key, pos(r.pos));
          case 'share': return td(key, r.share == null ? '' : (r.share * 100).toFixed(1));
          case 'gp':
          case 'st':
          case 'rank': return td(key, String(r[key]));
          default: return td(key, fixed((r as any)[key]));
        }
      })
      .join('');
  const playerRow = (r: PlayerRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 'pl': return td(key, pl(r.player));
          case 'pos': return td(key, pos(r.player.position));
          case 'f': return td(key, r.franchise ? fr(r.franchise) : '');
          case 's': return td(key, r.season == null ? '' : season(r.season));
          case 'ro':
          case 'st':
          case 'dr':
          case 'kc':
          case 'nfr': return td(key, String(r[key]));
          default: return td(key, fixed((r as any)[key]));
        }
      })
      .join('');
  const performanceRow = (r: PerformanceRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 's': return td(key, season(r.season));
          case 'wk': return td(key, `<a href="${seasonUrl(r.season, r.week)}">${r.week}</a>`);
          case 'ph': return td(key, PHASE_NAMES[r.phase]);
          case 'pl': return td(key, pl(r.player));
          case 'pos': return td(key, pos(r.player.position));
          case 'f': return td(key, fr(r.franchise));
          case 'o': return td(key, fr(r.opponent));
          case 'slot': return td(key, r.slot === 'BN' ? 'Bench' : esc(r.slot));
          case 'pts': return td(key, fixed(r.points));
          default: return td(key, '');
        }
      })
      .join('');
  const keptCell = (kept: boolean | null) =>
    kept == null ? '<span class="alias">Not recorded</span>' : kept ? 'Kept' : 'Drafted';
  const value = (v: number) => `<span title="${esc(VALUE)}">${fixed(v)}</span>`;
  const pickRow = (r: PickRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 's': return td(key, season(r.season));
          case 'pk':
          case 'rd': return td(key, String(key === 'pk' ? r.pick : r.round));
          case 'f': return td(key, fr(r.franchise));
          case 'sf': return td(key, r.slotFranchise.id === r.franchise.id ? '' : fr(r.slotFranchise));
          case 'pl': return td(key, pl(r.player));
          case 'pos': return td(key, pos(r.player.position));
          case 'kd': return td(key, keptCell(r.kept));
          case 'val': return td(key, value(r.value));
          default: return td(key, '');
        }
      })
      .join('');
  const pickGroupRow = (r: PickGroupRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 'f': return td(key, fr(r.franchise));
          case 'pos': return td(key, pos(r.group as string | null));
          case 'rd': return td(key, String(r.group));
          case 'val': return td(key, value(r.value));
          default: return td(key, String((r as any)[key]));
        }
      })
      .join('');
  const pickPlayerRow = (r: PickPlayerRow) =>
    cols
      .map((key) => {
        switch (key) {
          case 'pl': return td(key, pl(r.player));
          case 'pos': return td(key, pos(r.player.position));
          case 'top': return td(key, `${r.top.pick} (${season(r.top.season)})`);
          case 'frs': return td(key, r.franchises.map(fr).join(', '));
          case 'val': return td(key, value(r.value));
          default: return td(key, String((r as any)[key]));
        }
      })
      .join('');
  const row = (r: Row) => {
    switch (r.kind) {
      case 'pick': return `<tr>${pickRow(r)}</tr>`;
      case 'pickGroup': return `<tr>${pickGroupRow(r)}</tr>`;
      case 'pickPlayer': return `<tr>${pickPlayerRow(r)}</tr>`;
      case 'group': return `<tr>${groupRow(r)}</tr>`;
      case 'game': return `<tr>${gameRow(r)}</tr>`;
      case 'position': return `<tr>${positionRow(r)}</tr>`;
      case 'player': return `<tr>${playerRow(r)}</tr>`;
      case 'performance': return `<tr>${performanceRow(r)}</tr>`;
      default: return `<tr>${gapRow(r)}</tr>`;
    }
  };
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
