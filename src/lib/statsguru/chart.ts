// A query's results as a chart (ADR 0006): which mark, which columns on x and
// y (and which names a line's series), and one point per row: in the table's
// order for bars, along x for lines. Pure, like the table
// renderer; plot.ts turns it into an Observable Plot SVG in the browser.
// Values come from the one accessor the table reads (values.ts), so a chart
// only ever shows figures the view already computes.
import type { QueryResult } from './engine';
import { viewOf, type Query } from './query';
import { HEADINGS } from './render';
import { columnValue, type Value } from './values';

/** How the points are drawn. */
export type Mark = 'bar' | 'line';

/** A results column on one of the chart's axes, by its sort key. */
export interface Channel {
  key: string;
  label: string;
}

export interface Point {
  x: Value;
  y: number;
  /** The line the point is on, for a chart with series. */
  series?: string;
  /** When x is a game's place in order: which game it is. */
  at?: string;
}

/** An x axis label at a value of x, where the axis's own numbers would mean nothing. */
export interface Tick {
  x: number;
  label: string;
}

export interface Chart {
  mark: Mark;
  x: Channel;
  y: Channel;
  /** One line per value of this column, for a line chart. */
  series?: Channel;
  /** One per row with a y value: bars in the rows' order, so they follow the table's sort; lines along x. */
  points: Point[];
  /** The series drawn in colour, biggest first; each takes the next of the chart's colours. The rest are grey. */
  coloured?: string[];
  /** For games in order: a label at each season's first game. */
  ticks?: Tick[];
  /** Said under the chart, when some series are grey. */
  note?: string;
}

/** How many series a chart can tell apart by colour. */
export const COLOURS = 8;

/** What a chart shows, by column sort key, before any rows. */
export interface ChartSpec {
  mark: Mark;
  /** A line over 'wk' runs through the games in order, season after season. */
  x: string;
  y: string;
  series?: string;
}

/** A view's own chart, or null for a view with none (yet). */
export function defaultChart(q: Query): ChartSpec | null {
  const view = viewOf(q);
  if (q.subject === 'franchise' && view === 'totals') return { mark: 'bar', x: 'f', y: 'w' };
  if (q.subject === 'franchise' && view === 'season') return { mark: 'line', x: 's', y: 'apf', series: 'f' };
  if (q.subject === 'franchise' && view === 'games') return { mark: 'line', x: 'wk', y: 'pf', series: 'f' };
  return null;
}

const channel = (key: string): Channel => ({ key, label: HEADINGS[key] });

/** The chart of a query's results, or null when there is nothing to draw. */
export function chartOf(result: QueryResult, q: Query): Chart | null {
  const spec = defaultChart(q);
  if (!spec) return null;
  const games = spec.mark === 'line' && spec.x === 'wk';
  // Games with no score (or no one week, like reported totals) have no y, so they're skipped.
  const drawn = result.rows.flatMap((r) => {
    const y = columnValue(r, spec.y);
    if (typeof y !== 'number') return [];
    const point: Point = { x: columnValue(r, spec.x), y };
    if (spec.series) point.series = String(columnValue(r, spec.series) ?? '');
    const season = Number(columnValue(r, 's'));
    if (games) point.at = `${season} week ${point.x}`;
    return [{ point, season, week: Number(point.x) }];
  });
  if (!drawn.length) return null;
  const points = drawn.map((d) => d.point);
  const chart: Chart = { mark: spec.mark, x: channel(spec.x), y: channel(spec.y), points };
  if (games) chart.ticks = inGameOrder(drawn);
  if (spec.mark === 'line') points.sort((a, b) => Number(a.x) - Number(b.x));
  if (spec.series) {
    chart.series = channel(spec.series);
    const all = biggest(points);
    chart.coloured = all.slice(0, COLOURS);
    if (all.length > COLOURS) {
      const label = chart.series.label;
      chart.note = `Only the ${COLOURS} biggest of ${all.length} ${label.toLowerCase()}s are in colour. Choose the ${label.toLowerCase()}s to compare with the ${label} filter.`;
    }
  }
  return chart;
}

/**
 * Numbers each point's game by its place among the games drawn, so x runs
 * game after game with no room for off-seasons or skipped games, and gives a
 * tick at each season's first game.
 */
function inGameOrder(drawn: { point: Point; season: number; week: number }[]): Tick[] {
  const key = (d: { season: number; week: number }) => d.season * 100 + d.week;
  const order = [...new Map(drawn.map((d) => [key(d), d])).values()].sort((a, b) => key(a) - key(b));
  const place = new Map(order.map((d, i) => [key(d), i]));
  for (const d of drawn) d.point.x = place.get(key(d))!;
  return order.flatMap((d, i) => (i === 0 || order[i - 1].season !== d.season ? [{ x: i, label: String(d.season) }] : []));
}

/** The series, biggest (most y in all) first. */
function biggest(points: Point[]): string[] {
  const totals = new Map<string, number>();
  for (const p of points) totals.set(p.series!, (totals.get(p.series!) ?? 0) + p.y);
  return [...totals].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
