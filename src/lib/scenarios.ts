// Vitest's globalSetup (#49): builds each scenario (tests/scenarios.py)
// with the real Python build into a temp directory, once per run. A test opens
// one with open(inject('scenarios')[scenario]). Needs Python 3 with
// requirements.txt installed: set PYTHON to use another interpreter.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

export const SCENARIOS = ['regular', 'brackets', 'off-season', 'tied-final'] as const;
export type Scenario = (typeof SCENARIOS)[number];

declare module 'vitest' {
  export interface ProvidedContext {
    /** Each scenario's league.sqlite. */
    scenarios: Record<Scenario, string>;
  }
}

export default function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), 'tlgffl-scenarios-'));
  const python = process.env.PYTHON ?? 'python3';
  const databases = Object.fromEntries(
    SCENARIOS.map((s) => [
      s,
      execFileSync(python, ['-m', 'tests.scenarios', s, join(dir, s)], { encoding: 'utf8' }).trim(),
    ]),
  ) as Record<Scenario, string>;
  project.provide('scenarios', databases);
  return () => rmSync(dir, { recursive: true, force: true });
}
