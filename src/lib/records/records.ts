// One record, filtered by era and phase, ready to show (#7, #30). Records
// Statsguru can express run their saved query through Statsguru's own engine,
// so a record and its "full list in Statsguru" can't disagree (ADR 0002). The
// rest read what recordbook/records.py wrote. Nothing here derives a figure:
// it only filters, ranks and notes.
import { BRACKET_NAMES, type BracketKey } from '../brackets';
import { weekList } from '../format';
import { runQuery, type GameRow, type GroupRow } from '../statsguru/engine';
import type { Db } from '../database';
import { DEFAULT_QUERY, type Phase, type Query } from '../statsguru/query';
import type { Glyph } from '../../components/Marker.astro';
import type { Era, PhaseFilter, RecordDef } from './catalogue';
import { topTen } from './rank';
import { lineupEntries, divisionEntries } from './rivalries-divisions-sleeper';

export interface RecordFranchise {
  id: number;
  name: string;
  departed: boolean;
}

export interface Moment {
  season: number;
  week: number;
}

export interface Entry {
  /** Null for a record listing every entry unranked (all ties). */
  rank: number | null;
  value: number;
  franchise: RecordFranchise;
  /** A game's other franchise. */
  opponent?: RecordFranchise;
  /** The franchise's points, then the opponent's. */
  score?: [number, number];
  /** A game's week. */
  at?: Moment;
  /** A streak's first and last games. */
  from?: Moment;
  to?: Moment;
  /** A career's first and last seasons within the era. */
  seasons?: [number, number];
  games?: number;
  wlt?: [number, number, number];
  /** A streak whose week before or after has no score. */
  gapBefore?: boolean;
  gapAfter?: boolean;
  /** † Includes NFL.com's reported totals. */
  reported?: boolean;
  /** ‡ Includes games whose score is lost. */
  lostScores?: boolean;
  /** Set in the current season. */
  thisSeason: boolean;
  /** † The two franchises may have met in weeks with no game record (#32). */
  gamesMissing?: boolean;
  /** A division's season: its name and lineage, and its franchises (#32). */
  division?: { name: string; lineage: string };
  members?: RecordFranchise[];
  /** The NFL player behind a score; name and position are null if unknown. */
  player?: { id: string; name: string | null; position: string | null };
  /** A season record's season, and its figures alongside (def.alongside's, in order; null if none). */
  season?: number;
  alongside?: (number | null)[];
  /** A bracket tally's seasons. */
  list?: number[];
  /** A bracket run's first and last seasons, and whether it may go on. */
  span?: [number, number];
  ongoing?: boolean;
}

export interface RecordView {
  def: RecordDef;
  era: Era;
  phase: PhaseFilter;
  entries: Entry[];
  /** True when every entry is listed, unranked. */
  all: boolean;
  /** The figure column carries * : game scores are missing for some weeks. */
  star: boolean;
  notes: { glyph?: Glyph; text: string }[];
  /** The "full list in Statsguru" query, or null if Statsguru can't express it. */
  statsguru: Partial<Query> | null;
}

interface Context {
  franchises: Map<number, { name: string; active: boolean; first: number; last: number }>;
  eraOf: Map<number, 'nfl.com' | 'sleeper'>;
  current: number | null;
  /** The current season's phase. */
  phase: string | null;
  /** Regular-season weeks with games missing, by season, and how many weeks the season has. */
  gaps: Map<number, { weeks: number[]; of: number }>;
  /** Seasons with a bracket game whose score is lost. */
  lostScores: number[];
  /** Seasons whose Shit Bowl and Mediocre Bowl games were never recorded. */
  unrecorded: number[];
  completed: Map<string, number>;
  /** Pairs ("lo-hi") who may have met in weeks with no game record. */
  gamesMissing: Set<string>;
}

