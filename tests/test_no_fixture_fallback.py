"""No builder reads its *.example.json fixture unless --fixture asks for it [ingest#5].

build_honors, build_playoffs and build_wide_skills fell back to their
committed fixture whenever pipeline/cache held no real cache, and wrote it
into pipeline/data as a training input with exit 0. build_game_ratings did the
same inside integrate_context, so every prepare (the herdmux climb's included)
rewrote pipeline/data/game_ratings.json from a 2-row example. Each test points
the builder at an empty cache directory that holds only the fixture.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
sys.path.insert(0, str(ROOT / "pipeline"))


def _only_fixture(tmp_path: Path, fixture: str) -> Path:
    shutil.copy(CACHE / fixture, tmp_path / fixture)
    return tmp_path


def test_honors_without_a_real_cache_refuses(tmp_path, monkeypatch):
    import build_honors

    monkeypatch.setattr(build_honors, "CACHE_DIR", _only_fixture(tmp_path, "honors.example.json"))
    with pytest.raises(SystemExit, match=r"honors_award_<year>.json"):
        build_honors.load_award_index(use_fixture=False)
    by_season, complete, coverage = build_honors.load_award_index(use_fixture=True)
    assert by_season and complete is False
    assert not any(c["complete"] for c in coverage.values())  # nothing the fixture omits is a measured zero


def test_playoffs_without_a_real_cache_refuses(tmp_path, monkeypatch):
    import build_playoffs

    monkeypatch.setattr(build_playoffs, "CACHE_DIR", _only_fixture(tmp_path, "playoffs.example.json"))
    with pytest.raises(SystemExit, match=r"playoffs_<season>.json"):
        build_playoffs.load_caches(use_fixture=False)
    players, _, _ = build_playoffs.load_caches(use_fixture=True)
    assert players


def test_wide_skills_without_a_real_cache_refuses(tmp_path, monkeypatch):
    import build_wide_skills

    monkeypatch.setattr(build_wide_skills, "CACHE_DIR", _only_fixture(tmp_path, "wide_skills.example.json"))
    with pytest.raises(SystemExit, match=r"wide_skills_<season>.json"):
        build_wide_skills.load_caches(use_fixture=False)
    rows, complete = build_wide_skills.load_caches(use_fixture=True)
    assert rows and complete is False


def test_game_ratings_without_a_real_cache_is_source_unavailable(tmp_path, monkeypatch):
    import build_game_ratings as bgr

    cache = _only_fixture(tmp_path, "game_ratings.example.json")
    monkeypatch.setattr(bgr, "CACHE_DIR", cache)
    monkeypatch.setattr(bgr, "FIXTURE", cache / "game_ratings.example.json")
    assert bgr.load_cache(use_fixture=False) is None
    # A byte copy under a release name (what fetch_2k_ratings --offline wrote) is still the fixture.
    shutil.copy(cache / "game_ratings.example.json", cache / "game_ratings_2k25.json")
    assert bgr.load_cache(use_fixture=False) is None
    assert bgr.load_cache(use_fixture=True) is not None


def test_game_ratings_build_writes_an_empty_source_unavailable_doc(tmp_path):
    import real_caches

    if real_caches.game_ratings() is None:
        pytest.skip("this checkout has a real game_ratings release cache")
    proc = subprocess.run(
        [sys.executable, "pipeline/build_game_ratings.py", "--out-root", str(tmp_path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        errors="replace",
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    doc = json.loads((tmp_path / "pipeline" / "data" / "game_ratings.json").read_text(encoding="utf-8"))
    assert doc["players"] == [] and doc["complete"] is False and doc["source_unavailable"]
    assert not (tmp_path / "assets" / "game_ratings.json").exists()


def test_integrate_context_reads_source_unavailable_as_a_missing_family(tmp_path, monkeypatch):
    import integrate_context as ic

    p = tmp_path / "game_ratings.json"
    p.write_text(
        json.dumps({"source_unavailable": "no release", "players": [{"name": "X", "season": "2024-25"}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(ic, "GAME_RATINGS_JSON", p)
    assert ic.load_game_ratings_by_player_season() == {}


def test_wide_skills_refuses_a_proxy_doc(tmp_path, monkeypatch):
    # The two deleted 2013-14/2014-15 docs were proxy: true, constants for every player [ingest#5].
    import build_wide_skills

    real = {"season": "2016-17", "complete": True, "players": {"a b": {"deflections": 1.0}}}
    proxy = {"season": "2014-15", "complete": False, "proxy": True, "players": {"a b": {"post_ppp": 0.9}}}
    (tmp_path / "wide_skills_2016-17.json").write_text(json.dumps(real), encoding="utf-8")
    (tmp_path / "wide_skills_2014-15.json").write_text(json.dumps(proxy), encoding="utf-8")
    monkeypatch.setattr(build_wide_skills, "CACHE_DIR", tmp_path)
    with pytest.raises(SystemExit, match=r"wide_skills_2014-15.json"):
        build_wide_skills.load_caches(use_fixture=False)
    (tmp_path / "wide_skills_2014-15.json").unlink()
    rows, complete = build_wide_skills.load_caches(use_fixture=False)
    assert list(rows) == [("2016-17", "a b")] and complete is True


def test_no_proxy_wide_skills_doc_is_committed():
    for path in sorted(CACHE.glob("wide_skills_*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        assert not doc.get("proxy"), f"{path.name} is a proxy doc"
        assert not any(r.get("_proxy") for r in doc.get("players", {}).values()), f"{path.name} has proxy records"
