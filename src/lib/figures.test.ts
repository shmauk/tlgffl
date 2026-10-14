import { describe, expect, test } from 'vitest';
import { figure } from './figures';

describe('a figure as it reads on its own, for records and awards alike', () => {
  test('points to two places, counts whole, rates as a percentage to one place, dollars whole', () => {
    expect(figure('points', 19.8857)).toBe('19.89');
    expect(figure('count', 7)).toBe('7');
    expect(figure('pct', 0.75)).toBe('75.0%');
    expect(figure('share', 0.2403)).toBe('24.0%');
    expect(figure('dollars', 22)).toBe('$22');
  });

  test('luck, a difference of two percentages, is signed', () => {
    expect(figure('luck', 0.1234)).toBe('+12.3%');
    expect(figure('luck', -0.05)).toBe('-5.0%');
  });
});