const contexts = new WeakMap<Db, Context>();
function context(db: Db): Context {
  let c = contexts.get(db);
  if (c) return c;
  const gaps = new Map<number, { weeks: number[]; of: number }>();
  for (const r of db.all(`select season, week, complete from coverage where phase = 'regular' order by season, week`)) {
    const g = gaps.get(r.season) ?? { weeks: [], of: 0 };
    g.of++;
    if (!r.complete) g.weeks.push(r.week);
    gaps.set(r.season, g);
  }
  for (const [season, g] of gaps) if (!g.weeks.length) gaps.delete(season);
  c = {
    franchises: new Map(
      db.all('select id, name, active, first_season, last_season from franchises').map((r) => [
        r.id, { name: r.name, active: !!r.active, first: r.first_season, last: r.last_season },
      ]),
    ),
    eraOf: new Map(db.all('select year, era from seasons').map((r) => [r.year, r.era])),
    // The current season, as the build chose it (recordbook/current.py); null before any has started.
    current: db.all('select season from current_season')[0]?.season ?? null,
    phase: db.all('select phase from current_season')[0]?.phase ?? null,
    gaps,
    lostScores: db
      .all(`select distinct season from games where phase = 'bracket' and home_points is null order by season`)
      .map((r) => r.season),
    unrecorded: db
      .all(
        `select distinct b.season from season_brackets b
         where b.bracket in ('shit_bowl', 'mediocre_bowl')
           and not exists (select 1 from games g where g.season = b.season and g.bracket = b.bracket)
           and exists (select 1 from games g where g.season = b.season and g.bracket = 'playoffs')
         order by b.season`,
      )
      .map((r) => r.season),
    completed: new Map(db.all('select franchise_id, era, seasons from completed_seasons').map((r) => [`${r.franchise_id}|${r.era}`, r.seasons])),
    gamesMissing: new Set(
      db.all('select lo_franchise_id as lo, hi_franchise_id as hi from head_to_head where games_missing = 1').map((r) => `${r.lo}-${r.hi}`),
    ),
  };
  contexts.set(db, c);
  return c;
}

const DB_ERA = { all: 'all', 'nfl-com': 'nfl.com', sleeper: 'sleeper' } as const;
const SG_PHASES: Record<PhaseFilter, Phase[]> = { all: ['R', 'P', 'C'], regular: ['R'], playoffs: ['P'] };
const SQL_PHASE: Record<PhaseFilter, string> = {
  all: '1',
  regular: "g.phase = 'regular'",
  playoffs: "g.bracket = 'playoffs'",
};

const and = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');

