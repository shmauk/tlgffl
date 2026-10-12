// A season's format (#11) in a few short lines, for /league/ and season pages.
import type { SeasonFormat } from './db';

const BRACKETS = {
  playoffs: { name: 'Playoffs', from: 'top' },
  shit_bowl: { name: 'Shit Bowl', from: 'bottom' },
  mediocre_bowl: { name: 'Mediocre Bowl', from: 'middle' },
} as const;
const ORDER = Object.keys(BRACKETS);

const weeks = (first: number, last: number) => (first === last ? `week ${first}` : `weeks ${first}–${last}`);

export function formatSummary(f: SeasonFormat): string[] {
  const brackets = [...f.brackets].sort((a, b) => ORDER.indexOf(a.bracket) - ORDER.indexOf(b.bracket));
  return [
    `${f.teams} teams in ${f.divisions === 1 ? 'one division' : `${f.divisions} divisions`}`,
    `Regular season ${weeks(...f.regularSeason)}`,
    ...brackets.map(({ bracket, size, firstWeek, lastWeek, series }) => {
      const { name, from } = BRACKETS[bracket];
      return [`${name}: ${from} ${size}`, series, weeks(firstWeek, lastWeek)].filter(Boolean).join(', ');
    }),
  ];
}
