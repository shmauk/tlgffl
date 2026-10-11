# Hosting and data-serving options within $20 a year

Research for [#3](https://github.com/shmauk/tlgffl/issues/3), feeding the stack/hosting decision in #10. Sources checked 2026-10-12. This note does not make the decision.

## Constraints

- Public site. Free if possible, $20/year at most, and a custom domain counts toward the cap.
- Data rebuilt daily during the season from the Sleeper API by a scheduled job.
- A Statsguru-style query tool (filters, then aggregate or game-by-game views) over about 15 seasons × 16 franchises, plus Sleeper-era (2025 on) NFL-player weekly rows.

## How big is the data?

Estimates, checked against a synthetic SQLite build (random values, so it compresses worse than real data would):

| Table | Rows | Basis |
|---|---|---|
| Team-games (one row per franchise per week) | ~4,100 total (~2,000 matchups) | 15 seasons × 16 franchises × ~17 weeks. Grows by ~270 a season. |
| Rostered player-weeks (Sleeper era) | ~5,800 a season | 16 rosters × ~20 players × 18 weeks, from `matchups` `players`/`starters` |
| All NFL player-weeks (optional) | ~36,000 a season | ~2,000 fantasy-relevant players × 18 weeks |
| Players | ~4,000–11,000 | `/players/nfl` dump (~5 MB JSON, at most one call a day per Sleeper's docs) |

The synthetic DB with team-games for 2012–2026, two Sleeper seasons of rostered rows and all-NFL rows, and 4,000 players came to **4.6 MB raw, 2.2 MB gzip, 1.6 MB brotli**. Without the all-NFL table it is well under 1 MB. Each extra Sleeper season adds about 2 MB raw with all-NFL rows, or about 0.3 MB with rostered rows only. Typical Statsguru aggregates (group-by franchise over a season range, top-50 players by points) ran in **about 20 ms** in native SQLite. Expect WASM to be a few times slower, which is still effectively instant.

**What this means:** this is a tiny dataset. Any option can query it fast, so the choice comes down to cost, cold starts, lock-in and maintenance, not performance.

Sleeper API facts that matter here: stay under 1,000 calls a minute or risk an IP block. `GET /v1/league/<id>/matchups/<week>` gives `starters`, `players` and `points`. `/players/nfl` is about 5 MB and should be fetched at most daily and cached. ([docs.sleeper.com](https://docs.sleeper.com/))

## Options

### 1. Static site + prebuilt JSON

A scheduled job fetches from Sleeper, builds the site and JSON files (per season, per franchise, plus pre-aggregated record tables), and deploys them.

- **Cost:** $0 on GitHub Pages or Cloudflare Pages / Workers Static Assets.
  - GitHub Pages: 1 GB site, a *soft* 100 GB/month bandwidth limit, and a soft limit of 10 builds an hour that doesn't apply when deploying via a custom Actions workflow. It is not meant for commercial SaaS. ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits))
  - Cloudflare Pages Free: 500 builds a month, 20,000 files, 25 MiB per file. ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)) Workers Static Assets: "Requests to static assets are free and unlimited", with no storage charge. ([Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/))
- **Query performance:** instant for anything precomputed. Ad-hoc Statsguru means shipping the raw rows as JSON (~1–3 MB compressed) and writing the filter/group-by logic in JS by hand. That is fine at this size, but every new aggregate is custom code.
- **Cold start:** none.
- **Maintenance:** lowest. No server and no DB credentials.
- **Lock-in:** none. Any static host works.
- **Weakness:** the query tool becomes a hand-rolled mini query engine.

### 2. Static site + in-browser SQL

The same pipeline, except the build step emits a SQLite (or Parquet/DuckDB) file. The browser downloads it once, and the Statsguru UI turns filters into SQL.

Engine download sizes, measured from the npm builds on jsDelivr on 2026-10-12:

| Engine | Version | `.wasm` raw | gzip | brotli |
|---|---|---|---|---|
| sql.js | 1.14.2 | 658 KB | 322 KB | 279 KB |
| Official SQLite WASM (`@sqlite.org/sqlite-wasm`) | 3.53.4 | 867 KB | 396 KB | 343 KB |
| DuckDB-wasm (`duckdb-eh.wasm`) | 1.33.1-dev | **35.9 MB** | 8.1 MB | 5.3 MB |

- **Total first load (SQLite route):** ~0.3–0.4 MB engine plus ~0.5–2 MB DB compressed. Both cache well, and the DB can carry a content-hash filename so a new file is fetched only after the daily rebuild.
- **sql.js** loads the whole DB into memory from a `Uint8Array` (`new SQL.Database(data)`). That suits a read-only DB of a few MB. ([sql.js README](https://github.com/sql-js/sql.js)) The official SQLite WASM build is maintained by the SQLite project and also offers OPFS persistence, which isn't needed here. ([sqlite.org/wasm](https://sqlite.org/wasm/doc/trunk/index.md))
- **DuckDB-wasm** runs single-threaded by default (multithreading is experimental), is capped at 4 GB of WASM memory, and can range-read remote Parquet only via its JS httpfs path. The built-in httpfs extension may download the whole file ([duckdb-wasm #2153](https://duckdb.org/docs/current/clients/wasm/overview.html)). Its 36 MB raw `.wasm` also **exceeds Cloudflare's 25 MiB per-asset limit**, so it would have to come from a CDN such as jsDelivr. It is overkill at this data size.
- **Cost:** $0, on the same hosts as option 1.
- **Query performance:** milliseconds per query once loaded. The initial load is about 1–2 s on a decent connection.
- **Cold start:** none server-side. A one-time WASM and DB download per visitor (then cached).
- **Maintenance:** low. The build job writes one `.sqlite` file, and Statsguru is "UI → SQL" instead of custom aggregation code.
- **Lock-in:** none. SQLite files are portable, and the same DB could later be served by D1 or Turso unchanged.

### 3. Cloudflare Workers/Pages + D1

The static frontend calls a Worker API, which queries D1 (SQLite).

- **Cost:** $0 on Workers Free. Workers Paid is a **$5/month minimum ($60/year), which is over the cap**. ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/))
- **Free limits:**
  - D1: 5 M rows read and 100 k rows written a day, 5 GB total storage, 500 MB max per DB, 10 DBs, 50 queries per Worker invocation. ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/))
  - Workers: 100,000 requests a day and 10 ms CPU per invocation. Past the request limit, visitors get Error 1027, or the Worker is bypassed if the route is set to fail open. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/))
  - Cron Triggers: 5 per account on Free, 15-minute wall-time per invocation, run in UTC. ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/))
