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
    home_points: float | None   # null when the score is lost
    away: int
    away_points: float | None
    winner: int | None = None   # null for a tie


def read_log(path):
    """Rows of the scraped game log, or none if there is no log."""
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


def nfl_games(rows, franchise_of, regular_weeks):
    """Regular-season games from the log's rows, and the post-season rows as
    {season: {(week, frozenset of the two franchises): Game}}.

    franchise_of(season, team name) gives the franchise id and regular_weeks
    maps a season to its regular season's last week.

    After the regular season the log mixes the Playoffs with NFL.com's
    placement and consolation pairings, unlabelled, so post-season rows are
    only evidence: the brackets decide which of them are games.
    """
    rows = sorted(rows, key=lambda r: (int(r["year"]), int(r["round"])))
    games = []
    postseason = defaultdict(dict)
    for r in rows:
        season, week = int(r["year"]), int(r["round"])
        if season not in regular_weeks:
            continue
        home, away = franchise_of(season, r["home_team"]), franchise_of(season, r["away_team"])
        hp, ap = float(r["home_score"]), float(r["away_score"])
        winner = home if hp > ap else away if ap > hp else None
        if week <= regular_weeks[season]:
            games.append(Game(season, week, "regular", None, None, "final", home, hp, away, ap, winner))
        else:
            postseason[season][(week, frozenset((home, away)))] = Game(
                season, week, "bracket", None, None, "final", home, hp, away, ap, winner)
    return games, postseason


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
    """Rows of (season, week, phase, bracket, games expected, final games
    with a score, complete) for every NFL.com regular-season and Playoffs week."""
    final = defaultdict(int)
    for g in games:
        if g.status == "final" and g.home_points is not None:
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


def fully_covered(coverage, phase="regular"):
    """Seasons where every week of the phase has all its games."""
    weeks = defaultdict(list)
    for season, _week, ph, _bracket, _expected, _final, complete in coverage:
        if ph == phase:
            weeks[season].append(complete)
    return {season for season, flags in weeks.items() if all(flags)}


def regular_season_results(games, seasons):
    """{(franchise, season): [W, L, T, PF, PA]} from the final regular-season
    games of the given seasons. Equal scores are a tie."""
    out = defaultdict(lambda: [0, 0, 0, 0.0, 0.0])
    for g in games:
        if g.phase != "regular" or g.status != "final" or g.season not in seasons:
            continue
        for me, mine, theirs in ((g.home, g.home_points, g.away_points),
                                 (g.away, g.away_points, g.home_points)):
            acc = out[(me, g.season)]
            acc[0 if mine > theirs else 1 if mine < theirs else 2] += 1
            acc[3] += mine
            acc[4] += theirs
    return {k: (w, l, t, round(pf, 2), round(pa, 2)) for k, (w, l, t, pf, pa) in out.items()}


def breakdown(games, seasons):
    """{(franchise, season): (W, L, T)}: each regular-season week, a franchise's
    score against every other franchise that played a game that week."""
    scores = defaultdict(list)
    for g in games:
        if g.phase == "regular" and g.status == "final" and g.season in seasons:
            scores[(g.season, g.week)] += [(g.home, g.home_points), (g.away, g.away_points)]
    out = defaultdict(lambda: [0, 0, 0])
    for (season, _week), week in scores.items():
        for me, mine in week:
            acc = out[(me, season)]
            for other, theirs in week:
                if other != me:
                    acc[0 if mine > theirs else 1 if mine < theirs else 2] += 1
    return {k: tuple(v) for k, v in out.items()}


def win_pct(w, l, t):
    """Win %, a tie counting as half a win, as a fraction."""
    return (w + t / 2) / (w + l + t) if w + l + t else None


def season_lines(games, coverage, reported):
    """Season lines (ADR 0001): W-L-T and points derived from games where the
    regular season is fully covered, NFL.com's reported figures otherwise.

    reported rows are (franchise, season, W, L, T, PF, PA, division, seed,
    bracket, placing). NFL.com-era division, seed, bracket and placing are
    always as reported.

    Fully covered seasons also get Breakdown and luck (win % minus Breakdown
    %, as a fraction); other seasons leave them null.

    Where both exist they must agree (the ADR 0001 agreement check). Returns
    the (franchise, season, source, W, L, T, PF, PA, division, seed, bracket,
    placing, Breakdown W, L, T, luck) rows and a list of disagreements, each a
    sentence.
    """
    covered = fully_covered(coverage)
    derived = regular_season_results(games, covered)
    breakdowns = breakdown(games, covered)
    rows, disagreements = [], []
    for fid, season, w, l, t, pf, pa, *rest in reported:
        if season not in covered:
            rows.append((fid, season, "reported", w, l, t, pf, pa, *rest, None, None, None, None))
            continue
        dw, dl, dt, dpf, dpa = derived.get((fid, season), (0, 0, 0, 0.0, 0.0))
        for figure, ours, theirs in (("W-L-T", f"{dw}-{dl}-{dt}", f"{w}-{l}-{t}"),
                                     ("points for", dpf, round(pf, 2)),
                                     ("points against", dpa, round(pa, 2))):
            if ours != theirs:
                disagreements.append(f"{season} franchise {fid}: games give {figure} {ours}, "
                                     f"NFL.com reported {theirs}")
        bd = breakdowns.get((fid, season), (0, 0, 0))
        luck = win_pct(dw, dl, dt) - win_pct(*bd) if dw + dl + dt and sum(bd) else None
        rows.append((fid, season, "derived", dw, dl, dt, dpf, dpa, *rest, *bd, luck))
    return rows, disagreements
