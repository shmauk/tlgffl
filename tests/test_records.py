"""Records (#30): the candidates for the records Statsguru can't express,
worked out by hand from tests/test_games.py's one 4-team season.

Ant 1, Bee 2, Cat 3, Dog 4. Regular season (weeks 1-3):
  wk1 Ant 100-90 Bee, Cat 80-70 Dog; wk2 Ant 110-100 Cat, Bee 95-95 Dog;
  wk3 Ant 90-120 Dog, Bee 105-85 Cat. Week 4 Playoffs final: Ant 130-120 Bee.

A top-half week beats at least half the league (2 of the 4), a level score
counting half: wk1 Ant, Bee; wk2 Ant, Cat (Bee and Dog 1.5); wk3 Dog, Bee.
"""
from tests.archive import write_games
from tests.test_games import REGULAR, POSTSEASON, data, built, query  # noqa: F401 (fixture)


def streaks(db, record, season_set="all-seasons"):
    return query(db, "select s.franchise_id, s.length, f.week, l.week, s.gap_before, s.gap_after "
                     "from record_streaks s join games f on f.id = s.first_game_id "
                     "join games l on l.id = s.last_game_id where s.record = ? and s.season_set = ? "
                     "order by s.franchise_id, f.week", record, season_set)


def test_winning_streaks_are_runs_of_regular_season_wins(data, tmp_path):
    db = built(data, tmp_path)
    # Ant W W L; Bee L T W; Cat W L L; Dog L T W. The Playoffs final doesn't count.
    assert streaks(db, "winning") == [(1, 2, 1, 2, 0, 0), (2, 1, 3, 3, 0, 0),
                                      (3, 1, 1, 1, 0, 0), (4, 1, 3, 3, 0, 0)]


def test_a_tie_ends_a_losing_streak(data, tmp_path):
    db = built(data, tmp_path)
    assert streaks(db, "losing") == [(1, 1, 3, 3, 0, 0), (2, 1, 1, 1, 0, 0),
                                     (3, 2, 2, 3, 0, 0), (4, 1, 1, 1, 0, 0)]


def test_top_half_weeks_count_a_level_score_as_half(data, tmp_path):
    db = built(data, tmp_path)
    assert streaks(db, "top_half") == [(1, 2, 1, 2, 0, 0), (2, 1, 1, 1, 0, 0), (2, 1, 3, 3, 0, 0),
                                       (3, 1, 2, 2, 0, 0), (4, 1, 3, 3, 0, 0)]


def test_a_streak_that_reaches_a_week_with_no_score_is_marked(data, tmp_path):
    # Week 3's Bee v Cat is lost: Bee and Cat have a gap in week 3, and no
    # franchise's top-half status is known that week.
    write_games(data, [(2014, *g) for g in REGULAR[:-1] + POSTSEASON])
    db = built(data, tmp_path)
    assert streaks(db, "losing") == [(1, 1, 3, 3, 0, 0), (2, 1, 1, 1, 0, 0),
                                     (3, 1, 2, 2, 0, 1), (4, 1, 1, 1, 0, 0)]
    assert streaks(db, "top_half") == [(1, 2, 1, 2, 0, 1), (2, 1, 1, 1, 0, 0), (3, 1, 2, 2, 0, 1)]


def test_a_streak_after_a_week_with_no_score_may_have_begun_earlier(data, tmp_path):
    # Week 1 is lost entirely.
    write_games(data, [(2014, *g) for g in REGULAR[2:] + POSTSEASON])
    db = built(data, tmp_path)
    assert streaks(db, "winning") == [(1, 1, 2, 2, 1, 0), (2, 1, 3, 3, 0, 0), (4, 1, 3, 3, 0, 0)]


def test_streaks_are_also_kept_per_season_set(data, tmp_path):
    db = built(data, tmp_path)
    assert streaks(db, "winning", "nfl-com") == streaks(db, "winning")
    assert streaks(db, "winning", "sleeper") == []


