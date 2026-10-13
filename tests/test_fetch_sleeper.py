"""The Sleeper fetch (#25) against recorded responses; it never touches the network.

The responses are cut down from live ones (2026-10-13), in Sleeper's shapes,
with made-up user ids and names standing in for real ones.
"""
import copy
import json

import pytest

from recordbook.fetch_sleeper import fetch
from recordbook.privacy import find_violations

LID = "L26"
STATE = {"week": 5, "leg": 5, "season": "2026", "season_type": "regular", "display_week": 5}
LEAGUE = {"name": "The Fantasy League", "status": "in_season", "season": "2026", "league_id": LID,
          "previous_league_id": "L25", "draft_id": "D26", "total_rosters": 2,
          "metadata": {"division_1": "Group A", "latest_league_winner_roster_id": "5"},
          "settings": {"playoff_week_start": 15, "last_scored_leg": 4, "leg": 5},
          "last_author_display_name": "a manager", "last_message_text_map": {"x": "chat"},
          "last_author_id": "u1"}
ROSTERS = [
    {"roster_id": 1, "owner_id": "u1", "co_owners": ["u3"], "players": ["4984", "6813"],
     "starters": ["4984"], "metadata": {"record": "LW", "p_nick_4984": "a nickname"},
     "settings": {"division": 1, "wins": 1, "losses": 1, "ties": 0, "fpts": 200, "fpts_decimal": 50}},
    {"roster_id": 2, "owner_id": "u2", "co_owners": None, "players": ["CLE"], "starters": ["CLE"],
     "metadata": {"record": "WL"},
     "settings": {"division": 1, "wins": 1, "losses": 1, "ties": 0, "fpts": 190, "fpts_decimal": 0}},
]
USERS = [
    {"user_id": "u1", "display_name": "manager_one", "is_owner": True, "avatar": "a",
     "metadata": {"team_name": "The Hatters", "mention_pn": "on"}},
    {"user_id": "u2", "display_name": "manager_two", "is_owner": False, "avatar": "b",
     "metadata": {"allow_pn": "on"}},
    {"user_id": "u3", "display_name": "co_manager", "metadata": {"team_name": "Not a roster's owner"}},
]
MATCHUP_WK5 = [
    {"roster_id": 1, "matchup_id": 1, "points": 43.6, "custom_points": None, "starters": ["4984", "0"],
     "starters_points": [43.6, 0.0], "players": ["4984", "6813"], "players_points": {"4984": 43.6, "6813": 0}},
    {"roster_id": 2, "matchup_id": 1, "points": 12.0, "custom_points": None, "starters": ["CLE"],
     "starters_points": [12.0], "players": ["CLE"], "players_points": {"CLE": 12.0}},
]
TRANSACTIONS_WK5 = [
    {"transaction_id": "t1", "type": "waiver", "status": "failed", "roster_ids": [1], "adds": {"9480": 1},
     "drops": None, "creator": "u1", "settings": {"waiver_bid": 3}, "leg": 5, "draft_picks": [],
     "waiver_budget": [], "metadata": {"notes": "This player was claimed by another owner."}},
]
DRAFTS = [{"draft_id": "D26", "status": "complete", "type": "snake", "season": "2026"}]
DRAFT = {**DRAFTS[0], "slot_to_roster_id": {"1": 2, "2": 1}, "last_message_id": "m1"}
PICKS = [{"pick_no": 1, "round": 1, "roster_id": 1, "picked_by": "u1", "player_id": "11620",
          "metadata": {"first_name": "Bijan", "last_name": "Robinson", "position": "RB", "team": "ATL"}}]
PLAYERS = {
    "4984": {"first_name": "Josh", "last_name": "Allen", "full_name": "Josh Allen", "position": "QB",
             "team": "BUF", "birth_date": "1996-05-21", "college": "Wyoming"},
    "6813": {"first_name": "Jonathan", "last_name": "Taylor", "position": "RB", "team": "IND"},
    "9480": {"first_name": "Some", "last_name": "Receiver", "position": "WR", "team": None},
    "11620": {"first_name": "Bijan", "last_name": "Robinson", "position": "RB", "team": "ATL"},
    "CLE": {"first_name": "Cleveland", "last_name": "Browns", "position": "DEF", "team": "CLE"},
    "99999": {"first_name": "Not", "last_name": "Rostered", "position": "TE", "team": "KC"},
}


class Api:
    """Recorded responses by path; counts the GETs."""

    def __init__(self, **changes):
        self.responses = {
            "/state/nfl": STATE, f"/league/{LID}": LEAGUE, f"/league/{LID}/rosters": ROSTERS,
            f"/league/{LID}/users": USERS, f"/league/{LID}/matchups/5": MATCHUP_WK5,
            f"/league/{LID}/transactions/5": TRANSACTIONS_WK5, f"/league/{LID}/winners_bracket": [],
            f"/league/{LID}/losers_bracket": [], f"/league/{LID}/traded_picks": [],
            f"/league/{LID}/drafts": DRAFTS, "/draft/D26": DRAFT, "/draft/D26/picks": PICKS, "/players/nfl": PLAYERS,
        }
        self.responses.update(changes)
        self.calls = []

    def __call__(self, path):
        self.calls.append(path)
        if path in self.responses:
            return copy.deepcopy(self.responses[path])
        if "/matchups/" in path or "/transactions/" in path:
            return []
        raise AssertionError(f"unexpected GET {path}")


