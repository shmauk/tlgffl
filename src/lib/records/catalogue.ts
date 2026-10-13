// The records catalogue (#7): eight categories, each a fixed set of records.
// A record Statsguru can express is a saved Statsguru query (`statsguru`) and
// the figure it ranks on (`figure`), so it's defined once; the rest read the
// tables recordbook/records.py writes.
import type { GameRow, GroupRow } from '../statsguru/engine';
import type { Query } from '../statsguru/query';

/** The era filter, as it appears in a record's URL. */
export type Era = 'all' | 'nfl-com' | 'sleeper';
/** The phase filter: the Playoffs alone, the regular season alone, or every game. */
export type PhaseFilter = 'all' | 'regular' | 'playoffs';

export const ERAS: Era[] = ['all', 'nfl-com', 'sleeper'];
export const PHASES: PhaseFilter[] = ['all', 'regular', 'playoffs'];
export const ERA_NAMES: Record<Era, string> = { all: 'All eras', 'nfl-com': 'NFL.com era', sleeper: 'Sleeper era' };
export const PHASE_NAMES: Record<PhaseFilter, string> = { all: 'All games', regular: 'Regular season', playoffs: 'Playoffs' };

/** What a record ranks, which decides how its entries read. */
export type Kind = 'game' | 'pair' | 'career' | 'streak'
  // #32: a pair of franchises over their games, a division's season, an NFL
  // player's or a bench's points in a game, and a bench over a season.
  | 'rivalry' | 'division' | 'lineup' | 'lineup-season';
export type Unit = 'points' | 'pct' | 'count';

export interface RecordDef {
  slug: string;
  name: string;
  category: string;
  kind: Kind;
  unit: Unit;
  /** Highest first ('desc') or lowest first. */
  dir: 'asc' | 'desc';
  /** The filters that make sense for it; the first of each is the default. */
  eras: Era[];
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
}

const none = () => null;
const GAMES = 'Every final game with a score, from each franchise’s side.';
const game = (
  slug: string, name: string, dir: 'asc' | 'desc', key: 'pf' | 'mar', result: 'W' | 'L' | null, qualification = GAMES,
): RecordDef => ({
  slug, name, category: 'scoring', kind: 'game', unit: 'points', dir, eras: ERAS, phases: PHASES, qualification,
  statsguru: { view: 'games', result, sort: { key, dir } },
  figure: (r) => (r.kind === 'game' ? r[key === 'pf' ? 'pf' : 'margin'] : null),
});
const pair = (slug: string, name: string, dir: 'asc' | 'desc', table: 'combined' | 'ties', qualification: string): RecordDef => ({
  slug, name, category: 'scoring', kind: 'pair', unit: 'points', dir, eras: ERAS, phases: PHASES, qualification,
  figure: none, table, all: table === 'ties',
});
const career = (slug: string, name: string, key: 'w' | 'pct' | 'apf', unit: Unit, qualification: string): RecordDef => ({
  slug, name, category: 'results', kind: 'career', unit, dir: 'desc', eras: ERAS, phases: PHASES, qualification,
  statsguru: { view: 'totals', sort: { key, dir: 'desc' } },
  figure: (r) => (r.kind === 'group' ? r[key] : null),
  rate: key !== 'w',
});
const STREAKS = 'Consecutive regular-season games, carried across seasons. NFL.com-era Shit Bowl and Mediocre Bowl games were never recorded, so bracket games don’t count.';
const streak = (slug: string, name: string, table: 'winning' | 'losing' | 'top_half', qualification: string): RecordDef => ({
  slug, name, category: 'results', kind: 'streak', unit: 'count', dir: 'desc', eras: ERAS, phases: ['regular'],
  qualification, figure: none, table,
});

const rivalry = (slug: string, name: string, key: 'pct' | 'gp', qualification: string): RecordDef => ({
  slug, name, category: 'head-to-head', kind: 'rivalry', unit: key === 'pct' ? 'pct' : 'count', dir: 'desc',
  eras: ERAS, phases: PHASES, qualification, heading: key === 'pct' ? 'Win %' : 'Games',
  statsguru: { view: 'opp', minGames: key === 'pct' ? 6 : 0, sort: { key, dir: 'desc' } },
  // Reported games have no known opponent: they aren't anyone's rivalry.
  figure: (r) => (r.kind === 'group' && r.opponent ? r[key] : null),
  shared: key === 'gp',
});
const DIVISIONS = 'Each completed season’s divisions since 2015, their franchises’ regular-season lines summed.';
const division = (slug: string, name: string, measure: 'points_for' | 'wins', dir: 'asc' | 'desc'): RecordDef => ({
  slug, name, category: 'divisions', kind: 'division', unit: measure === 'wins' ? 'count' : 'points', dir,
  eras: ERAS, phases: ['regular'], measure, heading: measure === 'wins' ? 'Wins' : 'Points for',
  qualification: `${DIVISIONS}${measure === 'wins' ? ' A tie isn’t a win.' : ''}`, figure: none,
});
const SLEEPER: Era[] = ['sleeper'];
const lineup = (slug: string, name: string, measure: 'player' | 'bench', qualification: string): RecordDef => ({
  slug, name, category: 'sleeper', kind: 'lineup', unit: 'points', dir: 'desc', eras: SLEEPER, phases: PHASES,
  measure, qualification, figure: none, heading: measure === 'bench' ? 'Bench points' : 'Points',
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
    kind: 'lineup-season', unit: 'points', dir: 'desc', eras: SLEEPER, phases: ['regular'], measure: 'bench',
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

const BRACKET_RECORDS = [
  'Championships', 'Finals reached', 'Playoff appearances', 'Shit Bowl winner titles', 'Shit Bowl appearances',
  'Mediocre Bowl titles', 'Longest Playoff drought', 'Longest Playoff appearance streak',
];

export const CATEGORIES: Category[] = [
  built('scoring', 'Scoring'),
  built('results', 'Results and streaks'),
  pending('seasons', 'Seasons', [
    'Most and fewest wins', 'Most and fewest points for', 'Most and fewest points against',
    'Best and worst points per game', 'Best and worst Breakdown %',
  ]),
  pending('luck', 'Luck', ['Luckiest and unluckiest season', 'Career most points against per game']),
  {
    ...pending('brackets', 'Brackets', BRACKET_RECORDS),
    // The roll of honour already exists: the category links to it, not a copy (#14).
    records: [{ name: 'Roll of honour', href: '/seasons/' }, ...BRACKET_RECORDS.map((name) => ({ name }))],
  },
  built('head-to-head', 'Head-to-head'),
  { ...built('divisions', 'Divisions'), sub: 'Since 2015' },
  { ...built('sleeper', 'Sleeper era'), sub: 'Since 2025' },
];

export const recordDef = (slug: string) => RECORDS.find((r) => r.slug === slug);
export const categoryOf = (def: RecordDef) => CATEGORIES.find((c) => c.slug === def.category)!;

/** Every era and phase a record is shown for; the first is its own page. */
export const variants = (def: RecordDef) =>
  def.eras.flatMap((era) => def.phases.map((phase) => ({ era, phase })));
