# ESPNcricinfo Statsguru and records: the feature catalogue to borrow from

Research for [#4](https://github.com/shmauk/tlgffl/issues/4), part of the map [#1](https://github.com/shmauk/tlgffl/issues/1). Domain terms (Franchise, Manager, Season, Era, Division, Playoffs, Shit Bowl, Mediocre Bowl, Breakdown) are as defined in `GLOSSARY.md`.

## Answer in brief

ESPNcricinfo's record book has three parts that work together:

1. **Statsguru**, a query builder. You choose a format (`class`), a subject (`type`: batting, bowling, team and so on), around 30 filters, a view (overall, innings by innings, or split by season, opponent and so on), a grouping, one numeric qualification (min to max), a sort column and a page size. The whole query is held in one URL with semicolon-separated parameters.
2. **The records index**. This is a fixed, curated list of about 300 named records per format. It is organised as format, then category, then subheading, then record. The same lists can be scoped to one team, one opposition or one host country.
3. **Player pages**. Each has a profile overview, a full splits page, a "records held" list, recent matches, debut and last matches, and a Statsguru analysis page per format with about 15 views.

**Translation in one line:** a Franchise stands in for both the player and the team. A franchise's weekly score is an innings, and a game is a match. A Season is a series and also a year. The opponent franchise is the opposition, and a Manager plays the part of a captain. The bracket (Playoffs, Shit Bowl or Mediocre Bowl) or the regular season stands in for the match format or trophy. Points for map to batting and points against map to bowling. An NFL player is the "individual player" one level down, and exists only from the Sleeper era on.

Most of the venue machinery does not carry over: host country, ground, continent, home/away, toss, batting first, day/night. The same goes for most of the cricket mechanics: dismissals, wickets, balls, extras, fielding, wicketkeeping and umpires.

### Data-availability key

The labels used throughout:

- **A**: all eras. This needs only season standings, which exist for 2012 onward.
- **G**: needs game scores. These exist for 2012 to 2022 week 9 and for 2025 onward. 2022 week 10 to 2024 is missing until back-filled. Career figures built from games are incomplete until then.
- **S**: Sleeper era only (2025 onward). This covers lineups, NFL player points, transactions and drafts.
- **✗**: does not translate.

These availability facts come from the task brief and map #1. I did not re-check them against the archive. I am also assuming that "standings" means season W-L-T, plus season points for and against where the export has them. If the standings lack PF and PA, the season-level points rows in this document drop from A to G.

---

## 1. Statsguru

### 1.1 Query structure

There is one query page per subject. The tabs are: Batting | Bowling | Fielding | All-round | Partnership | Team | Umpire and referee | Aggregate/overall. A "Basic filter | Advanced filter" toggle (`filter=advanced`) shows the full filter set. [S1][S2]

The format selector (`class`) covers Tests (1), ODIs (2), T20Is (3), combined Test/ODI/T20I (11), Twenty20 (6), women's and youth formats, and so on. Switching format or subject on a results page keeps every other filter. [S3]

| Statsguru control | Values seen | Fantasy equivalent | Data |
|---|---|---|---|
| Format (`class`) | Tests / ODIs / T20Is / combined… | Game type: regular season / Playoffs / Shit Bowl / Mediocre Bowl / all games. Era (NFL.com vs Sleeper) as a second "class"-like switch | A (bracket placements) / G (bracket games) |
| Subject (`type`) | batting, bowling, fielding, allround, fow (partnership), team, official, aggregate | batting → **points for**; bowling → **points against**; team → franchise results (W-L-T, margins); aggregate → league-wide totals per game, season or week; partnership/fielding/official → ✗ (but see §1.5); new subjects: **manager**, **NFL player** (S) | — |
| Team (`team`) | a team | Franchise | A |
| Opposition (`opposition`) | a team | Opponent franchise | G |
| Home or away (`home_or_away`) | home / away / neutral | ✗ (fantasy has no venue) | ✗ |
| Host country / Continent / Ground | lists | ✗. The nearest substitute is **opponent's Division**, or in-division vs out-of-division games | G |
| Starting date (`spanmin1`/`spanmax1`, `spanquickpick`) | date range; quick picks such as "last 5 years" or "2010s" | Season range, or season plus week range. Quick picks: "this season", "last 3 seasons", "NFL.com era", "Sleeper era" | A / G |
| Season (`season`) | 1876/77… | Season | A |
| Series (`series`) | a named series | Season, or a specific bracket within a season ("2019 Shit Bowl") | A / G |
| Trophy (`trophy`) | Ashes, Border–Gavaskar… | Bracket (Playoffs / Shit Bowl / Mediocre Bowl). Could also be used for any named rivalry the league recognises | A / G |
| Tournament type (`tournament_type`) | 2-team / 3–4 / 5+ | ✗ (every season is the same 16-team shape) | ✗ |
| Match type (`final_type`) | tournament finals / preliminary | Championship (final) game vs earlier rounds; regular season vs bracket | G |
| Day/night (`floodlit`) | day / day-night | ✗ (a cute but low-value option is NFL kickoff window: TNF/Sunday/MNF, S only) | ✗ |
| Match result (`result`) | won / lost / tied / drawn | Won / lost / tied (no draws) | G (A for season W-L) |
| Toss; Batting or fielding first | won/lost; first/second | ✗ | ✗ |
| Captaincy (`captain`) / Match involving captains | as captain / not; captain name | Manager: "games while managed by X", "games involving manager X" | A / G |
| Wicketkeeper (`keeper`) | as keeper / not | ✗ | ✗ |
| Debut or last match (`debut_or_last`) | career debut / last / team debut / last for team | Franchise's first or last season; manager's first season with a franchise | A |
| Age at start of match (`agemin1`…) | 14–52, quick picks | Franchise tenure (nth season of the franchise or of its manager) | A |
| Match involving players (`search_player`) | name | Games involving franchise X (or NFL player X, S) | G / S |
| Innings in match (`innings_number`) | 1st–4th | ✗. The nearest substitute is **week of season** (see "match number in series" in §1.4) | G |
| Runs scored in an innings (`runsmin1`…, `runsquickpick`) | 0–400; "nervous nineties", "centuries" | Points scored in a game, with quick picks for league milestones (for example 150+ or under 80) | G |
| Batting position | 1–11; openers / middle / tail | Lineup slot (QB/RB/WR/TE/FLEX/K/DEF) | S |
| Dismissed / type of dismissal | out / not out; caught, bowled… | ✗ | ✗ |
| Team runs / wickets / balls; innings end (all out, declared…) | ranges | Points scored range; wickets, balls and innings end are ✗ | G |

Sources: the batting, team and aggregate advanced query pages [S1][S2][S4].

### 1.2 View formats (`view`)

| Statsguru view | Where offered | Fantasy equivalent | Data |
|---|---|---|---|
| Overall figures (`view=`) | all subjects | Career table, one row per franchise: G, W-L-T, PF, PA, avg, high, low, milestone counts | A (season sums) / G (game-derived columns) |
| Innings by innings list (`innings`) | batting, bowling, team | **Game log**: every franchise-game row | G |
| Match totals (`match`) | batting, bowling, team, aggregate | For franchises this is the same as the game log, since one fantasy game has one score per side. For the aggregate subject it means both sides' combined score per game | G |
| Match results (`results`) | team, aggregate | Results list: winner, loser, score, margin | G |
| Series averages (`series`) | all | **Per-season** figures | A / G |
| Ground averages (`ground`); By host country (`host`) | all | ✗ | ✗ |
| By opposition team (`opposition`) | batting, bowling, team | **Head-to-head** split per opponent | G |
| By year of match start (`year`); By season (`season`) | all | Both become "by Season". A fantasy season sits inside one NFL season, and its January weeks count as that season | A / G |
| Overall extras / extras by innings | team, aggregate | ✗. If something must fill the slot, **bench points / points left on bench** (S) | S |

### 1.3 Grouping, qualification, sorting, paging

- **Group figures by** (`groupby`, overall view only). Batting offers: individual players, each team innings, each match, each series, each tour, team, opposition team, each ground, host country, host continent, year, season, decade, overall aggregate. Team offers: each team, individual players, individual captains, each match, series, tour, ground, host, continent, year, season, decade, overall. [S1][S2]
  - Fantasy grouping: franchise · manager · game · season · opponent · opponent division · week · era · bracket · overall. **Tour, ground, host and continent are ✗.** Decade becomes era (two values) or "5-season blocks".
- **Result qualifications**: exactly one `qualval1` field with a `qualmin1`/`qualmax1` range. Quick picks run from "0 only" and "1 and above" to "10000 plus". The selectable field depends on the view (for example batting overall: matches, innings, runs, average, hundreds, ducks…; team overall: matches, won, lost, W/L ratio, % won, runs, high score…). [S1][S2]
  - Record pages use fixed qualifications, given as a footnote (for example "Minimum of 20 innings" on the career-average list). [S7]
  - Fantasy: a single "minimum games" or "minimum seasons" qualifier, plus the same fixed footnoted defaults on curated record pages (for example "minimum 3 seasons" for career win %).
- **Sort** (`orderby` + `orderbyad=reverse`): any column of the current view. Every column header on the results page is a sort link. [S3]
- **Paging**: `size` of 10/25/50/100/150/200, plus `page=N`, with First/Previous/Next/Last controls. [S2][S3]
- **"Add to query"** adds a value to a filter, which gives multi-select (for example several opponents). "Return to query menu" keeps the query and "Cleared query menu" resets it. [S1][S3]
- **Query summary**: the results page restates the query in words, for example "View: overall figures · Primary team: Australia · Opposition team: England · Qualifications: matches played ≥ 20 · Ordered by: runs scored (descending) · Showing 1–50 of 66". Each player name links to that player's profile. [S3]

### 1.4 Per-player Statsguru analysis

URL: `/ci/engine/player/4188.html?class=1;template=results;type=batting`. Analysis types are batting, bowling, fielding and all-round. The views, with their fantasy equivalents:

| View | Fantasy equivalent | Data |
|---|---|---|
| Career summary (splits table: see below) | Franchise splits page | A / G |
| Innings by innings list / Match by match list | Franchise game log | G |
| Cumulative averages / Reverse cumulative | Running career W-L, PF/game after each game (a chart opportunity) | G |
| Series averages / Tour averages | Per-season rows; tour is ✗ | A / G |
| Ground averages | ✗ | ✗ |
| Partnership summary / List of partnerships | ✗ (S only: NFL player "stacks" within a franchise's lineup) | S |
| Dismissal summary / Bowler summary / Fielder summary / List of dismissals | Bowler summary becomes **"opponents who held you lowest"** (PA by opponent). The rest are ✗ | G |

The **career summary split rows** for Bradman [S5]. Each row has Span · Mat · Inns · NO · Runs · HS · Ave · 100 · 50 · 0. In order:

- overall
- v each opposition → **v each franchise** (G)
- in each host country → ✗
- in each continent → ✗ (or v each **division**, G)
- home / away → ✗
- each year → **each season** (A/G)
- each season → same as the row above
- under each captain → **under each manager** (A/G)
- is / is not captain → ✗ (the manager always "captains")
- is / is not keeper → ✗
- won / lost toss; won toss & batted… → ✗
- matches batting / fielding first → ✗
- 1st / 2nd team innings and 1st–4th match innings → ✗
- won / lost / drawn match → **in wins / in losses / in ties** (G)
- won batting first… → ✗
- 1st–5th match in series → **week 1…N of season** (G)
- each trophy → **each bracket** (G)
- each batting position → ✗ for the franchise. For an NFL player this becomes lineup slot (S)

### 1.5 URL and permalink shape

```
https://stats.espncricinfo.com/ci/engine/stats/index.html
  ?class=1;filter=advanced;opposition=1;orderby=runs;qualmin1=20;qualval1=matches;team=2;template=results;type=batting
```

- Parameters are `;`-separated and listed alphabetically by key. `template=results` switches from the query form to the results page. Pagination adds `page=2`, and reverse order adds `orderbyad=reverse`. [S3]
- The same parameter string is reused for the format links (only `class` changes) and the subject links (only `type` changes, with partnership as `type=fow` and umpire as `type=official`). [S3]
- Player analysis: `/ci/engine/player/{id}.html?class=…;template=results;type=batting;view=…`. [S5]
- Lesson for the fantasy site: every query is a stable, shareable URL. Canonical parameter order makes caching and link-sharing work. The same filter state should round-trip between the form and the results page.

---

## 2. Records index

### 2.1 Organisation

- **Top level: format.** The list covers Tests, ODIs, T20Is, combined Test/ODI/T20I, First-class, List A, Twenty20, combined domestic, the women's formats and the youth formats. URL: `/ci/engine/records/index.html?class=1`. [S6]
- **Second level: category** (`category=2…9`): Team · Batting · Bowling · Wicketkeeping · Fielding · All-round · Partnership · Individual (captains, players, umpires). [S6]
- **Third level: subheadings, then individual record lists.** The full Test list is catalogued in §2.2.
- **Cross-cuts:** "Records by team", "by opposition team" and "by host country" re-run the whole index scoped to one team (`/ci/engine/records/index.html?class=1;id=2;type=team`, `type=opposition`, `type=…`). There are also by-year pages (`/records/year/2026-2026`) and by-trophy pages (`/records/trophy/indian-premier-league-117`). [S6][S7]
- **Record list pages** show a ranked table and a fixed qualification footnote. Each row links to the scorecard and the player. Old URLs look like `/ci/engine/records/team/highest_innings_totals.html?class=1;id=2;type=team`. The new site uses `/records/highest-innings-totals-283966`. [S7]

Fantasy organisation: one **index**, with categories and subheadings in this shape. Each list can be **scoped to a franchise, a manager, an opponent, a season, a bracket or an era**. The franchise-scoped index plays the same role as cricinfo's "records by team".

### 2.2 Test records catalogue, mapped

Lists are grouped by subheading, verbatim from the Test index [S6].

**Team records**

| Cricinfo subheading: records | Fantasy equivalent | Data |
|---|---|---|
| Match results: list of series results; list of match results by year; results summary; results summary by opposition; tied; abandoned | Season results list (champions, Shit Bowl winners, Mediocre Bowl winners, division winners); results by season; franchise all-time W-L-T; **head-to-head matrix**; tied games; abandoned → ✗ | A / G |
| Result margins: largest by innings/runs; fewest wickets lost; smallest by runs/wickets; closest draws; victory after follow-on; reaching target after declaration | **Largest and smallest winning margin**; the rest are ✗ | G |
| Series: whitewashes; most matches in series without a win; winning series after coming from behind; fewest/most players used; consecutive series wins/unbeaten/winless/defeats | Undefeated / winless season; **comebacks** (for example 0-3 start to Playoffs); fewest/most NFL players started in a season (S); consecutive Playoff appearances, titles, Shit Bowl appearances, winning seasons | A (season outcomes) / G (in-season comebacks) / S |
| High totals / Low totals: highest/lowest innings totals; highest 4th-innings total; most consecutive innings over 400; difference between 1st and 2nd innings | Highest and lowest single-game score; highest score in a Playoff or championship game; **consecutive games over N points**; biggest week-to-week swing | G |
| Match aggregates: highest/lowest | Highest and lowest combined game score | G |
| Run rates | ✗ | ✗ |
| Consecutives: wins; unbeaten; draws; without draw; without win; defeats | Win streaks, losing streaks (within and across seasons) | G |
| Totals in a day; match length; innings events | Most and fewest points in a **week league-wide** (aggregate); the rest are ✗ | G |
| Individual hundreds / double figures / ducks and pairs / boundaries / partnership hundreds (team-level counts) | NFL-player counts in a lineup: most starters over 20 pts, most zeros in a lineup, and so on | S |
| Extras; bowlers; similarity of dismissal; grounds | ✗ (or bench points, S) | ✗ / S |

**Batting records → franchise points-for records** (the "player" is a franchise)

| Cricinfo | Fantasy | Data |
|---|---|---|
| Most runs: career; innings; innings (progressive record holder); match; series; calendar year; by batting position; on losing side; on a ground; off one over; in a day; by captain/keeper/nightwatchman; career without a hundred | Most career PF (A if standings carry PF); highest single game; **record progression** (holder over time); most PF in a season (A); **highest score in a loss**; most PF under one manager; never reached the 150 milestone | A / G |
| Averages and strike rates: highest career average; highest strike rate in an innings | Highest career PF per game (with a qualification footnote) | A / G |
| Debuts and last match | Best debut-season record or score; best final season | A / G |
| Hundreds / nineties / fifties: most in career; in series; in consecutive innings or matches; vs one team; youngest/oldest; fastest/slowest; 99 not out; dismissed for 99 | Milestone-game counts (for example 150+ and 175+ games) in a career, in a season and against one opponent; consecutive milestone games; **"nervous nineties"** becomes losses by under 1 or 2 points, or 149.x scores; fastest/slowest by balls → ✗ | G |
| Ducks and pairs: king pair; no ducks in career; most ducks; consecutive ducks | "Stinker" games under a low threshold: most, consecutive, never | G |
| Boundaries; long innings; top scoring (no. 11 top scoring); dismissals | ✗ for the franchise. For NFL players: best performance by a K or DEF, bench player outscoring starters (S) | ✗ / S |
| Fastest career runs: fastest to 1000…15000 runs (by innings) | **Fastest to N career wins**, or to N thousand career PF (by games or seasons) | G (A for seasons-to-N-wins) |

**Bowling records → franchise points-against records**

| Cricinfo | Fantasy | Data |
|---|---|---|
| Most wickets in career / series / year; best figures in innings/match; best figures when losing; best by captain | Lowest PA in a game (the "best defensive week") and in a season. PA is luck rather than skill in fantasy, so these belong under a **"luck"** heading next to Breakdown | A (season PA) / G |
| Averages, economy, strike rate (best/worst career) | Lowest/highest career PA per game | A / G |
| Hauls; hat-tricks; most balls bowled; most runs conceded | Most PA in a game, in a season and in a career (**"unluckiest"**); hauls, hat-tricks and balls → ✗ | G |
| Dismissals: bowler/batter combinations | Opponent who most often held franchise X to its lowest scores | G |
| Fastest career wickets | ✗ | ✗ |

**Wicketkeeping, Fielding → ✗.** Sleeper-only stand-ins are possible (for example most waiver adds or most trades as "involvement" records, S). They are not a translation.

**All-round records** (1000 runs and 100 wickets; hundred and five wickets in a match): a loose fit is "games with top league score and a win by 50+" or "season leading both PF and fewest PA". This is low value. G.

**Partnership records** (highest by wicket, by pair, aggregate partnerships, fall of wicket): ✗ for franchises. In the Sleeper era a "partnership" could be an NFL-player pair in one lineup, such as the highest-scoring QB + WR stack (S). The franchise–manager pairing is the other loose analogue: best record by a manager on a franchise (A).

**Individual records (captains, players, umpires)**

| Cricinfo | Fantasy | Data |
|---|---|---|
| Players: most matches; most consecutive matches for a team; representing two countries; player-of-the-match/series awards; youngest/oldest; longest career; longest gap between appearances | Franchise longevity (seasons); **managers who ran more than one franchise**; most weekly or season **awards** (from sleeper-awards); longest franchise tenure | A / G (awards depend on what each award needs) |
| Captains: most matches as captain; consecutive; winning all tosses; youngest/oldest captains | Manager records: seasons managed, titles, Playoff appearances | A |
| Match officials | ✗ (the commissioner is not a record subject) | ✗ |

---

## 3. Player profile pages

The live site returned HTTP 403 to scripted fetches. These details come from the Wayback captures (Sep 2025) of `www.espncricinfo.com/cricketers/virat-kohli-253802` and its subpages [S8][S9][S10].

Profile sections, in order, with their fantasy equivalents:

| Section | Content | Fantasy franchise page | Data |
|---|---|---|---|
| Header bio | Full name, born, age, batting/bowling style, playing role, teams | Franchise ID, **team-name history by season**, managers by season (no real names), division by season, founding season | A |
| Narrative profile | Editorial essay plus a "factfile" | Optional hand-written blurb or "lore" (a contribution workflow question) | — |
| Career stats | Table per format (Tests, ODIs, T20Is, FC, List A, T20s): Mat Inns NO Runs HS Ave BF SR 100s 50s 4s 6s Ct St; bowling Mat Inns Balls Runs Wkts BBI BBM Ave Econ SR 4w 5w 10w | Table per **game type** (regular season / Playoffs / Shit Bowl / Mediocre Bowl / all): G, W-L-T, win %, PF, PA, PF/G, high, low, milestone counts, Breakdown record. Era split as extra rows | A / G (Breakdown needs G) |
| League stats | T20 stats per tournament and team (IPL with RCB…) | Per-**era** split (NFL.com vs Sleeper), or per-manager split | A / G |
| Records of X | Ranked entries such as "6th: Most matches as captain (68), Test matches" | **"Records held"**: each records-index list where the franchise ranks, with rank and value | A / G |
| Explore Statsguru Analysis | Links per format into the player analysis (§1.4) | Link into the Statsguru tool pre-filtered to this franchise | — |
| Recent matches | Last 5: opponent, score, date, ground, format | Last 5 games: opponent, score, result, week | G |
| Debut / last matches | Per format | First and last season; first and last Playoff, Shit Bowl and championship appearance | A |
| Videos, news, photos | Media | Links to AGM docs, draft boards and keeper lists (links only, per the constraints) | — |

**Subpages:** `/bowling-batting-stats`, `/tests-odi-t20-records`, `/matches`, `/news`, `/photos`, `/videos`.

The stats subpage shows the full splits stack [S9]:

- Career averages
- vs Team
- In Host Country
- in Continent
- Home vs Away
- By Year
- By Season
- Captains Involved
- Is Captain / Is Not Captain
- Is Keeper / Is Not Keeper
- Toss
- Toss and Batting Sequence
- Batting First vs Fielding First
- In Team Innings
- In Match Innings
- In Match Type
- Match Result
- Result and Batting Sequence
- In Tournament Type
- In Match Number per Series
- In Major Trophies
- In Finals
- In Batting Position

The fantasy splits that remain:

- **Career**
- **vs Franchise**
- **vs Division**
- **By Season**
- **Managers Involved**
- **Match Result** (in wins / losses / ties)
- **In Match Type** (regular season / bracket)
- **In Week Number per Season**
- **In Brackets**
- **In Finals** (championship / Shit Bowl final)
- **By Era**

All of these are A or G. Batting position becomes lineup slot, but only for NFL-player pages (S).

**NFL player pages (Sleeper era only)** are the closest true analogue of a cricinfo player page. They would show:

- franchises rostered by, with spans: the "Teams" line
- points by franchise
- points by lineup slot
- started vs benched
- drafted, kept, traded and added history: the "debut/last matches" for transactions
- records held

Everything on them is S.

---

## 4. What doesn't translate (summary)

- **Venue**: host country, ground, continent, home/away, day/night. Fantasy games have no place. Division is the only grouping of opponents worth offering in their place.
- **In-match sequence**: toss, batting/fielding first, innings number, follow-on, declarations, fall of wicket, partnerships, run rate, balls and minutes, "fastest" by balls. A fantasy game is two simultaneous single scores.
- **Dismissal and fielding mechanics**: wicketkeeping, fielding, extras, umpires.
- **Year vs season**: these are separate in cricket, but here they collapse into one, the Season.
- **Draws**: fantasy has only ties.
- **Things fantasy has that cricinfo lacks**: Breakdown (all-play), luck metrics (PA, record vs expected), bracket placement (Shit Bowl and Mediocre Bowl as first-class "trophies"), manager↔franchise mapping, and Sleeper transactions and drafts. These need categories of their own rather than borrowed ones.

## 5. Implications for later tickets

- The Statsguru prototype needs only these subjects: **points for** (batting), **points against** (bowling), **results** (team), **aggregate**, and later **NFL player** (S). It needs views for overall, game log, results, by season, by opponent, plus overall grouped by franchise, manager, season, opponent, opponent division, week, bracket and era. It needs one min/max qualifier, sorting by any column, and a canonical semicolon/alphabetical URL.
- **Coverage must be visible.** Any G figure that spans 2022 week 10 to 2024 should carry a "games missing" marker until back-fill. Season-level A figures (W-L, and PF/PA if present) should be preferred where they can stand in. Cricinfo has nothing like this because its data is complete.
- A **records index scoped by franchise** gives the "records held" section of the franchise page almost for free.

## Sources

All accessed 2026-10-12.

- [S1] Statsguru, Test batting query, advanced filter: https://stats.espncricinfo.com/ci/engine/stats/index.html?class=1;filter=advanced;type=batting
- [S2] Statsguru, Test team query, advanced filter: https://stats.espncricinfo.com/ci/engine/stats/index.html?class=1;filter=advanced;type=team
- [S3] Statsguru results page, Australia v England batting, ≥20 matches, by runs: https://stats.espncricinfo.com/ci/engine/stats/index.html?class=1;filter=advanced;opposition=1;orderby=runs;qualmin1=20;qualval1=matches;team=2;template=results;type=batting
- [S4] Statsguru, Test aggregate query: https://stats.espncricinfo.com/ci/engine/stats/index.html?class=1;filter=advanced;type=aggregate
- [S5] Statsguru player analysis, DG Bradman, Test batting: https://stats.espncricinfo.com/ci/engine/player/4188.html?class=1;template=results;type=batting
- [S6] Records index, Test matches: https://stats.espncricinfo.com/ci/engine/records/index.html?class=1 (and the all-formats index https://stats.espncricinfo.com/ci/content/records/index.html)
- [S7] Team-scoped record lists: https://stats.espncricinfo.com/ci/engine/records/team/highest_innings_totals.html?class=1;id=2;type=team and https://stats.espncricinfo.com/ci/engine/records/batting/highest_career_batting_average.html?class=1;id=2;type=team ("Minimum of 20 innings")
- [S8] Player profile overview (Wayback capture 2025-09-08): https://web.archive.org/web/20250908221708/https://www.espncricinfo.com/cricketers/virat-kohli-253802
- [S9] Player stats subpage (Wayback capture 2025): https://web.archive.org/web/2025/https://www.espncricinfo.com/cricketers/virat-kohli-253802/bowling-batting-stats
- [S10] Player records subpage (Wayback capture 2025-09-16): https://web.archive.org/web/20250916232804/https://www.espncricinfo.com/cricketers/virat-kohli-253802/tests-odi-t20-records
