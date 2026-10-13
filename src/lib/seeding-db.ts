// The seeding module (ADR 0005) fed from the league database: the playoff
// picture, clinch marks and the seed check for Sleeper-era seasons. Python
// writes every input (games, divisions, upcoming games, the format and the
// scissors-paper-rock rulings); only the seeding module derives seeds.
import { open, seasonFormats } from './db';
import {
  checkSeeds,
  clinchMarks,
  playoffPicture,
  type BracketGame,
  type BracketKey,
  type Mark,
  type Place,
  type SeedingInput,
} from './seeding';

/** The seeding module's input for a Sleeper season with games, or null. */
export function seedingInput(season: number): SeedingInput | null {
  const db = open();
  const era = db.prepare('select era from seasons where year = ?').get(season) as { era: string } | undefined;
  const format = seasonFormats().find((f) => f.season === season);
  if (era?.era !== 'sleeper' || !format) return null;
  const lines = db
    .prepare(
      `select franchise_id as id, division, breakdown_wins as w, breakdown_losses as l, breakdown_ties as t
       from season_lines where season = ?`,
    )
    .all(season) as { id: number; division: string | null; w: number | null; l: number | null; t: number | null }[];
  if (!lines.length) return null;
  const played = db
    .prepare(
      `select home_franchise_id as home, away_franchise_id as away, winner_franchise_id as winner
       from games where season = ? and phase = 'regular'`,
    )
    .all(season) as SeedingInput['played'];
  const remaining = db
    .prepare('select home_franchise_id as home, away_franchise_id as away from upcoming_games where season = ?')
    .all(season) as SeedingInput['remaining'];
  const rulings = db
    .prepare('select ruling, franchise_id as f from scissors_paper_rock where season = ? order by ruling, position')
    .all(season) as { ruling: number; f: number }[];
  const size = (b: BracketKey) => format.brackets.find((x) => x.bracket === b)?.size ?? 0;
  return {
    franchises: lines.map((l) => ({ id: l.id, division: l.division ?? '' })),
    played,
    remaining,
    breakdown: Object.fromEntries(
      lines.map((l) => {
        const n = (l.w ?? 0) + (l.l ?? 0) + (l.t ?? 0);
        return [l.id, n ? ((l.w ?? 0) + (l.t ?? 0) / 2) / n : 0];
      }),
    ),
    brackets: { playoffs: size('playoffs'), mediocre_bowl: size('mediocre_bowl'), shit_bowl: size('shit_bowl') },
    spr: [...new Set(rulings.map((r) => r.ruling))].map((n) => rulings.filter((r) => r.ruling === n).map((r) => r.f)),
  };
}

export interface SeasonPicture {
  places: Place[];
  /** Clinch and elimination marks, while the regular season is still being played. */
  marks: Record<number, Mark[]>;
  /** True until every regular-season game is final. */
  inProgress: boolean;
}

/** A Sleeper season's seeds as they stand (the playoff picture), or null for an NFL.com season. */
export function seasonPicture(season: number): SeasonPicture | null {
  const input = seedingInput(season);
  if (!input) return null;
  const format = seasonFormats().find((f) => f.season === season)!;
  const weeks = open()
    .prepare(`select count(distinct week) as n from games where season = ? and phase = 'regular'`)
    .get(season) as { n: number };
  const length = format.regularSeason[1] - format.regularSeason[0] + 1;
  const inProgress = input.remaining.length > 0 || weeks.n < length;
  return { places: playoffPicture(input), marks: inProgress ? clinchMarks(input) : {}, inProgress };
}

/** A season's bracket games, as the seed check reads them. */
export function bracketGames(season: number): BracketGame[] {
  return open()
    .prepare(
      `select bracket, round, home_franchise_id as home, away_franchise_id as away, winner_franchise_id as winner
       from games where season = ? and phase = 'bracket'`,
    )
    .all(season) as unknown as BracketGame[];
}

/**
 * Where a finished Sleeper season's computed seeds disagree with the
 * brackets played (empty while its regular season is still on, or before
 * its brackets start).
 */
export function seedProblems(season: number, played: BracketGame[] = bracketGames(season)): string[] {
  const picture = seasonPicture(season);
  if (!picture || picture.inProgress || !played.length) return [];
  const names = new Map(
    (open().prepare('select id, name from franchises').all() as { id: number; name: string }[]).map((f) => [f.id, f.name]),
  );
  return checkSeeds(picture.places, played, { name: (f) => names.get(f) ?? String(f) }).map((p) => `${season} ${p}`);
}

/** Fails the build if any finished Sleeper season's seeds disagree with its brackets (ADR 0005). */
export function checkSleeperSeeds(): void {
  const years = open().prepare(`select year from seasons where era = 'sleeper'`).all() as { year: number }[];
  const problems = years.flatMap(({ year }) => seedProblems(year));
  if (problems.length)
    throw new Error(`computed seeds disagree with the brackets played (ADR 0005):\n  ${problems.join('\n  ')}`);
}
