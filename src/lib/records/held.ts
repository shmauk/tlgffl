// Records held (#7's franchise profile, item 7): every top-10 entry a
// franchise holds, with its rank, across every record of the catalogue. Each
// record counts once, over its own page's era and phase (its first ones);
// entries listed unranked (all ties) aren't top-10 entries.
import { figure } from '../figures';
import type { Db } from '../database';
import { ERA_NAMES, RECORDS, type RecordDef } from './catalogue';
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

/** Each record's place in the catalogue. */
const CATALOGUE_ORDER = new Map(RECORDS.map((d, n) => [d.slug, n]));
/** Catalogue order, best rank first within a record. */
const inCatalogueOrder = (a: Held, b: Held) =>
  CATALOGUE_ORDER.get(a.def.slug)! - CATALOGUE_ORDER.get(b.def.slug)! || a.rank - b.rank;

/** A franchise's top-10 entries, in catalogue order, best rank first within a record. */
export function recordsHeld(db: Db, franchiseId: number): Held[] {
  return [...(everyHolding(db).get(franchiseId) ?? [])].sort(inCatalogueOrder);
}

const PHASE_WORDS = { all: 'all games', regular: 'regular season', playoffs: 'Playoffs' } as const;

/**
 * Which era and games a held entry is over: its record's own page's ("All
 * eras, all games"). A career win % over every game isn't the career
 * summary's regular-season one, so a profile says which it is.
 */
export const heldOver = (def: RecordDef) => `${ERA_NAMES[def.eras[0]]}, ${PHASE_WORDS[def.phases[0]]}`;

/** An entry's figure as it reads on its own (src/lib/figures.ts). */
export const figureText = (def: RecordDef, value: number) => figure(def.unit, value);

/** Every top-10 entry set in the current season, in catalogue order (#35's home page). */
export function recordsThisSeason(db: Db): Held[] {
  const seen = new Set<Entry>();
  return [...everyHolding(db).values()]
    .flat()
    .filter((h) => h.entry.thisSeason && !seen.has(h.entry) && seen.add(h.entry))
    .sort(inCatalogueOrder);
}
