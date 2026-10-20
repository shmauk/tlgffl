// The records catalogue (#7): eight categories, each a fixed set of records.
// A record Statsguru can express is a saved Statsguru query (`statsguru`) and
// the figure it ranks on (`figure`), so it's defined once; the rest read the
// tables recordbook/records.py writes.
import type { GameRow, GroupRow } from '../statsguru/engine';
import type { Query } from '../statsguru/query';
import { recordUrl, SEASONS_URL } from '../urls';

/**
 * A season set (#54): a named set of seasons a record can be ranked over, as it
 * appears in a record's URL. The build keeps its figures per season set under
 * the same keys (recordbook/season_sets.py), and the season_sets table lists
 * each one's seasons. No season set is named like a phase.
 */
export type SeasonSet = 'all-seasons' | 'nfl-com' | 'sleeper' | '10-teams' | '12-teams' | '16-teams' | 'nfl-com-16-teams';
/** A League size: how many franchises played, 10 in 2012, 12 in 2013–14 and 16 from 2015. */
export type LeagueSize = 10 | 12 | 16;
/** The phase filter: the Playoffs alone, the regular season alone, or every game. */
export type PhaseFilter = 'all' | 'regular' | 'playoffs';

/** The eras' season sets: every season, or one era's. */
export const ERAS: SeasonSet[] = ['all-seasons', 'nfl-com', 'sleeper'];
/**
 * Each League size's season set (#56). The NFL.com era's 16-team seasons are
 * the one era and size pair no other set gives: the Sleeper era is all 16
 * teams, and 10 and 12 teams are all NFL.com.
 */
const SIZE_SETS: Record<LeagueSize, SeasonSet> = { 10: '10-teams', 12: '12-teams', 16: '16-teams' };
export const SEASON_SETS: SeasonSet[] = [...ERAS, ...Object.values(SIZE_SETS), 'nfl-com-16-teams'];
/**
 * A record's season sets: the eras, and each League size it can have entries
 * for. A record with only one possible size has no size sets.
 */
const withSizes = (sizes: LeagueSize[]): SeasonSet[] =>
  sizes.length > 1 ? [...ERAS, ...sizes.map((n) => SIZE_SETS[n]), ...(sizes.includes(16) ? ['nfl-com-16-teams' as const] : [])] : ERAS;
const EVERY_SIZE = withSizes([10, 12, 16]);
// One 10-team season gives nobody 2 completed seasons, nor 6 games against one opponent.
const NOT_10_TEAMS = withSizes([12, 16]);
export const PHASES: PhaseFilter[] = ['all', 'regular', 'playoffs'];
export const SEASON_SET_NAMES: Record<SeasonSet, string> = {
  'all-seasons': 'All eras', 'nfl-com': 'NFL.com era', sleeper: 'Sleeper era',
  '10-teams': '10 teams', '12-teams': '12 teams', '16-teams': '16 teams', 'nfl-com-16-teams': 'NFL.com era, 16 teams',
};
/**
 * Each season set as Statsguru names it (#55): by era and League size, not
 * its seasons, so a record's full list keeps up with seasons to come.
 */
export const SEASON_SET_QUERY: Record<SeasonSet, Pick<Query, 'era' | 'size'>> = {
  'all-seasons': { era: null, size: null },
  'nfl-com': { era: 'nfl.com', size: null },
  sleeper: { era: 'sleeper', size: null },
  '10-teams': { era: null, size: 10 },
  '12-teams': { era: null, size: 12 },
  '16-teams': { era: null, size: 16 },
  'nfl-com-16-teams': { era: 'nfl.com', size: 16 },
};
export const PHASE_NAMES: Record<PhaseFilter, string> = { all: 'All games', regular: 'Regular season', playoffs: 'Playoffs' };

/** What a record ranks, which decides how its entries read. */
export type Kind = 'game' | 'pair' | 'career' | 'streak' | 'season' | 'tally' | 'run'
  // #32: a pair of franchises over their games, a division's season, an NFL
  // player's or a bench's points in a game, and a bench over a season.
  | 'rivalry' | 'division' | 'lineup' | 'lineup-season';
