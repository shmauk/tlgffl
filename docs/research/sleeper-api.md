# Sleeper API: what it gives us for the Sleeper era

Research for [#2](https://github.com/shmauk/tlgffl/issues/2). Probed on 2026-10-12 (NFL week 5 of 2026) against the real league:

- 2026: `1380142135487004672`, in season
- 2025: `1262684581069332480`, complete

Sources:

- **[docs]**: the official docs at https://docs.sleeper.com.
- **[live]**: a live call to `https://api.sleeper.app/v1`.
- **[rules]**: the league's own `playoffs.md` in [shmauk/sleeper-awards](https://github.com/shmauk/sleeper-awards/blob/main/playoffs.md).

Rosters are referred to only by `roster_id`. No usernames, display names, avatars or `user_id`s appear here.

## TL;DR

- The **Sleeper era** can be rebuilt from scratch every day with about 50 unauthenticated GETs per **season**, plus one players dump. Everything game-level is retained: matchups, per-player points, starters and bench, brackets, drafts, transactions and trades.
- A **franchise** maps to a `roster_id`. In 2025 and 2026 all 16 `roster_id`s kept the same owner, so a season chained through `previous_league_id` lines up roster for roster. Co-owners exist, so manager identity should be modelled separately.
- **Brackets do not map cleanly.** Sleeper has only a 6-team `winners_bracket` and an 8-team `losers_bracket`. The league needs three **brackets**, so the commissioner overrides slots by hand:
  - The **Mediocre Bowl** in 2025 was played inside a winners-bracket consolation slot and two losers-bracket slots.
  - Two **Shit Bowl** "byes" were real games against **Mediocre Bowl** teams.
  - So bracket membership must come from a hand-curated per-season mapping table, not from the API.
- **Keepers are not in the API.** `is_keeper` is null on every pick of both drafts, and `rosters[].keepers` is null. Keepers have to be hand-entered.
- **Must snapshot**, because Sleeper only holds the current state:
  - **NFL player** metadata, especially an NFL player's NFL team at the time.
  - **Team names**.
  - Roster ownership and co-owners.

## Endpoint inventory (for a daily rebuild)

Calls per season are for a 16-roster, 18-week season.

| Endpoint | Calls/season | Gives us | Retained historically? | Notes |
|---|---|---|---|---|
| `GET /state/nfl` | 1 per run | current `season`, `week`, `season_type`, `previous_season` | n/a | Decides which week is "live". [docs][live] |
| `GET /league/{id}` | 1 | `season`, `status`, `previous_league_id`, `draft_id`, `settings`, `roster_positions`, `scoring_settings`, `metadata` | yes | See "League settings" below. [live] |
| `GET /league/{id}/rosters` | 1 | `roster_id`, `owner_id`, `co_owners`, `players`, `starters`, `settings`, `metadata` | **current state only** | `settings` has `division`, `wins`, `losses`, `ties`, `fpts(+_decimal)`, `fpts_against(+_decimal)`, `ppts(+_decimal)` (max potential points), `total_moves`, `waiver_budget_used`. `metadata.record` is a W/L string. `keepers`, `taxi` and `reserve` are null or empty. [live] |
| `GET /league/{id}/users` | 1 | users, plus league-scoped `metadata.team_name` | **current state only** | 21 users for 16 rosters in 2025 (co-owners). 15 of the 21 had `team_name` set. PII: do not publish. [live] |
| `GET /league/{id}/matchups/{week}` | 18 | one row per roster: `matchup_id`, `points`, `custom_points`, `starters`, `starters_points`, `players`, `players_points` | yes | The core feed. See "Matchups" below. [docs][live] |
| `GET /league/{id}/winners_bracket` | 1 | 6-team bracket | yes, final state | See "Brackets" below. [docs][live] |
| `GET /league/{id}/losers_bracket` | 1 | 8-team toilet bracket | yes, final state | The docs typo it as `loses_bracket`. `losers_bracket` is what works. [docs][live] |
| `GET /league/{id}/transactions/{week}` | 18 | `waiver`, `free_agent` and `trade` (and `commissioner`, unseen here) with `adds`, `drops`, `draft_picks`, `waiver_budget`, `roster_ids`, `status`, `leg`, `created` | yes | Path param is the week (`leg`). Week 0 is empty. Pre-draft trades land in leg 1. Failed waiver claims are included (`status: failed`). [docs][live] |
| `GET /league/{id}/traded_picks` | 1 | `{season, round, roster_id, owner_id, previous_owner_id}` | yes | `roster_id` is the original slot. `owner_id` and `previous_owner_id` are **roster_ids**, not user ids. 2025 had 44, 2026 has 6. [live] |
| `GET /league/{id}/drafts` | 1 | draft list (one per season here) | yes | `draft_order` is keyed by `user_id`. Use `slot_to_roster_id` from `/draft/{id}` instead. [live] |
| `GET /draft/{draft_id}` | 1 | `type: snake`, `settings.rounds: 14`, `slot_to_roster_id`, `start_time`, `status` | yes | [live] |
| `GET /draft/{draft_id}/picks` | 1 | 224 picks: `round`, `pick_no`, `draft_slot`, `roster_id`, `player_id`, `is_keeper`, `picked_by`, `metadata` | yes | `metadata` freezes the NFL player's name, position, NFL team and years of experience **at draft time**. `is_keeper` is null on all picks in both seasons. [live] |
| `GET /draft/{draft_id}/traded_picks` | 1 | same as league `traded_picks`, plus `draft_id` | yes | [live] |
| `GET /players/nfl` | 1 per day max | map of 12,229 NFL players (53 fields) | **current state only** | See "NFL players" below. [docs][live] |
| `GET /players/nfl/trending/{add,drop}` | optional | `{player_id, count}` | rolling | The docs ask for attribution if it is displayed. [docs] |
| `GET /stats/nfl/regular/{season}/{week}`, `GET /projections/nfl/regular/{season}/{week}` | optional | raw per-player stat lines (228 fields), projections | appear retained (2025 wk1 works) | **Undocumented.** No NFL team or opponent field. Its `pts_half_ppr` does **not** always equal league points: a kicker scored 11.0 in league `players_points` but 12.0 `pts_half_ppr`. Use matchups for fantasy points. [live] |

Total: roughly 45 to 50 calls per season plus `/state` and one players dump. That is nowhere near the published limit.

## Season chaining

- `league.previous_league_id` links the seasons. 2026 points to `1262684581069332480` (2025), and 2025's is `null`, so the Sleeper era starts there. [live]
- Each season is a new league with new `league_id` and `draft_id`, but `roster_id`s carry over. In 2025 and 2026, 16 of 16 `roster_id`s had the same `owner_id` in both seasons. [live]
- Four rosters in 2026 have `co_owners`. The **franchise** ↔ `roster_id` mapping is stable, but **manager** ↔ franchise needs its own table. [live]
- `league.metadata.latest_league_winner_roster_id` = `5`. This matches the 2025 winners-bracket final (`m: 6, p: 1, w: 5`). [live]
- Division labels: `roster.settings.division` (1 to 4) and `league.metadata.division_1..4` (the display names). [live]

## League settings worth knowing

From `GET /league/{id}`, identical in 2025 and 2026 [live]:

- 16 teams, `divisions: 4`
- `playoff_teams: 6`, `playoff_week_start: 15`, `playoff_round_type: 0` (one week per round)
- `max_keepers: 1`, `metadata.keeper_deadline: "0"`
- `trade_deadline: 12`, `pick_trading: 1`
- `waiver_type: 2` (FAAB), `waiver_budget: 100`
- Lineup:

  ```
  roster_positions: QB, RB, RB, WR, WR, TE, FLEX, K, DEF, BN×5
  ```

- Scoring: `half_ppr` per the draft metadata. There are 44 `scoring_settings` keys, so custom tweaks exist (e.g. `fgm_50_59: 0`).
- Regular season is weeks 1–14. Brackets are weeks 15–17 (3 rounds). Week 18 is unused.

**Rules drift:** `playoffs.md` says the final is in "round 16". In 2025 Sleeper actually played the Playoffs and Shit Bowl finals in week 17. A 6-team bracket with two byes needs three rounds. [rules][live]

## Matchups

Each row is one roster for one week. [docs][live]

```json
{ "roster_id": 1, "matchup_id": 6, "points": 97.12, "custom_points": null,
  "starters": ["9758", "4866", "4035", "6801", "11638", "10859", "6806", "17", "HOU"],
  "starters_points": [8.72, 16.4, 12.7, 4.8, 12.8, 10.9, 13.8, 11.0, 6.0],
  "players": ["…16 ids…"], "players_points": { "10218": 4.5, "…": 0.0 } }
```

- **Opponent**: the other row with the same `matchup_id`. [docs]
- **Starters vs bench**:
  - `starters` is ordered to match the non-BN `roster_positions`. The FLEX slot is position 7.
  - The bench is `players − starters`, per the docs.
  - `players_points` covers **every** rostered NFL player, bench included.
  - `points` equals `sum(starters_points)` in all 2025 weeks.
  - This is enough for bench points, optimal-lineup / max-points and "points left on bench" records. [live]
- **Empty slots**: these appear as `"0"` in `starters`, scoring 0. 11 occurrences in 2025, mostly K or FLEX. [live]
- **DEF ids**: these are NFL team abbreviations (`"HOU"`), not numbers. [live]
- **`custom_points`**: the docs say it is set when the commissioner overrides a score. It was null for every 2025 row. If present, it should win over `points`. [docs][live]
- **No playoff flag on matchups.** In weeks 15–17:
  - Bracket games carry ordinary `matchup_id`s.
  - Rosters with no game have `matchup_id: null` but still have `points` and `players_points`.
  - Week 18 of 2025 returns all 16 rosters with `matchup_id: null` and real points.
  - Week 19+ returns `[]`.
  - Bracket games must be identified by joining the brackets: week = `playoff_week_start + r − 1`, matched on the `{t1, t2}` roster pair. [live]
- **Future weeks**: these are pre-populated with pairings and 0 points. The 2026 week 6 rows exist now, which is useful for current-season predictions. The current week is live and changes during games, so a daily rebuild must treat the current week as provisional. [live]

## Brackets

Bracket rows look like this [docs][live]:

```
{ r, m, t1, t2, w, l, t1_from: {w|l: m}, t2_from: {w|l: m}, p?, t1_original?, t2_original? }
```

- `p` is the placement the match decides (1 = final, 3 = third place, 5, 7).
- `t1_original` / `t2_original` (undocumented) appear when the commissioner **overrode** a slot. The league also has `bracket_overrides_id` / `loser_bracket_overrides_id`. [live]
- **In `losers_bracket`, `w` is the lower scorer**: the team that "advances" towards last place. This was verified against every 2025 week 15–17 score. For example, LB m1 had roster 3 on 93.28 vs roster 13 on 122.42, and `w: 3`. [live]
- Sleeper's `losers_bracket` takes 8 of the 10 non-playoff teams. Round 1 has 4 games, with a `p: 1/3/5/7` final round. The league's own 6 + 4 split does not exist in Sleeper. [live]
- **Before week 15 the brackets are projected and change weekly.** 2026 already has projected `t1` / `t2`. Only post-season state is final. [live]

### How the league's three brackets landed in 2025

Membership comes from `playoffs.md` and the final standings. Games come from matchups weeks 15–17 joined to the brackets. [rules][live]

| League bracket | Rosters | Sleeper slots actually used |
|---|---|---|
| **Playoffs** (6) | 4, 5, 6, 7, 9, 11 | `winners_bracket` m1, m2 (wk15), m3, m4 (wk16), m6 `p:1` final and m7 `p:3` (wk17). The commissioner **re-seeded** m1–m4: four `*_original` overrides, because Sleeper's seeding ≠ the league's tiebreakers. Champion: roster 5. |
| **Shit Bowl** (6) | 2, 3, 8, 14, 15, 16 | `losers_bracket` m2 (2 v 15) and m3 (8 v 16) are the wildcard round. Seeds 1–2 (3, 14) had "byes", but Sleeper put them in **real games** m1 (3 v 13) and m4 (14 v 1) against **Mediocre Bowl** teams. Then m5 and m6 (wk16), m9 `p:1` final (wk17: 3 v 8, 8 lost → Shit Bowl "winner"), and m10 `p:3`. m2 and m3 had 8 and 15 swapped by override. |
| **Mediocre Bowl** (4) | 1, 10, 12, 13 | No Sleeper slot exists. 10 and 12 had **no game** in wk15 (`matchup_id: null`). wk16 semis were played in the hijacked `winners_bracket` m5 (`p:5`, 11 v 4 overridden to 1 v 12) and `losers_bracket` m7 (overridden to 10 v 13). The wk17 final was `losers_bracket` m12 (`p:7`, overridden to 10 v 12). Winner: roster 12. |
| (meaningless) | — | `losers_bracket` m8 (11 v 16, overridden) and m11 (13 v 11) in wk16–17 decide nothing for the league. |

Consequences for the spec:

1. Bracket identity per game must be a **hand-curated, per-season table**:

   ```
   (season, week, roster pair) → league bracket, round, game
   ```

   Sleeper's `p` and `m` labels cannot be trusted, since slots get hijacked. This table is small (about 14 games a season) and can be seeded automatically, then corrected.
2. Wk15 games between a Shit Bowl bye team and a Mediocre Bowl team are real Sleeper matchups but **not** bracket games for either team. Records like "bracket games" must exclude them. Whether they count for other records (high scores etc.) is a domain decision.
3. Seeding cannot be read from Sleeper either, because of the overrides and tiebreakers (Breakdown, "Scissors, Paper, Rock"). Compute it from the rules, or hand-enter it.

## Drafts, keepers, trades

- **Drafts**:
  - One snake draft per season, 14 rounds × 16 = 224 picks.
  - Picks carry `roster_id`, `round`, `pick_no` and `draft_slot`.
  - `slot_to_roster_id` gives draft order without user ids. [live]
- **Traded picks**:
  - These appear both in `/league/{id}/traded_picks` and `/draft/{id}/traded_picks`, plus inside each trade transaction's `draft_picks`.
  - `draft_picks[].league_id` is null in transactions. [live]
- **Keepers**:
  - The API carries no keeper information. `is_keeper` is `null` on all 448 picks (2025 and 2026), and `rosters[].keepers` is null.
  - Keepers appear to be entered as ordinary picks. 12 of the 2026 picks were NFL players the same roster held at the end of 2025, spread across rounds 1–13. That is more than one per team in some cases, so this can't be used to infer keepers.
  - The **keeper list must be hand-maintained** for the Sleeper era too, e.g. (season, roster_id, player_id, round). [live]
- **Trades**:
  - These are `type: "trade"` rows: 11 in 2025 and 5 so far in 2026.
  - `adds` / `drops` are maps from `player_id` to `roster_id`.
  - `draft_picks` lists picks moved.
  - `waiver_budget: [{sender, receiver, amount}]` covers FAAB moved.
  - `roster_ids` lists the parties.
  - A trade can have `adds: null` (picks or FAAB only).
  - `metadata.notes` is free text. [docs][live]
- **Waivers / free agents**:
  - `settings.waiver_bid` is the FAAB bid, `settings.seq` and `priority` are also set.
  - `status: failed` marks a lost claim: 231 of 448 waiver rows in 2025.
  - Filter to `complete` for roster history. [live]

## NFL players

- `GET /players/nfl` returns all 12,229 NFL players (9,422 `active`). Observed size: **14.7 MB uncompressed, 2.6 MB gzipped**. The docs say "~5MB".
- The docs ask callers to fetch it **at most once per day** and store it on their own servers.
- `?position=QB&active=true` filters reduce the size. [docs][live]
- Useful fields:
  - `player_id`, `full_name`, `first_name`, `last_name`, `position`, `fantasy_positions`
  - `team`, `status`, `active`, `years_exp`, `birth_date`, `college`
  - Cross-IDs: `gsis_id`, `espn_id`, `yahoo_id`, `sportradar_id`, `rotowire_id`, `stats_id`
  - `injury_status`, `depth_chart_position`, `search_rank` [live]
- DEF entries are keyed by team abbreviation (32 rows). [live]
- All 375 `player_id`s that appeared in 2025 matchups are still in today's dump, so IDs look stable. [live]
- **Current state only**: `team`, `status`, `injury_status` and depth chart reflect today. There is no history of an NFL player's NFL team. The undocumented stats endpoint has no team field either. Draft-pick `metadata` freezes the team at draft time only. [live]

## Rate limits and stability

- No auth. Read-only. Free for **non-commercial** use (commercial use needs a licence). [docs]
- "Stay under **1000 API calls per minute**, otherwise you risk being IP-blocked." No rate-limit headers were returned. [docs][live]
- Responses come through a Cloudflare CDN [live]:
  - `cache-control: s-maxage=300` (5 min) on most league endpoints
  - 86400 on a completed league object
  - 120 on drafts, 60 on `/state/nfl`
  - Weak ETags are present
  - Data can be up to about 5 min stale. That is irrelevant for a daily rebuild.
- Unknown IDs return `404` with body `null`. Out-of-range weeks return `200 []`. [live]
- Typical latency is 0.03–0.5 s. A sequential full rebuild of both seasons took well under a minute. [live]
- Stability caveats [docs][live]:
  - The docs are terse and partly wrong (`loses_bracket`, "5MB").
  - `*_original`, `stats` and `projections` are undocumented and could change.
  - Pin to the documented fields, and archive raw JSON per run, so a schema change never loses history.

## What Sleeper does not keep (must be captured)

| Data | Why | Capture |
|---|---|---|
| NFL player's NFL team, position and status at the time | `/players/nfl` is current-state only | Store the players dump daily (or weekly in season). Key `player_team_history` by (player_id, date/week). |
| **Team names** per season | `users[].metadata.team_name` is the current value on a league-scoped user. It is set on the user, not the roster (co-owners make that ambiguous), and nothing stops later edits. | Snapshot each week and freeze at season end, keyed by roster_id. |
| Roster ownership and co-owners | `rosters[].owner_id` and `co_owners` are current only | Snapshot weekly, keyed by roster_id. Never publish. |
| Weekly squads | `/rosters` is current only | Not needed: matchups `players` gives each week's squad, and transactions give the movements. |
| League bracket mapping, seeding, Shit Bowl / Mediocre Bowl results | Not modelled by Sleeper (see Brackets) | Hand-curated per-season table. |
| Keepers | Not flagged anywhere | Hand-maintained list. |
| Pre-override bracket seeding | Only partly visible via `*_original` | Compute from the rules. |
| Live / in-progress scores | The current week mutates. Late stat corrections may move points. | Rebuild the last completed week as well as the current one each day. Treat the current week as provisional. |

Raw JSON from every run should be archived (e.g. per-season and per-week files). Then any of the above can be recovered later even if not modelled up front.
