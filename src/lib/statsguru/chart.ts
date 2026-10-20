// A query's results as a chart (ADR 0006): which mark, which columns on x and
// y, and one point per row, in the table's order. Pure, like the table
// renderer; plot.ts turns it into an Observable Plot SVG in the browser.
// Values come from the one accessor the table reads (values.ts), so a chart
// only ever shows figures the view already computes.
import type { QueryResult } from './engine';
import { viewOf, type Query } from './query';
import { HEADINGS } from './render';
import { columnValue, type Value } from './values';

/** How the points are drawn. */
export type Mark = 'bar';

/** A results column on one of the chart's axes, by its sort key. */
export interface Channel {
  key: string;
  label: string;
}

export interface Point {
  x: Value;
  y: number;
}

export interface Chart {
  mark: Mark;
  x: Channel;
  y: Channel;
  /** One per row with a y value, in the rows' order: the bars follow the table's sort. */
  points: Point[];
}

/** What a chart shows, by column sort key, before any rows. */
export interface ChartSpec {
  mark: Mark;
  x: string;
  y: string;
}

/** A view's own chart, or null for a view with none (yet). */
export function defaultChart(q: Query): ChartSpec | null {
  const view = viewOf(q);
  if (q.subject === 'franchise' && view === 'totals') return { mark: 'bar', x: 'f', y: 'w' };
  return null;
}

const channel = (key: string): Channel => ({ key, label: HEADINGS[key] });

/** The chart of a query's results, or null when there is nothing to draw. */
export function chartOf(result: QueryResult, q: Query): Chart | null {
  const spec = defaultChart(q);
  if (!spec) return null;
  const points = result.rows.flatMap((r) => {
    const y = columnValue(r, spec.y);
    return typeof y === 'number' ? [{ x: columnValue(r, spec.x), y }] : [];
  });
  if (!points.length) return null;
  return { mark: spec.mark, x: channel(spec.x), y: channel(spec.y), points };
}
