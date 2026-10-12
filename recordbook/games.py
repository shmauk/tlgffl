"""NFL.com-era games (ADR 0001).

The scraped game log (data/league_h2h.csv) names teams by their season team
name and covers 2012 wk1 to 2022 wk9. Missing games are added later as plain
rows in the same file.
"""
import csv
from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class Game:
    season: int
    week: int
    phase: str            # 'regular' or 'bracket'
    bracket: str | None   # 'playoffs', 'shit_bowl', 'mediocre_bowl'
    round: int | None
    status: str           # 'scheduled', 'live' or 'final'
    home: int             # franchise ids
    home_points: float
    away: int
    away_points: float


def read_log(path):
    """Rows of the scraped game log, or none if there is no log."""
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


def nfl_games(rows, franchise_of, regular_weeks, playoff_teams):
    """Games from the log's rows.

    franchise_of(season, team name) gives the franchise id, regular_weeks maps
    a season to its regular-season length, and playoff_teams a season to the
    franchises NFL.com put in its championship bracket.

    After the regular season the log mixes the Playoffs with NFL.com's
    placement and consolation pairings, unlabelled. A Playoffs game is one
    between two championship-bracket franchises that have both still to lose a
    Playoffs game; any other pairing in a Playoffs week (a third-place game,
    say) is platform filler. NFL.com's consolation bracket advanced winners,
    unlike the Shit Bowl, so its pairings are not taken as Shit Bowl or
    Mediocre Bowl games: those are recorded by hand.
    """
    rows = sorted(rows, key=lambda r: (int(r["year"]), int(r["round"])))
    games = []
    eliminated = set()
    for r in rows:
        season, week = int(r["year"]), int(r["round"])
        if season not in regular_weeks:
            continue
        home, away = franchise_of(season, r["home_team"]), franchise_of(season, r["away_team"])
        hp, ap = float(r["home_score"]), float(r["away_score"])
        if week <= regular_weeks[season]:
            games.append(Game(season, week, "regular", None, None, "final", home, hp, away, ap))
            continue
        alive = playoff_teams.get(season, set())
        if not ({home, away} <= alive and not {(season, home), (season, away)} & eliminated):
            continue
        games.append(Game(season, week, "bracket", "playoffs", week - regular_weeks[season],
                          "final", home, hp, away, ap))
        if hp != ap:
            eliminated.add((season, away if hp > ap else home))
    return games


def playoffs_rounds(teams):
    """Games in each round of a single-elimination Playoffs of `teams`
    franchises, the top seeds taking byes until the field is a power of two."""
    if teams < 2:
        return []
    field = 1 << (teams.bit_length() - 1)
    rounds = [teams - field] if field < teams else []
    while field > 1:
        rounds.append(field // 2)
        field //= 2
    return rounds


def coverage(games, team_counts, regular_weeks, playoff_teams):
    """Rows of (season, week, phase, bracket, games expected, final games,
    complete) for every NFL.com regular-season and Playoffs week."""
    final = defaultdict(int)
    for g in games:
        if g.status == "final":
            final[(g.season, g.week, g.phase, g.bracket)] += 1
    rows = []
    for season, weeks in sorted(regular_weeks.items()):
        expected = [(w, "regular", None, team_counts[season] // 2) for w in range(1, weeks + 1)]
        for n, count in enumerate(playoffs_rounds(len(playoff_teams.get(season, ()))), start=1):
            expected.append((weeks + n, "bracket", "playoffs", count))
        for week, phase, bracket, count in expected:
            got = final[(season, week, phase, bracket)]
            rows.append((season, week, phase, bracket, count, got, int(got == count)))
    return rows
