// Statsguru in the browser: the URL is the only state. Each render reads the
// query from the URL, shows it in the form, and runs it against the build's
// database, which (with SQLite WASM) is fetched once, only on this page.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import type { Db } from '../database';
import { esc } from '../html';
import { chartOf, type Chart } from './chart';
import { runQuery } from './engine';
import { formValues, queryFromForm, type Fields, type FormContext } from './form';
import { DEFAULT_QUERY, chartChoiceOf, chartColumns, chartSpecOf, decodeQuery, defaultChart, encodeQuery, type Query } from './query';
import { HEADINGS, renderResults, summary, type Context } from './render';
import { sqlJsDb } from './sqljs';

let database: Promise<Db> | undefined;
function open(url: string): Promise<Db> {
  database ??= Promise.all([initSqlJs({ locateFile: () => wasmUrl }), fetch(url)]).then(async ([SQL, res]) => {
    if (!res.ok) throw new Error(`the database didn't load (${res.status})`);
    return sqlJsDb(new SQL.Database(new Uint8Array(await res.arrayBuffer())));
  });
  return database;
}

// Observable Plot is fetched only once a chart is switched on, and only here.
let plot: Promise<typeof import('./plot')> | undefined;
const loadPlot = () => (plot ??= import('./plot'));

function readForm(form: HTMLFormElement): Fields {
  const fields: Fields = {};
  for (const [k, v] of new FormData(form)) (fields[k] ??= []).push(String(v));
  return fields;
}

function fillForm(form: HTMLFormElement, fields: Fields) {
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    const values = fields[el.name];
    if (!values) continue;
    if (el instanceof HTMLSelectElement && el.multiple)
      for (const o of Array.from(el.options)) o.selected = values.includes(o.value);
    else if (el.type === 'checkbox' || el.type === 'radio') el.checked = values.includes(el.value);
    else el.value = values[0] ?? '';
  }
}

export function start(root: HTMLElement) {
  const ctx = JSON.parse(root.dataset.context!) as FormContext & Context;
  const context: Context = { franchises: ctx.franchises, seasons: ctx.seasons.map((s) => s.year), players: ctx.players };
  const form = root.querySelector<HTMLFormElement>('#sg-form')!;
  const queryRow = root.querySelector<HTMLElement>('#sg-query')!;
  const edit = root.querySelector<HTMLAnchorElement>('#sg-edit')!;
  const results = root.querySelector<HTMLElement>('#sg-results')!;
  const said = root.querySelector<HTMLElement>('#sg-summary')!;
  const chartSwitch = root.querySelector<HTMLElement>('#sg-chart-switch')!;
  const chartOn = chartSwitch.querySelector<HTMLInputElement>('input')!;
  const chartBox = root.querySelector<HTMLElement>('#sg-chart')!;
  const builder = root.querySelector<HTMLElement>('#sg-chart-build')!;
  const choose = (name: string) => builder.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
  let drawn: Chart | null = null;

  // The builder offers only the view's own columns, and shows the chart as it is drawn.
  const options = (keys: string[], none = false) =>
    [...(none ? ['<option value="none">none</option>'] : []), ...keys.map((k) => `<option value="${k}">${esc(HEADINGS[k])}</option>`)].join('');
  function showBuilder(q: Query) {
    const spec = q.chart ? chartSpecOf(q) : null;
    builder.hidden = !spec;
    if (!spec) return;
    const columns = chartColumns(q);
    choose('x').innerHTML = options(columns.x);
    choose('y').innerHTML = options(columns.y);
    choose('series').innerHTML = options(columns.series.filter((k) => k !== spec.x), true);
    choose('mark').value = spec.mark;
    choose('x').value = spec.x;
    choose('y').value = spec.y;
    choose('series').value = spec.series ?? 'none';
  }

  // Each subject shows only its own views and filters (data-subject lists the subjects a field is for).
  const subject = () => (form.querySelector<HTMLInputElement>('input[name="subject"]:checked')?.value ?? 'franchise');
  const showSubject = () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-subject]')) el.hidden = !el.dataset.subject!.split(' ').includes(subject());
  };
  for (const r of form.querySelectorAll('input[name="subject"]')) r.addEventListener('change', showSubject);

  async function render() {
    const q = decodeQuery(location.search);
    fillForm(form, formValues(q, ctx));
    showSubject();
    said.textContent = summary(q, context);
    // A blank URL opens on the form; a query opens on its results.
    const asked = location.search.length > 1;
    queryRow.hidden = asked;
    edit.hidden = !asked;
    edit.textContent = 'Edit query';
    try {
      const db = await open(root.dataset.db!);
      const result = runQuery(db, q);
      results.innerHTML = renderResults(result, q);
      chartSwitch.hidden = !defaultChart(q);
      chartOn.checked = q.chart;
      showBuilder(q);
      drawn = q.chart ? chartOf(result, q) : null;
      void draw();
    } catch (e) {
      drawn = null;
      chartBox.replaceChildren();
      results.innerHTML = `<p class="sub">Statsguru couldn't load the record book: ${String((e as Error).message ?? e)}</p>`;
    }
  }
  // Above the table, never instead of it, as wide as the results.
  async function draw() {
    if (!drawn) {
      chartBox.replaceChildren();
      return;
    }
    const chart = drawn;
    // A line or bar that would need rows added up is only its note.
    if (!chart.points.length) {
      chartBox.innerHTML = `<p class="sub">${esc(chart.note ?? '')}</p>`;
      return;
    }
    try {
      const { drawChart } = await loadPlot();
      if (chart !== drawn) return;
      width = results.clientWidth;
      chartBox.replaceChildren(drawChart(chart, width));
    } catch (e) {
      chartBox.innerHTML = `<p class="sub">The chart couldn't be drawn: ${esc(String((e as Error).message ?? e))}</p>`;
    }
  }
  // Redrawn only once a resize settles on a new width, never for a theme change.
  let width = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => {
    clearTimeout(settle);
    settle = setTimeout(() => {
      if (drawn?.points.length && results.clientWidth !== width) void draw();
    }, 150);
  }).observe(results);

  const go = (search: string) => {
    // The default query still gets a results page, not the blank form.
    history.pushState(null, '', `?${search || 'view=totals'}`);
    void render();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(encodeQuery(queryFromForm(readForm(form), ctx)));
  });
  // Reset the whole query but keep the subject (#9).
  root.querySelector('#sg-reset')!.addEventListener('click', () => {
    const s = subject();
    fillForm(form, formValues({ ...DEFAULT_QUERY, subject: s === 'player' || s === 'pick' ? s : 'franchise' }, ctx));
  });
  for (const a of root.querySelectorAll<HTMLAnchorElement>('[data-clear]'))
    a.addEventListener('click', (e) => {
      e.preventDefault();
      fillForm(form, { [a.dataset.clear!]: [] });
    });
  edit.addEventListener('click', (e) => {
    e.preventDefault();
    queryRow.hidden = !queryRow.hidden;
    edit.textContent = queryRow.hidden ? 'Edit query' : 'Hide query';
  });
  results.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('th a');
    if (!(a instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    go(a.search.slice(1));
  });
  chartOn.addEventListener('change', () => go(encodeQuery({ ...decodeQuery(location.search), chart: chartOn.checked })));
  builder.addEventListener('change', () => {
    const q = decodeQuery(location.search);
    const raw = { mark: choose('mark').value, x: choose('x').value, y: choose('y').value, series: choose('series').value };
    go(encodeQuery({ ...q, chartChoice: chartChoiceOf(q, raw) }));
  });
  addEventListener('popstate', () => void render());
  void render();
}
