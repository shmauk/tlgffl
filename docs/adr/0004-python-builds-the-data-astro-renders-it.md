# Python builds the data, Astro renders it

The pipeline uses two languages. A Python build (restructured from ff-data-project's `build.py`) fetches, validates and writes the SQLite database. An Astro site reads that database at build time to render the static pages, and hosts Statsguru as its one interactive island on SQLite WASM. Python keeps the logic that is hardest to get right, and already checked: franchise identity, bracket reconstruction and Shit Bowl crowning. Astro fits the site's shape: many static pages that ship no JS, plus one interactive tool. The boundary between them is the database file. The frontend only reads it and never derives figures of its own.

## Considered Options

- **All Python (Jinja templates, plain-JS Statsguru)**: one toolchain, but every component and all of Statsguru's UI would be hand-rolled.
- **All TypeScript**: one language end to end, but build.py's checked logic would have to be ported, which risks breaking it.
- **Go (port sleeper-awards)**: its logic only covers 2025, keys on Sleeper users, and drifts from the written rules.
