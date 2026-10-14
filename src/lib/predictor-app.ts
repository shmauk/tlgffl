// The playoff predictor in the browser (#36): the URL is the only state (no
// localStorage). Every pick is a link; following one updates the URL and
// renders the page again from it. Clinch marks are worked out in a Web
// Worker, the latest request winning.
import { decodeScenario, encodeScenario, predictorHref, project, type PredictorData } from './predictor';
import { renderPredictor } from './predictor-page';
import type { FranchiseId, Mark } from './seeding';

export function start(root: HTMLElement) {
  const data = JSON.parse(root.dataset.predictor!) as PredictorData;
  const base = predictorHref(data.season, { picks: [], spr: [] });
  const known = new Map<string, Record<FranchiseId, Mark[]>>([['', data.marks]]);
  let worker: Worker | null = null;
  let asked = 0;

  function marksFor(key: string, input: ReturnType<typeof project>['input']) {
    // A search still running is for a scenario no longer shown: drop it.
    worker?.terminate();
    worker = new Worker(new URL('./predictor-worker.ts', import.meta.url), { type: 'module' });
    const id = ++asked;
    worker.onmessage = (e: MessageEvent<{ id: number; marks: Record<FranchiseId, Mark[]> }>) => {
      if (e.data.id !== asked) return;
      known.set(key, e.data.marks);
      worker?.terminate();
      worker = null;
      if (encodeScenario(decodeScenario(location.search, data).scenario) === key) render();
    };
    worker.postMessage({ id, input });
  }

  function render() {
    const { scenario, dropped } = decodeScenario(location.search, data);
    const p = project(data, scenario);
    const key = encodeScenario(p.scenario);
    const marks = known.get(key) ?? null;
    root.innerHTML = renderPredictor(data, p, marks, dropped);
    // The URL shows the scenario as applied, without dropped or ignored picks.
    const canonical = predictorHref(data.season, p.scenario);
    if (location.pathname + location.search !== canonical) history.replaceState(null, '', canonical);
    if (!marks) marksFor(key, p.input);
  }

  root.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href?.startsWith(base) || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    history.pushState(null, '', href);
    render();
  });
  window.addEventListener('popstate', render);
  if (location.search) render();
}
