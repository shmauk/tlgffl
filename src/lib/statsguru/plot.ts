// Draws a chart description (chart.ts) with Observable Plot, in the browser
// only and only on Statsguru (ADR 0006). Colours are CSS variables and text is
// currentColor, so a theme change recolours the SVG with no redraw; the page's
// style gives it the site's font.
import * as Plot from '@observablehq/plot';
import type { Chart, Point } from './chart';

/** Roughly how wide a label is at the chart's 12px. */
const textWidth = (label: string) => [...label].length * 6.5;

export function drawChart(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  return chart.mark === 'line' ? drawLines(chart, width) : drawBars(chart, width);
}

function drawBars(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  const labels = chart.points.map((p) => String(p.x ?? ''));
  // Labels slant under wide bars and stand upright under narrow ones (phones), so they never overlap.
  const upright = width / Math.max(1, labels.length) < 28;
  const rotate = upright ? -90 : -45;
  const slant = upright ? 1 : Math.SQRT1_2;
  const longest = Math.max(0, ...labels.map(textWidth));
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 320,
    marginBottom: Math.round(longest * slant) + 16,
    // A slanted first label reaches left of its bar.
    marginLeft: upright ? 40 : Math.max(40, Math.round(textWidth(labels[0] ?? '') * slant)),
    x: { domain: labels, label: null, tickRotate: rotate, tickSize: 0 },
    y: { label: chart.y.label, grid: true },
    marks: [
      Plot.barY(chart.points, {
        x: (p) => String(p.x ?? ''),
        y: 'y',
        fill: 'var(--accent)',
        title: (p) => `${chart.x.label}: ${p.x ?? ''}\n${chart.y.label}: ${p.y}`,
        tip: true,
      }),
      Plot.ruleY([0]),
    ],
  });
}

/** A figure as the table shows it: counts whole, points to two places. */
const figure = (y: number) => (Number.isInteger(y) ? String(y) : y.toFixed(2));

/** Season labels at least this far apart, so they never overlap on a phone. */
const TICK_GAP = 40;

function drawLines(chart: Chart, width: number): SVGSVGElement | HTMLElement {
  // Colours go to this chart's biggest series in turn; the rest are thin grey lines under them.
  const coloured = new Set(chart.coloured);
  const range = (chart.coloured ?? []).map((_, i) => `var(--series-${i + 1})`);
  const grey = chart.points.filter((p) => !coloured.has(p.series!));
  const bright = chart.points.filter((p) => coloured.has(p.series!));
  const title = (p: Point) =>
    `${p.series}\n${p.at ?? `${chart.x.label} ${p.x}`}\n${chart.y.label}: ${figure(p.y)}`;
  const marginLeft = 40;
  return Plot.plot({
    className: 'sg-plot',
    width,
    height: 320,
    marginLeft,
    x: chart.ticks ? gameAxis(chart, width - marginLeft - 20) : { label: chart.x.label, tickFormat: 'd' },
    y: { label: chart.y.label, grid: true },
    color: { domain: chart.coloured, range, legend: true },
    caption: chart.note,
    marks: [
      Plot.lineY(grey, { x: 'x', y: 'y', z: 'series', stroke: 'var(--quiet)', strokeWidth: 1 }),
      Plot.lineY(bright, {
        x: 'x', y: 'y', z: 'series', stroke: 'series', strokeWidth: 2,
        // Seasons are few enough to mark each one, so a lone season still shows.
        marker: chart.ticks ? 'none' : 'circle',
      }),
      Plot.tip(chart.points, Plot.pointer({ x: 'x', y: 'y', title })),
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
