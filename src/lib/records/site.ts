// The record pages' way into the build's database: Statsguru's Db interface
// over node:sqlite, so pages run the same engine Statsguru does.
import { open, type Db } from '../database';

export const siteDb: Db = {
  all: (sql, params) => open().all(sql, params),
};
