// A query's results as a chart (ADR 0006): which mark, which columns on x and
// y (and which names the series), and one point per row: in the table's order
// for bars, along x for lines. Pure, like the table renderer; plot.ts turns it
// into an Observable Plot SVG in the browser. Values come from the one accessor
// the table reads (values.ts), so a chart only ever shows figures the view
// already computes, and never adds rows up: a line or bar with more than one
// row to a point draws nothing and says which view groups that way.
import type { QueryResult } from './engine';
import { chartSpecOf, positionRank, viewOf, viewsOf, type Mark, type Query, type View } from './query';
import { HEADINGS, heading, viewName } from './render';
import { addsUp, columnKind, columnValue, UNKNOWN_POSITION, type Value } from './values';

/** A results column on one of the chart's axes, by its sort key. */
export interface Channel {
  key: string;
  label: string;
  /** A fraction shown as a percentage (Win %, Share %). */
  percent?: true;
}

export interface Point {
  x: Value;
  /** In a share bar, the point's fraction of its bar. */
  y: number;
  /** In a share bar, the figure itself, as the table shows it. */
  value?: number;
  /** The line, bar in its group or dot colour the point has, for a chart with series. */
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
  /** One line, bar in each group, or dot colour per value of this column. */
  series?: Channel;
  /** One per row with a y value: bars in the rows' order, so they follow the table's sort; lines along x. None when a line or bar would need rows added up. */
  points: Point[];
  /** The series drawn in colour, biggest (by sum, or by mean for a figure that doesn't add up) first; each takes the next of the chart's colours. The rest are grey. */
  coloured?: string[];
  /** For games in order: a label at each season's first game. */
  ticks?: Tick[];
  /** Said under the chart when some series are grey or bars are left out, or instead of it when it can't be drawn. */
  note?: string;
}


/** How many series a chart can tell apart by colour. */
export const COLOURS = 8;
/** How many bars (or groups of bars) a chart draws before it gets too narrow to read. */
export const BARS = 30;

const channel = (key: string, q: Query): Channel =>
  columnKind(key) === 'fraction' ? { key, label: heading(key, q), percent: true } : { key, label: heading(key, q) };
/** A heading inside a sentence: "franchise", but "W" and "PF" as they are. */
const inWords = (label: string) => label.replace(/^.(?=[a-z])/, (c) => c.toLowerCase());

/** The columns each view has one row per, so a chart of exactly those adds nothing up. */
const ROW_PER: Record<Query['subject'], Partial<Record<View, string[]>>> = {
  franchise: { totals: ['f'], season: ['f', 's'], opp: ['f', 'o'], phase: ['f', 'ph'], pos: ['f', 'pos'], games: ['s', 'wk', 'f'] },
  player: { totals: ['pl'], fr: ['pl', 'f'], season: ['pl', 's'], log: ['s', 'wk', 'pl'] },
  pick: { list: ['s', 'pk'], fr: ['f', 'pos'], pl: ['pl'] },
};
const rowPer = (q: Query, view: View) =>
  (ROW_PER[q.subject][view] ?? []).map((k) => (k === 'pos' && q.subject === 'pick' && q.grouping === 'round' ? 'rd' : k));

/** The chart of a query's results, or null when there is nothing to draw. */
export function chartOf(result: QueryResult, q: Query): Chart | null {
  const spec = chartSpecOf(q);
  if (!spec) return null;
  const games = spec.mark === 'line' && spec.x === 'wk';
  // Games with no score (or no one week, like reported totals) have no y, so they're skipped.
  const drawn = result.rows.flatMap((r) => {
    const y = columnValue(r, spec.y);
    if (typeof y !== 'number') return [];
    const point: Point = { x: columnValue(r, spec.x), y };
    if (spec.series) point.series = String(columnValue(r, spec.series) ?? (spec.series === 'pos' ? UNKNOWN_POSITION : ''));
    const season = Number(columnValue(r, 's'));
    if (games) point.at = `${season} week ${point.x}`;
    return [{ point, season, week: Number(point.x) }];
  });
  if (!drawn.length) return null;
  const points = drawn.map((d) => d.point);
  const chart: Chart = { mark: spec.mark, x: channel(spec.x, q), y: channel(spec.y, q), points };
  if (spec.series) chart.series = channel(spec.series, q);
  if (games) chart.ticks = inGameOrder(drawn);
  if (spec.mark !== 'scatter' && !onePerPoint(points)) {
    chart.points = [];
    delete chart.ticks;
    chart.note = groupedElsewhere(q, chart, games ? ['s', 'wk'] : [spec.x]);
    return chart;
  }
  if (spec.mark === 'line') points.sort((a, b) => Number(a.x) - Number(b.x));
  const notes: string[] = [];
  if (spec.mark === 'bar' || spec.mark === 'share') {
    const bars = [...new Set(points.map((p) => p.x))];
    if (bars.length > BARS) {
      const firstBars = new Set(bars.slice(0, BARS));
      chart.points = points.filter((p) => firstBars.has(p.x));
      notes.push(`Only the first ${BARS} of ${bars.length} ${inWords(chart.x.label)}s are drawn, in the table’s order: sort or filter the table to chart others.`);
    }
  }
  if (spec.mark === 'share') {
    const { scaled, segments } = shares(chart.points, spec.series === 'pos');
    chart.points = scaled;
    if (chart.series) {
      chart.coloured = segments.slice(0, COLOURS);
      if (segments.length > COLOURS) {
        const label = inWords(chart.series.label);
        notes.push(`Only the first ${COLOURS} of ${segments.length} ${label}s, in the legend’s order, are in colour; the rest are grey.`);
      }
    }
  } else if (chart.series) {
    const all = biggest(chart.points, spec.y);
    chart.coloured = all.slice(0, COLOURS);
    if (all.length > COLOURS) {
      const label = chart.series.label;
      notes.push(`Only the ${COLOURS} biggest of ${all.length} ${inWords(label)}s are in colour. Choose the ${inWords(label)}s to compare with the ${label} filter.`);
    }
  }
  if (notes.length) chart.note = notes.join(' ');
  return chart;
}

