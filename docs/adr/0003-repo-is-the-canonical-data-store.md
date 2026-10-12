# The repo is the canonical data store; the database is a build artifact

All source data is committed to this repo: the raw platform responses (the imported NFL.com archive and the Sleeper snapshots) and the hand-maintained tables (franchise aliases, bracket assignments, keepers, Shit Bowl winners, badges, and later the recovered games). The SQLite database is rebuilt from scratch on every build and never committed. That makes every figure reproducible from history. A correction or recovered data is just a commit that can be reviewed. And the daily snapshot commits keep the scheduled workflow from being switched off for inactivity. ff-data-project's archive is imported here, and that repo stops being an upstream.

## Considered Options

- **A hosted database as the source of truth**: ruled out by ADR 0002 (no server). It would also hide edits from review and need its own backups.
- **Keep ff-data-project as a live upstream for 2012–2024**: no import needed, but every build would depend on two repos, and corrections would be split between them.