export function recordView(db: Db, def: RecordDef, era: Era, phase: PhaseFilter): RecordView {
  const c = context(db);
  const inEra = (season: number) => era === 'all' || c.eraOf.get(season) === DB_ERA[era];
  const seasons = [...c.eraOf.keys()].filter(inEra).sort((a, b) => a - b);
  const franchise = (id: number): RecordFranchise => {
    const f = c.franchises.get(id)!;
    return { id, name: f.name, departed: !f.active };
  };
  const notes: RecordView['notes'] = [{ text: def.qualification }];
  let entries: Entry[] = [];
  let statsguru: Partial<Query> | null = null;
  const gameBased = def.kind === 'game' || def.kind === 'pair';
  // Games the league leaves out of the records (data/record_exclusions.csv).
  const excluded = gameBased
    ? db
        .all(
          `select e.game_id as id, g.season, g.week, g.home_franchise_id as h, g.away_franchise_id as a,
                  e.franchise_id as f, e.reason
           from record_exclusions e join games g on g.id = e.game_id where ${SQL_PHASE[phase]} order by g.season, g.week`,
        )
        .filter((x) => inEra(x.season))
    : [];
  const isExcluded = (season: number, week: number, f: number) =>
    excluded.some((x) => x.season === season && x.week === week && (x.h === f || x.a === f));

  const seen = new Set<string>();
  // Statsguru links name the era (era=), not its seasons, so they keep up with seasons to come.
  const sgEra = era === 'all' ? null : DB_ERA[era];
  if (def.statsguru) {
    statsguru = { ...def.statsguru, seasons: [], era: sgEra, phases: SG_PHASES[phase] };
    const rows = runQuery(db, { ...DEFAULT_QUERY, ...statsguru }).rows as (GameRow & GroupRow)[];
    for (const r of rows) {
      const value = def.figure(r);
      if (value === null) continue;
      if (def.kind === 'rivalry') {
        // The opponent view has each pair from both sides: keep its first.
        const key = [r.franchise.id, r.opponent!.id].sort((a, b) => a - b).join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          rank: null, value, franchise: franchise(r.franchise.id), opponent: franchise(r.opponent!.id), games: r.gp,
          wlt: [r.w, r.l, r.t], thisSeason: false,
          gamesMissing: phase !== 'playoffs' && era !== 'sleeper' && c.gamesMissing.has(key),
        });
      } else if (def.kind === 'game') {
        if (isExcluded(r.season!, r.week, r.franchise.id)) continue;
        entries.push({
          rank: null, value, franchise: franchise(r.franchise.id), opponent: franchise(r.opponent!.id),
          score: [r.pf!, r.pa!], at: { season: r.season!, week: r.week }, thisSeason: r.season === c.current,
        });
      } else {
        if (def.rate && (c.completed.get(`${r.franchise.id}|${DB_ERA[era]}`) ?? 0) < 2) continue;
        const f = c.franchises.get(r.franchise.id)!;
        const span = seasons.filter((s) => s >= f.first && s <= f.last);
        entries.push({
          rank: null, value, franchise: franchise(r.franchise.id), seasons: [span[0], span.at(-1)!], games: r.gp,
          wlt: [r.w, r.l, r.t], reported: r.reported, lostScores: def.unit === 'points' && r.lostScores > 0,
          thisSeason: false,
        });
      }
    }
  } else if (def.kind === 'division') {
    entries = divisionEntries(db, def, inEra, franchise, c.current);
  } else if (def.kind === 'lineup' || def.kind === 'lineup-season') {
    entries = lineupEntries(db, def, SQL_PHASE[phase], franchise, c.current);
  } else if (def.kind === 'pair') {
    const ties = def.table === 'ties';
    const rows = db.all(
      `select ${ties ? 'g.home_points' : 'c.points'} as value, g.season, g.week, g.home_franchise_id as h,
              g.home_points as hp, g.away_franchise_id as a, g.away_points as ap, g.winner_franchise_id as w
       from games g ${ties ? '' : 'join combined_scores c on c.game_id = g.id'}
       where g.status = 'final' and g.home_points is not null and ${SQL_PHASE[phase]}
         ${ties ? 'and g.home_points = g.away_points' : ''}
       order by g.season ${ties ? 'desc' : ''}, g.week ${ties ? 'desc' : ''}, g.id`,
    );
    entries = rows
      .filter((r) => inEra(r.season) && !isExcluded(r.season, r.week, r.h))
      .map((r) => {
        const homeFirst = r.w === null || r.w === r.h;
        return {
          rank: null, value: r.value, franchise: franchise(homeFirst ? r.h : r.a), opponent: franchise(homeFirst ? r.a : r.h),
          score: homeFirst ? [r.hp, r.ap] : [r.ap, r.hp], at: { season: r.season, week: r.week },
          thisSeason: r.season === c.current,
        };
      });
  } else if (def.kind === 'season') {
    entries = seasonEntries(db, def, inEra, franchise, c.current);
    notes.push(...seasonNotes(db, def, seasons, c.current));
    if (def.seasonSort) {
      // The full list: Statsguru's per-season view over the same seasons, so the season
      // in progress is left out while its regular season is on, as the record leaves it out.
      const listed = seasons.filter((s) => !(s === c.current && c.phase === 'regular'));
      statsguru = {
        view: 'season', phases: ['R'], sort: { key: def.seasonSort, dir: def.dir },
        seasons: listed.length === seasons.length ? [] : listed,
        era: sgEra,
      };
    }
  } else if (def.kind === 'tally' || def.kind === 'run') {
    entries = bracketEntries(db, def, DB_ERA[era], franchise, c.current);
    notes.push(...bracketNotes(db, def, seasons, c.current, c.phase));
  } else {
    const rows = db.all(
      `select s.franchise_id as f, s.length, s.gap_before, s.gap_after, a.season as fs, a.week as fw,
              b.season as ls, b.week as lw
       from record_streaks s join games a on a.id = s.first_game_id join games b on b.id = s.last_game_id
       where s.record = ? and s.era = ? order by s.first_game_id`,
      [def.table!, DB_ERA[era]],
    );
    entries = rows.map((r) => ({
      rank: null, value: r.length, franchise: franchise(r.f), from: { season: r.fs, week: r.fw },
      to: { season: r.ls, week: r.lw }, gapBefore: !!r.gap_before, gapAfter: !!r.gap_after,
      thisSeason: r.ls === c.current,
    }));
  }

  if (!def.all) entries = topTen(entries, (e) => e.value, def.dir).map(({ rank, entry }) => ({ ...entry, rank }));

  // The footnotes (#7): * and ‡ for game-based records, † and ‡ for careers.
  const gapSeasons = seasons.filter((s) => c.gaps.has(s));
  const star = gameBased && gapSeasons.length > 0;
  if (star) {
    const parts = gapSeasons.map((s) => {
      const g = c.gaps.get(s)!;
      return g.weeks.length === g.of ? `${s}` : `${s} ${weekList(g.weeks)}`;
    });
    notes.push({ glyph: '*', text: `Ranks only games with a score: there are none for ${and(parts)}.` });
  }
  const lost = c.lostScores.filter(inEra);
  if (gameBased && phase !== 'regular' && lost.length)
    notes.push({ glyph: '‡', text: `Bracket games whose score is lost are left out (${and(lost.map(String))}).` });
  for (const x of excluded) {
    const opponent = x.f === x.h ? x.a : x.h;
    notes.push({ text: `${c.franchises.get(x.f)!.name}’s ${x.season} week ${x.week} game v ${c.franchises.get(opponent)!.name} is left out: ${x.reason}` });
  }
  if (entries.some((e) => e.reported))
    notes.push({ glyph: '†', text: 'Includes the season totals NFL.com reported for weeks with no game scores.' });
  if (entries.some((e) => e.gamesMissing))
    notes.push({ glyph: '†', text: 'Both franchises played seasons with regular-season weeks that have no game record, so they may have met more often than is known.' });
  if (entries.some((e) => e.lostScores))
    notes.push({ glyph: '‡', text: 'Includes Playoffs games whose score is lost: they count in W-L-T, not in points per game.' });
  if (entries.some((e) => e.gapAfter || e.gapBefore))
    notes.push({
      glyph: '*',
      text: 'The run reaches a week with no scores, so it may continue into weeks with no scores (* after it) or may have begun in them (* before it).',
    });
  const unrecorded = c.unrecorded.filter(inEra);
  if (phase === 'all' && (gameBased || def.kind === 'career') && unrecorded.length)
    notes.push({ text: `Shit Bowl and Mediocre Bowl games were never recorded for ${seasonSpan(unrecorded)}.` });

  return { def, era, phase, entries, all: !!def.all, star, notes, statsguru };
}

