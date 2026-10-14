# The Fantasy League record book

See `GLOSSARY.md` for the league's language and `docs/adr/` for the decisions behind the pipeline.
To change data or propose a record or award, see `CONTRIBUTING.md`.

## Building locally

Needs Python 3.14 and Node 24 or later. The Python build's one dependency is PyYAML, for the
hand-kept `data/formats.yaml` (`requirements.txt`); pytest is the one dev dependency.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
npm ci

.venv/bin/python -m pytest -q                      # Python tests
.venv/bin/python -m recordbook.validate data        # checks every hand-kept table, row by row
.venv/bin/python -m recordbook.build               # data/ -> build/league.sqlite, from scratch
.venv/bin/python -m recordbook.privacy             # fails on a forbidden field in data/, golden/ or the database
.venv/bin/python -m recordbook.golden              # compares the database with golden/league_records.json
npm run test:components                            # the shared components and helpers (Vitest)
npm run build                                      # Astro renders dist/ from build/league.sqlite
npm run test:site                                  # checks dist/ against the database
```

`build/league.sqlite` and `dist/` are build artifacts and are never committed (ADR 0003).
CI (`.github/workflows/site.yml`) runs the same steps and deploys `dist/` to Cloudflare Pages:
pushes to `main` go to production, and every other branch with a PR gets a preview. Deploying needs
the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and a Direct Upload Pages
project named `tlgffl`.

### The scheduled refresh

The same workflow runs every morning at 06:00 UTC (after Monday night's game) and can be run by
hand (`workflow_dispatch`). It fetches Sleeper, runs the privacy check on `data/`, commits the
snapshot straight to `main` as `github-actions[bot]` if anything changed (a quiet day commits
nothing), then builds and deploys that commit. A failing build deploys nothing and fails the run,
with a note in the run summary; the likeliest cause in the brackets is a newly scored bracket week
missing from `data/sleeper_brackets.csv`.

```bash
.venv/bin/python -m recordbook.schedule [--today YYYY-MM-DD]   # would today's scheduled run refresh?
```

How often it refreshes comes from the latest Sleeper season in the snapshot, not from editing the
cron: daily from its draft (`drafts[].start_time`) until its last bracket week (`data/formats.yaml`)
is scored, and on Tuesdays otherwise. So each new season needs its league id in
`data/sleeper_leagues.csv` and its entry in `data/formats.yaml`; the weekly runs then pick up the
draft date as soon as it is set.

Keep-alive: GitHub disables a public repo's scheduled workflows after 60 days without activity, and
off-season there are no snapshot commits. Every scheduled run therefore re-enables its own workflow
through the API (`PUT /repos/{repo}/actions/workflows/site.yml/enable`, the `actions: write`
permission). If the schedule is ever disabled anyway, re-enable it from the Actions tab or with
`gh workflow enable site.yml`.

### Importing ff-data-project's archive (one time)

The NFL.com and Sleeper archive comes from [ff-data-project](https://github.com/juffleberry/ff-data-project)
and is committed here once; nothing reads from that repo afterwards.

```bash
git clone https://github.com/juffleberry/ff-data-project /tmp/ff-data-project
git -C /tmp/ff-data-project checkout 6e7fefd2638efa9c235032d99b27eaeb2e52db54   # the version this repo was checked against
.venv/bin/python -m recordbook.import_ff /tmp/ff-data-project --dest .
```

This copies the raw responses and hand-kept tables into `data/` and the published figures into
`golden/league_records.json`, stripping the fields the privacy check forbids (Sleeper chat
metadata and manager-typed player nicknames). `data/franchises.csv` is not imported: here it is
the hand-kept franchise id table.

### Golden test allow-list

`golden/allowlist.csv` lists figures that may differ from ff-data-project's, one per line as
`<franchise name>|<season>|<field>,<reason>` (or `<season>|<field>` for a season's champion,
runner-up and Shit Bowl winner). Every entry needs a reason, and an entry with nothing left to
excuse fails the check.

### Hand-kept bracket tables

`data/formats.yaml` holds every season's format; a season without one fails the build.
`data/shitbowl.csv` and `data/mediocre_bowl.csv` record NFL.com-era Shit Bowl and Mediocre Bowl
winners, which no platform data can supply. A blank row is shown as unknown, and `A|B` as disputed.

### The Sleeper era

```bash
.venv/bin/python -m recordbook.fetch_sleeper       # snapshots the Sleeper API into data/sleeper/
```

The fetch pulls every Sleeper-era season in the hand-kept `data/sleeper_leagues.csv` (season,
league id) and writes a file only when its content changed. Sleeper links each season's league to
the one before but never to the next, and finding the next would need a manager's user id, which
the record book never uses, so each new season's league id is a one-line edit to that table. The
fetch fails before writing anything if a league isn't its row's season or doesn't follow the
previous season's league, and the validation checks every league snapshot against the table. Privacy reductions are applied
before writing: users become `{roster_id, team_name}`, the players dump is cut to the league's NFL
players, and forbidden fields are stripped. A season in progress also gets dated weekly
`<season>-team_names-<week>.json` and `<season>-players-<week>.json` files, because Sleeper only
keeps the current team names and NFL teams. The season Sleeper's state is about gets
`<season>-state.json`, cut to its `season_start_date` (week 1).

The home page is the current season's hub. Which season is current, and its phase (regular season,
brackets or off-season), is decided once, by the Python build (`recordbook/current.py`, written to
the `current_season` table), from the data and the build date, never by hand: a season becomes
current at its week 1 (that date, or its first final week), its brackets start once every
regular-season week is final, and its off-season once every bracket is crowned. The build date is
the UK date unless `python -m recordbook.build --today YYYY-MM-DD` says otherwise; every page's
"Updated <date>" stamp is that date. Records, the season pages, the predictor and the home page all
read it, and a season counts as finished (for career and bracket records) once it reaches its
off-season. Only final weeks
have scores; the week being played shows Sleeper's pairings. Until a bracket-week pairing has its
row in `data/sleeper_brackets.csv`, the build places it from the bracket games already played (a
franchise still in a bracket plays its next round); a bracket's opening-week pairings, which only
the seeds can place, are placed by the seeding module.

Three hand-kept tables go with it. `data/sleeper_brackets.csv` assigns every pairing Sleeper made in
a bracket week to the Playoffs, the Shit Bowl, the Mediocre Bowl or `filler` (never a game), since
Sleeper's winners and losers brackets don't match the league's three; a missing or stale row fails
the build. `data/sleeper_adjustments.csv` explains, to the point, any gap between Sleeper's roster
season totals and the games (ADR 0001, Sleeper era); an unexplained or stale gap fails the build.
`data/keepers.csv` records each season's keepers, since Sleeper's `is_keeper` is always null: the
validation checks each one is the franchise's pick of that NFL player in the round it cost. A season
with no rows shows "keepers not yet recorded" rather than failing, unless `data/formats.yaml` says
it was played without keepers (`keepers: false`, from 2026). Each draft pick records the
franchise whose slot it was (the draft's `slot_to_roster_id`) and the franchise that made it, and a
pick made by a franchise that didn't own it according to the traded picks fails the build.

Sleeper-era seeds, the playoff picture and clinch marks come from one TypeScript module,
`src/lib/seeding.ts` (ADR 0005); Python only writes its inputs, including the regular-season
pairings still to play and the hand-kept `data/scissors_paper_rock.csv` rulings. `npm run build`
fails if a finished season's computed seeds don't match the brackets played, or if its seeds
still wait on a scissors-paper-rock ruling.
