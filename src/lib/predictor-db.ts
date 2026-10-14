// The playoff predictor's inputs (#36), read from the league database at build
// time and shipped to the browser as JSON: the seeding module's input with
// each remaining game's week, the franchise names and the real clinch marks.
import { current } from './current';
import { seasonFormats, seasonFranchise, seasons } from './db';
import type { Db } from './database';
import type { PredictorData } from './predictor';
import { seasonPicture, seedingInput } from './seeding-db';

/**
 * The season the predictor is for: the current season, while its regular
 * season is still being played (#16, #17). Null otherwise.
 */
export function predictorSeason(db: Db): number | null {
  const now = current(db);
  if (!now || now.phase !== 'regular') return null;
  if (seasons(db).find((s) => s.year === now.season)?.era !== 'sleeper') return null;
  return seedingInput(db, now.season)?.remaining.length ? now.season : null;
}

/** Everything the predictor needs for a season. */
export function predictorData(db: Db, season: number): PredictorData {
  const input = seedingInput(db, season)!;
  const format = seasonFormats(db).find((f) => f.season === season)!;
  const remaining = db
    .all(
      `select week, home_franchise_id as home, away_franchise_id as away
       from upcoming_games where season = ? order by week, rowid`,
      [season],
    ) as PredictorData['input']['remaining'];
  const franchise = seasonFranchise(db);
  const franchises = db
    .all('select franchise_id as id from season_lines where season = ? order by franchise_id', [season])
    .map((r) => franchise(season, r.id));
  return {
    season,
    weeks: [format.regularSeason[0], format.regularSeason[1]],
    franchises,
    input: { ...input, remaining },
    marks: seasonPicture(db, season)!.marks,
  };
}
