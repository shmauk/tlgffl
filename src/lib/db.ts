// The league database's core readers. Like every reader, each takes the
// database (src/lib/database.ts) first: a page opens it once and passes it in.
// Pages read it at build time and never derive figures of their own (ADR 0004).
import type { BracketKey, CrownSource } from './brackets';
import type { Db } from './database';

export interface Franchise {
  id: number;
  name: string;
  active: boolean;
  firstSeason: number;
  lastSeason: number;
}

export interface TeamName {
  season: number;
  teamName: string;
}

export interface SeasonLine {
  season: number;
  /** 'reported' where the season's games don't all survive (ADR 0001). */
  source: 'derived' | 'reported';
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  division: string | null;
  seed: number | null;
  finalPlacing: number | null;
}

export function franchises(db: Db): Franchise[] {
  return db
    .all(
      `select id, name, active, first_season as firstSeason, last_season as lastSeason
       from franchises order by name collate nocase`,
    )
    .map((r) => ({ ...(r as unknown as Franchise), active: Boolean(r.active) }));
}

export function teamNames(db: Db, franchiseId: number): TeamName[] {
  return db
    .all(
      `select season, team_name as teamName from team_names
       where franchise_id = ? order by season`,
      [franchiseId],
    ) as unknown as TeamName[];
}

export interface Season {
  year: number;
  era: 'nfl.com' | 'sleeper';
  teamCount: number;
  /** Over, as the build decided (recordbook/current.py): not in progress or still to start. */
  finished: boolean;
}

/** Every season, newest first. */
export function seasons(db: Db): Season[] {
  return db
    .all('select year, era, team_count as teamCount, finished from seasons order by year desc')
    .map((r: any) => ({ ...r, finished: Boolean(r.finished) }));
}


export interface SeasonFormat {
  season: number;
  teams: number;
  divisions: number;
  regularSeason: [number, number];
  /** The first season of the division cycle this season belongs to. */
  realignment?: number;
  tiebreaks?: string | null;
  brackets: {
    bracket: BracketKey;
    size: number;
    firstWeek: number;
    lastWeek: number;
    series: string | null;
    seeding?: string | null;
  }[];
}

/** Every season's format (#11), oldest first. */
export function seasonFormats(db: Db): SeasonFormat[] {
  const brackets = db
    .all(
      `select season, bracket, size, first_week as firstWeek, last_week as lastWeek, series, seeding
       from season_brackets`,
    ) as unknown as (SeasonFormat['brackets'][number] & { season: number })[];
  return db
    .all(
      `select f.season, s.team_count as teams, f.divisions,
              f.regular_season_first_week as first, f.regular_season_last_week as last,
              f.realignment, f.tiebreaks
       from season_formats f join seasons s on s.year = f.season order by f.season`,
    )
    .map((r: any) => ({
      season: r.season,
      teams: r.teams,
      divisions: r.divisions,
      regularSeason: [r.first, r.last],
      realignment: r.realignment,
      tiebreaks: r.tiebreaks,
      brackets: brackets.filter((b) => b.season === r.season).map(({ season, ...b }) => b),
    }));
}

/** One bracket's format in one season, which must have it. */
export function bracketFormat(formats: SeasonFormat[], season: number, bracket: BracketKey): SeasonFormat['brackets'][number] {
  return formats.find((f) => f.season === season)!.brackets.find((b) => b.bracket === bracket)!;
}

export interface LeagueDocument {
  kind: 'constitution' | 'agm';
  season: number | null;
  title: string;
  url: string;
}

/** The constitution and the AGM docs, in the order they are kept. */
export function documents(db: Db): LeagueDocument[] {
  return db
    .all('select kind, season, title, url from documents order by rowid') as unknown as LeagueDocument[];
}

/** The AGM docs for one season. */
export function seasonDocuments(db: Db, season: number): LeagueDocument[] {
  return documents(db).filter((d) => d.kind === 'agm' && d.season === season);
}

const LINE_COLUMNS = `l.season, l.source, l.wins, l.losses, l.ties, l.points_for as pointsFor,
  l.points_against as pointsAgainst, l.division, l.seed, l.final_placing as finalPlacing`;

/** A franchise's season lines as the site shows them (ADR 0001). */
export function seasonLines(db: Db, franchiseId: number): SeasonLine[] {
  return db
    .all(`select ${LINE_COLUMNS} from season_lines l where franchise_id = ? order by season`, [franchiseId]) as unknown as SeasonLine[];
}

/** A franchise as a season shows it: its name, and the team name it played under. */
export interface SeasonFranchise {
  id: number;
  name: string;
  teamName: string;
}

