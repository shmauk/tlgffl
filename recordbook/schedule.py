"""Whether today's scheduled refresh should run (#26).

    python3 -m recordbook.schedule [--data data] [--today YYYY-MM-DD]

The workflow's cron fires every morning; this decides from the committed
snapshot of the latest Sleeper season, so no one edits the schedule by hand.
From the draft (drafts[].start_time) until the season's last bracket week is
final, every run goes ahead (daily). Otherwise, before a draft date is set,
before the draft or once the brackets are over, only Tuesday's does (weekly).

Prints `run=true|false` and `reason=...`, ready to append to $GITHUB_OUTPUT.
"""
import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import NamedTuple

import yaml

from recordbook.sleeper import final_weeks

WEEKLY_DAY = 1  # Tuesday: the morning after Monday night's game


class Decision(NamedTuple):
    run: bool
    reason: str


def _read(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _draft_day(drafts):
    times = [d["start_time"] for d in drafts or [] if d.get("start_time")]
    return datetime.fromtimestamp(min(times) / 1000, timezone.utc).date() if times else None


def _last_bracket_week(data, season):
    path = Path(data) / "formats.yaml"
    entries = (yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None) or {}
    brackets = (entries.get(season) or {}).get("brackets") or {}
    weeks = [w for b in brackets.values() for w in b.get("weeks", [])]
    return max(weeks) if weeks else None


def in_season(data, today):
    """(season, True if today falls between its draft and the end of its brackets)."""
    folder = Path(data) / "sleeper"
    seasons = sorted(int(p.name.split("-")[0]) for p in folder.glob("*-league.json"))
    if not seasons:
        return None, False
    season = seasons[-1]
    league = _read(folder / f"{season}-league.json") or {}
    draft = _draft_day(_read(folder / f"{season}-drafts.json"))
    if draft is None or today < draft:
        return season, False
    last = _last_bracket_week(data, season)
    over = league.get("status") == "complete" or (last is not None and last in final_weeks(league, [last]))
    return season, not over


def decide(data, today):
    """Whether the refresh runs today, and why."""
    season, daily = in_season(data, today)
    if daily:
        return Decision(True, f"{season} is between its draft and the end of its brackets: daily")
    tuesday = today.weekday() == WEEKLY_DAY
    when = f"{season} is not in season" if season else "no Sleeper season"
    return Decision(tuesday, f"{when}: weekly, on Tuesdays")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--data", default="data", type=Path)
    p.add_argument("--today", type=date.fromisoformat,
                   default=datetime.now(timezone.utc).date())
    args = p.parse_args(argv)
    d = decide(args.data, args.today)
    print(f"run={'true' if d.run else 'false'}")
    print(f"reason={d.reason}")


if __name__ == "__main__":
    main()
