// The league's three brackets (GLOSSARY.md), in one place: their keys, the
// order the site lists them in (the glossary's) and their names. Python's
// recordbook/formats.py keeps the same keys, order and names. Pure.

export type BracketKey = 'playoffs' | 'shit_bowl' | 'mediocre_bowl';

/** Every listing of the brackets follows this order. */
export const BRACKET_ORDER: readonly BracketKey[] = ['playoffs', 'shit_bowl', 'mediocre_bowl'];

export const BRACKET_NAMES: Record<BracketKey, string> = {
  playoffs: 'Playoffs',
  shit_bowl: 'Shit Bowl',
  mediocre_bowl: 'Mediocre Bowl',
};

/** What a bracket's winner is called. */
export const BRACKET_CROWNS: Record<BracketKey, string> = {
  playoffs: 'Champion',
  shit_bowl: 'Shit Bowl winner',
  mediocre_bowl: 'Mediocre Bowl winner',
};

/** Sorts a list by bracket, in BRACKET_ORDER. */
export const byBracket = <T>(key: (x: T) => BracketKey) => (a: T, b: T) =>
  BRACKET_ORDER.indexOf(key(a)) - BRACKET_ORDER.indexOf(key(b));

/** A bracket's weeks in one season's format: a round a week, or one round for a series. */
export interface BracketWeeks {
  firstWeek: number;
  lastWeek: number;
  /** A series ("best of three") is the same two franchises every week. */
  series: string | null;
}

/** How many rounds a bracket has, from its format rather than the games played so far. */
export const roundCount = (b: BracketWeeks) => (b.series ? 1 : b.lastWeek - b.firstWeek + 1);

/** A round's name: Final, Semi-finals, or Round n. */
export function roundName(round: number, b: BracketWeeks): string {
  const rounds = roundCount(b);
  return round === rounds ? 'Final' : round === rounds - 1 ? 'Semi-finals' : `Round ${round}`;
}

/** Where a crown comes from: the games themselves, or a hand-kept table. */
export type CrownSource = 'derived' | 'confirmed' | 'recalled' | 'disputed';

/** One franchise's path through one bracket in one season (GLOSSARY.md), as the build writes it. */
export interface BracketRun {
  bracket: BracketKey;
  /** Null for a crown from a hand-kept table: its path is unknown. */
  roundReached: number | null;
  result: 'crowned' | 'runner_up' | 'out' | 'alive';
  source: CrownSource;
}

/** How a run ended, in words. Going out of the Shit Bowl, where losing advances you, is an escape. */
export function runResult(run: BracketRun, b: BracketWeeks): string {
  switch (run.result) {
    case 'crowned':
      return run.source === 'disputed' ? `${BRACKET_CROWNS[run.bracket]}?` : BRACKET_CROWNS[run.bracket];
    case 'runner_up':
      return 'Runner-up';
    case 'alive':
      return 'Still in';
    case 'out': {
      const name = roundName(run.roundReached!, b);
      const round = name.startsWith('Round') ? name.toLowerCase() : `the ${name.toLowerCase()}`;
      return `${run.bracket === 'shit_bowl' ? 'Escaped' : 'Out'} in ${round}`;
    }
  }
}

/**
 * How a bracket game reads: "first beat second", or for a tie, which stays a
 * tie in every record, "first tied second" and the franchise that went on.
 */
export function bracketGameLine(g: { home: number; away: number; winnerId: number | null; advancedId: number | null }) {
  const tied = g.winnerId === null;
  const first = tied ? g.home : g.winnerId!;
  return { first, second: first === g.home ? g.away : g.home, tied, wentOn: tied ? g.advancedId : null };
}
