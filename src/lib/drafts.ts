// Drafts, keepers and lineups for the franchise profile's Sleeper-era section
// and the season page (#37): reads of draft_picks, lineups and nfl_players.
// A season's keepers are recorded once data/keepers.csv has rows for it;
// until then its picks have kept = null and the pages say so.
import { open } from './db';
import type { NflPlayer } from './nfl-players';

export interface DraftSeason {
  season: number;
  /** False while data/keepers.csv records none of the season's keepers. */
  keepersRecorded: boolean;
}

/** Every season with a draft, oldest first. */
export function draftSeasons(): DraftSeason[] {
  return open()
    .prepare(`select season, max(kept is not null) as recorded from draft_picks group by season order by season`)
    .all()
    .map((r: any) => ({ season: r.season, keepersRecorded: !!r.recorded }));
}

/** The largest round and overall pick any draft has, and the first draft's season. */
export function draftSize(): { lastRound: number; lastPick: number; firstSeason: number | null } {
  const r = open().prepare('select max(round) as rd, max(pick_no) as pk, min(season) as s from draft_picks').get() as any;
  return { lastRound: r?.rd ?? 1, lastPick: r?.pk ?? 1, firstSeason: r?.s ?? null };
}

export interface FranchisePick {
  season: number;
  pick: number;
  round: number;
  player: NflPlayer;
  /** The franchise whose slot it was, if not the picker's own. */
  from: { id: number; name: string } | null;
  kept: boolean | null;
}

const PICKS = `select d.season, d.pick_no as pick, d.round, d.nfl_player_id as pid, p.name, p.position, d.kept,
    d.franchise_id as fid, f.name as fname, d.slot_franchise_id as sid, s.name as sname
  from draft_picks d
  left join nfl_players p on p.id = d.nfl_player_id
  join franchises f on f.id = d.franchise_id
  join franchises s on s.id = d.slot_franchise_id`;

const toPick = (r: any): FranchisePick & { franchise: { id: number; name: string } } => ({
  season: r.season,
  pick: r.pick,
  round: r.round,
  player: { id: r.pid, name: r.name ?? null, position: r.position ?? null },
  from: r.sid === r.fid ? null : { id: r.sid, name: r.sname },
  kept: r.kept == null ? null : !!r.kept,
  franchise: { id: r.fid, name: r.fname },
});

/** The picks a franchise made, by season and pick. */
export function franchisePicks(franchiseId: number): FranchisePick[] {
  return open().prepare(`${PICKS} where d.franchise_id = ? order by d.season, d.pick_no`).all(franchiseId).map(toPick);
}

/** A season's keepers, by franchise name. */
export function seasonKeepers(season: number) {
  return open()
    .prepare(`${PICKS} where d.season = ? and d.kept = 1 order by f.name collate nocase`)
    .all(season)
    .map(toPick);
}

export interface Started {
  player: NflPlayer;
  starts: number;
  points: number;
}

/** The NFL players a franchise started most often in its games, then by points. */
export function mostStarted(franchiseId: number, limit = 10): Started[] {
  return open()
    .prepare(
      `select l.nfl_player_id as pid, p.name, p.position, count(*) as starts, round(sum(coalesce(l.points, 0)), 2) as points
       from lineups l
       join games g on g.season = l.season and g.week = l.week and g.status = 'final'
                   and l.franchise_id in (g.home_franchise_id, g.away_franchise_id)
       left join nfl_players p on p.id = l.nfl_player_id
       where l.franchise_id = ? and l.starter = 1 and l.nfl_player_id is not null
       group by l.nfl_player_id order by starts desc, points desc, l.nfl_player_id limit ?`,
    )
    .all(franchiseId, limit)
    .map((r: any) => ({ player: { id: r.pid, name: r.name ?? null, position: r.position ?? null }, starts: r.starts, points: r.points }));
}
