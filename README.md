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

The fetch pulls every Sleeper-era season (league ids in `recordbook/fetch_sleeper.py`; add each new
season's there) and writes a file only when its content changed. Privacy reductions are applied
before writing: users become `{roster_id, team_name}`, the players dump is cut to the league's NFL
players, and forbidden fields are stripped. A season in progress also gets dated weekly
`<season>-team_names-<week>.json` and `<season>-players-<week>.json` files, because Sleeper only
keeps the current team names and NFL teams.

Two hand-kept tables go with it. `data/sleeper_brackets.csv` assigns every pairing Sleeper made in
a bracket week to the Playoffs, the Shit Bowl, the Mediocre Bowl or `filler` (never a game), since
Sleeper's winners and losers brackets don't match the league's three; a missing or stale row fails
the build. `data/sleeper_adjustments.csv` explains, to the point, any gap between Sleeper's roster
season totals and the games (ADR 0001, Sleeper era); an unexplained or stale gap fails the build.
