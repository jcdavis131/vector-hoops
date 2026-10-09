"""build_vectors' fetch layer: no empty caches, no silent gaps, no network when --offline.

CACHE, OUT and DATA_DIR point into tmp_path and nba_api is a fake module, so
nothing here touches pipeline/cache, assets/ or the network.

Run:  python -m pytest tests/test_build_vectors_fetch.py
"""

from __future__ import annotations

import json
import re
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import build_vectors as bv  # noqa: E402
import ingest  # noqa: E402
import nba_http  # noqa: E402

FINAL = "2003-04"
LIVE = "2099-00"  # never final: stands in for a season still being played


class FakeDF:
    """The two things df_to_rows touches: .columns and .iterrows()."""

    def __init__(self, rows):
        self.rows = rows
        self.columns = list(rows[0]) if rows else []

    def iterrows(self):
        yield from enumerate(self.rows)


@pytest.fixture
def tmp_cache(tmp_path, monkeypatch):
    cache = tmp_path / "cache"
    cache.mkdir()
    monkeypatch.setattr(bv, "CACHE", cache)
    monkeypatch.setattr(bv.time, "sleep", lambda s: None)
    monkeypatch.setattr(nba_http, "_sleep", lambda s: None)
    return cache


def fake_dash_api(monkeypatch, frames):
    """Install nba_api.stats.endpoints.leaguedashplayerstats returning frames in order."""
    calls = []

    class LeagueDashPlayerStats:
        def __init__(self, season, **kw):
            calls.append(season)
            res = frames.pop(0)
            if isinstance(res, Exception):
                raise res
            self._df = res

        def get_data_frames(self):
            return [self._df]

    endpoints = types.ModuleType("nba_api.stats.endpoints")
    endpoints.leaguedashplayerstats = types.SimpleNamespace(LeagueDashPlayerStats=LeagueDashPlayerStats)
    for name in ("nba_api", "nba_api.stats"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    monkeypatch.setitem(sys.modules, "nba_api.stats.endpoints", endpoints)
    return calls


def base_row(pid=1):
    row = {"PLAYER_ID": pid, "PLAYER_NAME": f"p{pid}"}
    row.update({c: 1.0 for c in bv.GAME_FEATURES})
    row.update({"MIN": 30.0, "GP": 70.0})
    return row


def test_empty_response_is_not_cached(tmp_cache, monkeypatch):
    # Before: fetch_dash wrote '[]' to dashbase_<season>.json and returned [].
    fake_dash_api(monkeypatch, [FakeDF([])])
    monkeypatch.setattr(bv, "require_columns", lambda *a, **k: None)  # an empty frame has no columns either
    with pytest.raises(ingest.EmptyPayloadError):
        bv.fetch_dash(FINAL, "Base", bv.GAME_FEATURES, offline=False)
    assert not (tmp_cache / f"dashbase_{FINAL}.json").exists()


def test_exhausted_retries_raise_and_keep_the_old_cache(tmp_cache, monkeypatch):
    old = tmp_cache / f"dashbase_{LIVE}.json"
    old.write_text(json.dumps([base_row()]), encoding="utf-8")  # no fetch record: stale for a live season
    before = old.read_bytes()
    calls = fake_dash_api(monkeypatch, [ConnectionResetError("reset")] * 5)
    with pytest.raises(ingest.FetchError, match="failed after 5 attempts"):
        bv.fetch_dash(LIVE, "Base", bv.GAME_FEATURES, offline=False)
    assert len(calls) == 5
    assert old.read_bytes() == before


def test_a_missing_column_is_not_read_as_absent(tmp_cache, monkeypatch):
    row = base_row()
    del row["PLUS_MINUS"]
    calls = fake_dash_api(monkeypatch, [FakeDF([row])] * 5)
    with pytest.raises(ingest.MissingColumnsError, match="PLUS_MINUS"):
        bv.fetch_dash(FINAL, "Base", bv.GAME_FEATURES, offline=False)
    assert len(calls) == 1, "upstream drift is not retried"
    assert not (tmp_cache / f"dashbase_{FINAL}.json").exists()


def test_a_good_fetch_is_cached_with_its_record(tmp_cache, monkeypatch):
    fake_dash_api(monkeypatch, [FakeDF([base_row(1), base_row(2)])])
    rows = bv.fetch_dash(FINAL, "Base", bv.GAME_FEATURES, offline=False)
    p = tmp_cache / f"dashbase_{FINAL}.json"
    assert json.loads(p.read_text(encoding="utf-8")) == rows
    rec = ingest.read_fetch_record(p)
    assert rec["rows"] == 2 and rec["season"] == FINAL


def test_final_season_cache_is_not_refetched(tmp_cache, monkeypatch):
    (tmp_cache / f"dashbase_{FINAL}.json").write_text(json.dumps([base_row()]), encoding="utf-8")
    calls = fake_dash_api(monkeypatch, [])
    assert bv.fetch_dash(FINAL, "Base", bv.GAME_FEATURES, offline=False)[0]["PLAYER_ID"] == 1
    assert calls == []


def test_live_season_refetches_when_stale_but_offline_never_does(tmp_cache, monkeypatch):
    p = tmp_cache / f"dashbase_{LIVE}.json"
    p.write_text(json.dumps([base_row(1)]), encoding="utf-8")
    calls = fake_dash_api(monkeypatch, [FakeDF([base_row(7)])])
    assert bv.fetch_dash(LIVE, "Base", bv.GAME_FEATURES, offline=True)[0]["PLAYER_ID"] == 1
    assert calls == []
    assert bv.fetch_dash(LIVE, "Base", bv.GAME_FEATURES, offline=False)[0]["PLAYER_ID"] == 7
    assert calls == [LIVE]
    # Just fetched: inside the TTL, so the next online call keeps it.
    assert bv.fetch_dash(LIVE, "Base", bv.GAME_FEATURES, offline=False)[0]["PLAYER_ID"] == 7
    assert calls == [LIVE]


def test_corrupt_and_empty_caches(tmp_cache):
    (tmp_cache / f"dashadvanced_{FINAL}.json").write_text('[{"PLAYER_ID": 1, ', encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape(f"dashadvanced_{FINAL}.json")):
        bv.load_cached("dashadvanced", FINAL)  # before: None, i.e. the family silently masked
    (tmp_cache / f"dashscoring_{FINAL}.json").write_text("[]", encoding="utf-8")
    assert bv.load_cached("dashscoring", FINAL) is None
    (tmp_cache / "wide_skills_2016-17.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape("wide_skills_2016-17.json")):
        bv.load_wide_skills_defense("2016-17")  # before: {}


def test_a_partial_run_writes_nothing_and_exits_2(tmp_path, tmp_cache, monkeypatch, capsys):
    """Season 2 fails; seasons 1 and 3 are still fetched; no artifact is touched."""
    out = tmp_path / "vectors.json"
    data = tmp_path / "data"
    data.mkdir()
    out.write_bytes(b"old vectors")
    (data / "train_matrix.npz").write_bytes(b"old matrix")
    monkeypatch.setattr(bv, "OUT", out)
    monkeypatch.setattr(bv, "DATA_DIR", data)
    seasons = ["2001-02", "2002-03", "2003-04"]
    monkeypatch.setattr(bv, "SEASONS", seasons)
    monkeypatch.setattr(bv, "patch_nba_api_session", lambda: False)
    monkeypatch.setattr(bv, "fetch_bbref_contracts", lambda offline: {})
    attempted = []

    def fake_dash(season, measure, wanted, offline):
        attempted.append((season, measure))
        if season == "2002-03":
            raise ingest.BlockedError("HTTP 403 on 2 attempts")
        return [base_row()]

    monkeypatch.setattr(bv, "fetch_dash", fake_dash)
    monkeypatch.setattr(bv, "fetch_bio", lambda season, offline: [{"PLAYER_ID": 1}])
    monkeypatch.setattr(bv, "fetch_tracking", lambda season, offline: {})
    monkeypatch.setattr(sys, "argv", ["build_vectors.py"])

    with pytest.raises(SystemExit) as ei:
        ingest.run_fetch(bv.main, name="build_vectors")
    assert ei.value.code == 2
    assert ("2003-04", "Base") in attempted, "a failed season must not stop the rest"
    err = capsys.readouterr().err
    assert "2002-03: fetch failed" in err and "not written" in err
    assert out.read_bytes() == b"old vectors"
    assert (data / "train_matrix.npz").read_bytes() == b"old matrix"
    assert not (data / "feature_manifest.json").exists()


def test_offline_with_a_missing_cache_fails_instead_of_masking(tmp_path, tmp_cache, monkeypatch, capsys):
    monkeypatch.setattr(bv, "OUT", tmp_path / "vectors.json")
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(bv, "SEASONS", [FINAL])
    (tmp_cache / f"dashbase_{FINAL}.json").write_text(json.dumps([base_row()]), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["build_vectors.py", "--offline"])
    monkeypatch.setattr(bv, "patch_nba_api_session", lambda: pytest.fail("--offline must not open a session"))
    # 2003-04 predates tracking, so tracking is {} (masked by design), not missing.
    with pytest.raises(ingest.FetchError, match=re.escape(f"{FINAL}: no cache for Advanced, Scoring, bio.")):
        bv.main()
    assert not (tmp_path / "vectors.json").exists()


def test_a_truncated_gamelog_line_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(bv, "DATA_DIR", tmp_path)
    game = {"PLAYER_ID": 1, "MIN": 30, "PTS": 20, "AST": 5, "OREB": 1, "DREB": 4, "STL": 1, "BLK": 0}
    lines = [json.dumps(game) + "\n"] * 12
    (tmp_path / "gamelogs_2016-17.jsonl").write_text("".join(lines) + "\n", encoding="utf-8")
    assert bv.compute_form_features("2016-17")["1"]["FORM_GP"] == 12.0  # a blank line is not an error
    # What a crash mid-write left behind with the old streaming writer: before, skipped silently.
    (tmp_path / "gamelogs_2016-17.jsonl").write_text("".join(lines) + '{"PLAYER_ID": 1, "MI', encoding="utf-8")
    with pytest.raises(ValueError, match=re.escape("gamelogs_2016-17.jsonl:13")):
        bv.compute_form_features("2016-17")
    with pytest.raises(ValueError):
        bv.compute_shape_features("2016-17")
