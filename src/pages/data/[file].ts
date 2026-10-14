// Ships the build's database for Statsguru (ADR 0002), under a name that
// changes with its contents so no browser holds on to an old copy.
import type { APIRoute } from 'astro';
import { databaseFile } from '../../lib/database-file';

export function getStaticPaths() {
  return [{ params: { file: databaseFile().name } }];
}

export const GET: APIRoute = () =>
  new Response(databaseFile().bytes, { headers: { 'Content-Type': 'application/vnd.sqlite3' } });
