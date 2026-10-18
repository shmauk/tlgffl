"""The franchise registry: the one place franchise identity and names are
decided (GLOSSARY.md: Franchise, Team name, Franchise name, Filed name).

Built from the hand-kept franchise keys and Sleeper aliases and the seasons
the platforms played, it says which franchise each NFL.com team and Sleeper
roster is, what each franchise played under every season, and every name a
hand-kept table may give it. It collects the problems it finds instead of
stopping at the first: the build fails on them, and validation reports them.
"""
import csv
from collections import defaultdict
from dataclasses import dataclass, field

from recordbook import sleeper as sleeperlib

# Names a platform shows when no real team name exists. They are kept as a
# season's team name but never become a franchise name or a filed name.
PLACEHOLDER_NAMES = {"pending", "[name redacted]"}


@dataclass
class Registry:
    nfl_keys: dict
    sleeper_keys: dict
    team_names: dict = field(default_factory=dict)
    filed_names: dict = field(default_factory=dict)
    franchise_names: dict = field(default_factory=dict)
    by_name: dict = field(default_factory=dict)
    by_team_name: dict = field(default_factory=dict)
    problems: list = field(default_factory=list)

    @property
    def ids(self):
        """Every franchise id, in order."""
        return sorted(set(self.nfl_keys.values()) | set(self.sleeper_keys.values()))

    @property
    def played(self):
        """{franchise: the seasons it played}."""
        out = defaultdict(set)
        for fid, year in self.team_names:
            out[fid].add(year)
        return out

    def nfl_team(self, team):
        """The franchise an NFL.com team (its teamId and ownerUserId) is."""
        return self.nfl_keys[(team["teamId"], team["ownerUserId"])]

    def roster(self, roster_id):
        """The franchise a Sleeper roster is."""
        return self.sleeper_keys[int(roster_id)]

    def filed_name(self, fid):
        """The name the hand-kept tables file the franchise under: the last
        real team name it played under on NFL.com or, if it has only played
        on Sleeper, the name ff-data-project gave its roster. A rename on
        Sleeper doesn't change it."""
        return self.filed_names[fid]

    def franchise_name(self, fid):
        """The name the franchise is shown by: its latest real team name in
        either era (#25)."""
        return self.franchise_names[fid]

    def named(self, name):
        """The franchise a hand-kept table's name refers to, by its franchise
        name or its filed name, or None."""
        return self.by_name.get(name)

    @property
    def names(self):
        """Every name a hand-kept table may give a franchise, in order."""
        return sorted(self.by_name)

    def team_named(self, season, name):
        """The franchise that played under a team name in a season, or None."""
        return self.by_team_name.get((season, name))


def load(data, nfl, sleeper):
    """The registry from the hand-kept tables and the Sleeper team-name
    snapshots under data, given the {year: league} NFL.com seasons and
    {year: (league, rosters)} Sleeper seasons already loaded from it."""
    return registry(_rows(data / "franchises.csv"), _rows(data / "sleeper_aliases.csv"),
                    {year: list(league["teams"].values()) for year, league in nfl.items()},
                    {year: ([r["roster_id"] for r in rosters], sleeperlib.team_names(data / "sleeper", year))
                     for year, (_league, rosters) in sleeper.items()})


def _rows(path):
    """A hand-kept CSV's rows, skipping '#' comment lines; none if it's missing."""
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(line for line in f if not line.startswith("#")))


