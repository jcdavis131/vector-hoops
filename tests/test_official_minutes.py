"""vectors.json mpg / total_min from official stats.nba.com minutes [F6].

build_vectors fetches the Base dashboard Per100Possessions, so its MIN is
minutes per 100 possessions (~48 for everyone). The served `mpg` was that
number (9,508 of 12,966 rows above 48 on origin 50697c11) and `total_min`
was GP x it, so every row past the GP gate cleared the 450-minute gate.
The default minutes source is now the Totals dashboard (git-tracked under
pipeline/cache/official_totals/, never Basketball-Reference): mpg = MIN/GP,
total_min = MIN. The universe is unchanged; the rows whose official minutes
miss the gate are counted in vectors.json's eligibility block, not dropped.

Expected values are B-ACC's (writeups/hoops-sota-2026-10-21/evidence/B-ACC
diff.csv, population D), copied to tests/fixtures/bacc_official_minutes.csv.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

TOTALS = ROOT / "pipeline" / "cache" / "official_totals"
FIXTURE = ROOT / "tests" / "fixtures" / "bacc_official_minutes.csv"
SEASONS = [f"{y}-{(y + 1) % 100:02d}" for y in range(1996, 2026)]


def _fixture():
    with FIXTURE.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_cache_is_the_recorded_bytes_of_the_totals_endpoint():
    doc = json.loads((TOTALS / "SOURCES.json").read_text(encoding="utf-8"))
    assert [e["season"] for e in doc["files"]] == SEASONS
    for e in doc["files"]:
        raw = (TOTALS / e["file"]).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == e["sha256"], e["file"]
        url = e["url"]
        assert url.startswith("https://stats.nba.com/stats/leaguedashplayerstats?")
        for want in ("MeasureType=Base", "PerMode=Totals", "SeasonType=Regular+Season", f"Season={e['season']}"):
            assert want in url, (e["file"], want)


def test_official_minutes_match_bacc_rows():
    import official_minutes as om

    rows = _fixture()
    assert len(rows) == 360
    seen = {"mpg": 0, "total_min": 0, "gp": 0}
    for r in rows:
        totals = om.load_official_totals(r["season"])
        assert totals is not None, r["season"]
        entry = totals[int(r["pid"])]
        mpg, total = om.official_minutes(entry)
        want = float(r["official"])
        if r["stat"] == "mpg":
            assert mpg == pytest.approx(want, abs=0.05), r
        elif r["stat"] == "total_min":
            assert total == pytest.approx(want, abs=0.5), r
        else:
            assert entry[0] == int(want), r
        seen[r["stat"]] += 1
    assert seen == {"mpg": 120, "total_min": 120, "gp": 120}


def test_official_mpg_never_exceeds_48_past_the_gp_gate():
    import official_minutes as om
    from eligibility import derive_min_gp

    n = 0
    for s in SEASONS:
        for pid, entry in om.load_official_totals(s).items():
            if entry[0] < derive_min_gp(s):
                continue
            mpg, _total = om.official_minutes(entry)
            assert mpg is not None and 0 <= mpg <= 48.0, (s, pid, entry)
            n += 1
    assert n > 12000


def test_missing_entry_is_missing_never_per100():
    import official_minutes as om

    assert om.official_minutes(None) == (None, None)
    assert om.official_minutes((0, 0.0)) == (None, 0.0)
    assert om.load_official_totals("1946-47") is None


def test_build_vectors_defaults_to_official_minutes():
    import build_vectors as bv

    assert bv.DEFAULT_MINUTES_SOURCE == "official"
    # Chris Dudley 1996-97 (B-ACC row 246): per-100 MIN 52.8, official 22.7264 mpg.
    entry = bv.load_official_totals("1996-97")[201]
    mpg, total = bv.row_minutes("official", gp=entry[0], per100_min=52.8, official=entry)
    assert mpg == pytest.approx(22.7264, abs=0.05)
    assert total == pytest.approx(entry[1])
    # No official row: missing, never the per-100 value.
    assert bv.row_minutes("official", gp=20, per100_min=52.8, official=None) == (None, None)
    # per100 keeps the old (mislabelled) arithmetic for the A/B arm that asks for it.
    assert bv.row_minutes("per100", gp=20, per100_min=52.8) == (52.8, 20 * 52.8)


def test_gate_summary_counts_rows_whose_official_minutes_miss_the_gate():
    import official_minutes as om

    rows = [
        {"season": "2023-24", "gp": 60, "total_min": 450.0},  # on the line: passes
        {"season": "2023-24", "gp": 60, "total_min": 449.6},  # under 450
        {"season": "2023-24", "gp": 11, "total_min": 900.0},  # under min_gp 12
        {"season": "1998-99", "gp": 10, "total_min": 451.0},  # lockout gate 10 GP / 450: passes
        {"season": "2011-12", "gp": 40, "total_min": None},  # no official minutes
    ]
    s = om.gate_summary(rows)
    assert s["applied"] is False
    assert s["rows"] == 5
    assert s["rows_below_gate"] == 2
    assert s["rows_without_official_minutes"] == 1
    assert s["by_season"] == {"2023-24": 2}
    assert "450" in s["rule"] and s["why_kept"]


def test_eligibility_block_records_the_source_and_the_gate_count():
    import build_vectors as bv

    players = [{"season": "2023-24", "gp": 60, "total_min": 300}, {"season": "2023-24", "gp": 60, "total_min": 2000}]
    block = bv.minutes_eligibility_fields("official", players, minutes_stats={})
    assert block["minutes_source"] == "official"
    assert block["official_minutes_gate"]["rows_below_gate"] == 1
    assert bv.minutes_eligibility_fields("per100", players, minutes_stats={}) == {}
