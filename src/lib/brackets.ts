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
