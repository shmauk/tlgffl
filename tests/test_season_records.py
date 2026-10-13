"""Season, luck and bracket records (#31): the figures behind them, worked out
by hand from small synthetic archives.

The NFL.com fixture is tests/test_games.py's one 4-team 2014: Ant 1, Bee 2,
Cat 3, Dog 4, a 3-week regular season and a week-4 Playoffs final Ant won.

The Sleeper fixture is tests/test_sleeper_build.py's: six rosters (franchise
10 + roster), a 2-week regular season, and a week-3 Playoffs and Shit Bowl.
"""
from tests.archive import fmt, team, write_formats, write_games, write_nfl_season, write_sleeper_league
from tests.test_brackets import write_shitbowl
from tests.test_games import REGULAR, REPORTED, POSTSEASON, data  # noqa: F401 (fixture)
from tests.test_sleeper_build import DIVISIONS, WEEKS, sleeper, built, query  # noqa: F401 (fixture)


def seasons(db):
    return query(db, "select franchise_id, season, games, wins, losses, ties, points_for, points_against "
                     "from record_seasons order by season, franchise_id")


def test_a_season_in_progress_has_no_season_records_until_its_regular_season_ends(sleeper, tmp_path):
    # Week 1 of 2 is final: 2025 has season lines, but no season records yet.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=1,
                         totals={1: (1, 0, 0, 100.0), 2: (0, 1, 0, 90.0), 3: (0, 1, 0, 80.0),
                                 4: (1, 0, 0, 85.0), 5: (0, 1, 0, 70.0), 6: (1, 0, 0, 70.5)})
    db = built(sleeper, tmp_path)
    assert query(db, "select count(*) from season_lines where season = 2025") == [(6,)]
    assert seasons(db) == []


def test_a_season_joins_the_season_records_once_its_last_regular_season_week_is_final(sleeper, tmp_path):
    # Week 2 is final, the Playoffs (week 3) still to come.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=2,
                         totals={1: (2, 0, 0, 210.0), 2: (0, 2, 0, 189.0), 3: (0, 2, 0, 175.0),
                                 4: (1, 1, 0, 145.0), 5: (1, 1, 0, 171.0), 6: (2, 0, 0, 135.5)})
    db = built(sleeper, tmp_path)
    assert seasons(db)[0] == (11, 2025, 2, 2, 0, 0, 210.0, 185.0)
    assert len(seasons(db)) == 6


def test_breakdown_and_luck_only_cover_fully_covered_seasons_and_a_recovered_one_joins(data, tmp_path):
    # tests/test_games.py's 2014. Ant's Breakdown: 3-0 in week 1 (100 v 90, 80,
    # 70), 3-0 in week 2 (110 v 100, 95, 95), 1-2 in week 3 (90 v 120, 105, 85):
    # 7-2, 77.8%. Win % 2-1, 66.7%, so luck is -11.1 points.
    def ant(db):
        return query(db, "select games, round(win_pct, 4), points_for_per_game, round(breakdown_pct, 4), "
                         "round(luck, 4), reported from record_seasons where franchise_id = 1")

    write_games(data, [(2014, *g) for g in REGULAR[:-1] + POSTSEASON])
    assert ant(built(data, tmp_path)) == [(3, 0.6667, 100.0, None, None, 1)]
    # The lost week-3 game is recovered.
    write_games(data, [(2014, *g) for g in REGULAR + POSTSEASON])
    (tmp_path / "league.sqlite").unlink()
    assert ant(built(data, tmp_path)) == [(3, 0.6667, 100.0, 0.7778, -0.1111, 0)]


