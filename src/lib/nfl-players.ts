// NFL players for Statsguru's form (#29): the ones in a lineup, the only ones
// a query can return, and the positions Sleeper gives them.
import { open } from './db';
import { positionRank } from './statsguru/query';

export interface NflPlayer {
  id: string;
  /** Null when no Sleeper snapshot knows the NFL player. */
  name: string | null;
  position: string | null;
}

/** Every NFL player in a lineup, A-Z by name, those with no name last. */
export function lineupPlayers(): NflPlayer[] {
  return open()
    .prepare(
      `select p.id, p.name, p.position from nfl_players p
       where exists (select 1 from lineups l where l.nfl_player_id = p.id)
       order by p.name is null, lower(p.name), p.id`,
    )
    .all()
    .map((r: any) => ({ id: r.id, name: r.name ?? null, position: r.position ?? null }));
}

/** The positions of the NFL players in lineups, in lineup order. */
export function lineupPositions(): string[] {
  const all = new Set(lineupPlayers().flatMap((p) => (p.position ? [p.position] : [])));
  return [...all].sort((a, b) => positionRank(a).localeCompare(positionRank(b)));
}
