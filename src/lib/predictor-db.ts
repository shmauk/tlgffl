// The playoff predictor's inputs (#36), read from the league database at build
// time and shipped to the browser as JSON: the seeding module's input with
// each remaining game's week, the franchise names and the real clinch marks.
import { current } from './current';
import { open, seasonFormats, seasons } from './db';
import type { PredictorData } from './predictor';
import { seasonPicture, seedingInput } from './seeding-db';

/**
 * The season the predictor is for: the current season, while its regular
 * season is still being played (#16, #17). Null otherwise.
 */
export function predictorSeason(): number | null {
  const now = current();
  if (!now || now.phase !== 'regular') return null;
  if (seasons().find((s) => s.year === now.season)?.era !== 'sleeper') return null;
  return seedingInput(now.season)?.remaining.length ? now.season : null;
}

/** Everything the predictor needs for a season. */
export function predictorData(season: number): PredictorData {
  const input = seedingInput(season)!;
  const format = seasonFormats().find((f) => f.season === season)!;
  const db = open();
  const remaining = db
    .prepare(
      `select week, home_franchise_id as home, away_franchise_id as away
       from upcoming_games where season = ? order by week, rowid`,
    )
    .all(season) as PredictorData['input']['remaining'];
  const franchises = db
    .prepare(
      `select f.id, f.name, t.team_name as teamName
       from season_lines l join franchises f on f.id = l.franchise_id
       left join team_names t on t.franchise_id = l.franchise_id and t.season = l.season
       where l.season = ? order by f.id`,
    )
    .all(season) as PredictorData['franchises'];
  return {
    season,
    weeks: [format.regularSeason[0], format.regularSeason[1]],
    franchises: franchises.map((f) => ({ ...f, teamName: f.teamName ?? f.name })),
    input: { ...input, remaining },
    marks: seasonPicture(season)!.marks,
  };
}