def three_seasons(data):
    """2014-16, the same regular season each year (so the reported lines agree
    with the games). Playoffs finals: 2014 Ant beat Bee, 2015 Bee beat Ant,
    2016 Ant beat Cat. Shit Bowl winners: 2014 Dog, 2015 disputed between Cat
    and Dog, 2016 Dog."""
    finals = {2014: ("Ant", "Bee"), 2015: ("Bee", "Ant"), 2016: ("Ant", "Cat")}
    slots = {"Ant": 1, "Bee": 2, "Cat": 3, "Dog": 4}
    for year, (won, lost) in finals.items():
        teams = []
        for name, slot in slots.items():
            w, l, t, pf, pa = REPORTED[name]
            seed = 1 if name == won else 2 if name == lost else None
            teams.append(team(slot, slot * 100, name, (w, l, t), pf, pa, seed=seed,
                              bracket="championship" if seed else None))
        rest = [slots[n] for n in slots if n not in (won, lost)]
        write_nfl_season(data, year, teams, final_order=[slots[won], slots[lost], *rest])
    write_games(data, [(y, *g) for y, (won, lost) in finals.items()
                       for g in REGULAR + [(4, won, lost, 130, 120)]])
    write_formats(data, {y: fmt(4, 3, (2, [4]), shit_bowl=(2, [4])) for y in finals})
    write_shitbowl(data, [(2014, "Dog", "derived-confirmed"), (2015, "Cat|Dog", "inconclusive"),
                          (2016, "Dog", "recalled")])


def tallies(db, record, era="all"):
    return query(db, "select franchise_id, count, seasons from record_tallies where record = ? and era = ? "
                     "order by franchise_id", record, era)


def test_bracket_tallies_count_each_franchises_seasons(data, tmp_path):
    three_seasons(data)
    db = built(data, tmp_path)
    assert tallies(db, "championships") == [(1, 2, "2014,2016"), (2, 1, "2015")]
    assert tallies(db, "finals") == [(1, 3, "2014,2015,2016"), (2, 2, "2014,2015"), (3, 1, "2016")]
    assert tallies(db, "playoffs") == [(1, 3, "2014,2015,2016"), (2, 2, "2014,2015"), (3, 1, "2016")]
    assert tallies(db, "championships", "sleeper") == []


def test_a_disputed_shit_bowl_counts_for_nobody(data, tmp_path):
    three_seasons(data)
    db = built(data, tmp_path)
    assert tallies(db, "shit_bowl_titles") == [(4, 2, "2014,2016")]


def test_shit_bowl_appearances_come_from_the_sleeper_eras_bracket_games(sleeper, tmp_path):
    db = built(sleeper, tmp_path)
    assert tallies(db, "shit_bowl") == [(12, 1, "2025"), (13, 1, "2025")]
    assert tallies(db, "playoffs", "sleeper") == [(11, 1, "2025"), (16, 1, "2025")]
    assert tallies(db, "shit_bowl", "nfl.com") == []


def test_brackets_in_a_season_with_no_champion_yet_count_for_nobody(sleeper, tmp_path):
    # The Playoffs final (week 3) is still to come.
    write_sleeper_league(sleeper, 2025, WEEKS, DIVISIONS, status="in_season", last_scored_leg=2,
                         totals={1: (2, 0, 0, 210.0), 2: (0, 2, 0, 189.0), 3: (0, 2, 0, 175.0),
                                 4: (1, 1, 0, 145.0), 5: (1, 1, 0, 171.0), 6: (2, 0, 0, 135.5)})
    db = built(sleeper, tmp_path)
    assert query(db, "select count(*) from record_tallies") == [(0,)]


def runs(db, record, era="all"):
    return query(db, "select franchise_id, length, first_season, last_season, ongoing from record_runs "
                     "where record = ? and era = ? order by franchise_id, first_season", record, era)


def test_playoff_droughts_and_appearance_streaks_run_over_finished_seasons(data, tmp_path):
    # Playoffs: Ant 2014-16, Bee 2014-15, Cat 2016, Dog never. Everyone still
    # plays, so a run reaching 2016 is still going.
    three_seasons(data)
    db = built(data, tmp_path)
    assert runs(db, "appearances") == [(1, 3, 2014, 2016, 1), (2, 2, 2014, 2015, 0), (3, 1, 2016, 2016, 1)]
    assert runs(db, "drought") == [(2, 1, 2016, 2016, 1), (3, 2, 2014, 2015, 0), (4, 3, 2014, 2016, 1)]
