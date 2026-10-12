"""build_embedding_map_manifest lists a current player without a vector with measured fields only [artifacts#10].

It used to give each of them is_recent_rookie True, is_allstar False and
seasons/best/latest "2025-26", none of it measured, under a hardcoded build date.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import build_embedding_map_manifest as bm  # noqa: E402


def _vec(pid: int, name: str, season: str, total_min: float) -> dict:
    return {"pid": pid, "name": name, "season": season, "x": 0.1, "y": 0.2, "z": 0.3, "c": 1, "total_min": total_min}


VEC = {
    "players": [
        _vec(1, "Old Guard", "2010-11", 2000),
        _vec(1, "Old Guard", "2011-12", 2500),
        _vec(1, "Old Guard", "2012-13", 1000),
        _vec(2, "Current Star", "2024-25", 2600),
        _vec(2, "Current Star", "2025-26", 900),
    ]
}
HONORS = {"players": {"current star|2024-25": {}, "returning vet|2019-20": {}}}
BIO = [
    {"PLAYER_ID": 2, "PLAYER_NAME": "Current Star"},
    {"PLAYER_ID": 3, "PLAYER_NAME": "Returning Vet"},
    {"PLAYER_ID": 4, "PLAYER_NAME": "Unknown Rookie"},
    {"PLAYER_ID": 5},
]


def test_missing_vector_rows_carry_no_invented_labels():
    rows, filters = bm.build_manifest(VEC, HONORS, BIO)
    missing = {r["player_id"]: r for r in rows if r.get("missing_vector")}
    assert sorted(missing) == [3, 4, 5]
    assert filters["missing_vector"] == 3
    for r in missing.values():
        assert r["is_current"] is True
        assert r["is_recent_rookie"] is None and r["is_3plus"] is None
        assert r["best_season"] is None and r["latest_season"] is None
        assert r["seasons"] == [] and r["seasons_count"] == 0
    # is_allstar is the same name lookup the vector rows use, so it is measured.
    assert missing[3]["is_allstar"] is True and missing[4]["is_allstar"] is False
    # No bio name: no invented "PID 5" display name, and no name to look up,
    # so is_allstar is unknown rather than False.
    assert missing[5]["display_name"] is None and missing[5]["norm"] is None
    assert missing[5]["is_allstar"] is None


def test_rows_with_vectors_are_unchanged_in_meaning():
    rows, filters = bm.build_manifest(VEC, HONORS, BIO)
    by = {r["player_id"]: r for r in rows if not r.get("missing_vector")}
    assert by[1]["is_3plus"] is True and by[1]["best_season"] == "2011-12" and by[1]["is_current"] is False
    assert by[2]["is_current"] is True and by[2]["is_allstar"] is True and by[2]["is_recent_rookie"] is True
    assert by[2]["latest_season"] == "2025-26"
    assert rows[0]["player_id"] == 2  # current players first
    assert filters["qualifying_vectors"] == 2


def test_main_writes_under_out_root_with_a_real_build_stamp(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    for name, obj in (("vectors.json", VEC), ("honors.json", HONORS), ("bio.json", BIO)):
        (src / name).write_text(json.dumps(obj), encoding="utf-8")
    monkeypatch.setattr(bm, "VECTORS", src / "vectors.json")
    monkeypatch.setattr(bm, "HONORS", src / "honors.json")
    monkeypatch.setattr(bm, "BIO", src / "bio.json")
    out = tmp_path / "out"
    monkeypatch.setattr(sys, "argv", ["build_embedding_map_manifest.py", "--out-root", str(out)])
    bm.main()
    man = json.loads((out / "assets" / "embedding_map_manifest.json").read_text(encoding="utf-8"))
    assert man["built"] != "2026-08-10 embed v7.1.5" and man["built"].endswith("Z")
    assert len(man["vectors_sha256"]) == 64
    assert man["total_players"] == 5 and man["filters"]["missing_vector"] == 3
    pts = json.loads((out / "assets" / "embedding_map_points_limited.json").read_text(encoding="utf-8"))
    assert {p["pid"] for p in pts["points"]} == {1, 2}