/** Seasons as runs: [2014, 2015, 2016, 2018] -> "2014–2016 and 2018". */
function seasonSpan(list: number[]): string {
  const runs: [number, number][] = [];
  for (const y of list) {
    const last = runs.at(-1);
    if (last && y === last[1] + 1) last[1] = y;
    else runs.push([y, y]);
  }
  return and(runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)));
}

// Season records (#31): one entry per season line, from record_seasons.
const SEASON_COLUMNS = new Set(['games', 'wins', 'win_pct', 'points_for', 'points_against', 'points_for_per_game',
  'points_against_per_game', 'breakdown_pct', 'luck']);
const column = (name: string) => {
  if (!SEASON_COLUMNS.has(name)) throw new Error(`not a record_seasons column: ${name}`);
  return name;
};

function seasonEntries(
  db: Db, def: RecordDef, inEra: (s: number) => boolean, franchise: (id: number) => RecordFranchise, current: number | null,
): Entry[] {
  const extra = (def.alongside ?? []).map((a, n) => `${column(a.column)} as x${n}`);
  return db
    .all(
      `select franchise_id as f, season, games, wins, losses, ties, reported, ${column(def.column!)} as value
              ${extra.map((x) => `, ${x}`).join('')}
       from record_seasons where ${column(def.column!)} is not null order by season, franchise_id`,
    )
    .filter((r) => inEra(r.season))
    .map((r) => ({
      rank: null, value: r.value, franchise: franchise(r.f), season: r.season, games: r.games,
      wlt: [r.wins, r.losses, r.ties] as [number, number, number], reported: !!r.reported,
      alongside: extra.map((_, n) => r[`x${n}`]), thisSeason: r.season === current,
    }));
}

