// The engine's Db over a sql.js database, as Statsguru opens it in the browser.
import type { Database } from 'sql.js';
import type { Db } from './engine';

export function sqlJsDb(database: Database): Db {
  return {
    all(sql, params = []) {
      const stmt = database.prepare(sql, params);
      const rows: Record<string, any>[] = [];
      try {
        while (stmt.step()) rows.push(stmt.getAsObject());
      } finally {
        stmt.free();
      }
      return rows;
    },
  };
}