/**
 * Each bar's points as fractions of the bar, so every bar reaches 100%: the
 * one thing a chart works out that the view doesn't, and only to draw it.
 * Bars keep the table's order; the segments in each are in lineup order (for
 * positions), go up (for numbers, like rounds) or keep the order they first
 * come. A bar of nothing is all 0%.
 */
function shares(points: Point[], lineup: boolean): { scaled: Point[]; segments: string[] } {
  const bars = [...new Set(points.map((p) => p.x))];
  const first = [...new Set(points.map((p) => p.series ?? ''))];
  const numbers = first.every((s) => s !== '' && Number.isFinite(Number(s)));
  const place = (s: string) => String(numbers ? Number(s) : first.indexOf(s)).padStart(4, '0');
  const rank = (s: string) => (lineup ? positionRank(s === UNKNOWN_POSITION ? null : s) : place(s));
  const segments = [...first].sort((a, b) => rank(a).localeCompare(rank(b)));
  const scaled = bars.flatMap((x) => {
    const bar = points.filter((p) => p.x === x).sort((a, b) => rank(a.series ?? '').localeCompare(rank(b.series ?? '')));
    const total = bar.reduce((sum, p) => sum + p.y, 0);
    return bar.map((p) => ({ ...p, y: total ? p.y / total : 0, value: p.y }));
  });
  return { scaled, segments };
}

/** Whether no two points share an x and a series. */
function onePerPoint(points: Point[]): boolean {
  const seen = new Set<string>();
  for (const p of points) {
    const key = JSON.stringify([p.x, p.series ?? null]);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Why a line or bar can't be drawn, and what to use instead: the view with a
 * row per the chart's x and series (the fewest other columns), this view's
 * other column as the series, or else a scatter.
 */
function groupedElsewhere(q: Query, chart: Chart, x: string[]): string {
  const chosen = [...x, ...(chart.series ? [chart.series.key] : [])];
  const per = [chart.x, ...(chart.series ? [chart.series] : [])].map((c) => inWords(c.label));
  const said = `More than one row per ${per.join(' and ')}, and a ${chart.mark} chart doesn’t add rows up.`;
  const scatter = 'a scatter, which draws every row.';
  const best = viewsOf(q.subject)
    .map((view) => ({ view, keys: rowPer(q, view) }))
    .filter((v) => chosen.every((k) => v.keys.includes(k)))
    .sort((a, b) => a.keys.length - b.keys.length)[0];
  if (best && best.view !== viewOf(q)) return `${said} Use ${viewName({ ...q, view: best.view })} instead, or ${scatter}`;
  const extra = best?.keys.filter((k) => !chosen.includes(k)) ?? [];
  if (chart.series || extra.length !== 1) return `${said} Use ${scatter}`;
  return `${said} Use a ${inWords(HEADINGS[extra[0]])} series, or ${scatter}`;
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

/**
 * The series, biggest first: most y in all for a figure that adds up (wins,
 * points), the highest mean for one that doesn't (an average, Win %), so a
 * series isn't bigger only for having more rows.
 */
function biggest(points: Point[], y: string): string[] {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const s = sums.get(p.series!) ?? { sum: 0, n: 0 };
    sums.set(p.series!, { sum: s.sum + p.y, n: s.n + 1 });
  }
  const size = ({ sum, n }: { sum: number; n: number }) => (addsUp(y) ? sum : sum / n);
  return [...sums].sort((a, b) => size(b[1]) - size(a[1])).map(([name]) => name);
}