- **Query performance:** fine. **Caveat on "rows read":** D1 counts rows *scanned*, so an unindexed aggregate over a 72 k-row all-NFL table burns 72 k rows per query. That allows ~70 such queries a day before the 5 M cap, unless indexed, precomputed or cached. With rostered-only data and indexes it is comfortable.
- **Daily rebuild:** a full reload of ~80 k rows each day is within 100 k writes a day, but incremental upserts are safer. The 10 ms CPU cap on Free cron triggers is tight for parsing the ~5 MB `/players/nfl` JSON inside a Worker. Doing the ingest in GitHub Actions and pushing with `wrangler d1 execute` sidesteps this.
- **Cold start:** Workers isolates have negligible cold start. D1 adds a network round-trip per query.
- **Maintenance:** moderate. An API layer, schema migrations, and SQL-injection-safe query building for the ad-hoc tool.
- **Lock-in:** moderate. The D1 API and Wrangler are Cloudflare-specific, but the data is SQLite and exportable.

### 4. Turso (libSQL)

- **Cost:** $0 on Free. The cheapest paid plan (Developer) is $4.99/month, over the cap. ([Turso pricing](https://turso.tech/pricing))
- **Free limits:** 100 DBs, 5 GB storage, 500 M rows read and 10 M rows written a month, 1-day point-in-time restore. The pricing page says nothing about archiving inactive free DBs.
- **Access:** `@libsql/client/web` runs in Cloudflare Workers and other non-Node runtimes ([TS SDK reference](https://docs.turso.tech/sdk/ts/reference)). Tokens can be `--read-only` with an expiry or `never` ([CLI tokens](https://docs.turso.tech/cli/db/tokens/create)). Even so, embedding a token in a public browser bundle exposes it to unlimited reads that count against the quota, so a thin Worker proxy is the realistic setup.
- **Query performance:** fine. The read quota (~16 M a day on average) is far roomier than D1's 5 M a day.
- **Cold start:** none documented on the pricing page. Treat it as per-query network latency.
- **Maintenance:** moderate. A third vendor (host + Turso + scheduler) and token management.
- **Lock-in:** low to moderate. libSQL is a SQLite fork, and dumps are portable.

### 5. Supabase free tier (Postgres)

- **Cost:** $0. Pro is $25/month, far over the cap. ([Supabase pricing](https://supabase.com/pricing))
- **Free limits:** 500 MB DB per project, 5 GB egress plus 5 GB cached egress, 2 active projects.
- **Pausing:** free projects are **paused after low activity over a rolling 7-day period**. The docs say "a few user requests to the database each day" usually prevents it, but warn it may not be enough. Paused projects can be restored in one click for 1 year. ([Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Upgrading](https://supabase.com/docs/guides/platform/upgrading)) The daily in-season rebuild would keep it awake. **In the off-season (Feb–Aug) it would pause** unless a keep-alive job pings it, and a paused DB means a broken Statsguru until someone restores it.
- **Query performance:** excellent (real Postgres, and PostgREST/RPC can expose views).
- **Cold start:** none while active. Effectively infinite when paused.
- **Maintenance:** moderate. Pausing management and RLS policies for public read access.
- **Lock-in:** low for the data (plain Postgres). Moderate if the site leans on supabase-js and PostgREST conventions. sleeper-awards already uses Postgres, which is a point in its favour for code reuse.

### 6. A tiny always-on server

- **Paid VPS:** Hetzner's smallest cloud plans (CX23 / CAX11: 2 vCPU, 4 GB, 40 GB NVMe) don't show a price on the public pages ([Hetzner cost-optimized](https://www.hetzner.com/cloud/cost-optimized/)). Hetzner announced price adjustments effective 1 April and 15 June 2026 ([pressroom](https://www.hetzner.com/pressroom/)). Historically they cost about €4/month, so **≥ ~$45/year, over the cap**. Other mainstream VPSes cost more.
- **Oracle Cloud Always Free:**
  - Free on paper: up to 2 AMD micro VMs (1/8 OCPU, 1 GB) or Ampere A1 with 2 OCPUs and 12 GB total, plus 200 GB block storage, in the home region. ([OCI Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm))
  - Oracle **may reclaim idle instances**: over 7 days, 95th-percentile CPU < 20%, network < 20%, and (A1 only) memory < 20%. A low-traffic league site would sit below all of these.
  - "Out of host capacity" errors are documented.
- **Query performance:** excellent (local Postgres or SQLite).
- **Cold start:** none.
- **Maintenance:** **highest**. OS patching, TLS, uptime, backups and security, which is a lot for a hobby site that several league-mates will co-own.
- **Lock-in:** none technically, but the box itself is a pet.

### 7. Schedulers (for the daily rebuild)

- **GitHub Actions cron:**
  - Free for public repos on standard runners. Private repos on the Free plan get 2,000 minutes a month. ([Actions billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions))
  - The minimum interval is 5 minutes, and runs can be delayed at busy times, especially "the start of every hour", so pick an odd minute.
  - **"In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days."** ([Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows)) The daily job commits nothing if it deploys straight to Pages, so in a quiet off-season the cron could switch off silently. Mitigations: have the job commit the built data (counts as activity), use a keep-alive action, or re-enable it at season start. During the season, daily data commits keep it alive anyway.
  - Full Node/Python/Go toolchain, 6-hour job limit, and secrets for deploy tokens. This is the natural home for the ingest step.
- **Cloudflare Cron Triggers:**
  - Free (5 per account), UTC, up to 15 minutes to propagate changes, and a 15-minute wall-time per run. No inactivity disable is documented.
  - The catch is **10 ms CPU per invocation on Free**, which is too little to parse the ~5 MB player dump or rebuild a DB in-Worker.
  - Good as a trigger (for example, firing a GitHub `repository_dispatch` so the 60-day rule matters less), not as the builder.

## Domain cost (counts toward the $20)

- Cloudflare Registrar sells at cost with no markup ([Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)).
- Current at-cost renewals: **.com $10.46/year**, .org $11.20, .net $11.86, .xyz $11.20 (registration $12.30), **.uk $5.30**. These come from a third-party tracker ([cfdomainpricing.com](https://cfdomainpricing.com/), updated 2026-10-11), since Cloudflare shows prices only in the dashboard. Confirm at purchase.
- A free `*.github.io` / `*.pages.dev` subdomain costs $0.
- So a custom domain uses about $5–12 of the $20, which leaves no room for any paid hosting tier (all of them are ≥ $5/month).

## Ranked shortlist

1. **Static site + SQLite-in-the-browser (official SQLite WASM or sql.js), built daily by GitHub Actions, hosted on Cloudflare Pages/Workers Static Assets or GitHub Pages.**
   - $0 plus an optional domain at ~$5–12.
   - Real SQL for Statsguru, about 1–2 MB first load, no server and no cold starts.
   - The DB stays portable to D1 or Turso if needs grow.
   - Watch the 60-day cron disable in the off-season.
2. **Static site + prebuilt JSON** (same pipeline, no WASM).
   - Simplest and smallest. The cost is hand-written aggregation code for every Statsguru view.
   - A good fit if Statsguru turns out to be a fixed set of views rather than truly ad-hoc.
3. **Cloudflare Workers + D1 (free).**
   - Server-side SQL with no extra vendor if already on Cloudflare.
   - Watch the 5 M rows-read-a-day cap on unindexed scans and the 10 ms CPU limit. Do the ingest in Actions.
4. **Turso free (behind a Worker).**
   - Roomier read quota than D1, but a third vendor and token handling for no real gain at this size.
5. **Supabase free.**
   - Postgres familiarity (sleeper-awards reuse), but off-season pausing is a real outage risk for a record book people consult year-round.

Not recommended: paid VPS (over the cap) and Oracle Always Free (idle reclamation and high maintenance).