/** 'luck' is a difference of two percentages, shown signed. */
export type Unit = 'points' | 'pct' | 'count' | 'luck';

/** A figure shown alongside a season record's own, from the same season line. */
export interface Alongside {
  label: string;
  column: string;
  unit: Unit;
}

export interface RecordDef {
  slug: string;
  name: string;
  category: string;
  kind: Kind;
  unit: Unit;
  /** Highest first ('desc') or lowest first. */
  dir: 'asc' | 'desc';
  /** The filters that make sense for it; the first of each is the default. */
  seasonSets: SeasonSet[];
  phases: PhaseFilter[];
  /** The fixed footnote saying what qualifies. */
  qualification: string;
  /** The saved Statsguru query, less its seasons and phases (the filters add those). */
  statsguru?: Partial<Query>;
  /** The figure a Statsguru row ranks on; null leaves the row out. */
  figure: (r: GameRow & GroupRow) => number | null;
  /** Career rates need 2 completed seasons (#7). */
  rate?: boolean;
  /** Every entry, unranked, rather than the top 10. */
  all?: boolean;
  /** For records the Python build writes: which table rows. */
  table?: 'combined' | 'ties' | 'winning' | 'losing' | 'top_half';
  /** What a division or lineup record ranks (#32). */
  measure?: 'points_for' | 'wins' | 'player' | 'bench';
  /** Both franchises of an entry hold it, not just the first. */
  shared?: boolean;
  /** The figure column's heading, where the kind doesn't say. */
  heading?: string;
  /** Season records (#31): the record_seasons column ranked, and the figures shown alongside. */
  column?: string;
  /**
   * A season record Statsguru can list (#30): its per-season view, sorted on
   * this key. The record still reads record_seasons; this is only its full list.
   */
  seasonSort?: 'w' | 'pf' | 'pa' | 'apf';
  alongside?: Alongside[];
  /** Bracket records (#31): the record_tallies or record_runs record. */
  record?: string;
}

const none = () => null;
const GAMES = 'Every final game with a score, from each franchise’s side.';
const game = (
  slug: string, name: string, dir: 'asc' | 'desc', key: 'pf' | 'mar', result: 'W' | 'L' | null, qualification = GAMES,
): RecordDef => ({
  slug, name, category: 'scoring', kind: 'game', unit: 'points', dir, seasonSets: EVERY_SIZE, phases: PHASES, qualification,
  statsguru: { view: 'games', result, sort: { key, dir } },
  figure: (r) => (r.kind === 'game' ? r[key === 'pf' ? 'pf' : 'margin'] : null),
});
const pair = (slug: string, name: string, dir: 'asc' | 'desc', table: 'combined' | 'ties', qualification: string): RecordDef => ({
  slug, name, category: 'scoring', kind: 'pair', unit: 'points', dir, seasonSets: EVERY_SIZE, phases: PHASES, qualification,
  figure: none, table, all: table === 'ties',
});
const career = (
  slug: string, name: string, key: 'w' | 'pct' | 'apf' | 'apa', unit: Unit, qualification: string, category = 'results',
): RecordDef => ({
  slug, name, category, kind: 'career', unit, dir: 'desc', seasonSets: key === 'w' ? EVERY_SIZE : NOT_10_TEAMS, phases: PHASES,
  qualification,
  statsguru: { view: 'totals', sort: { key, dir: 'desc' } },
  figure: (r) => (r.kind === 'group' ? r[key] : null),
  rate: key !== 'w',
});
const STREAKS = 'Consecutive regular-season games, carried across seasons. NFL.com-era Shit Bowl and Mediocre Bowl games were never recorded, so bracket games don’t count.';
const streak = (slug: string, name: string, table: 'winning' | 'losing' | 'top_half', qualification: string): RecordDef => ({
  slug, name, category: 'results', kind: 'streak', unit: 'count', dir: 'desc', seasonSets: EVERY_SIZE, phases: ['regular'],
  qualification, figure: none, table,
});

