// A season's format (#11) in a few short lines, for /league/ and season pages.
import { BRACKET_NAMES, byBracket, type BracketKey } from './brackets';
import type { SeasonFormat } from './db';

/** Where in the table each bracket's franchises come from. */
const FROM: Record<BracketKey, string> = { playoffs: 'top', shit_bowl: 'bottom', mediocre_bowl: 'middle' };

const weeks = (first: number, last: number) => (first === last ? `week ${first}` : `weeks ${first}–${last}`);

/** Weeks in words, runs collapsed: [1, 2, 5] -> "weeks 1–2 and 5". */
export function weekList(list: number[]): string {
  const runs: [number, number][] = [];
  for (const w of [...list].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && w === last[1] + 1) last[1] = w;
    else runs.push([w, w]);
  }
  const parts = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`));
  const words = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return list.length === 1 ? `week ${words}` : `weeks ${words}`;
}

export function formatSummary(f: SeasonFormat): string[] {
  const brackets = [...f.brackets].sort(byBracket((b) => b.bracket));
  return [
    `${f.teams} teams in ${f.divisions === 1 ? 'one division' : `${f.divisions} divisions`}`,
    `Regular season ${weeks(...f.regularSeason)}`,
    ...brackets.map(({ bracket, size, firstWeek, lastWeek, series }) => {
      return [`${BRACKET_NAMES[bracket]}: ${FROM[bracket]} ${size}`, series, weeks(firstWeek, lastWeek)].filter(Boolean).join(', ');
    }),
  ];
}
