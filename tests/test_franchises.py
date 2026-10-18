"""The franchise registry: which franchise each platform team is, and every
name a franchise goes by (GLOSSARY.md: Franchise, Team name, Franchise name,
Filed name)."""
from recordbook.franchises import registry


def keys(*rows):
    """franchises.csv rows from (franchise id, era, slot, owner user id)."""
    return [{"franchise_id": str(f), "era": era, "slot": str(slot), "owner_user_id": str(owner)}
            for f, era, slot, owner in rows]


def aliases(*rows):
    """sleeper_aliases.csv rows from (roster id, sleeper name, franchise)."""
    return [{"roster_id": str(r), "sleeper_name": s, "franchise": f} for r, s, f in rows]


def nfl(**seasons):
    """{year: NFL.com teams} from y<year>=[(team id, owner, team name)]."""
    return {int(y[1:]): [{"teamId": str(t), "ownerUserId": str(o), "name": n} for t, o, n in teams]
            for y, teams in seasons.items()}


def test_an_nfl_com_team_is_the_franchise_its_team_and_owner_are_keyed_to():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200)), [],
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")]), {})
    assert r.problems == []
    assert r.nfl_team({"teamId": "2", "ownerUserId": "200"}) == 2
    assert r.team_names == {(1, 2012): "Alpha", (2, 2012): "Bravo"}


def test_a_manager_switching_accounts_stays_one_franchise():
    # The league judged owner 400 to be owner 100 on a new NFL.com account.
    r = registry(keys((1, "nfl.com", 1, 100), (1, "nfl.com", 1, 400)), [],
                 nfl(y2012=[(1, 100, "Alpha One")], y2013=[(1, 400, "Alpha Two")]), {})
    assert r.problems == []
    assert r.team_names == {(1, 2012): "Alpha One", (1, 2013): "Alpha Two"}


def test_every_nfl_com_team_needs_a_franchise():
    r = registry(keys((1, "nfl.com", 1, 100)), [],
                 nfl(y2012=[(1, 100, "Alpha"), (2, 999, "Stranger")], y2013=[(2, 999, "Stranger")]), {})
    assert r.problems == [
        "2012 NFL.com team 2 (owner 999) has no franchise in data/franchises.csv",
        "2013 NFL.com team 2 (owner 999) has no franchise in data/franchises.csv"]


def test_a_sleeper_team_name_comes_from_the_snapshot_or_else_the_alias():
    r = registry(keys((1, "sleeper", 1, ""), (2, "sleeper", 2, "")),
                 aliases((1, "Alpha Recorded", "Alpha"), (2, "Bravo Recorded", "Bravo")),
                 {}, {2025: ([1, 2], {}), 2026: ([1, 2], {1: "Alpha Renamed"})})
    assert r.problems == []
    assert r.roster(2) == 2
    assert r.team_names == {(1, 2025): "Alpha Recorded", (2, 2025): "Bravo Recorded",
                            (1, 2026): "Alpha Renamed", (2, 2026): "Bravo Recorded"}


def test_every_sleeper_roster_needs_a_franchise_and_an_alias():
    r = registry(keys((1, "sleeper", 1, ""), (2, "sleeper", 2, "")), aliases((1, "Alpha", "Alpha")),
                 {}, {2025: ([1, 2, 3], {3: "Charlie"})})
    assert r.problems == [
        "2025 Sleeper roster 2 has no row in data/sleeper_aliases.csv",
        "2025 Sleeper roster 3 has no franchise in data/franchises.csv",
        "2025 Sleeper roster 3 has no row in data/sleeper_aliases.csv"]


def test_a_franchise_is_filed_under_its_last_nfl_com_name_and_shown_by_its_latest():
    # Alpha renames itself on Sleeper; Bravo has only played on Sleeper.
    r = registry(keys((1, "nfl.com", 1, 100), (1, "sleeper", 1, ""), (2, "sleeper", 2, "")),
                 aliases((1, "Alpha Sleeper", "Alpha Two"), (2, "The Bravos", "Bravo")),
                 nfl(y2012=[(1, 100, "Alpha One")], y2013=[(1, 100, "Alpha Two")]),
                 {2025: ([1, 2], {})})
    assert r.problems == []
    assert (r.filed_name(1), r.name(1)) == ("Alpha Two", "Alpha Sleeper")
    assert (r.filed_name(2), r.name(2)) == ("Bravo", "The Bravos")