const rivalry = (slug: string, name: string, key: 'pct' | 'gp', qualification: string): RecordDef => ({
  slug, name, category: 'head-to-head', kind: 'rivalry', unit: key === 'pct' ? 'pct' : 'count', dir: 'desc',
  seasonSets: key === 'pct' ? NOT_10_TEAMS : EVERY_SIZE, phases: PHASES, qualification, heading: key === 'pct' ? 'Win %' : 'Games',
  statsguru: { view: 'opp', minGames: key === 'pct' ? 6 : 0, sort: { key, dir: 'desc' } },
  // Reported games have no known opponent: they aren't anyone's rivalry.
  figure: (r) => (r.kind === 'group' && r.opponent ? r[key] : null),
  shared: key === 'gp',
});
const DIVISIONS = 'Each completed season’s divisions since 2015, their franchises’ regular-season lines summed.';
const division = (slug: string, name: string, measure: 'points_for' | 'wins', dir: 'asc' | 'desc'): RecordDef => ({
  slug, name, category: 'divisions', kind: 'division', unit: measure === 'wins' ? 'count' : 'points', dir,
  seasonSets: ERAS, phases: ['regular'], measure, heading: measure === 'wins' ? 'Wins' : 'Points for',
  qualification: `${DIVISIONS}${measure === 'wins' ? ' A tie isn’t a win.' : ''}`, figure: none,
});
const SLEEPER: SeasonSet[] = ['sleeper'];
const lineup = (slug: string, name: string, measure: 'player' | 'bench', qualification: string): RecordDef => ({
  slug, name, category: 'sleeper', kind: 'lineup', unit: 'points', dir: 'desc', seasonSets: SLEEPER, phases: PHASES,
  measure, qualification, figure: none, heading: measure === 'bench' ? 'Bench points' : 'Points',
});
const SEASON_LINES = 'Every season line, NFL.com’s reported ones filling the seasons with games missing (ADR 0001).';
const BREAKDOWN = 'Every fully covered season line: Breakdown needs every score of every regular-season week.';
const GP: Alongside = { label: 'GP', column: 'games', unit: 'count' };
// Statsguru's per-season view has these; Breakdown and luck it hasn't.
const SEASON_SORT: Record<string, RecordDef['seasonSort']> = {
  wins: 'w', points_for: 'pf', points_against: 'pa', points_for_per_game: 'apf',
};
const season = (
  slug: string, name: string, dir: 'asc' | 'desc', column: string, unit: Unit, alongside: Alongside[],
  qualification = SEASON_LINES, category = 'seasons',
): RecordDef => ({
  slug, name, category, kind: 'season', unit, dir, seasonSets: EVERY_SIZE, phases: ['regular'], qualification, figure: none, column,
  alongside, seasonSort: SEASON_SORT[column],
});
const PF_GAME: Alongside = { label: 'PF per game', column: 'points_for_per_game', unit: 'points' };
const PA_GAME: Alongside = { label: 'PA per game', column: 'points_against_per_game', unit: 'points' };
const WIN_PCT: Alongside = { label: 'Win %', column: 'win_pct', unit: 'pct' };
const BREAKDOWN_PCT: Alongside = { label: 'Breakdown %', column: 'breakdown_pct', unit: 'pct' };

const FINISHED = 'Every finished season.';
const tally = (slug: string, name: string, record: string, qualification: string, seasonSets: SeasonSet[] = EVERY_SIZE): RecordDef => ({
  slug, name, category: 'brackets', kind: 'tally', unit: 'count', dir: 'desc', seasonSets, phases: ['all'], qualification,
  figure: none, record,
});
const run = (slug: string, name: string, record: string, qualification: string): RecordDef => ({
  slug, name, category: 'brackets', kind: 'run', unit: 'count', dir: 'desc', seasonSets: EVERY_SIZE, phases: ['all'], qualification,
  figure: none, record,
});