def registry(keys, aliases, nfl, sleeper):
    """The registry from the franchises.csv and sleeper_aliases.csv rows,
    {year: NFL.com teams} and {year: (Sleeper roster ids, {roster: snapshot
    team name})}."""
    nfl_keys = {(row["slot"], row["owner_user_id"]): int(row["franchise_id"])
                for row in keys if row["era"] == "nfl.com"}
    sleeper_keys = {int(row["slot"]): int(row["franchise_id"]) for row in keys if row["era"] == "sleeper"}
    by_roster = {int(a["roster_id"]): a for a in aliases}
    reg = Registry(nfl_keys, sleeper_keys)
    last_roster = {}
    # Franchises with a roster but no alias: their names can't be known, so
    # they go unchecked until it's added.
    unnamed = set()
    for year, teams in nfl.items():
        for t in teams:
            if (t["teamId"], t["ownerUserId"]) not in nfl_keys:
                reg.problems.append(f"{year} NFL.com team {t['teamId']} (owner {t['ownerUserId']}) "
                                    "has no franchise in data/franchises.csv")
                continue
            reg.team_names[(reg.nfl_team(t), year)] = t["name"]
    for year, (rosters, snapshot) in sleeper.items():
        for rid in rosters:
            if rid not in sleeper_keys:
                reg.problems.append(f"{year} Sleeper roster {rid} has no franchise in data/franchises.csv")
            if rid not in by_roster:
                reg.problems.append(f"{year} Sleeper roster {rid} has no row in data/sleeper_aliases.csv")
                if rid in sleeper_keys:
                    unnamed.add(sleeper_keys[rid])
            if rid in sleeper_keys and rid in by_roster:
                # Never the manager's display name: an unsnapshotted season
                # takes the name ff-data-project recorded for the roster.
                reg.team_names[(reg.roster(rid), year)] = snapshot.get(rid) or by_roster[rid]["sleeper_name"]
                last_roster[reg.roster(rid)] = rid
    for (fid, year), name in sorted(reg.team_names.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if (other := reg.by_team_name.setdefault((year, name), fid)) != fid:
            reg.problems.append(f"{year}: franchises {other} and {fid} both played as {name!r}, "
                                "so the game log can't tell them apart")
    played = reg.played
    for fid in (f for f in reg.ids if f not in unnamed):
        if not played[fid]:
            reg.problems.append(f"franchise {fid} in data/franchises.csv never played a season")
            continue
        real = [(year, n) for (f, year), n in sorted(reg.team_names.items(), key=lambda kv: kv[0][1])
                if f == fid and n not in PLACEHOLDER_NAMES]
        on_nfl = [n for year, n in real if year in nfl]
        if on_nfl:
            reg.filed_names[fid] = on_nfl[-1]
        elif last_roster.get(fid) in by_roster:
            reg.filed_names[fid] = by_roster[last_roster[fid]]["franchise"]
        else:
            reg.problems.append(f"franchise {fid} has no team name that could be its filed name")
            continue
        reg.franchise_names[fid] = real[-1][1] if real else reg.filed_names[fid]
    reg.problems += _name_clashes(reg)
    # ff-data-project's sleeper_aliases.csv names the franchise behind each
    # Sleeper roster. The franchise ids must make the same call (#20).
    for fid, roster in sorted(last_roster.items(), key=lambda kv: kv[1]):
        expected = by_roster[roster]["franchise"]
        if fid in reg.filed_names and expected != reg.filed_names[fid]:
            reg.problems.append(f"Sleeper roster {roster} is franchise {fid} ({reg.filed_names[fid]!r}), "
                                f"but data/sleeper_aliases.csv says {expected!r}")
    return reg


def _name_clashes(reg):
    """Every franchise name or filed name more than one franchise goes by,
    which a hand-kept table naming it couldn't tell apart."""
    goes_by = defaultdict(lambda: defaultdict(list))
    for fid in reg.filed_names:
        goes_by[reg.filed_names[fid]][fid].append("filed name")
        goes_by[reg.franchise_names[fid]][fid].append("franchise name")
    problems = []
    for name, franchises in goes_by.items():
        if len(franchises) > 1:
            problems.append(f"{name!r} is " + " and ".join(
                f"franchise {fid}'s {' and '.join(kinds)}" for fid, kinds in sorted(franchises.items()))
                + ": a hand-kept table naming it can't tell them apart")
        else:
            [reg.by_name[name]] = franchises
    return problems
