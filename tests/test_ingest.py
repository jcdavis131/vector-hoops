"""pipeline/ingest.py: empty payloads are refused, failures reach the exit code, stale seasons refetch.

Everything runs in tmp_path; nothing touches pipeline/cache or the network.

Run:  python -m pytest tests/test_ingest.py
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.error
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import ingest  # noqa: E402

DURING = dt.date(2027, 1, 15)  # 2026-27 still being played
AFTER = dt.date(2027, 9, 1)  # 2026-27 final


# --- write_cache -------------------------------------------------------------


@pytest.mark.parametrize("doc", [None, [], {}])
def test_empty_payload_is_refused_and_the_old_cache_survives(tmp_path, doc):
    p = tmp_path / "dashbase_2026-27.json"
    p.write_text('[{"PLAYER_ID":1}]', encoding="utf-8")
    with pytest.raises(ingest.EmptyPayloadError):
        ingest.write_cache(p, doc, source="test")
    assert p.read_text(encoding="utf-8") == '[{"PLAYER_ID":1}]'
    assert not ingest.meta_path(p).exists()


def test_empty_row_list_under_a_key_is_refused(tmp_path):
    p = tmp_path / "playoffs_2026-27.json"
    doc = {"complete": True, "players": {}, "teams": {}}
    with pytest.raises(ingest.EmptyPayloadError):
        ingest.write_cache(p, doc, source="test", n_rows=len(doc["players"]))
    assert not p.exists()


def test_same_bytes_as_the_write_text_it_replaces(tmp_path):
    doc = [{"PLAYER_ID": 1, "PLAYER_NAME": "Nikola Jokić", "PTS": 30.5}, {"PLAYER_ID": 2, "PTS": None}]
    old = tmp_path / "old.json"
    old.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    new = ingest.write_cache(tmp_path / "new.json", doc, source="test")
    assert new.read_bytes() == old.read_bytes()

    old.write_text(json.dumps(doc, indent=2), encoding="utf-8")
    ingest.write_cache(new, doc, source="test", indent=2)
    assert new.read_bytes() == old.read_bytes()


def test_fetch_record_sits_where_no_reader_glob_finds_it(tmp_path):
    p = ingest.write_cache(
        tmp_path / "bio_2026-27.json", [{"PLAYER_ID": 1}], source="stats.nba.com x", season="2026-27"
    )
    rec = ingest.read_fetch_record(p)
    assert rec["file"] == "bio_2026-27.json"
    assert rec["rows"] == 1
    assert rec["source"] == "stats.nba.com x"
    assert rec["season"] == "2026-27"
    assert rec["fetched_at"].endswith("Z")
    assert ingest.meta_path(p).parent.name == "_fetch_meta"
    assert sorted(x.name for x in tmp_path.glob("bio_*.json")) == ["bio_2026-27.json"]
    assert sorted(x.name for x in tmp_path.glob("*.json")) == ["bio_2026-27.json"]


def test_require_columns_names_every_missing_column():
    ingest.require_columns(["A", "B"], ["A"], "x")
    with pytest.raises(ingest.MissingColumnsError, match=r"\['D_FG_PCT', 'Z'\]"):
        ingest.require_columns(["A"], ["A", "D_FG_PCT", "Z"], "leaguedashptstats Defense")


# --- TTL -------------------------------------------------------------------


def _fetched(tmp_path, hours_ago: float) -> tuple[Path, dt.datetime]:
    p = ingest.write_cache(tmp_path / "dashbase_2026-27.json", [{"PLAYER_ID": 1}], source="test", season="2026-27")
    fetched = dt.datetime.strptime(ingest.read_fetch_record(p)["fetched_at"], "%Y-%m-%dT%H:%M:%SZ")
    return p, fetched.replace(tzinfo=dt.UTC) + dt.timedelta(hours=hours_ago)


def test_current_season_is_fresh_inside_the_ttl_and_stale_after(tmp_path):
    p, now = _fetched(tmp_path, 2)
    assert ingest.cache_is_fresh(p, "2026-27", today=DURING, now=now, ttl=24)
    _, later = _fetched(tmp_path, 25)
    assert not ingest.cache_is_fresh(p, "2026-27", today=DURING, now=later, ttl=24)
    assert ingest.cache_is_fresh(p, "2026-27", today=DURING, now=later, ttl=48)


def test_final_season_is_kept_as_fetched(tmp_path):
    p = tmp_path / "dashbase_2026-27.json"
    p.write_text("[1]", encoding="utf-8")  # no fetch record at all, as every cache today
    assert ingest.cache_is_fresh(p, "2026-27", today=AFTER)
    assert not ingest.cache_is_fresh(p, "2026-27", today=DURING), "no record on a live season = stale"
    assert not ingest.cache_is_fresh(tmp_path / "missing.json", "2026-27", today=AFTER)


def test_cache_rewritten_behind_the_record_is_stale(tmp_path):
    p, now = _fetched(tmp_path, 1)
    p.write_text('[{"PLAYER_ID":2}]', encoding="utf-8")  # some other tool rewrote it
    assert ingest.cache_age_hours(p, now) is None
    assert not ingest.cache_is_fresh(p, "2026-27", today=DURING, now=now, ttl=24)


def test_ttl_comes_from_the_environment(monkeypatch):
    monkeypatch.delenv(ingest.TTL_ENV, raising=False)
    assert ingest.ttl_hours() == 24.0
    monkeypatch.setenv(ingest.TTL_ENV, "6")
    assert ingest.ttl_hours() == 6.0
    for bad in ("soon", "0", "-3"):
        monkeypatch.setenv(ingest.TTL_ENV, bad)
        with pytest.raises(ValueError):
            ingest.ttl_hours()


# --- failures and exit codes --------------------------------------------------


def test_failures_attempt_everything_then_raise():
    f = ingest.Failures("fetch_x")
    f.add("2001-02", ingest.FetchError("HTTP 500 after 5 attempts"))
    f.add("2003-04", ingest.EmptyPayloadError("no rows"))
    with pytest.raises(ingest.FetchError, match=r"2 failed \(2001-02, 2003-04\)") as ei:
        f.raise_if_any()
    assert not isinstance(ei.value, ingest.BlockedError)

    b = ingest.Failures("fetch_y")
    b.add("2001-02", ingest.BlockedError("403"))
    with pytest.raises(ingest.BlockedError):
        b.raise_if_any()
    ingest.Failures("empty").raise_if_any()  # nothing failed: no raise


def _exit_code(main) -> int:
    with pytest.raises(SystemExit) as ei:
        ingest.run_fetch(main, name="t")
    return ei.value.code


def test_run_fetch_exit_codes(capsys):
    def blocked():
        raise ingest.BlockedError("HTTP 403 on 2 attempts")

    def refused():
        raise urllib.error.URLError("connection refused")

    assert _exit_code(blocked) == 2
    assert "FETCH BLOCKED t: HTTP 403" in capsys.readouterr().err
    assert _exit_code(refused) == 2
    assert "FETCH FAILED t: network error URLError" in capsys.readouterr().err
    assert _exit_code(lambda: None) == 0
    assert _exit_code(lambda: 3) == 3
    assert _exit_code(lambda: (12, 0)) == 0, "a tuple of counts is not an exit code"
    assert _exit_code(lambda: True) == 0


def test_run_fetch_lets_bugs_through():
    def bug():
        raise KeyError("PLAYER_ID")

    with pytest.raises(KeyError):
        ingest.run_fetch(bug)
