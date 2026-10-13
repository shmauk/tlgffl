"""Division lineages and division records (#7, #32).

A division lineage is the same division across the seasons between two
realignments, even if it is renamed or one of its franchises changes hands
(GLOSSARY.md). Nothing in the platform data says which division continues
which, so data/division_lineages.csv keeps it by hand: one row per season and
division, naming its lineage. Every division of a season with more than one
must resolve to a lineage, and a lineage stays within one realignment.

Division records rank a division's season (its franchises' season lines
summed, ADR 0001), so like every season-line record they leave out a season
in progress (#16).
"""
from collections import defaultdict

SCHEMA = """
-- Every division of a season with more than one, and its lineage (the
-- hand-kept data/division_lineages.csv).
create table division_lineages (
    season integer not null references seasons(year),
    division text not null,
    lineage text not null,
    primary key (season, division)
);
-- A division's completed season: its franchises' season lines summed.
-- lineage_name is the lineage's first division name and the seasons it
-- spans. reported is 1 where any of those lines is NFL.com's reported one.
create table record_divisions (
    season integer not null references seasons(year),
    division text not null,
    lineage text not null,
    lineage_name text not null,
    wins integer not null,
    losses integer not null,
    ties integer not null,
    points_for real not null,
    points_against real not null,
    reported integer not null check (reported in (0, 1)),
    primary key (season, division)
);
"""

TABLE = "data/division_lineages.csv"


class LineageError(Exception):
    pass


def read_lineages(rows):
    """{(season, division): lineage} from the hand-kept CSV rows."""
    return {(int(r["season"]), r["division"].strip()): r["lineage"].strip() for r in rows}


def lineage_rows(lineages, season_lines, formats):
    """division_lineages rows, after checking every division resolves.

    season_lines are season_lines rows; formats maps a season to its Format.
    Raises LineageError listing every problem.
    """
    played = {(row[1], row[8]) for row in season_lines
              if row[8] is not None and formats[row[1]].divisions > 1}
    problems = [f"{season} division {division!r} has no lineage in {TABLE}"
                for season, division in sorted(played - lineages.keys())]
    # A season with no season lines yet can't be checked: its rows may be
    # written ahead.
    lined = {row[1] for row in season_lines}
    problems += [f"{TABLE}: {season} has no division {division!r}"
                 for season, division in sorted(lineages.keys() - played) if season in lined]
    by_lineage = defaultdict(list)
    for (season, division), lineage in sorted(lineages.items()):
        by_lineage[lineage].append((season, division))
    for lineage, members in sorted(by_lineage.items()):
        seasons = [s for s, _ in members]
        for season in sorted({s for s in seasons if seasons.count(s) > 1}):
            problems.append(f"{TABLE}: lineage {lineage!r} has two divisions in {season}")
        cycles = sorted({formats[s].realignment for s in seasons if s in formats})
        if len(cycles) > 1:
            problems.append(f"{TABLE}: lineage {lineage!r} crosses a realignment "
                            f"({' and '.join(map(str, cycles))})")
    if problems:
        raise LineageError("division lineages:\n  " + "\n  ".join(problems))
    return sorted((s, d, lineage) for (s, d), lineage in lineages.items())


def lineage_names(lineages):
    """{lineage: "<first division name>, <first>–<last season>"}."""
    out = {}
    for lineage in set(lineages.values()):
        seasons = sorted((s, d) for (s, d), l in lineages.items() if l == lineage)
        first, last = seasons[0][0], seasons[-1][0]
        span = f"{first}" if first == last else f"{first}–{last}"
        out[lineage] = f"{seasons[0][1]}, {span}"
    return out


def record_rows(lineages, season_lines, completed):
    """record_divisions rows for the completed seasons' divisions."""
    names = lineage_names(lineages)
    acc = defaultdict(lambda: [0, 0, 0, 0.0, 0.0, 0])
    for (_f, season, source, w, l, t, pf, pa, division, *_rest) in season_lines:
        if (season, division) not in lineages or season not in completed:
            continue
        a = acc[(season, division)]
        a[0], a[1], a[2] = a[0] + w, a[1] + l, a[2] + t
        a[3], a[4] = a[3] + pf, a[4] + pa
        a[5] = a[5] or int(source == "reported")
    return [(season, division, lineages[(season, division)], names[lineages[(season, division)]],
             w, l, t, round(pf, 2), round(pa, 2), rep)
            for (season, division), (w, l, t, pf, pa, rep) in sorted(acc.items())]
