"""Whole synthetic archives for the site's tests (#49): a Sleeper season at
each point the home page has a phase for, built into a database by the real
build. Vitest's globalSetup (src/lib/scenarios.ts) builds them with

    python -m tests.scenarios <scenario> <dir>

which writes <dir>/data and <dir>/league.sqlite. pytest can use them too.

The 2025 season: six rosters, roster r being franchise r ("Team r"), in two
divisions (Group A: 1, 3, 5; Group B: 2, 4, 6). The regular season (weeks
1-5) is a round robin the lower id always wins, so the records run 5-0 for
franchise 1 to 0-5 for franchise 6. Roster r scores 130 - 10r + week every
week. The Playoffs (top 4) are weeks 6-7, the Shit Bowl (bottom 2) week 6:
week 6 is 1 v 4 and 2 v 3 in the Playoffs and 5 v 6 in the Shit Bowl, week
7 the Playoffs final, 1 v 2, with 3 v 4 and 5 v 6 as filler. The tied-final
scenario is the off-season with that final level, seed 1 going on.
"""
import json
import sys
from pathlib import Path

from recordbook.build import build
from tests.archive import (fmt, write_division_lineages, write_formats, write_franchise_keys,
                           write_sleeper_aliases, write_sleeper_brackets, write_sleeper_league)

ROSTERS = range(1, 7)
DIVISIONS = {1: 1, 3: 1, 5: 1, 2: 2, 4: 2, 6: 2}
SCHEDULE = {
    1: [(1, 6), (2, 5), (3, 4)],
    2: [(1, 5), (4, 6), (2, 3)],
    3: [(1, 4), (3, 5), (2, 6)],
    4: [(1, 3), (2, 4), (5, 6)],
    5: [(1, 2), (3, 6), (4, 5)],
    6: [(1, 4), (2, 3), (5, 6)],
    7: [(1, 2), (3, 4), (5, 6)],
}
BRACKETS = [(2025, 6, 1, 4, "playoffs", 1), (2025, 6, 2, 3, "playoffs", 1),
            (2025, 6, 5, 6, "shit_bowl", 1),
            (2025, 7, 1, 2, "playoffs", 2), (2025, 7, 3, 4, "filler", ""), (2025, 7, 5, 6, "filler", "")]


def points(roster, week):
    return float(130 - 10 * roster + week)


def season(data, through, status, brackets_through, paired=7, tied_final=False):
    """2025, final through week `through`, with Sleeper's pairings up to week
    `paired`. A tied final is 1 v 2 level in week 7, seed 1 going on."""
    def scored(a, b, w):
        if w > through:
            return 0.0, 0.0
        return (points(a, w),) * 2 if tied_final and w == 7 and (a, b) == (1, 2) else (points(a, w), points(b, w))
    weeks = {w: [(a, pa, b, pb) for a, b in pairs for pa, pb in [scored(a, b, w)]]
             for w, pairs in SCHEDULE.items() if w <= paired}
    regular = [w for w in range(1, 6) if w <= through]
    totals = {r: (sum(1 for w in regular for a, b in SCHEDULE[w] if r == min(a, b) and r in (a, b)),
                  sum(1 for w in regular for a, b in SCHEDULE[w] if r == max(a, b) and r in (a, b)),
                  0, sum(points(r, w) for w in regular)) for r in ROSTERS}
    write_sleeper_league(data, 2025, weeks, DIVISIONS, status=status, last_scored_leg=through, totals=totals)
    write_sleeper_brackets(data, [(*b, 1) if tied_final and b[1:4] == (7, 1, 2) else b
                                  for b in BRACKETS if b[1] <= brackets_through])


def common(data):
    write_franchise_keys(data, [(r, "sleeper", r, "") for r in ROSTERS])
    write_sleeper_aliases(data, [(r, f"Team {r}", f"Team {r}") for r in ROSTERS])
    write_formats(data, {y: fmt(6, 5, (4, [6, 7]), shit_bowl=(2, [6]), divisions=2, realignment=2025)
                         for y in (2025, 2026)})
    write_division_lineages(data, [(2025, "Group A", "A"), (2025, "Group B", "B")])


def regular(data):
    """Week 3 is final; week 4 is being played. Sleeper pairs the bracket weeks later."""
    common(data)
    season(data, through=3, status="in_season", brackets_through=0, paired=5)
    return "2025-09-24"


def brackets(data):
    """The first bracket week (6) is final; week 7's pairings are Sleeper's, not yet assigned."""
    common(data)
    season(data, through=6, status="in_season", brackets_through=6)
    return "2025-10-15"


def off_season(data, tied_final=False):
    """2025 is crowned; 2026 has a draft date and starts on 9 September 2026."""
    common(data)
    season(data, through=7, status="complete", brackets_through=7, tied_final=tied_final)
    write_sleeper_league(data, 2026, {1: [(1, 0.0, 2, 0.0)]}, DIVISIONS, status="pre_draft", last_scored_leg=0)
    sleeper = data / "sleeper"
    # 1 September 2026, 18:00 UK time.
    (sleeper / "2026-drafts.json").write_text(json.dumps([{"draft_id": "D", "start_time": 1788282000000}]))
    (sleeper / "2026-state.json").write_text(json.dumps({"season": "2026", "season_start_date": "2026-09-09"}))
    return "2026-08-01"


def tied_final(data):
    """The off-season, but 2025's Playoffs final was a tie that seed 1 went on from."""
    return off_season(data, tied_final=True)


SCENARIOS = {"regular": regular, "brackets": brackets, "off-season": off_season, "tied-final": tied_final}


def write(scenario, out):
    """Write a scenario's archive to out/data and build it into out/league.sqlite."""
    out = Path(out)
    today = SCENARIOS[scenario](out / "data")
    build(out / "data", out / "league.sqlite", today=today)
    return out / "league.sqlite"


if __name__ == "__main__":
    print(write(*sys.argv[1:]))
