// A franchise as a season shows it (SeasonFranchise), over a database small
// enough to read off the test.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import type { Db } from './database';
import { seasonFranchise } from './db';

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
