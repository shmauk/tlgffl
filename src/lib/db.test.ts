// A franchise as a season shows it (SeasonFranchise), over a database small
// enough to read off the test, and over a scenario's (tests/scenarios.py).
import { copyFileSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, inject, test } from 'vitest';
import { open, type Db } from './database';
import { rollOfHonour, seasonFranchise, seasonGames } from './db';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  create table franchises (id integer primary key, name text);
  create table team_names (franchise_id integer, season integer, team_name text);
  insert into franchises values (1, 'The Puffins'), (2, 'Kurlewless');
  insert into team_names values (1, 2024, 'Puffin Billy'), (1, 2025, 'The Puffins'), (2, 2025, 'pending');
`);
const db: Db = { all: (sql, params = []) => sqlite.prepare(sql).all(...params) as Record<string, any>[] };

describe('a franchise in a season', () => {
  const resolve = seasonFranchise(db);

  test('has its franchise name and the team name it played under that season', () => {
    expect(resolve(2024, 1)).toEqual({ id: 1, name: 'The Puffins', teamName: 'Puffin Billy' });
    expect(resolve(2025, 2)).toEqual({ id: 2, name: 'Kurlewless', teamName: 'pending' });
  });

  test('with no team name for the season, goes by its franchise name', () => {
    expect(resolve(2023, 2)).toEqual({ id: 2, name: 'Kurlewless', teamName: 'Kurlewless' });
  });
});

test('a franchise with no team name for a season still has its games shown, by its franchise name', () => {
  // The build never writes such a database (ADR 0004), so take a scenario's and remove one.
  const path = join(mkdtempSync(join(tmpdir(), 'tlgffl-')), 'league.sqlite');
  copyFileSync(inject('scenarios').regular, path);
  const edit = new DatabaseSync(path);
  edit.exec(`delete from team_names where franchise_id = 6 and season = 2025;
             update franchises set name = 'Sixers' where id = 6`);
  edit.close();
  const games = seasonGames(open(path), 2025).filter((g) => g.away.id === 6 || g.home.id === 6);
  // Franchise 6 played weeks 1-3: v 1, v 4 and v 2, away each time.
  expect(games.map((g) => [g.week, g.home.id, g.away])).toEqual([
    [1, 1, { id: 6, name: 'Sixers', teamName: 'Sixers' }],
    [2, 4, { id: 6, name: 'Sixers', teamName: 'Sixers' }],
    [3, 2, { id: 6, name: 'Sixers', teamName: 'Sixers' }],
  ]);
});

test('a tied Playoffs final’s champion is the franchise that went on from it, and its runner-up the other', () => {
  const [row] = rollOfHonour(open(inject('scenarios')['tied-final']));
  expect([row.season.year, row.champion?.id, row.runnerUp?.id]).toEqual([2025, 1, 2]);
});
