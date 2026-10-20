// Draws a chart description (chart.ts) with Observable Plot, in the browser
// only and only on Statsguru (ADR 0006). Colours are CSS variables and text is
// currentColor, so a theme change recolours the SVG with no redraw; the page's
// style gives it the site's font.
import * as Plot from '@observablehq/plot';
import type { Chart } from './chart';

/** Roughly how wide a label is at the chart's 12px. */
const textWidth = (label: string) => [...label].length * 6.5;

export function drawChart(chart: Chart, width: number): SVGSVGElement | HTMLElement {
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
