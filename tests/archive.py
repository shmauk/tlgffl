"""Write small synthetic archives in the same shape as the real one.

The real archive lives in data/. These helpers let each test lay out only the
seasons it is about, so expected figures can be read straight off the test.
"""
import csv
import json
from pathlib import Path

import yaml

LEAGUE = "1078038"


def team(team_id, owner, name, record=(0, 0, 0), pf=0.0, pa=0.0, seed=None,
         division="1", bracket=None):
    """One NFL.com team as the standings API reports it."""
    w, l, t = record
    return {
        "teamId": str(team_id), "ownerUserId": str(owner), "name": name,
        "divisionId": division,
        "stats": {"season": {}},
        "_season": {
            "record": f"{w}-{l}-{t}", "wins": str(w), "losses": str(l), "ties": str(t),
            "pts": f"{pf}", "ptsAgainst": f"{pa}",
            "playoffSeed": str(seed) if seed else None,
            "playoffBracketType": bracket,
        },
    }


def write_nfl_season(data: Path, year: int, teams, final_order=None, divisions=None):
    lg_teams = {}
    for t in teams:
        t = dict(t)
        t["stats"] = {"season": {str(year): t.pop("_season")}}
        lg_teams[t["teamId"]] = t
    league = {
        "leagueId": LEAGUE,
        "numTeams": len(teams),
        "divisions": divisions or {"1": {"divisionId": "1", "name": "Division 1",
                                         "teamIds": [t["teamId"] for t in teams]}},
        "teams": lg_teams,
        "finalStandingsTeamIds": [str(i) for i in (final_order or [])],
    }
    out = data / "nfl-api" / f"standings-{year}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"games": {f"10{year}": {"leagues": {LEAGUE: league}}}}))


def write_sleeper_season(data: Path, year: int, roster_ids, league_extra=None, roster_extra=None):
    sleeper = data / "sleeper"
    sleeper.mkdir(parents=True, exist_ok=True)
    league = {"name": "The Fantasy League", "season": str(year),
              "total_rosters": len(roster_ids), "settings": {"playoff_week_start": 15}}
    league.update(league_extra or {})
    (sleeper / f"{year}-league.json").write_text(json.dumps(league))
    rosters = [{"roster_id": r, "owner_id": f"9{r:05d}", "metadata": dict(roster_extra or {})}
               for r in roster_ids]
    (sleeper / f"{year}-rosters.json").write_text(json.dumps(rosters))


def write_csv(path: Path, header, rows, comments=()):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        for c in comments:
            f.write(f"# {c}\n")
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def write_franchise_keys(data: Path, rows):
    """rows: (franchise_id, era, slot, owner_user_id)."""
    write_csv(data / "franchises.csv", ["franchise_id", "era", "slot", "owner_user_id", "note"],
              [(*r, "") if len(r) == 4 else r for r in rows])


def write_sleeper_aliases(data: Path, rows):
    """rows: (roster_id, sleeper_name, franchise name as ff-data-project calls it)."""
    write_csv(data / "sleeper_aliases.csv", ["roster_id", "sleeper_name", "franchise"], rows)


def write_formats(data: Path, formats):
    """formats: {season: format entry}, as in data/formats.yaml."""
    data.mkdir(parents=True, exist_ok=True)
    (data / "formats.yaml").write_text(yaml.safe_dump(formats, sort_keys=False))


def write_documents(data: Path, rows):
    """rows: (kind, season, title, url)."""
    write_csv(data / "documents.csv", ["kind", "season", "title", "url"], rows)
