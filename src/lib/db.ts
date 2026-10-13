// The site's only way into the league database. Pages read it at build time
// and never derive figures of their own (ADR 0004).
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.TLGFFL_DB ?? 'build/league.sqlite';

let db: DatabaseSync | undefined;
function open(): DatabaseSync {
  db ??= new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

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

export function franchises(): Franchise[] {
  return open()
    .prepare(
      `select id, name, active, first_season as firstSeason, last_season as lastSeason
       from franchises order by name collate nocase`,
    )
    .all()
    .map((r) => ({ ...(r as unknown as Franchise), active: Boolean(r.active) }));
}

export function teamNames(franchiseId: number): TeamName[] {
  return open()
    .prepare(
      `select season, team_name as teamName from team_names
       where franchise_id = ? order by season`,
    )
    .all(franchiseId) as unknown as TeamName[];
}

export interface Season {
  year: number;
  era: 'nfl.com' | 'sleeper';
  teamCount: number;
}

/** Every season, newest first. */
export function seasons(): Season[] {
  return open()
    .prepare('select year, era, team_count as teamCount from seasons order by year desc')
    .all() as unknown as Season[];
}

export type BracketName = 'playoffs' | 'shit_bowl' | 'mediocre_bowl';

export interface SeasonFormat {
  season: number;
  teams: number;
  divisions: number;
  regularSeason: [number, number];
  /** The first season of the division cycle this season belongs to. */
  realignment?: number;
  tiebreaks?: string | null;
  brackets: {
    bracket: BracketName;
    size: number;
    firstWeek: number;
    lastWeek: number;
    series: string | null;
    seeding?: string | null;
  }[];
}

/** Every season's format (#11), oldest first. */
export function seasonFormats(): SeasonFormat[] {
  const brackets = open()
    .prepare(
      `select season, bracket, size, first_week as firstWeek, last_week as lastWeek, series, seeding
       from season_brackets`,
    )
    .all() as unknown as (SeasonFormat['brackets'][number] & { season: number })[];
  return open()
    .prepare(
      `select f.season, s.team_count as teams, f.divisions,
              f.regular_season_first_week as first, f.regular_season_last_week as last,
              f.realignment, f.tiebreaks
       from season_formats f join seasons s on s.year = f.season order by f.season`,
    )
    .all()
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

export interface LeagueDocument {
  kind: 'constitution' | 'agm';
  season: number | null;
  title: string;
  url: string;
}

/** The constitution and the AGM docs, in the order they are kept. */
export function documents(): LeagueDocument[] {
  return open()
    .prepare('select kind, season, title, url from documents order by rowid')
    .all() as unknown as LeagueDocument[];
}

/** The AGM docs for one season. */
export function seasonDocuments(season: number): LeagueDocument[] {
  return documents().filter((d) => d.kind === 'agm' && d.season === season);
}

const LINE_COLUMNS = `l.season, l.source, l.wins, l.losses, l.ties, l.points_for as pointsFor,
  l.points_against as pointsAgainst, l.division, l.seed, l.final_placing as finalPlacing`;

/** A franchise's season lines as the site shows them (ADR 0001). */
export function seasonLines(franchiseId: number): SeasonLine[] {
  return open()
    .prepare(`select ${LINE_COLUMNS} from season_lines l where franchise_id = ? order by season`)
    .all(franchiseId) as unknown as SeasonLine[];
}

/** A franchise as a season shows it: its name, and the team name it played under. */
export interface SeasonFranchise {
  id: number;
  name: string;
  teamName: string;
}

export interface Standing extends SeasonLine {
  franchise: SeasonFranchise;
  /** NFL.com's bracket type: 'championship' is the Playoffs. */
  bracket: string | null;
  breakdownWins: number | null;
  breakdownLosses: number | null;
  breakdownTies: number | null;
  luck: number | null;
}

/** A season's lines, by division and then final placing. */
export function seasonStandings(season: number): Standing[] {
  return open()
    .prepare(
      `select ${LINE_COLUMNS}, l.bracket, l.breakdown_wins as breakdownWins,
              l.breakdown_losses as breakdownLosses, l.breakdown_ties as breakdownTies, l.luck,
              f.id as fid, f.name, t.team_name as teamName
       from season_lines l join franchises f on f.id = l.franchise_id
       join team_names t on t.franchise_id = l.franchise_id and t.season = l.season
       where l.season = ? order by l.division, l.final_placing, f.name`,
    )
    .all(season)
    .map(({ fid, name, teamName, ...l }: any) => ({ ...l, franchise: { id: fid, name, teamName } }));
}

export interface Game {
  id: number;
  week: number;
  phase: 'regular' | 'bracket';
  bracket: BracketName | null;
  round: number | null;
  home: SeasonFranchise;
  homePoints: number | null;
  away: SeasonFranchise;
  awayPoints: number | null;
  /** Null for a tie. */
  winnerId: number | null;
}

const side = (r: any, p: string): SeasonFranchise => ({ id: r[`${p}Id`], name: r[`${p}Name`], teamName: r[`${p}Team`] });

/** A season's games, by week. A bracket game whose score is lost has null points. */
export function seasonGames(season: number): Game[] {
  return open()
    .prepare(
      `select g.id, g.week, g.phase, g.bracket, g.round, g.home_points as homePoints,
              g.away_points as awayPoints, g.winner_franchise_id as winnerId,
              h.id as homeId, h.name as homeName, ht.team_name as homeTeam,
              a.id as awayId, a.name as awayName, at.team_name as awayTeam
       from games g
       join franchises h on h.id = g.home_franchise_id
       join team_names ht on ht.franchise_id = h.id and ht.season = g.season
       join franchises a on a.id = g.away_franchise_id
       join team_names at on at.franchise_id = a.id and at.season = g.season
       where g.season = ? order by g.week, g.phase, g.round, g.id`,
    )
    .all(season)
    .map((r: any) => ({
      id: r.id,
      week: r.week,
      phase: r.phase,
      bracket: r.bracket,
      round: r.round,
      home: side(r, 'home'),
      homePoints: r.homePoints,
      away: side(r, 'away'),
      awayPoints: r.awayPoints,
      winnerId: r.winnerId,
    }));
}

export interface BracketWinner {
  bracket: BracketName;
  /** Null when nobody recorded it. */
  franchise: SeasonFranchise | null;
  source: 'derived' | 'confirmed' | 'recalled' | 'disputed' | 'unknown';
}

/** Who each of the season's brackets crowned; a disputed one lists every candidate. */
export function bracketWinners(season: number): BracketWinner[] {
  return open()
    .prepare(
      `select w.bracket, w.source, f.id, f.name, t.team_name as teamName
       from bracket_winners w left join franchises f on f.id = w.franchise_id
       left join team_names t on t.franchise_id = f.id and t.season = w.season
       where w.season = ? order by w.bracket, f.name`,
    )
    .all(season)
    .map((r: any) => ({
      bracket: r.bracket,
      source: r.source,
      franchise: r.id == null ? null : { id: r.id, name: r.name, teamName: r.teamName },
    }));
}

export interface HighLow {
  measure: 'highest_score' | 'lowest_score' | 'biggest_margin' | 'narrowest_margin';
  value: number;
  franchise: SeasonFranchise;
  game: Game;
}

/** The season's highest and lowest scores and biggest and narrowest wins. */
export function highsAndLows(season: number): HighLow[] {
  const games = new Map(seasonGames(season).map((g) => [g.id, g]));
  return open()
    .prepare(
      `select measure, value, game_id as gameId, franchise_id as fid from season_highs_lows
       where season = ? order by game_id`,
    )
    .all(season)
    .map((r: any) => {
      const game = games.get(r.gameId)!;
      return { measure: r.measure, value: r.value, game, franchise: game.home.id === r.fid ? game.home : game.away };
    });
}

/** Weeks of a phase whose games don't all have a score (ADR 0001's gaps). */
export function gapWeeks(season: number, phase: 'regular' | 'bracket'): number[] {
  return open()
    .prepare('select week from coverage where season = ? and phase = ? and not complete order by week')
    .all(season, phase)
    .map((r: any) => r.week);
}

/** One season of the roll of honour (#24). */
export interface Honours {
  season: Season;
  /** Null until the season's Playoffs final is recorded. */
  champion: SeasonFranchise | null;
  /** The Playoffs final's loser; null with the champion. */
  runnerUp: SeasonFranchise | null;
}

/** Every season's champion and runner-up, newest first. */
export function rollOfHonour(): Honours[] {
  // The Playoffs final is each season's last-round Playoffs game.
  const finals = open()
    .prepare(
      `select g.season, g.winner_franchise_id as winnerId,
              case when g.winner_franchise_id = g.home_franchise_id then g.away_franchise_id
                   else g.home_franchise_id end as loserId
       from games g
       where g.bracket = 'playoffs' and g.winner_franchise_id is not null
         and g.round = (select max(round) from games m where m.season = g.season and m.bracket = 'playoffs')`,
    )
    .all() as unknown as { season: number; winnerId: number; loserId: number }[];
  const named = open().prepare(
    `select f.id, f.name, t.team_name as teamName from franchises f
     join team_names t on t.franchise_id = f.id and t.season = ? where f.id = ?`,
  );
  const franchise = (season: number, id: number | undefined) =>
    id === undefined ? null : (named.get(season, id) as unknown as SeasonFranchise);
  return seasons().map((season) => {
    const final = finals.find((f) => f.season === season.year);
    return {
      season,
      champion: franchise(season.year, final?.winnerId),
      runnerUp: franchise(season.year, final?.loserId),
    };
  });
}

/** Every week with games in the season, regular season and brackets. */
export function seasonWeeks(season: number): number[] {
  return open()
    .prepare(
      `select week from coverage where season = ? union select week from games where season = ? order by week`,
    )
    .all(season, season)
    .map((r: any) => r.week);
}
