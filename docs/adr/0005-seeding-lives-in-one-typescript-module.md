# Seeding and clinches live in one TypeScript module

The playoff predictor has to work out seeds and clinches in the browser, so seeding can't stay only in Python. Instead of two copies, seeding and clinch logic for the current season live in one TypeScript module. The Astro build uses it for the playoff picture, the clinch marks and the check that a season's seeds match the brackets actually played, and the predictor uses it in the browser. Python still writes every input (games, divisions, the format file, hand-recorded scissors-paper-rock results) but derives no current-season seeds. This is the one exception to ADR 0004's rule that the frontend never derives figures of its own. NFL.com-era seeds are still taken as reported and aren't computed by anyone.

## Considered Options

- **Seeding in both Python and TypeScript**: keeps ADR 0004's boundary, but the two copies would drift, as sleeper-awards' code did from `playoffs.md`.
- **Precomputing scenarios in Python**: the predictor would need every combination of remaining results, which is far too many before the last two weeks.
