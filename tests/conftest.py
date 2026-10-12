import pytest

from tests.archive import (team, write_nfl_season, write_sleeper_season,
                           write_franchise_keys, write_sleeper_aliases)


@pytest.fixture
def archive(tmp_path):
    data = tmp_path / "data"
    # Slot 2 changes hands after 2012, so 2013 starts a new franchise there.
    write_nfl_season(data, 2012, [
        team(1, 100, "Alpha One", (2, 1, 0), 300.5, 280.25, seed=1, bracket="championship"),
        team(2, 200, "Bravo", (1, 2, 0), 250.0, 270.0),
    ], final_order=[1, 2])
    write_nfl_season(data, 2013, [
        team(1, 100, "Alpha Two", (1, 2, 0), 260.0, 290.0),
        team(2, 300, "Charlie", (2, 1, 0), 310.0, 280.5, seed=1, bracket="championship"),
    ], final_order=[2, 1])
    write_franchise_keys(data, [
        (1, "nfl.com", 1, 100),
        (2, "nfl.com", 2, 200),
        (3, "nfl.com", 2, 300),
        (3, "sleeper", 1, ""),
        (1, "sleeper", 2, ""),
        (4, "sleeper", 3, ""),
    ])
    write_sleeper_season(data, 2025, [1, 2, 3])
    write_sleeper_aliases(data, [(1, "Charlie Sleeper", "Charlie"),
                                 (2, "Alpha Sleeper", "Alpha Two"),
                                 (3, "Delta", "Delta")])
    return data
