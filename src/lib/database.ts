// The league database, as everything on the site reads it: pages at build
// time over node:sqlite, Statsguru in the browser over sql.js
// (statsguru/sqljs.ts). Readers take a Db and never open one themselves.
import { DatabaseSync } from 'node:sqlite';

/** The one thing a reader needs from a database: rows for a query. */
export interface Db {
  all(sql: string, params?: (number | string | null)[]): Record<string, any>[];
}

export const DB_PATH = process.env.TLGFFL_DB ?? 'build/league.sqlite';

const opened = new Map<string, Db>();

/** The build's database (or the one at path), read-only. Opened once per path. */
export function open(path: string = DB_PATH): Db {
  let db = opened.get(path);
  if (!db) {
    const sqlite = new DatabaseSync(path, { readOnly: true });
    db = { all: (sql, params = []) => sqlite.prepare(sql).all(...params) as Record<string, any>[] };
    opened.set(path, db);
  }
  return db;
}
