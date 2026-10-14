// The entries of the division and Sleeper-era records (#7, #32), read from the
// tables recordbook/divisions.py and recordbook/lineup_records.py write. Head-
// to-head records are saved Statsguru queries, so they live in records.ts.
// Nothing here derives a figure: it only reads and filters.
import type { Db } from '../database';
import type { RecordDef } from './catalogue';
import type { Entry, RecordFranchise } from './records';

type Franchise = (id: number) => RecordFranchise;

export function divisionEntries(
  db: Db, def: RecordDef, inEra: (season: number) => boolean, franchise: Franchise, current: number,
): Entry[] {
  const members = new Map<string, RecordFranchise[]>();
  for (const r of db.all('select season, division, franchise_id as f from season_lines order by franchise_id'))
    members.set(`${r.season}|${r.division}`, [...(members.get(`${r.season}|${r.division}`) ?? []), franchise(r.f)]);
  return db
    .all('select * from record_divisions order by season, division')
    .filter((r) => inEra(r.season))
    .map((r) => {
      const all = members.get(`${r.season}|${r.division}`)!;
      return {
        rank: null, value: def.measure === 'wins' ? r.wins : r.points_for, franchise: all[0], members: all,
        division: { name: r.division, lineage: r.lineage_name }, at: { season: r.season, week: 0 },
        seasons: [r.season, r.season], wlt: [r.wins, r.losses, r.ties], score: [r.points_for, r.points_against],
        reported: !!r.reported, thisSeason: r.season === current,
      };
    });
}

export function lineupEntries(db: Db, def: RecordDef, phase: string, franchise: Franchise, current: number): Entry[] {
  if (def.kind === 'lineup-season')
    return db
      .all('select season, franchise_id as f, points, games from record_bench_seasons order by season, franchise_id')
      .map((r) => ({
        rank: null, value: r.points, franchise: franchise(r.f), seasons: [r.season, r.season], games: r.games,
        thisSeason: r.season === current,
      }));
  const player = def.measure === 'player';
  return db
    .all(
      `select r.season, r.week, r.franchise_id as f, r.points,
              case when g.home_franchise_id = r.franchise_id then g.away_franchise_id else g.home_franchise_id end as o
              ${player ? ', r.nfl_player_id as pid, r.player_name as name, r.position as pos' : ''}
       from ${player ? 'record_player_scores' : 'record_bench_games'} r join games g on g.id = r.game_id
       where ${phase} order by r.season, r.week, r.franchise_id`,
    )
    .map((r) => ({
      rank: null, value: r.points, franchise: franchise(r.f), opponent: franchise(r.o),
      at: { season: r.season, week: r.week }, thisSeason: r.season === current,
      ...(player ? { player: { id: r.pid, name: r.name, position: r.pos } } : {}),
    }));
}