/**
 * Every franchise as each season shows it. The build gives a franchise a team
 * name for every season it plays (ADR 0004); one without goes by its
 * franchise name, so nothing it played is ever dropped.
 */
export function seasonFranchise(db: Db): (season: number, franchiseId: number) => SeasonFranchise {
  const names = new Map<number, string>();
  const teamNames = new Map<string, string>();
  for (const r of db.all(
    `select f.id, f.name, t.season, t.team_name as teamName
     from franchises f left join team_names t on t.franchise_id = f.id`,
  )) {
    names.set(r.id, r.name);
    if (r.season != null) teamNames.set(`${r.season}-${r.id}`, r.teamName);
  }
  return (season, id) => {
    const name = names.get(id)!;
    return { id, name, teamName: teamNames.get(`${season}-${id}`) ?? name };
  };
}

export interface Standing extends SeasonLine {
  franchise: SeasonFranchise;
  /** NFL.com's bracket type ('championship' is the Playoffs), or on Sleeper the bracket played in. */
  bracket: string | null;
  breakdownWins: number | null;
  breakdownLosses: number | null;
  breakdownTies: number | null;
  luck: number | null;
}

/** A season's lines, by division and then final placing. */
export function seasonStandings(db: Db, season: number): Standing[] {
  const franchise = seasonFranchise(db);
  return db
    .all(
      `select ${LINE_COLUMNS}, l.bracket, l.breakdown_wins as breakdownWins,
              l.breakdown_losses as breakdownLosses, l.breakdown_ties as breakdownTies, l.luck,
              l.franchise_id as fid
       from season_lines l join franchises f on f.id = l.franchise_id
       where l.season = ? order by l.division, l.final_placing, f.name`,
      [season],
    )
    .map(({ fid, ...l }: any) => ({ ...l, franchise: franchise(season, fid) }));
}

export interface Game {
  id: number;
  week: number;
  phase: 'regular' | 'bracket';
  bracket: BracketKey | null;
  round: number | null;
  home: SeasonFranchise;
  homePoints: number | null;
  away: SeasonFranchise;
  awayPoints: number | null;
  /** Null for a tie. */
  winnerId: number | null;
  /** From a tied knockout game, the franchise that went on (#43). */
  advancedId: number | null;
}

/** The columns a Game is read from, for the games table as g. */
export const GAME_COLUMNS = `g.id, g.season, g.week, g.phase, g.bracket, g.round, g.home_points as homePoints,
  g.away_points as awayPoints, g.winner_franchise_id as winnerId, g.advanced_franchise_id as advancedId,
  g.home_franchise_id as homeId, g.away_franchise_id as awayId`;

/** A Game from a row of GAME_COLUMNS, each side as its season shows it. */
export const toGame =
  (franchise: ReturnType<typeof seasonFranchise>) =>
  (r: any): Game & { season: number } => ({
    id: r.id,
    season: r.season,
    week: r.week,
    phase: r.phase,
    bracket: r.bracket,
    round: r.round,
    home: franchise(r.season, r.homeId),
    homePoints: r.homePoints,
    away: franchise(r.season, r.awayId),
    awayPoints: r.awayPoints,
    winnerId: r.winnerId,
    advancedId: r.advancedId,
  });

/** A season's games, by week. A bracket game whose score is lost has null points. */
export function seasonGames(db: Db, season: number): Game[] {
  return db
    .all(`select ${GAME_COLUMNS} from games g where g.season = ? order by g.week, g.phase, g.round, g.id`, [season])
    .map(toGame(seasonFranchise(db)))
    .map(({ season: _, ...g }) => g);
}

export interface BracketWinner {
  bracket: BracketKey;
  /** Null when nobody recorded it. */
  franchise: SeasonFranchise | null;
  source: CrownSource | 'unknown';
}

/** Who each of the season's brackets crowned; a disputed one lists every candidate. */
export function bracketWinners(db: Db, season: number): BracketWinner[] {
  const franchise = seasonFranchise(db);
  return db
    .all(
      `select w.bracket, w.source, w.franchise_id as fid
       from bracket_winners w left join franchises f on f.id = w.franchise_id
       where w.season = ? order by w.bracket, f.name`,
      [season],
    )
    .map((r: any) => ({
      bracket: r.bracket,
      source: r.source,
      franchise: r.fid == null ? null : franchise(season, r.fid),
    }));
}

export interface HighLow {
  measure: 'highest_score' | 'lowest_score' | 'biggest_margin' | 'narrowest_margin';
  value: number;
  franchise: SeasonFranchise;
  game: Game;
}

