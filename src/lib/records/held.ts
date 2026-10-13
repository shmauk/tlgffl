// Records held (#7's franchise profile, item 7): every top-10 entry a
// franchise holds, with its rank, across every record of the catalogue. Each
// record counts once, over its own page's era and phase (its first ones);
// entries listed unranked (all ties) aren't top-10 entries.
import type { Db } from '../statsguru/engine';
import { RECORDS, type RecordDef } from './catalogue';
import { recordView, type Entry, type RecordFranchise } from './records';

/** Who holds an entry: a division's franchises, both of a shared pair, or its franchise. */
export function holders(def: RecordDef, e: Entry): RecordFranchise[] {
  if (e.members) return e.members;
  return (def.kind === 'pair' || def.shared) && e.opponent ? [e.franchise, e.opponent] : [e.franchise];
}

export interface Held {
  def: RecordDef;
  rank: number;
  entry: Entry;
}

const cache = new WeakMap<Db, Map<number, Held[]>>();

function everyHolding(db: Db): Map<number, Held[]> {
  let byFranchise = cache.get(db);
  if (byFranchise) return byFranchise;
  byFranchise = new Map();
  for (const def of RECORDS) {
    for (const entry of recordView(db, def, def.eras[0], def.phases[0]).entries) {
      if (entry.rank === null) continue;
      for (const f of holders(def, entry)) {
        const list = byFranchise.get(f.id) ?? [];
        list.push({ def, rank: entry.rank, entry });
        byFranchise.set(f.id, list);
      }
    }
  }
  cache.set(db, byFranchise);
  return byFranchise;
}

/** A franchise's top-10 entries, in catalogue order, best rank first within a record. */
export function recordsHeld(db: Db, franchiseId: number): Held[] {
  const order = new Map(RECORDS.map((d, n) => [d.slug, n]));
  return [...(everyHolding(db).get(franchiseId) ?? [])].sort(
    (a, b) => order.get(a.def.slug)! - order.get(b.def.slug)! || a.rank - b.rank,
  );
}

/** An entry's figure as its record shows it. */
export const figureText = (def: RecordDef, value: number) =>
  def.unit === 'points' ? value.toFixed(2) : def.unit === 'pct' ? `${(value * 100).toFixed(1)}%` : String(value);
