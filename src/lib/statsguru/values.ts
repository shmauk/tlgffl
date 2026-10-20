// The raw value of any results column in any row, keyed by the column's sort
// key: a number for a figure, a label for a text column, null when the row has
// none. The results table formats these into cells, and a chart reads the same
// values, so the two can never disagree.
import { nflPlayerName } from '../urls';
import type {
  GameRow, GapRow, GroupRow, NflPlayer, PerformanceRow, PickGroupRow, PickPlayerRow, PickRow, PlayerRow, PositionRow, Row,
} from './engine';
import type { Phase } from './query';

export type Value = number | string | null;

export const PHASE_NAMES: Record<Phase, string> = {
  R: 'Regular season',
  P: 'Playoffs',
  C: 'Shit Bowl and Mediocre Bowl',
};

/** A row's raw value for a column. */
export function columnValue(r: Row, key: string): Value {
  switch (r.kind) {
    case 'group': return groupValue(r, key);
    case 'game': return gameValue(r, key);
    case 'reported':
    case 'unchecked': return gapValue(r, key);
    case 'position': return positionValue(r, key);
    case 'player': return playerValue(r, key);
    case 'performance': return performanceValue(r, key);
    case 'pick': return pickValue(r, key);
    case 'pickGroup': return pickGroupValue(r, key);
    case 'pickPlayer': return pickPlayerValue(r, key);
  }
}

const own = (r: object, key: string): Value => (r as any)[key] ?? null;

function groupValue(r: GroupRow, key: string): Value {
  switch (key) {
    case 'f': return r.franchise.name;
    case 'o': return r.opponent?.name ?? null;
    case 's': return r.season;
    case 'ph': return r.phase ? PHASE_NAMES[r.phase] : null;
    default: return own(r, key);
  }
}

function gameValue(r: GameRow, key: string): Value {
  switch (key) {
    case 's': return r.season;
    case 'wk': return r.week;
    case 'ph': return PHASE_NAMES[r.phase];
    case 'f': return r.franchise.name;
    case 'o': return r.opponent.name;
    case 'pf':
    case 'pa': return r[key];
    case 'res': return r.result;
    case 'mar': return r.margin;
    default: return null;
  }
}

/** Weeks with no scores: several weeks, so no one week, score or result. */
function gapValue(r: GapRow, key: string): Value {
  switch (key) {
    case 's': return r.season;
    case 'ph': return PHASE_NAMES[r.phase];
    case 'f': return r.franchise.name;
    default: return null;
  }
}

/** The NFL player's name and position, for any row about one NFL player. */
const playerColumn = (p: NflPlayer, key: string): Value | undefined =>
  key === 'pl' ? nflPlayerName(p) : key === 'pos' ? p.position : undefined;

function positionValue(r: PositionRow, key: string): Value {
  return key === 'f' ? r.franchise.name : own(r, key);
}

function playerValue(r: PlayerRow, key: string): Value {
  const player = playerColumn(r.player, key);
  if (player !== undefined) return player;
  switch (key) {
    case 'f': return r.franchise?.name ?? null;
    case 's': return r.season;
    default: return own(r, key);
  }
}

function performanceValue(r: PerformanceRow, key: string): Value {
  const player = playerColumn(r.player, key);
  if (player !== undefined) return player;
  switch (key) {
    case 's': return r.season;
    case 'wk': return r.week;
    case 'ph': return PHASE_NAMES[r.phase];
    case 'f': return r.franchise.name;
    case 'o': return r.opponent.name;
    case 'slot': return r.slot === 'BN' ? 'Bench' : r.slot;
    case 'pts': return r.points;
    default: return null;
  }
}

function pickValue(r: PickRow, key: string): Value {
  const player = playerColumn(r.player, key);
  if (player !== undefined) return player;
  switch (key) {
    case 's': return r.season;
    case 'pk': return r.pick;
    case 'rd': return r.round;
    case 'f': return r.franchise.name;
    // Only a traded pick names the franchise whose slot it was.
    case 'sf': return r.slotFranchise.id === r.franchise.id ? null : r.slotFranchise.name;
    case 'kd': return r.kept == null ? null : r.kept ? 'Kept' : 'Drafted';
    case 'val': return r.value;
    default: return null;
  }
}

function pickGroupValue(r: PickGroupRow, key: string): Value {
  switch (key) {
    case 'f': return r.franchise.name;
    case 'pos':
    case 'rd': return r.group;
    case 'val': return r.value;
    default: return own(r, key);
  }
}

function pickPlayerValue(r: PickPlayerRow, key: string): Value {
  const player = playerColumn(r.player, key);
  if (player !== undefined) return player;
  switch (key) {
    case 'top': return r.top.pick;
    case 'frs': return r.franchises.map((f) => f.name).join(', ');
    case 'val': return r.value;
    default: return own(r, key);
  }
}
