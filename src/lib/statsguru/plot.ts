// Draws a chart description (chart.ts) with Observable Plot, in the browser
// only and only on Statsguru (ADR 0006). Colours are CSS variables and text is
// currentColor, so a theme change recolours the SVG with no redraw; the page's
// style gives it the site's font.
import * as Plot from '@observablehq/plot';
import type { Channel, Chart, Point } from './chart';

/** Roughly how wide a label is at the chart's 12px. */
const textWidth = (label: string) => [...label].length * 6.5;

export function drawChart(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  if (chart.mark === 'line') return drawLines(chart, width);
  if (chart.mark === 'scatter') return drawDots(chart, width);
  if (chart.mark === 'share') return drawShares(chart, width);
  return chart.series ? drawGroupedBars(chart, width) : drawBars(chart, width);
}

/** A figure as the table shows it: counts whole, points to two places, fractions as percentages. */
const figure = (y: number, c: Channel) =>
  c.percent ? `${(y * 100).toFixed(1)}%` : Number.isInteger(y) ? String(y) : y.toFixed(2);
const value = (v: Point['x'], c: Channel) => (typeof v === 'number' ? figure(v, c) : String(v ?? ''));
/** An x of names or labels, in the order the rows bring them, rather than A-Z. */
const xAxis = (chart: Chart) =>
  chart.points.every((p) => typeof p.x === 'number')
    ? { label: chart.x.label, percent: chart.x.percent }
    : { label: chart.x.label, type: 'point' as const, domain: [...new Set(chart.points.map((p) => value(p.x, chart.x)))] };
const yAxis = (chart: Chart) => ({ label: chart.y.label, grid: true, percent: chart.y.percent });

/** The series in colour, each its own; the rest are one grey, drawn under them. */
function colours(chart: Chart) {
  if (!chart.series) return { grey: [], bright: chart.points, color: undefined };
  const coloured = new Set(chart.coloured);
  return {
    grey: chart.points.filter((p) => !coloured.has(p.series!)),
    bright: chart.points.filter((p) => coloured.has(p.series!)),
    color: { domain: chart.coloured, range: (chart.coloured ?? []).map((_, i) => `var(--series-${i + 1})`), legend: true },
  };
}

/** Labels slant under wide bars and stand upright under narrow ones (phones), so they never overlap. */
function barLabels(labels: string[], width: number) {
  const upright = width / Math.max(1, labels.length) < 28;
  const slant = upright ? 1 : Math.SQRT1_2;
  const longest = Math.max(0, ...labels.map(textWidth));
  return {
    marginBottom: Math.round(longest * slant) + 16,
    // A slanted first label reaches left of its bar.
    marginLeft: upright ? 40 : Math.max(40, Math.round(textWidth(labels[0] ?? '') * slant)),
    axis: { domain: labels, label: null, tickRotate: upright ? -90 : -45, tickSize: 0 },
  };
}

function drawBars(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  const labels = chart.points.map((p) => value(p.x, chart.x));
  const { marginBottom, marginLeft, axis } = barLabels(labels, width);
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 320,
    marginBottom,
    marginLeft,
    x: axis,
    y: yAxis(chart),
    caption: chart.note,
    marks: [
      Plot.barY(chart.points, {
        x: (p) => value(p.x, chart.x),
        y: 'y',
        fill: 'var(--accent)',
        title: (p) => `${chart.x.label}: ${value(p.x, chart.x)}\n${chart.y.label}: ${figure(p.y, chart.y)}`,
        tip: true,
      }),
      Plot.ruleY([0]),
    ],
  });
}

/** Bars no wider than this, so a lone franchise's bar isn't the whole width. */
const SHARE_BAR = 90;

/** A bar at each x, in the table's order, split by the series in its order and scaled to 100%. */
function drawShares(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  const labels = [...new Set(chart.points.map((p) => value(p.x, chart.x)))];
  // The coloured segments come in the chart's order (the lineup's, for positions).
  const series = [...new Set([...(chart.coloured ?? []), ...chart.points.map((p) => p.series ?? '')])];
  const { marginBottom, marginLeft, axis } = barLabels(labels, width);
  const coloured = new Set(chart.coloured);
  const title = (p: Point) =>
    [p.series, `${chart.x.label}: ${value(p.x, chart.x)}`, `${chart.y.label}: ${figure(p.value ?? 0, chart.y)} (${figure(p.y, { ...chart.y, percent: true })})`]
      .filter(Boolean)
      .join('\n');
  return Plot.plot({
    className: 'sg-plot',
    width: Math.min(width, marginLeft + 20 + labels.length * SHARE_BAR),
    height: 320,
    marginBottom,
    marginLeft,
    x: { ...axis, padding: 0.2 },
    y: { label: `Share of ${chart.y.label}`, percent: true },
    caption: chart.note,
    ...(chart.series
      ? {
          // Colours go to the segments in turn; any past the chart's colours are grey.
          color: { domain: series, range: series.map((s, i) => (coloured.has(s) ? `var(--series-${i + 1})` : 'var(--quiet)')), legend: true },
        }
      : {}),
    marks: [
      Plot.barY(
        chart.points,
        Plot.stackY({
          x: (p: Point) => value(p.x, chart.x),
          y: 'y',
          fill: chart.series ? 'series' : 'var(--accent)',
          order: series,
          z: 'series',
          title,
          tip: true,
        }),
      ),
      Plot.ruleY([0]),
    ],
  });
}