def test_combined_scores_cover_every_game_with_a_score(data, tmp_path):
    write_games(data, [(2014, *g) for g in REGULAR[:-1] + POSTSEASON])
    db = built(data, tmp_path)
    assert query(db, "select g.week, c.points from combined_scores c join games g on g.id = c.game_id "
                     "order by g.week, c.points") == [
        (1, 150.0), (1, 190.0), (2, 190.0), (2, 210.0), (3, 210.0), (4, 250.0)]


def test_completed_seasons_leave_out_a_season_not_yet_finished(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    from recordbook.build import build
    build(archive, db)
    # 2012 and 2013 are over; 2025 has not finished (nor, here, begun).
    assert query(db, "select franchise_id, season_set, seasons from completed_seasons order by 1, 2") == [
        (1, "10-teams", 1), (1, "12-teams", 1), (1, "16-teams", 0),
        (1, "all-seasons", 2), (1, "nfl-com", 2), (1, "nfl-com-16-teams", 0), (1, "sleeper", 0),
        (2, "10-teams", 1), (2, "12-teams", 0), (2, "16-teams", 0),
        (2, "all-seasons", 1), (2, "nfl-com", 1), (2, "nfl-com-16-teams", 0), (2, "sleeper", 0),
        (3, "10-teams", 0), (3, "12-teams", 1), (3, "16-teams", 0),
        (3, "all-seasons", 1), (3, "nfl-com", 1), (3, "nfl-com-16-teams", 0), (3, "sleeper", 0),
        (4, "10-teams", 0), (4, "12-teams", 0), (4, "16-teams", 0),
        (4, "all-seasons", 0), (4, "nfl-com", 0), (4, "nfl-com-16-teams", 0), (4, "sleeper", 0),
    ]


def test_each_season_set_lists_its_seasons(archive, tmp_path):
    db = tmp_path / "league.sqlite"
    from recordbook.build import build
    build(archive, db)
    # League sizes are fixed years: 10 teams in 2012, 12 in 2013-14, 16 from 2015,
    # whatever the fixture's seasons field. No NFL.com season here has 16 teams.
    assert query(db, "select season_set, season from season_sets order by 1, 2") == [
        ("10-teams", 2012), ("12-teams", 2013), ("16-teams", 2025),
        ("all-seasons", 2012), ("all-seasons", 2013), ("all-seasons", 2025),
        ("nfl-com", 2012), ("nfl-com", 2013), ("sleeper", 2025),
    ]


def test_a_streak_under_a_league_size_counts_only_that_sizes_seasons(data, tmp_path):
    # tests/test_season_records.py's 2014-16, the same regular season each year:
    # Bee beats half the league in weeks 1 and 3, so its run from 2014's week 3
    # into 2015's week 1 is cut at 2015 under 16 teams.
    from tests.test_season_records import three_seasons
    three_seasons(data)
    db = built(data, tmp_path)
    bee = "select s.length, f.season, f.week, l.season, l.week from record_streaks s " \
          "join games f on f.id = s.first_game_id join games l on l.id = s.last_game_id " \
          "where s.record = 'top_half' and s.franchise_id = 2 and s.season_set = ? order by s.first_game_id"
    assert query(db, bee, "all-seasons") == [(1, 2014, 1, 2014, 1), (2, 2014, 3, 2015, 1),
                                              (2, 2015, 3, 2016, 1), (1, 2016, 3, 2016, 3)]
    assert query(db, bee, "16-teams") == [(1, 2015, 1, 2015, 1), (2, 2015, 3, 2016, 1), (1, 2016, 3, 2016, 3)]
    assert query(db, bee, "nfl-com-16-teams") == query(db, bee, "16-teams")
    assert query(db, bee, "12-teams") == [(1, 2014, 1, 2014, 1), (1, 2014, 3, 2014, 3)]
    assert query(db, bee, "10-teams") == []