export const RECORDS: RecordDef[] = [
  game('highest-score', 'Highest score', 'desc', 'pf', null),
  game('lowest-score', 'Lowest score', 'asc', 'pf', null),
  game('highest-score-in-a-loss', 'Highest score in a loss', 'desc', 'pf', 'L'),
  game('lowest-score-in-a-win', 'Lowest score in a win', 'asc', 'pf', 'W'),
  game('biggest-margin', 'Biggest margin', 'desc', 'mar', 'W', 'Every final game with a score and a winner.'),
  game('narrowest-margin', 'Narrowest margin', 'asc', 'mar', 'W', 'Every final game with a score and a winner: ties are listed under All ties.'),
  pair('highest-combined-score', 'Highest combined score', 'desc', 'combined', 'Every final game with a score: both franchises’ points together.'),
  pair('lowest-combined-score', 'Lowest combined score', 'asc', 'combined', 'Every final game with a score: both franchises’ points together.'),
  pair('all-ties', 'All ties', 'desc', 'ties', 'Every final game whose two franchises scored the same points, newest first.'),
  career('career-wins', 'Career wins', 'w', 'count', 'Every franchise. Season lines cover every season, NFL.com’s reported figures filling the weeks with no game scores (ADR 0001).'),
  career('career-win-pct', 'Career win %', 'pct', 'pct', 'At least 2 completed seasons. A tie counts as half a win.'),
  career('career-points-per-game', 'Career points per game', 'apf', 'points', 'At least 2 completed seasons. Games with a score, plus NFL.com’s reported totals for weeks with none.'),
  streak('longest-winning-streak', 'Longest winning streak', 'winning', `${STREAKS} A tie ends it.`),
  streak('longest-losing-streak', 'Longest losing streak', 'losing', `${STREAKS} A tie ends it.`),
  streak('longest-top-half-run', 'Longest run of top-half weeks', 'top_half',
    'Consecutive regular-season weeks beating at least half the league that week, a level score counting half. Only weeks where every score survives count.'),
  season('most-wins', 'Most wins', 'desc', 'wins', 'count', [WIN_PCT, GP]),
  season('fewest-wins', 'Fewest wins', 'asc', 'wins', 'count', [WIN_PCT, GP]),
  season('most-points-for', 'Most points for', 'desc', 'points_for', 'points', [PF_GAME, GP]),
  season('fewest-points-for', 'Fewest points for', 'asc', 'points_for', 'points', [PF_GAME, GP]),
  season('most-points-against', 'Most points against', 'desc', 'points_against', 'points', [PA_GAME, GP]),
  season('fewest-points-against', 'Fewest points against', 'asc', 'points_against', 'points', [PA_GAME, GP]),
  season('best-points-per-game', 'Best points per game', 'desc', 'points_for_per_game', 'points',
    [{ label: 'PF', column: 'points_for', unit: 'points' }, GP]),
  season('worst-points-per-game', 'Worst points per game', 'asc', 'points_for_per_game', 'points',
    [{ label: 'PF', column: 'points_for', unit: 'points' }, GP]),
  season('best-breakdown-pct', 'Best Breakdown %', 'desc', 'breakdown_pct', 'pct', [WIN_PCT, GP], BREAKDOWN),
  season('worst-breakdown-pct', 'Worst Breakdown %', 'asc', 'breakdown_pct', 'pct', [WIN_PCT, GP], BREAKDOWN),
  season('luckiest-season', 'Luckiest season', 'desc', 'luck', 'luck', [WIN_PCT, BREAKDOWN_PCT],
    `Win % minus Breakdown %, a tie counting half. ${BREAKDOWN}`, 'luck'),
  season('unluckiest-season', 'Unluckiest season', 'asc', 'luck', 'luck', [WIN_PCT, BREAKDOWN_PCT],
    `Win % minus Breakdown %, a tie counting half. ${BREAKDOWN}`, 'luck'),
  career('career-points-against-per-game', 'Career most points against per game', 'apa', 'points',
    'At least 2 completed seasons. Games with a score, plus NFL.com’s reported totals for weeks with none.', 'luck'),
  tally('championships', 'Championships', 'championships', `${FINISHED} A disputed outcome counts for nobody.`),
  tally('finals-reached', 'Finals reached', 'finals', `Every Playoffs final played. ${FINISHED}`),
  tally('playoff-appearances', 'Playoff appearances', 'playoffs', FINISHED),
  tally('shit-bowl-titles', 'Shit Bowl winner titles', 'shit_bowl_titles', `${FINISHED} A disputed outcome counts for nobody.`),
  tally('shit-bowl-appearances', 'Shit Bowl appearances', 'shit_bowl',
    `Since 2025: NFL.com never recorded who played in the Shit Bowl, so the NFL.com era can’t be counted. ${FINISHED}`,
    ['sleeper']),
  tally('mediocre-bowl-titles', 'Mediocre Bowl titles', 'mediocre_bowl_titles',
    `Since 2015, when the Mediocre Bowl began. ${FINISHED} An unknown or disputed outcome counts for nobody.`, ERAS),
  run('longest-playoff-drought', 'Longest Playoff drought', 'drought',
    `Consecutive seasons a franchise played without a Playoff appearance. ${FINISHED}`),
  run('longest-playoff-appearance-streak', 'Longest Playoff appearance streak', 'appearances',
    `Consecutive seasons with a Playoff appearance. ${FINISHED}`),
  rivalry('most-lopsided-rivalry', 'Most lopsided rivalry', 'pct',
    'The best win % against one opponent, at least 6 games between them. A tie counts as half a win.'),
  rivalry('most-played-pairing', 'Most-played pairing', 'gp', 'Every final game between the two franchises.'),
  division('group-of-death', 'Group of Death', 'points_for', 'desc'),
  division('winningest-division', 'Winningest', 'wins', 'desc'),
  division('weakest-division-by-points-for', 'Weakest division by points for', 'points_for', 'asc'),
  division('weakest-division-by-wins', 'Weakest division by wins', 'wins', 'asc'),
  lineup('best-nfl-player-score', 'Best single NFL player score', 'player',
    'Every NFL player a franchise started in a final game, on the points he scored for it.'),
  lineup('most-bench-points-in-a-game', 'Most bench points in a game', 'bench',
    'Every final game: the points of the NFL players a franchise had on its roster but didn’t start.'),
  {
    slug: 'most-bench-points-in-a-season', name: 'Most bench points in a season', category: 'sleeper',
    kind: 'lineup-season', unit: 'points', dir: 'desc', seasonSets: SLEEPER, phases: ['regular'], measure: 'bench',
    heading: 'Bench points', figure: none,
    qualification: 'Each completed season’s regular season: the points of the NFL players a franchise had on its roster but didn’t start.',
  },
];