def test_a_placeholder_name_is_a_team_name_but_never_a_franchise_name():
    r = registry(keys((1, "nfl.com", 1, 100)), [],
                 nfl(y2012=[(1, 100, "Alpha")], y2013=[(1, 100, "pending")], y2014=[(1, 100, "[name redacted]")]),
                 {})
    assert r.team_names[(1, 2013)] == "pending"
    assert (r.filed_name(1), r.name(1)) == ("Alpha", "Alpha")


def test_a_franchise_needs_a_season_and_a_real_name():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200)), [],
                 nfl(y2012=[(1, 100, "pending")]), {})
    assert r.problems == [
        "franchise 1 has no team name that could be its filed name",
        "franchise 2 in data/franchises.csv never played a season"]


def test_a_hand_kept_table_can_name_a_franchise_as_the_site_shows_it_or_as_it_is_filed():
    r = registry(keys((1, "nfl.com", 1, 100), (1, "sleeper", 1, ""), (2, "nfl.com", 2, 200)),
                 aliases((1, "Kurlewis", "Kurlewless")),
                 nfl(y2012=[(1, 100, "Kurlewless"), (2, 200, "Bravo")]), {2025: ([1], {})})
    assert r.problems == []
    assert [r.named(n) for n in ("Kurlewless", "Kurlewis", "Bravo", "Charlie")] == [1, 1, 2, None]
    assert r.names == ["Bravo", "Kurlewis", "Kurlewless"]


def test_the_game_log_names_a_franchise_by_its_team_name_that_season():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200)), [],
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")], y2013=[(1, 100, "Bravo"), (2, 200, "Alpha")]),
                 {})
    assert r.problems == []
    assert [r.team_named(2012, "Bravo"), r.team_named(2013, "Bravo"), r.team_named(2013, "Charlie")] == [2, 1, None]


def test_two_franchises_cant_share_a_filed_name():
    # Alpha's manager leaves after 2012; Bravo takes the name in 2013.
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200)), [],
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")], y2013=[(2, 200, "Alpha")]), {})
    assert r.problems == [
        "'Alpha' is franchise 1's filed name and name on the site and franchise 2's filed name and "
        "name on the site: a hand-kept table naming it can't tell them apart"]


def test_two_franchises_cant_share_a_name_on_the_site():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200), (1, "sleeper", 1, ""), (2, "sleeper", 2, "")),
                 aliases((1, "Same", "Alpha"), (2, "Same", "Bravo")),
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")]), {2025: ([1, 2], {2: "Bravo Again"}),
                                                                     2026: ([2], {2: "Same"})})
    assert r.problems == [
        "'Same' is franchise 1's name on the site and franchise 2's name on the site: "
        "a hand-kept table naming it can't tell them apart"]


def test_one_franchises_name_on_the_site_cant_be_anothers_filed_name():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200), (1, "sleeper", 1, "")),
                 aliases((1, "Bravo", "Alpha")),
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")]), {2025: ([1], {})})
    assert r.problems == [
        "'Bravo' is franchise 1's name on the site and franchise 2's filed name and name on the site: "
        "a hand-kept table naming it can't tell them apart"]


def test_two_franchises_cant_play_under_one_team_name_in_a_season():
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200)), [],
                 nfl(y2012=[(1, 100, "pending"), (2, 200, "pending")], y2013=[(1, 100, "Alpha"), (2, 200, "Bravo")]),
                 {})
    assert r.problems == [
        "2012: franchises 1 and 2 both played as 'pending', so the game log can't tell them apart"]


def test_franchise_ids_must_agree_with_ff_data_projects_sleeper_aliases():
    # ff-data-project says roster 1 is Alpha's and roster 2 Bravo's.
    r = registry(keys((1, "nfl.com", 1, 100), (2, "nfl.com", 2, 200), (2, "sleeper", 1, ""), (1, "sleeper", 2, "")),
                 aliases((1, "A", "Alpha"), (2, "B", "Bravo")),
                 nfl(y2012=[(1, 100, "Alpha"), (2, 200, "Bravo")]), {2025: ([1, 2], {})})
    assert r.problems == [
        "Sleeper roster 1 is franchise 2 ('Bravo'), but data/sleeper_aliases.csv says 'Alpha'",
        "Sleeper roster 2 is franchise 1 ('Alpha'), but data/sleeper_aliases.csv says 'Bravo'"]