def load(data, name):
    return json.loads((data / "sleeper" / name).read_text())


@pytest.fixture
def data(tmp_path):
    return tmp_path / "data"


def test_a_season_is_about_fifty_gets(data):
    api = Api()
    fetch(data, api, {2026: LID})
    # state, league, rosters, users, 18 + 18 weeks, 2 brackets, traded picks,
    # drafts, the draft, its picks, and the players dump.
    assert len(api.calls) == 47


def test_snapshots_carry_the_privacy_reductions_and_pass_the_privacy_check(data):
    fetch(data, Api(), {2026: LID})
    assert find_violations([data]) == []
    league = load(data, "2026-league.json")
    assert not [k for k in league if k.startswith(("last_author", "last_message"))]
    assert load(data, "2026-rosters.json")[0]["metadata"] == {"record": "LW"}
    # Users are only ever team names, by roster: a roster whose owner set none
    # gets an empty name, never the display name.
    assert load(data, "2026-team_names-05.json") == [
        {"roster_id": 1, "team_name": "The Hatters"}, {"roster_id": 2, "team_name": ""}]
    assert not list((data / "sleeper").glob("*users*"))
    assert "manager" not in "".join(p.read_text() for p in (data / "sleeper").glob("*.json"))


def test_the_players_dump_is_cut_to_the_leagues_nfl_players(data):
    fetch(data, Api(), {2026: LID})
    assert load(data, "2026-players-05.json") == {
        "11620": {"name": "Bijan Robinson", "pos": "RB", "team": "ATL"},
        "4984": {"name": "Josh Allen", "pos": "QB", "team": "BUF"},
        "6813": {"name": "Jonathan Taylor", "pos": "RB", "team": "IND"},
        "9480": {"name": "Some Receiver", "pos": "WR", "team": None},
        "CLE": {"name": "Cleveland Browns", "pos": "DEF", "team": "CLE"}}


def test_raw_responses_are_kept_per_season_endpoint_and_week(data):
    fetch(data, Api(), {2026: LID})
    assert load(data, "2026-matchups-05.json") == MATCHUP_WK5
    assert load(data, "2026-matchups-06.json") == []
    assert load(data, "2026-transactions-05.json") == TRANSACTIONS_WK5
    assert load(data, "2026-draft_picks.json") == PICKS


def test_the_draft_is_kept_for_its_slot_to_roster_map(data):
    fetch(data, Api(), {2026: LID})
    # draft_order is keyed by user id; slot_to_roster_id says whose slot each was.
    assert load(data, "2026-draft.json")["slot_to_roster_id"] == {"1": 2, "2": 1}
    assert "last_message_id" not in load(data, "2026-draft.json")


def test_a_rerun_with_nothing_new_writes_nothing(data):
    fetch(data, Api(), {2026: LID})
    assert fetch(data, Api(), {2026: LID}) == []


def test_only_changed_snapshots_are_rewritten(data):
    fetch(data, Api(), {2026: LID})
    rescored = [{**MATCHUP_WK5[0], "points": 44.6}, MATCHUP_WK5[1]]
    written = fetch(data, Api(**{f"/league/{LID}/matchups/5": rescored}), {2026: LID})
    assert [p.name for p in written] == ["2026-matchups-05.json"]


def test_team_names_and_nfl_teams_get_a_new_weekly_file_only_when_they_change(data):
    fetch(data, Api(), {2026: LID})
    week6 = {**STATE, "week": 6}
    # Week 6, nothing renamed or traded: no new files.
    assert fetch(data, Api(**{"/state/nfl": week6}), {2026: LID}) == []
    renamed = copy.deepcopy(USERS)
    renamed[1]["metadata"]["team_name"] = "SERPION"
    traded = {**PLAYERS, "6813": {**PLAYERS["6813"], "team": "NYJ"}}
    written = fetch(data, Api(**{"/state/nfl": week6, f"/league/{LID}/users": renamed,
                                 "/players/nfl": traded}), {2026: LID})
    assert sorted(p.name for p in written) == ["2026-players-06.json", "2026-team_names-06.json"]
    assert load(data, "2026-team_names-05.json")[1]["team_name"] == ""
    assert load(data, "2026-team_names-06.json")[1]["team_name"] == "SERPION"
    assert load(data, "2026-players-06.json")["6813"]["team"] == "NYJ"


def test_a_complete_season_takes_no_team_name_or_player_snapshot(data):
    api = Api(**{f"/league/{LID}": {**LEAGUE, "status": "complete"}})
    fetch(data, api, {2026: LID})
    assert not list((data / "sleeper").glob("2026-team_names-*"))
    assert not list((data / "sleeper").glob("2026-players-*"))
    assert "/players/nfl" not in api.calls and f"/league/{LID}/users" not in api.calls
