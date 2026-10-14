// What the home page (#16, #35) shows: the current season's hub, in one of
// three phases. src/lib/home-db.ts fills it from the database and the build
// date; src/components/Home.astro renders it.
import type { SeasonFranchise } from './db';
import type { Column } from './bracket-columns';
import type { Phase } from './current';
import type { BracketKey, Mark } from './seeding';

/** A pairing of the week being played: never a score. */
export interface Matchup {
  /** Null for a regular-season game. */
  bracket: BracketKey | null;
  home: SeasonFranchise;
  away: SeasonFranchise;
}

export interface Result extends Matchup {
  homePoints: number;
  awayPoints: number;
  /** Null for a tie. */
  winnerId: number | null;
}

export interface Score {
  franchise: SeasonFranchise;
  points: number;
}

/** One line of the compact playoff picture, in seed order. */
export interface PictureLine {
  franchise: SeasonFranchise;
  bracket: BracketKey;
  seed: number;
  /** Level after every tiebreak but scissors-paper-rock. */
  shared: boolean;
  wins: number;
  losses: number;
  ties: number;
  /** Breakdown %, as a fraction. */
  breakdown: number | null;
  marks: Mark[];
}

export interface AwardLine {
  award: { slug: string; name: string };
  franchises: SeasonFranchise[];
  /** The value as it reads: 12.34, $22, 24.0%. */
  value: string;
}

/** An entry a franchise set this season in a record's top ten. */
export interface RecordLine {
  record: { slug: string; name: string };
  rank: number;
  franchises: { id: number; name: string }[];
  /** The figure as the record shows it. */
  figure: string;
}

export interface BracketView {
  key: BracketKey;
  columns: Column[];
  /** Once crowned. */
  winner: SeasonFranchise | null;
}

export interface HomeData {
  season: number;
  phase: Phase;
  through: number | null;
  playing: number | null;
  /** "Updated 14 October 2026". */
  updated: string;
  /** Every franchise of the season, by id (the bracket columns name them by id). */
  names: Record<number, SeasonFranchise>;
  /** The week being played. */
  thisWeek: Matchup[];
  /** The latest final week. */
  lastWeek: { results: Result[]; highest: Score | null; lowest: Score | null } | null;
  /** While the regular season is on. */
  picture: PictureLine[] | null;
  /** From the end of the regular season. */
  brackets: BracketView[];
  /** Leaders during the regular season, winners afterwards. */
  awards: AwardLine[];
  records: RecordLine[];
  /** In the off-season: who each bracket crowned (null if unknown). */
  honours: Record<BracketKey, SeasonFranchise | null> | null;
  /** In the off-season, once Sleeper has next season. draft is "1 September 2026" or null. */
  next: { season: number; draft: string | null } | null;
  /** The playoff predictor's URL (#36), while it exists for this season. */
  predictor: string | null;
}

export const BRACKET_NAMES: Record<BracketKey, string> = {
  playoffs: 'Playoffs',
  shit_bowl: 'Shit Bowl',
  mediocre_bowl: 'Mediocre Bowl',
};
export const BRACKET_ORDER: BracketKey[] = ['playoffs', 'mediocre_bowl', 'shit_bowl'];
