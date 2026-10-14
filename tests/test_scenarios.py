"""The site's test scenarios (tests/scenarios.py) build, each in the phase
it is for."""
import sqlite3

import pytest

from tests.scenarios import write


@pytest.mark.parametrize("scenario, current", [
    ("regular", (2025, "regular", 3, 4, None, None)),
    ("brackets", (2025, "brackets", 6, 7, None, None)),
    ("off-season", (2025, "off-season", 7, None, 2026, 1788282000000)),
])
def test_each_scenario_is_built_in_its_phase(scenario, current, tmp_path):
    con = sqlite3.connect(write(scenario, tmp_path))
    try:
        assert con.execute("select season, phase, through, playing, next_season, next_draft_start "
                           "from current_season").fetchall() == [current]
    finally:
        con.close()
