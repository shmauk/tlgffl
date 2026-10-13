// The record pages' way into the build's database: Statsguru's Db interface
// over node:sqlite, so pages run the same engine Statsguru does.
import { open } from '../db';
import type { Db } from '../statsguru/engine';

export const siteDb: Db = {
  all: (sql, params = []) => open().prepare(sql).all(...params) as Record<string, any>[],
};
