// Statsguru in the browser: the URL is the only state. Each render reads the
// query from the URL, shows it in the form, and runs it against the build's
// database, which (with SQLite WASM) is fetched once, only on this page.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { runQuery, type Db } from './engine';
import { formValues, queryFromForm, type Fields, type FormContext } from './form';
import { DEFAULT_QUERY, decodeQuery, encodeQuery } from './query';
import { renderResults, summary, type Context } from './render';
import { sqlJsDb } from './sqljs';

let database: Promise<Db> | undefined;
function open(url: string): Promise<Db> {
  database ??= Promise.all([initSqlJs({ locateFile: () => wasmUrl }), fetch(url)]).then(async ([SQL, res]) => {
    if (!res.ok) throw new Error(`the database didn't load (${res.status})`);
    return sqlJsDb(new SQL.Database(new Uint8Array(await res.arrayBuffer())));
  });
  return database;
}

function readForm(form: HTMLFormElement): Fields {
  const fields: Fields = {};
  for (const [k, v] of new FormData(form)) (fields[k] ??= []).push(String(v));
  return fields;
}

function fillForm(form: HTMLFormElement, fields: Fields) {
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    const values = fields[el.name];
    if (!values || el.name === 'subject') continue;
    if (el instanceof HTMLSelectElement && el.multiple)
      for (const o of Array.from(el.options)) o.selected = values.includes(o.value);
    else if (el.type === 'checkbox' || el.type === 'radio') el.checked = values.includes(el.value);
    else el.value = values[0] ?? '';
  }
}

export function start(root: HTMLElement) {
  const ctx = JSON.parse(root.dataset.context!) as FormContext & Context;
  const context: Context = { franchises: ctx.franchises, seasons: ctx.seasons.map((s) => s.year) };
  const form = root.querySelector<HTMLFormElement>('#sg-form')!;
  const queryRow = root.querySelector<HTMLElement>('#sg-query')!;
  const edit = root.querySelector<HTMLAnchorElement>('#sg-edit')!;
  const results = root.querySelector<HTMLElement>('#sg-results')!;
  const said = root.querySelector<HTMLElement>('#sg-summary')!;

  async function render() {
    const q = decodeQuery(location.search);
    fillForm(form, formValues(q, ctx));
    said.textContent = summary(q, context);
    // A blank URL opens on the form; a query opens on its results.
    const asked = location.search.length > 1;
    queryRow.hidden = asked;
    edit.hidden = !asked;
    edit.textContent = 'Edit query';
    try {
      const db = await open(root.dataset.db!);
      results.innerHTML = renderResults(runQuery(db, q), q);
    } catch (e) {
      results.innerHTML = `<p class="sub">Statsguru couldn't load the record book: ${String((e as Error).message ?? e)}</p>`;
    }
  }
  const go = (search: string) => {
    // The default query still gets a results page, not the blank form.
    history.pushState(null, '', `?${search || 'view=totals'}`);
    void render();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    go(encodeQuery(queryFromForm(readForm(form), ctx)));
  });
  root.querySelector('#sg-reset')!.addEventListener('click', () => fillForm(form, formValues(DEFAULT_QUERY, ctx)));
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
  addEventListener('popstate', () => void render());
  void render();
}