export interface Category {
  slug: string;
  name: string;
  /** Pending categories list their records' names until they're built. */
  built: boolean;
  records: { name: string; slug?: string; href?: string }[];
  sub?: string;
}

const pending = (slug: string, name: string, names: string[], sub?: string): Category => ({
  slug, name, built: false, sub, records: names.map((n) => ({ name: n })),
});
const built = (slug: string, name: string): Category => ({
  slug, name, built: true, records: RECORDS.filter((r) => r.category === slug).map(({ name, slug }) => ({ name, slug })),
});

export const CATEGORIES: Category[] = [
  built('scoring', 'Scoring'),
  built('results', 'Results and streaks'),
  built('seasons', 'Seasons'),
  built('luck', 'Luck'),
  {
    ...built('brackets', 'Brackets'),
    // The roll of honour already exists: the category links to it, not a copy (#14).
    records: [{ name: 'Roll of honour', href: SEASONS_URL }, ...built('brackets', 'Brackets').records],
  },
  built('head-to-head', 'Head-to-head'),
  { ...built('divisions', 'Divisions'), sub: 'Since 2015' },
  { ...built('sleeper', 'Sleeper era'), sub: 'Since 2025' },
];

export const recordDef = (slug: string) => RECORDS.find((r) => r.slug === slug);
export const categoryOf = (def: RecordDef) => CATEGORIES.find((c) => c.slug === def.category)!;

