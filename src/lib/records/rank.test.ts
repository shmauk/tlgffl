import { describe, expect, test } from 'vitest';
import { topTen } from './rank';

const values = (...v: number[]) => v.map((value, n) => ({ id: n + 1, value }));

describe('top ten', () => {
  test('keeps the ten best, highest first, ranks shared by level values', () => {
    const ranked = topTen(values(5, 9, 7, 9, 1, 2, 3, 4, 6, 8, 0, 10), (e) => e.value, 'desc');
    expect(ranked.map((r) => [r.rank, r.entry.value])).toEqual([
      [1, 10], [2, 9], [2, 9], [4, 8], [5, 7], [6, 6], [7, 5], [8, 4], [9, 3], [10, 2],
    ]);
  });

  test('extends past ten to anyone level with tenth', () => {
    const ranked = topTen(values(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 11), (e) => e.value, 'asc');
    expect(ranked.map((r) => [r.rank, r.entry.value])).toEqual([
      [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10], [10, 10], [10, 10],
    ]);
  });

  test('keeps the order it is given among level values', () => {
    const ranked = topTen(values(3, 3, 3), (e) => e.value, 'desc');
    expect(ranked.map((r) => r.entry.id)).toEqual([1, 2, 3]);
  });

  test('fewer than ten is every entry', () => {
    expect(topTen([], (e: { value: number }) => e.value, 'desc')).toEqual([]);
  });
});
