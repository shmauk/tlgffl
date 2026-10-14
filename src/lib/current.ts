// The current season (GLOSSARY.md) and its phase (#16, #35), chosen from the
// data and the build date, never by hand: the season being played or, between
// seasons, the one that finished most recently, until the next season's week 1.
// Pure: src/lib/current-db.ts feeds it from the database.

export type Phase = 'regular' | 'brackets' | 'off-season';

/** What the database knows about a season's progress. */
export interface SeasonState {
  season: number;
  /** Week 1's date (YYYY-MM-DD), if Sleeper's state was snapshotted for the season. */
  week1: string | null;
  /** When the season's draft starts (ms since the epoch), once Sleeper has a date. */
  draftStart: number | null;
  regularWeeks: [number, number];
  /** Every week with final games, regular season and brackets. */
  finalWeeks: number[];
  /** How many brackets the format has, and how many have crowned a winner. */
  brackets: number;
  crowned: number;
}

export interface Current {
  season: number;
  phase: Phase;
  /** The latest final week; null before week 1 is final. */
  through: number | null;
  /** The week being played (no scores shown); null in the off-season. */
  playing: number | null;
  /** In the off-season, the next season if Sleeper has it, and its draft start. */
  next: { season: number; draftStart: number | null } | null;
}

const started = (s: SeasonState, today: string) => s.finalWeeks.length > 0 || (s.week1 !== null && s.week1 <= today);

/** The current season on `today` (YYYY-MM-DD), or null if no season has started. */
export function currentSeason(states: SeasonState[], today: string): Current | null {
  const sorted = [...states].sort((a, b) => a.season - b.season);
  const s = sorted.filter((x) => started(x, today)).at(-1);
  if (!s) return null;
  const [first, last] = s.regularWeeks;
  const final = new Set(s.finalWeeks);
  const through = s.finalWeeks.length ? Math.max(...s.finalWeeks) : null;
  const regularDone = Array.from({ length: last - first + 1 }, (_, i) => first + i).every((w) => final.has(w));
  const phase: Phase = !regularDone ? 'regular' : s.crowned < s.brackets ? 'brackets' : 'off-season';
  const after = sorted.find((x) => x.season > s.season);
  return {
    season: s.season,
    phase,
    through,
    playing: phase === 'off-season' ? null : (through ?? first - 1) + 1,
    next: phase === 'off-season' && after ? { season: after.season, draftStart: after.draftStart } : null,
  };
}