/** One of a record's pages: the seasons it ranks over and the games it counts. */
export interface Variant {
  seasonSet: SeasonSet;
  phase: PhaseFilter;
}

/** Every season set and phase a record is shown for; the first is its own page. */
export const variants = (def: RecordDef): Variant[] =>
  def.seasonSets.flatMap((seasonSet) => def.phases.map((phase) => ({ seasonSet, phase })));

/**
 * A variant's path below its record's own page (#54): its season set, then its
 * phase, each left out where it is the record's default, so every variant has
 * exactly one URL.
 */
export const variantPath = (def: RecordDef, { seasonSet, phase }: Variant): string[] => [
  ...(seasonSet === def.seasonSets[0] ? [] : [seasonSet]),
  ...(phase === def.phases[0] ? [] : [phase]),
];

/** A variant's one URL. */
export const variantUrl = (def: RecordDef, variant: Variant) => recordUrl(def.slug, variantPath(def, variant));

/** One choice in a record page's era or size row. */
export interface Filter {
  name: string;
  seasonSet: SeasonSet;
  current: boolean;
}

type EraChoice = 'all-seasons' | 'nfl-com' | 'sleeper';
const ERA_OF: Record<SeasonSet, EraChoice> = {
  'all-seasons': 'all-seasons', 'nfl-com': 'nfl-com', sleeper: 'sleeper',
  '10-teams': 'all-seasons', '12-teams': 'all-seasons', '16-teams': 'all-seasons', 'nfl-com-16-teams': 'nfl-com',
};
const SIZE_OF: Record<SeasonSet, LeagueSize | null> = {
  'all-seasons': null, 'nfl-com': null, sleeper: null,
  '10-teams': 10, '12-teams': 12, '16-teams': 16, 'nfl-com-16-teams': 16,
};
const SIZE_NAMES: Record<LeagueSize, string> = { 10: '10 teams (2012)', 12: '12 teams (2013–14)', 16: '16 teams (2015 on)' };
/** The one season set an era and a League size (null for every size) give together. */
const setOf = (era: EraChoice, size: LeagueSize | null): SeasonSet =>
  era === 'sleeper' ? 'sleeper' : size === null ? era : size === 16 && era === 'nfl-com' ? 'nfl-com-16-teams' : SIZE_SETS[size];

/**
 * A record page's era and size rows (#56), each null where it isn't shown.
 * Each choice keeps the other row's, and equivalent pairs are one season set:
 * the Sleeper era has no size row (every Sleeper season is 16 teams), and 10
 * or 12 teams no era row (both are NFL.com only). A record with one possible
 * era or size has no row for it.
 */
export function filters(def: RecordDef, seasonSet: SeasonSet): { eras: Filter[] | null; sizes: Filter[] | null } {
  const era = ERA_OF[seasonSet];
  const size = SIZE_OF[seasonSet];
  const eras = ERAS.filter((s) => def.seasonSets.includes(s)) as EraChoice[];
  const sizes = ([10, 12, 16] as LeagueSize[]).filter((n) => def.seasonSets.includes(SIZE_SETS[n]));
  return {
    eras: eras.length > 1 && size !== 10 && size !== 12
      ? eras.map((e) => ({ name: SEASON_SET_NAMES[e], seasonSet: setOf(e, size), current: e === era }))
      : null,
    sizes: sizes.length > 1 && era !== 'sleeper'
      ? [null, ...sizes].map((n) => ({ name: n === null ? 'All sizes' : SIZE_NAMES[n], seasonSet: setOf(era, n), current: n === size }))
      : null,
  };
}
