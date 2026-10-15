// Round names and bracket run results (#43), worded from the season's format,
// never from the rounds played so far.
import { describe, expect, test } from 'vitest';
import { roundName, runResult, type BracketRun, type BracketWeeks } from './brackets';

const THREE_WEEKS: BracketWeeks = { firstWeek: 15, lastWeek: 17, series: null };
const SERIES: BracketWeeks = { firstWeek: 15, lastWeek: 17, series: 'best of three' };

describe('round names', () => {
  test('come from the bracket’s weeks, a round a week', () => {
    expect([1, 2, 3].map((r) => roundName(r, THREE_WEEKS))).toEqual(['Round 1', 'Semi-finals', 'Final']);
  });

  test('a series is one round, its final', () => {
    expect(roundName(1, SERIES)).toBe('Final');
  });
});

describe('a bracket run’s result', () => {
  const run = (bracket: BracketRun['bracket'], result: BracketRun['result'], roundReached: number | null, source: BracketRun['source'] = 'derived'): BracketRun => ({
    bracket, result, roundReached, source,
  });

  test('a crowned franchise takes its bracket’s crown, with a question mark while disputed', () => {
    expect(runResult(run('playoffs', 'crowned', 3), THREE_WEEKS)).toBe('Champion');
    expect(runResult(run('shit_bowl', 'crowned', null, 'disputed'), THREE_WEEKS)).toBe('Shit Bowl winner?');
  });

  test('going out is named by round, and in the Shit Bowl it is an escape', () => {
    expect(runResult(run('playoffs', 'out', 2), THREE_WEEKS)).toBe('Out in the semi-finals');
    expect(runResult(run('mediocre_bowl', 'out', 1), THREE_WEEKS)).toBe('Out in round 1');
    expect(runResult(run('shit_bowl', 'out', 2), THREE_WEEKS)).toBe('Escaped in the semi-finals');
  });

  test('a finalist that wasn’t crowned is runner-up, and a franchise yet to go out is still in', () => {
    expect(runResult(run('shit_bowl', 'runner_up', 3), THREE_WEEKS)).toBe('Runner-up');
    expect(runResult(run('mediocre_bowl', 'alive', 1), SERIES)).toBe('Still in');
  });
});