/** The season's highest and lowest scores and biggest and narrowest wins. */
export function highsAndLows(db: Db, season: number): HighLow[] {
  const games = new Map(seasonGames(db, season).map((g) => [g.id, g]));
  return db
    .all(
      `select measure, value, game_id as gameId, franchise_id as fid from season_highs_lows
       where season = ? order by game_id`,
      [season],
    )
    .map((r: any) => {
      const game = games.get(r.gameId)!;
      return { measure: r.measure, value: r.value, game, franchise: game.home.id === r.fid ? game.home : game.away };
    });
}

/** Weeks of a phase whose games don't all have a score (ADR 0001's gaps). */
export function gapWeeks(db: Db, season: number, phase: 'regular' | 'bracket'): number[] {
  return db
    .all('select week from coverage where season = ? and phase = ? and not complete order by week', [season, phase])
    .map((r: any) => r.week);
}

/** One season of the roll of honour (#24). */
export interface Honours {
  season: Season;
  /** Null until the season's Playoffs final is recorded. */
  champion: SeasonFranchise | null;
  /** The Playoffs final's loser; null with the champion. */
  runnerUp: SeasonFranchise | null;
  /** Empty until recorded; a single 'unknown' row when nobody recorded it. */
  shitBowl: BracketWinner[];
  /** Null for a season that had no Mediocre Bowl (before 2015). */
  mediocreBowl: BracketWinner[] | null;
}

/** Every finished season's champion and runner-up, newest first: the season in progress has no row (#24). */
export function rollOfHonour(db: Db): Honours[] {
  // The Playoffs' finalists, from their bracket runs (#43): a tied final's champion is the higher seed.
  const finals = db
    .all(
      `select c.season, c.franchise_id as winnerId, r.franchise_id as loserId
       from bracket_runs c join bracket_runs r on r.season = c.season and r.bracket = 'playoffs' and r.result = 'runner_up'
       where c.bracket = 'playoffs' and c.result = 'crowned'`,
    ) as unknown as { season: number; winnerId: number; loserId: number }[];
  const named = seasonFranchise(db);
  const franchise = (season: number, id: number | undefined) => (id === undefined ? null : named(season, id));
  const formats = new Map(seasonFormats(db).map((f) => [f.season, f]));
  return seasons(db).flatMap((season) => {
    const final = finals.find((f) => f.season === season.year);
    if (!season.finished || !final) return [];
    const winners = bracketWinners(db, season.year);
    const hasMediocreBowl = formats.get(season.year)?.brackets.some((b) => b.bracket === 'mediocre_bowl');
    return [{
      season,
      champion: franchise(season.year, final.winnerId),
      runnerUp: franchise(season.year, final.loserId),
      shitBowl: winners.filter((w) => w.bracket === 'shit_bowl'),
      mediocreBowl: hasMediocreBowl ? winners.filter((w) => w.bracket === 'mediocre_bowl') : null,
    }];
  });
}

/** Every week with games in the season, regular season and brackets. */
export function seasonWeeks(db: Db, season: number): number[] {
  return db
    .all(`select week from coverage where season = ? union select week from games where season = ? order by week`, [season, season])
    .map((r: any) => r.week);
}

/** A game the league leaves out of the records (data/record_exclusions.csv). */
export interface RecordExclusion {
  gameId: number;
  season: number;
  week: number;
  franchise: { id: number; name: string };
  opponent: { id: number; name: string };
  reason: string;
}

/** Every game left out of the records, oldest first. */
export function recordExclusions(db: Db): RecordExclusion[] {
  return db
    .all(
      `select e.game_id as gameId, g.season, g.week, e.reason, f.id as fid, f.name as fname, o.id as oid, o.name as oname
       from record_exclusions e
       join games g on g.id = e.game_id
       join franchises f on f.id = e.franchise_id
       join franchises o on o.id = case when g.home_franchise_id = e.franchise_id then g.away_franchise_id else g.home_franchise_id end
       order by g.season, g.week, g.id`,
    )
    .map((r: any) => ({
      gameId: r.gameId, season: r.season, week: r.week, reason: r.reason,
      franchise: { id: r.fid, name: r.fname }, opponent: { id: r.oid, name: r.oname },
    }));
}

/** The note where a game is left out: whose game, and why. */
export const exclusionNote = (x: RecordExclusion) =>
  `${x.franchise.name}’s ${x.season} week ${x.week} game v ${x.opponent.name} is left out: ${x.reason}`;