/** A group of bars at each x, in the table's order; a bar per series in each, in the order they first come. */
function drawGroupedBars(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  const groups = [...new Set(chart.points.map((p) => value(p.x, chart.x)))];
  const series = [...new Set(chart.points.map((p) => p.series!))];
  const { marginBottom, marginLeft, axis } = barLabels(groups, width);
  const { grey, bright, color } = colours(chart);
  const bar = { fx: (p: Point) => value(p.x, chart.x), x: 'series', y: 'y' };
  const title = (p: Point) => `${p.series}\n${chart.x.label}: ${value(p.x, chart.x)}\n${chart.y.label}: ${figure(p.y, chart.y)}`;
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 320,
    marginBottom,
    marginLeft,
    fx: { ...axis, padding: 0.2 },
    x: { domain: series, axis: null, padding: 0.05 },
    y: yAxis(chart),
    color,
    caption: chart.note,
    marks: [
      Plot.barY(grey, { ...bar, fill: 'var(--quiet)' }),
      Plot.barY(bright, { ...bar, fill: 'series' }),
      Plot.ruleY([0]),
      Plot.tip(chart.points, Plot.pointer({ ...bar, title })),
    ],
  });
}

/** Every row a dot; coloured by the series if there is one. */
function drawDots(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  const { grey, bright, color } = colours(chart);
  const dotX = (p: Point) => (typeof p.x === 'number' ? p.x : value(p.x, chart.x));
  const title = (p: Point) =>
    [p.series, `${chart.x.label}: ${value(p.x, chart.x)}`, `${chart.y.label}: ${figure(p.y, chart.y)}`].filter(Boolean).join('\n');
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 360,
    marginLeft: 48,
    // Room for the x label at the axis's end.
    marginRight: 28,
    marginBottom: 40,
    x: { ...xAxis(chart), grid: true },
    y: yAxis(chart),
    ...(chart.series ? { color, caption: chart.note } : {}),
    marks: [
      Plot.dot(grey, { x: dotX, y: 'y', fill: 'var(--quiet)', r: 2.5 }),
      Plot.dot(bright, { x: dotX, y: 'y', fill: chart.series ? 'series' : 'var(--accent)', r: 3 }),
      Plot.tip(chart.points, Plot.pointer({ x: dotX, y: 'y', title })),
    ],
  });
}

/** Season labels at least this far apart, so they never overlap on a phone. */
const TICK_GAP = 40;

function drawLines(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  // Colours go to this chart's biggest series in turn; the rest are thin grey lines under them.
  const { grey, bright, color } = colours(chart);
  const title = (p: Point) =>
    [p.series, p.at ?? `${chart.x.label} ${value(p.x, chart.x)}`, `${chart.y.label}: ${figure(p.y, chart.y)}`]
      .filter(Boolean)
      .join('\n');
  const marginLeft = 40;
  const line = { x: (p: Point) => (typeof p.x === 'number' ? p.x : value(p.x, chart.x)), y: 'y', z: 'series' };
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 320,
    marginLeft,
    x: chart.ticks
      ? gameAxis(chart, width - marginLeft - 20)
      : { ...xAxis(chart), ...(chart.x.key === 's' ? { tickFormat: 'd' } : {}) },
    y: yAxis(chart),
    ...(chart.series ? { color, caption: chart.note } : {}),
    marks: [
      Plot.lineY(grey, { ...line, stroke: 'var(--quiet)', strokeWidth: 1 }),
      Plot.lineY(bright, {
        ...line,
        stroke: chart.series ? 'series' : 'var(--accent)',
        strokeWidth: 2,
        // Seasons are few enough to mark each one, so a lone season still shows.
        marker: chart.ticks ? 'none' : 'circle',
      }),
      Plot.tip(chart.points, Plot.pointer({ x: line.x, y: 'y', title })),
    ],
  });
}

/** Games in order on x, labelled only where a season starts. */
function gameAxis(chart: Chart, plotWidth: number) {
  const last = Math.max(1, ...chart.points.map((p) => Number(p.x)));
  const ticks: number[] = [];
  for (const t of chart.ticks!)
    if (!ticks.length || ((t.x - ticks[ticks.length - 1]) / last) * plotWidth >= TICK_GAP) ticks.push(t.x);
  const labels = new Map(chart.ticks!.map((t) => [t.x, t.label]));
  return { ticks, tickFormat: (x: number) => labels.get(x) ?? '', label: null };
}
