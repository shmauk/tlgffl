// Statsguru's draft-picks subject (#37): every pick of the Sleeper-era drafts,
// with the franchise that made it and the franchise whose slot it was. Drafts
// are only known from 2025 until the NFL.com-era boards are converted (#18).
// A keeper is a pick recorded in data/keepers.csv; until a season's keepers
// are recorded its picks can't be told apart, and count as drafted.
import type { Db, Named } from './engine';
import type { NflPlayer } from './lineups';
import { positionRank, type Query } from './query';

/** One draft pick. */
export interface PickRow {
  kind: 'pick';
  season: number;
  /** Overall pick number. */
  pick: number;
  round: number;
  /** The franchise that made the pick. */
  franchise: Named;
  /** The franchise whose slot it was: another franchise for a traded pick. */
  slotFranchise: Named;
  player: NflPlayer;
  /** Null while the season's keepers aren't recorded. */
  kept: boolean | null;
  /** Pick value: the points the NFL player scored in the picking franchise's starting lineups that season. */
  value: number;
}

/** One franchise's picks at one position or in one round. */
export interface PickGroupRow {
  kind: 'pickGroup';
  franchise: Named;
  /** The NFL player position (null if unknown) or the round. */
  group: string | number | null;
  n: number;
  dr: number;
  kc: number;
  /** The highest (lowest-numbered) overall pick. */
  top: number;
  value: number;
}

/** One NFL player across every draft in the query. */
export interface PickPlayerRow {
  kind: 'pickPlayer';
  player: NflPlayer;
  n: number;
  dr: number;
  kc: number;
  /** The highest pick they went at. */
  top: { season: number; pick: number };
  /** The franchises that picked or kept them. */
  franchises: Named[];
  value: number;
}

export interface DraftPick {
  season: number;
  pick: number;
  round: number;
  f: number;
  slot: number;
  player: NflPlayer;
  kept: boolean | null;
  value: number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Every draft pick in the database, in draft order. */
export function draftPicks(db: Db): DraftPick[] {
  return db
    .all(
      `select d.season, d.pick_no, d.round, d.franchise_id as f, d.slot_franchise_id as slot, d.nfl_player_id as pid,
              d.kept, p.name, p.position,
              (select coalesce(sum(l.points), 0) from lineups l
               join games g on g.season = l.season and g.week = l.week and g.status = 'final'
                           and l.franchise_id in (g.home_franchise_id, g.away_franchise_id)
               where l.season = d.season and l.franchise_id = d.franchise_id
                 and l.nfl_player_id = d.nfl_player_id and l.starter = 1) as value
       from draft_picks d left join nfl_players p on p.id = d.nfl_player_id
       order by d.season, d.pick_no`,
    )
    .map((r) => ({
      season: r.season,
      pick: r.pick_no,
      round: r.round,
      f: r.f,
      slot: r.slot,
      player: { id: r.pid, name: r.name ?? null, position: r.position ?? null },
      kept: r.kept == null ? null : !!r.kept,
      value: round2(r.value),
    }));
}

/** The draft-pick subject's rows for a query, over the given seasons. */
export function pickRows(
  db: Db,
  q: Query,
  seasons: Set<number>,
  named: (id: number) => Named,
): (PickRow | PickGroupRow | PickPlayerRow)[] {
  const inSpan = (n: number, span: [number, number] | null) => !span || (n >= span[0] && n <= span[1]);
  const side = (p: DraftPick) => (q.franchiseAs === 'slot' ? p.slot : p.f);
  const picks = draftPicks(db).filter(
    (p) =>
      seasons.has(p.season) &&
      inSpan(p.round, q.rounds) &&
      inSpan(p.pick, q.picks) &&
      (!q.franchises.length || q.franchises.includes(side(p))) &&
      (!q.players.length || q.players.includes(p.player.id)) &&
      (!q.positions.length || q.positions.includes(p.player.position ?? '')) &&
      (!q.kept || (q.kept === 'kept') === (p.kept === true)),
  );
  if (q.view === 'fr') {
    const acc = new Map<string, PickGroupRow>();
    for (const p of picks) {
      const group = q.grouping === 'round' ? p.round : p.player.position;
      const k = `${side(p)}|${group}`;
      if (!acc.has(k))
        acc.set(k, { kind: 'pickGroup', franchise: named(side(p)), group, n: 0, dr: 0, kc: 0, top: p.pick, value: 0 });
      const a = acc.get(k)!;
      a.n++;
      if (p.kept) a.kc++;
      else a.dr++;
      a.top = Math.min(a.top, p.pick);
      a.value = round2(a.value + p.value);
    }
    return [...acc.values()];
  }
  if (q.view === 'pl') {
    const acc = new Map<string, PickPlayerRow & { ids: Set<number> }>();
    for (const p of picks) {
      if (!acc.has(p.player.id))
        acc.set(p.player.id, {
          kind: 'pickPlayer', player: p.player, n: 0, dr: 0, kc: 0,
          top: { season: p.season, pick: p.pick }, franchises: [], value: 0, ids: new Set(),
        });
      const a = acc.get(p.player.id)!;
      a.n++;
      if (p.kept) a.kc++;
      else a.dr++;
      if (p.pick < a.top.pick) a.top = { season: p.season, pick: p.pick };
      a.ids.add(p.f);
      a.value = round2(a.value + p.value);
    }
    return [...acc.values()].map(({ ids, ...a }) => ({
      ...a,
      franchises: [...ids].map(named).sort((x, y) => x.name.localeCompare(y.name)),
    }));
  }
  return picks.map((p) => ({
    kind: 'pick',
    season: p.season,
    pick: p.pick,
    round: p.round,
    franchise: named(p.f),
    slotFranchise: named(p.slot),
    player: p.player,
    kept: p.kept,
    value: p.value,
  }));
}

/** The group a per-franchise row sorts by: positions in lineup order, rounds in number order. */
export const groupRank = (r: PickGroupRow): number | string =>
  typeof r.group === 'number' ? r.group : positionRank(r.group);
