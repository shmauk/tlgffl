// The build's "updated <date>" stamp (#26), shown in every page's footer and
// on every current-season view. The date is the UK day the Python build was
// for (the build_date table, read by src/lib/current.ts): the scheduled
// refresh rebuilds it each run, so the stamp tells a reader how fresh the data is.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];

/** "2026-10-13" -> { text: 'Updated 13 October 2026', iso: '2026-10-13' } */
export function updatedOn(iso: string): { text: string; iso: string } {
  const [y, m, d] = iso.split('-').map(Number);
  return { text: `Updated ${d} ${MONTHS[m - 1]} ${y}`, iso };
}

/** A current-season view's line: "Updated 13 October 2026, through week 4" (through: the latest final week). */
export const throughWeek = (iso: string, through: number | null) =>
  `${updatedOn(iso).text}, ${through === null ? 'week 1 not yet final' : `through week ${through}`}`;
