# Games are canonical; reported standings fill the gaps

A franchise's season line (W-L-T, points for and against, seed, placing) is derived from its games wherever the season's game coverage is complete, and falls back to the figures NFL.com reported only where games are missing (2012–14 brackets, playoff scores after 2021, 2022 wk10 – 2024). Reported figures are kept for every NFL.com season and must agree with the derived ones wherever both exist. We chose this so that the 2022–24 games a league-mate is recovering from email can be added later as plain game rows: coverage completes, the season line switches to derived on its own, and the agreement check proves the recovery is right, with no rework.

## Considered Options

- **Season lines always from reported standings, games only for game-level records**: simpler, but two sources of truth forever, and recovered games would never feed season figures.
- **Everything from games only**: impossible today; it would leave 2022–24 with no standings at all.

## Sleeper era

From 2025, game coverage is always complete, so season lines are always derived from games, and a game's score is Sleeper's matchup `points` (or `custom_points` when a commissioner has overridden it), never re-scored from raw stats. Sleeper's roster season totals are not reported figures: they never fill a gap or feed the site, and are only a cross-check. A W-L-T mismatch fails the build. A points mismatch fails it unless a hand-kept entry explains the exact difference, and an entry that no longer matches a real gap fails it too. The first entry: in 2025 week 9, Sleeper's totals kept 6 points for a special-teams return TD that the league's scoring doesn't count.
