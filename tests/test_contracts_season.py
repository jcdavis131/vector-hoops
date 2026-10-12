"""bbref_salaries/<year>/ is the season's END year (fetch_salary_history.cache_path).

fetch_contracts read it as the start year, so contracts_full.json filed every
static salary one season late (LeBron James 2019-20 showed his 2018-19
salary). P8 carry-forward, measured in P11.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))


def test_a_year_dir_is_the_seasons_end_year(tmp_path, monkeypatch):
    import fetch_contracts as fc
    import fetch_salary_history as fsh

    # The writer's own layout: end year 2020 -> 2020/LAL.json, season 2019-20.
    assert fsh.season_label(2020) == "2019-20"
    monkeypatch.setattr(fsh, "SAL_DIR", tmp_path)
    assert fsh.cache_path("LAL", 2020) == tmp_path / "2020" / "LAL.json"
    (tmp_path / "2020").mkdir()
    (tmp_path / "2020" / "LAL.json").write_text(
        json.dumps([{"name": "LeBron James", "salary": 37436858.0}]), encoding="utf-8"
    )
    monkeypatch.setattr(fc, "BBREF_SAL_DIR", tmp_path)
    out, _ = fc.load_bbref_salaries_static()
    assert list(out) == ["lebron james|2019-20"]
    assert out["lebron james|2019-20"]["season"] == "2019-20" and out["lebron james|2019-20"]["team"] == "LAL"
