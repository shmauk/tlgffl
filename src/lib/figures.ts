// How a figure reads on its own, the same for records (#7) and awards (#33).
// Tables whose heading carries the unit (a "Win %" column) show the bare
// number instead. Pure.

/** 'pct' and 'share' are rates; 'luck' is a difference of two percentages. */
export type FigureUnit = 'points' | 'count' | 'pct' | 'share' | 'luck' | 'dollars';

/** 19.89, 7, 75.0%, 24.0%, +12.3%, $22. */
export function figure(unit: FigureUnit, value: number): string {
  switch (unit) {
    case 'points':
      return value.toFixed(2);
    case 'count':
      return String(Math.round(value));
    case 'pct':
    case 'share':
      return `${(value * 100).toFixed(1)}%`;
    case 'luck':
      return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
    case 'dollars':
      return `$${Math.round(value)}`;
  }
}
