# Statsguru charts use Observable Plot

Statsguru can show a query's results as a chart as well as a table. Charts are drawn with Observable Plot, loaded only on the Statsguru page like sql.js (ADR 0002). Plot draws SVG, so a chart takes its colours and font from the site's CSS variables and follows the light and dark themes without any code of its own. The extra download is small next to the SQLite engine and database that Statsguru already loads. Our code only turns a view's rows into a Plot chart description, a pure function that can be tested like the table renderer.

## Considered Options

- **Hand-drawn SVG**: no new dependency and full control, but every axis, legend and scale would have to be written and maintained by us, which works against letting people build charts flexibly.
- **Chart.js**: popular, with a built-in pie chart and polished tooltips, but it draws on canvas. It can't read CSS, so the theme's colours would be copied into JS and every chart redrawn on a theme change.
- **ECharts, Vega-Lite**: capable, but heavy and with a strong look of their own.
