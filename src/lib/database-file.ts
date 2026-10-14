// The database file Statsguru downloads: the build's own bytes, named by a
// hash of them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DB_PATH } from './db';
import { dataFileUrl } from './urls';

let file: { name: string; url: string; bytes: Uint8Array } | undefined;
export function databaseFile() {
  if (!file) {
    const bytes = new Uint8Array(readFileSync(DB_PATH));
    const name = `league-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.sqlite`;
    file = { name, url: dataFileUrl(name), bytes };
  }
  return file;
}
