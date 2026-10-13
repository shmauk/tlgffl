// The length rule every record follows (#7): the top 10, extended to include
// anyone level with 10th. Level values share a rank (1, 2, 2, 4).

export interface Ranked<T> {
  rank: number;
  entry: T;
}

export const TOP = 10;

/** The best entries by value, keeping the given order among level ones. */
export function topTen<T>(entries: T[], value: (e: T) => number, dir: 'asc' | 'desc'): Ranked<T>[] {
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = entries
    .map((entry, n) => ({ entry, n }))
    .sort((a, b) => sign * (value(a.entry) - value(b.entry)) || a.n - b.n)
    .map(({ entry }) => entry);
  const out: Ranked<T>[] = [];
  for (const [n, entry] of sorted.entries()) {
    const level = n > 0 && value(entry) === value(sorted[n - 1]);
    const rank = level ? out[n - 1].rank : n + 1;
    if (rank > TOP) break;
    out.push({ rank, entry });
  }
  return out;
}
