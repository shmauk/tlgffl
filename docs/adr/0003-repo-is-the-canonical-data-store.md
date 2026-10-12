# The repo is the canonical data store; the database is a build artifact

All source data is committed to this repo: the raw platform responses (the imported NFL.com archive and the Sleeper snapshots) and the hand-maintained tables (franchise aliases, bracket assignments, keepers, Shit Bowl winners, badges, and later the recovered games). The SQLite database is rebuilt from scratch on every build and never committed. That makes every figure reproducible from history. A correction or recovered data is just a commit that can be reviewed. And the daily snapshot commits keep the scheduled workflow from being switched off for inactivity. ff-data-project's archive is imported here, and that repo stops being an upstream.

## Considered Options

- **A hosted database as the source of truth**: ruled out by ADR 0002 (no server). It would also hide edits from review and need its own backups.
- **Keep ff-data-project as a live upstream for 2012–2024**: no import needed, but every build would depend on two repos, and corrections would be split between them.

## NFL.com-era drafts and keepers

The 2017–2024 draft boards and 2021–2024 keeper lists only exist as Google Sheets, and they name owners by their real first names. Their raw exports are **not** committed. They are converted once, by hand, into CSV keyed on franchise ids and Sleeper player ids, and that CSV is the canonical data, edited by PR like any other hand-kept table. The mapping from owner names to franchises is used during the conversion and never committed, and the site doesn't link to the sheets. Corrections can't be replayed from a raw file, so they are made to the CSV directly.
