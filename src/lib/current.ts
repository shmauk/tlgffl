// The current season (GLOSSARY.md) and its phase (#16, #35), as the Python
// build chose them for its build date (recordbook/current.py, ADR 0004): the
// site only reads them, so every page agrees on what "this season" is.
import { open } from './database';
import { updatedOn } from './updated';

export type Phase = 'regular' | 'brackets' | 'off-season';

export interface Current {
  season: number;
  phase: Phase;
  /** The latest final week; null before week 1 is final. */
  through: number | null;
  /** The week being played (no scores shown); null in the off-season. */
  playing: number | null;
  /** In the off-season, the next season if Sleeper has it, and its draft start (ms since the epoch). */
  next: { season: number; draftStart: number | null } | null;
}

/** The current season on the build date, or null if no season has started. */
export function current(): Current | null {
  const r = open()
    .all('select season, phase, through, playing, next_season as n, next_draft_start as d from current_season')[0] as any;
  if (!r) return null;
  return {
    season: r.season,
    phase: r.phase,
    through: r.through,
    playing: r.playing,
    next: r.n === null ? null : { season: r.n, draftStart: r.d },
  };
}

/** The build's date and its "Updated <date>" stamp (#26). */
export function buildDate(): { text: string; iso: string } {
  return updatedOn((open().all('select today from build_date')[0] as { today: string }).today);
}
