# Static pages, with SQLite in the browser only for Statsguru

The site is fully static. Each build produces one SQLite database. From it, the build pre-renders the fixed pages (records, franchises, seasons, awards) as HTML, and ships the same file for Statsguru to load into the browser, but only when Statsguru is opened. There is no server and no hosted database. This fits the free-tier-only budget, means no cold starts or idle shutdowns in the off-season, and lets the fixed pages and Statsguru be computed from one database so their figures can't disagree.

## Considered Options

- **Every page queries SQLite in the browser**: one code path, but every page has to download the engine and database before it can show anything, and nothing can be indexed by search engines.
- **Prebuilt JSON only**: the simplest option, but every Statsguru aggregate would have to be hand-written in JS.
- **An edge database (Cloudflare D1, Turso) or Supabase**: real server-side SQL, but it brings row-read quotas, another vendor, and (with Supabase) pausing in the off-season, for data that is only about 2 MB.