function seasonNotes(db: Db, def: RecordDef, seasons: number[], current: number | null): RecordView['notes'] {
  const notes: RecordView['notes'] = [];
  const ranked = new Set(db.all('select distinct season from record_seasons').map((r) => r.season));
  const lined = new Set(db.all('select distinct season from season_lines').map((r) => r.season));
  if (seasons.includes(current) && lined.has(current) && !ranked.has(current))
    notes.push({ text: `${current} joins once its regular season ends.` });
  if (def.column === 'breakdown_pct' || def.column === 'luck') {
    const none = db
      .all('select distinct season from record_seasons where breakdown_pct is null order by season')
      .map((r) => r.season)
      .filter((s) => seasons.includes(s));
    if (none.length)
      notes.push({ text: `There is no Breakdown for ${and(none.map(String))}: some of their regular-season scores are missing.` });
  }
  return notes;
}

// Bracket records (#31): tallies and runs, from record_tallies and record_runs.
function bracketEntries(
  db: Db, def: RecordDef, era: string, franchise: (id: number) => RecordFranchise, current: number | null,
): Entry[] {
  if (def.kind === 'tally')
    return db
      .all('select franchise_id as f, count, seasons from record_tallies where record = ? and era = ? order by franchise_id',
        [def.record!, era])
      .map((r) => {
        const list = String(r.seasons).split(',').map(Number);
        return { rank: null, value: r.count, franchise: franchise(r.f), list, thisSeason: list.includes(current) };
      });
  return db
    .all(
      `select franchise_id as f, length, first_season, last_season, ongoing from record_runs
       where record = ? and era = ? order by first_season, franchise_id`,
      [def.record!, era],
    )
    .map((r) => ({
      rank: null, value: r.length, franchise: franchise(r.f), span: [r.first_season, r.last_season] as [number, number],
      ongoing: !!r.ongoing, thisSeason: false,
    }));
}

const BRACKET_OF: Record<string, BracketKey> = {
  championships: 'playoffs', shit_bowl_titles: 'shit_bowl', mediocre_bowl_titles: 'mediocre_bowl',
};

function bracketNotes(db: Db, def: RecordDef, seasons: number[], current: number | null, phase: string | null): RecordView['notes'] {
  const notes: RecordView['notes'] = [];
  // Tallies count finished seasons only (recordbook/current.py): the current one once its brackets are over.
  if (current !== null && seasons.includes(current) && phase !== 'off-season')
    notes.push({ text: `${current} counts once its brackets are over.` });
  const bracket = BRACKET_OF[def.record!];
  if (!bracket) return notes;
  const winners = db.all(
    `select w.season, w.source, f.name from bracket_winners w left join franchises f on f.id = w.franchise_id
     where w.bracket = ? and w.source in ('disputed', 'unknown') order by w.season, f.name`,
    [bracket],
  ).filter((r) => seasons.includes(r.season));
  const disputed = new Map<number, string[]>();
  for (const r of winners.filter((r) => r.source === 'disputed')) disputed.set(r.season, [...(disputed.get(r.season) ?? []), r.name]);
  for (const [season, names] of disputed)
    notes.push({ text: `${season} is disputed between ${names.join(' and ')}, so it counts for nobody.` });
  const unknown = winners.filter((r) => r.source === 'unknown').map((r) => r.season);
  if (unknown.length)
    notes.push({ text: `The ${BRACKET_NAMES[bracket]} winner is unknown for ${seasonSpan(unknown)}, so those seasons count for nobody.` });
  return notes;
}
