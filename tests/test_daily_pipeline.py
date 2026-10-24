"""The daily box pipeline (feeds plan P4): fetch planning, the Map Hunt rolling window,
status receipts, change detection and the run lock.

No request leaves the machine: the cdn client gets a fake opener and a fake clock.
The one Map Hunt test that runs the builder writes only into tmp_path.

Run:  python -m pytest tests/test_daily_pipeline.py
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import shutil
import sys
import urllib.error
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import fetch_cdn_games as fcg  # noqa: E402
from ingest import BlockedError  # noqa: E402


def _load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


mh = _load("build_map_hunt", "scripts/build_map_hunt.py")
rd = _load("run_daily", "scripts/daily/run_daily.py")

UTC = dt.UTC


def sched(*games):
    """A scheduleLeagueV2-shaped doc from (gameId, 'MM/DD/YYYY', status, utc) tuples."""
    days: dict[str, list] = {}
    for gid, d, st, utc in games:
        days.setdefault(d, []).append(
            {"gameId": gid, "gameDateEst": d + " 00:00:00", "gameStatus": st, "gameDateTimeUTC": utc}
        )
    return {"leagueSchedule": {"gameDates": [{"gameDate": d, "games": g} for d, g in days.items()]}}


DOC = sched(
    ("0012600050", "10/15/2026", 3, "2026-10-15T23:00:00Z"),  # preseason: never fetched
    ("0022600001", "10/20/2026", 3, "2026-10-20T23:30:00Z"),
    ("0022600002", "10/20/2026", 3, "2026-10-21T02:00:00Z"),
    ("0022600004", "10/21/2026", 3, "2026-10-21T23:00:00Z"),
    ("0022600104", "10/24/2026", 1, "2026-10-24T23:00:00Z"),
)


# --------------------------------------------------------------------------- fetch planning


def test_parse_schedule_keeps_regular_season_and_iso_dates():
    games = fcg.parse_schedule(DOC)
    assert [g.game_id for g in games] == ["0022600001", "0022600002", "0022600004", "0022600104"]
    assert games[0].date == "2026-10-20" and games[0].status == 3


def test_plan_fetches_pbp_first_then_box_and_respects_the_cap():
    games = fcg.parse_schedule(DOC)
    have = {"pbp": {"0022600001"}, "box": set()}
    plan = fcg.plan_fetch(games, have, "2026-10-20", budget=4)
    assert plan.requests == [("pbp", "0022600002"), ("pbp", "0022600004"), ("box", "0022600001"), ("box", "0022600002")]
    assert plan.deferred == [("box", "0022600004")]
    assert plan.finals == ["0022600001", "0022600002", "0022600004"]


def test_plan_is_idempotent_once_everything_is_cached():
    games = fcg.parse_schedule(DOC)
    have = {k: {"0022600001", "0022600002", "0022600004"} for k in fcg.KINDS}
    assert fcg.plan_fetch(games, have, None, budget=50).requests == []


def test_plan_honours_since():
    games = fcg.parse_schedule(DOC)
    plan = fcg.plan_fetch(games, {"pbp": set(), "box": set()}, "2026-10-21", budget=50)
    assert plan.requests == [("pbp", "0022600004"), ("box", "0022600004")]


def test_cursor_holds_at_the_oldest_missing_file():
    games = fcg.parse_schedule(DOC)
    now = dt.datetime(2026, 10, 24, 18, tzinfo=UTC)
    have = {"pbp": {"0022600001", "0022600002", "0022600004"}, "box": {"0022600001", "0022600004"}}
    assert fcg.next_cursor(games, have, "2026-10-20", now) == "2026-10-20"  # 0022600002's box is missing


def test_cursor_waits_for_unfinished_games_but_not_postponed_ones():
    games = fcg.parse_schedule(DOC)
    full = {k: {"0022600001", "0022600002", "0022600004"} for k in fcg.KINDS}
    now = dt.datetime(2026, 10, 24, 18, tzinfo=UTC)
    assert fcg.next_cursor(games, full, "2026-10-20", now) == "2026-10-24"  # tonight's game is pending
    later = dt.datetime(2026, 10, 28, tzinfo=UTC)  # still status 1 four days on: postponed
    assert fcg.next_cursor(games, full, "2026-10-20", later) == "2026-10-21"


def test_final_detection():
    assert fcg.pbp_is_final({"game": {"actions": [{"actionType": "period"}, {"actionType": "game", "subType": "end"}]}})
    assert not fcg.pbp_is_final({"game": {"actions": [{"actionType": "period", "subType": "end"}]}})
    late = [{"actionType": "game", "subType": "end"}, {"actionType": "foul", "subType": "technical"}]
    assert fcg.pbp_is_final({"game": {"actions": late}})  # a correction after the final horn
    assert fcg.box_is_final({"game": {"gameStatus": 3}})
    assert not fcg.box_is_final({"game": {"gameStatus": 2}})


def test_cached_ids_reads_every_root(tmp_path):
    (tmp_path / "a" / "cdn_pbp").mkdir(parents=True)
    (tmp_path / "b" / "cdn_pbp").mkdir(parents=True)
    (tmp_path / "a" / "cdn_pbp" / "playbyplay_0022600001.json").write_text("{}")
    (tmp_path / "b" / "cdn_pbp" / "playbyplay_0022600002.json").write_text("{}")
    (tmp_path / "b" / "cdn_pbp" / "playbyplay_0022600002.json.tmp").write_text("{}")
    assert fcg.cached_ids([tmp_path / "a", tmp_path / "b"], "pbp") == {"0022600001", "0022600002"}


# --------------------------------------------------------------------------- cdn client


class FakeResp(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Clock:
    def __init__(self):
        self.t = 0.0
        self.slept: list[float] = []

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.slept.append(round(s, 2))
        self.t += s


def test_client_spaces_requests_logs_each_and_stops_at_the_cap(tmp_path, monkeypatch):
    clock = Clock()
    seen = []

    def opener(req, timeout):
        seen.append(dict(req.header_items()))
        return FakeResp(b'{"ok": 1}')

    log = tmp_path / "req.jsonl"
    c = fcg.Client(2, log, opener=opener, sleep=clock.sleep, clock=clock)
    c.get("https://cdn.nba.com/a.json", "schedule")
    c.get("https://cdn.nba.com/b.json", "pbp:1")
    assert clock.slept == [fcg.MIN_SPACING_S]
    with pytest.raises(fcg.BudgetExhaustedError):
        c.get("https://cdn.nba.com/c.json", "pbp:2")
    assert c.used == 2
    lines = [json.loads(x) for x in log.read_text().splitlines()]
    assert [x["status"] for x in lines] == [200, 200]
    # D8: exactly the repo's header set plus a User-Agent; no cookies, no Sec-Fetch.
    sent = {k.lower() for k in seen[0]}
    assert sent == {k.lower() for k in fcg.HEADERS}
    assert not any(k.startswith("sec-") or k == "cookie" for k in sent)


def test_client_403_is_blocked_after_two_attempts(tmp_path, monkeypatch):
    clock = Clock()
    monkeypatch.setattr("nba_http._sleep", lambda s: None)

    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)

    c = fcg.Client(10, tmp_path / "r.jsonl", opener=opener, sleep=clock.sleep, clock=clock)
    with pytest.raises(BlockedError):
        c.get("https://cdn.nba.com/x.json", "pbp:1")
    assert c.used == 2


def test_client_retries_a_non_json_200(tmp_path, monkeypatch):
    clock = Clock()
    monkeypatch.setattr("nba_http._sleep", lambda s: None)
    bodies = [b"<html>akamai</html>", b'{"game": {}}']

    def opener(req, timeout):
        return FakeResp(bodies.pop(0))

    c = fcg.Client(10, None, opener=opener, sleep=clock.sleep, clock=clock)
    assert c.get("https://cdn.nba.com/x.json", "box:1") == b'{"game": {}}'
    assert c.used == 2


def test_write_raw_keeps_bytes_and_writes_a_fetch_record(tmp_path):
    p = tmp_path / "cdn_pbp" / "playbyplay_0022600001.json"
    fcg.write_raw(p, b'{"game":{"actions":[]}}', source="https://cdn.nba.com/x", rows=5)
    assert p.read_bytes() == b'{"game":{"actions":[]}}'
    rec = json.loads((tmp_path / "cdn_pbp" / "_fetch_meta" / "playbyplay_0022600001.json.json").read_text())
    assert rec["rows"] == 5 and rec["source"] == "https://cdn.nba.com/x" and len(rec["sha256"]) == 64


# --------------------------------------------------------------------------- Map Hunt window


def test_target_end_rolls_forward_and_never_shrinks():
    d = dt.date
    assert mh.target_end(d(2026, 11, 3), d(2026, 10, 24)) == d(2026, 11, 14)
    assert mh.target_end(d(2026, 12, 31), d(2026, 10, 24)) == d(2026, 12, 31)
    assert mh.target_end(None, d(2026, 10, 1)) == mh.END


def test_days_between_and_remaining():
    d = dt.date
    assert mh.days_between(d(2026, 11, 4), d(2026, 11, 6)) == [d(2026, 11, 4), d(2026, 11, 5), d(2026, 11, 6)]
    assert mh.days_between(d(2026, 11, 4), d(2026, 11, 3)) == []
    assert mh.days_remaining(d(2026, 11, 3), d(2026, 10, 27)) == 7


def _index(first: str, last: str) -> dict:
    days = mh.days_between(dt.date.fromisoformat(first), dt.date.fromisoformat(last))
    return {"days": {x.isoformat(): {"mh": 1, "th": 2, "tht": 3} for x in days}}


def test_check_window_threshold_is_seven_days():
    idx = _index("2026-10-13", "2026-11-03")
    assert mh.check_window(idx, dt.date(2026, 10, 27)) == []
    errs = mh.check_window(idx, dt.date(2026, 10, 28))
    assert errs and "only 6 day(s)" in errs[0]


def test_check_window_flags_gaps_and_missing_files(tmp_path):
    idx = _index("2026-10-13", "2026-11-03")
    del idx["days"]["2026-10-20"]
    errs = mh.check_window(idx, dt.date(2026, 10, 14), tmp_path)
    assert any("gaps" in e for e in errs)
    assert any("missing or wrong-size" in e for e in errs)


def _have_map_hunt_inputs() -> bool:
    need = ["vectors.json", "eratwins.json", "mtnn_embeddings.f32", "map-hunt/index.json"]
    return importlib.util.find_spec("numpy") is not None and all((ROOT / "assets" / n).exists() for n in need)


@pytest.mark.skipif(not _have_map_hunt_inputs(), reason="needs numpy and the committed Map Hunt inputs")
def test_extend_keeps_published_days_byte_identical_and_is_idempotent(tmp_path, monkeypatch):
    src = ROOT / "assets" / "map-hunt"
    out = tmp_path / "map-hunt"
    shutil.copytree(src, out)
    before = {p.name: p.read_bytes() for p in (out / "puzzles").iterdir()}
    old = json.loads((out / "index.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(mh, "OUT", out)
    last = max(old["days"])
    today = dt.date.fromisoformat(last) - dt.timedelta(days=10)
    assert mh.main(["--today", today.isoformat()]) == 0
    new = json.loads((out / "index.json").read_text(encoding="utf-8"))
    want_end = today + dt.timedelta(days=21)
    assert max(new["days"]) == want_end.isoformat()
    for k, v in old["days"].items():
        assert new["days"][k] == v
    for name, data in before.items():
        assert (out / "puzzles" / name).read_bytes() == data
    assert len(new["days"]) == len(old["days"]) + 11
    assert (out / "candidates.json").read_bytes() == (src / "candidates.json").read_bytes()
    snapshot = {p.name: p.read_bytes() for p in out.rglob("*") if p.is_file()}
    assert mh.main(["--today", today.isoformat()]) == 0  # second run: nothing to do
    assert {p.name: p.read_bytes() for p in out.rglob("*") if p.is_file()} == snapshot
    assert mh.main(["--check", "--today", today.isoformat()]) == 0


# --------------------------------------------------------------------------- runner


def test_classify_changes_splits_data_from_code():
    lines = [
        " M assets/map-hunt/index.json",
        "?? pipeline/cache/cdn_pbp/playbyplay_0022600087.json",
        " M public/assets/replays/index.json",
        " M status.html",
        " M assets/map-hunt.js",
        " M sw.js",
        " M api/odds.js",
        " M scripts/build_status.py",
        " M pipeline/build_replays.py",
        " M vercel.json",
    ]
    data, bad = rd.classify_changes(lines)
    assert data == sorted(
        [
            "assets/map-hunt/index.json",
            "pipeline/cache/cdn_pbp/playbyplay_0022600087.json",
            "public/assets/replays/index.json",
            "status.html",
            "assets/map-hunt.js",
        ]
    )
    assert bad == sorted(
        ["sw.js", "api/odds.js", "scripts/build_status.py", "pipeline/build_replays.py", "vercel.json"]
    )
    assert rd.classify_changes([]) == ([], [])


REPORT = {
    "schedule": {"origin": "network", "games": 1206},
    "latency_ms": {"schedule": 300, "pbp": 200, "box": 150},  # the shape Client.latency_ms has
    "fetched": {"pbp": ["0022600087"], "box": ["0022600001"]},
    "failed": [],
    "deferred": ["box:0022600088"],
    "blocked": False,
    "cursor": "2026-10-21",
}


def test_receipt_marks_this_run_as_the_last_good_tick():
    now = "2026-10-24T18:00:00Z"
    doc = rd.build_receipt(None, REPORT, {"fetch": True, "replays": True}, now)
    s = doc["sources"]
    assert set(s) == {"cdn_schedule", "cdn_playbyplay", "cdn_boxscore", "daily_pipeline"}
    assert all(v["status"] == "ok" and v["last_good_tick"] == now for v in s.values())
    assert s["cdn_playbyplay"]["latency_ms"] == 200
    assert "deferred 1" in s["cdn_boxscore"]["detail"]
    assert all(v["stale_after_minutes"] == rd.STALE_AFTER_MIN for v in s.values())


def test_receipt_failure_keeps_the_old_tick_and_counts_failures():
    first = rd.build_receipt(None, REPORT, {"fetch": True}, "2026-10-24T18:00:00Z")
    blocked = {"schedule_error": "HTTP 403", "blocked": True, "latency_ms": {}}
    doc = rd.build_receipt(first, blocked, {"fetch": False}, "2026-10-25T18:00:00Z")
    s = doc["sources"]
    assert s["cdn_schedule"]["status"] == "down"
    assert s["cdn_schedule"]["last_good_tick"] == "2026-10-24T18:00:00Z"
    assert s["cdn_schedule"]["consecutive_failures"] == 1
    assert s["cdn_playbyplay"]["last_good_tick"] == "2026-10-24T18:00:00Z"  # not exercised: carried
    assert s["daily_pipeline"]["status"] == "degraded" and "fetch" in s["daily_pipeline"]["detail"]
    again = rd.build_receipt(doc, blocked, {"fetch": False}, "2026-10-26T18:00:00Z")
    assert again["sources"]["cdn_schedule"]["consecutive_failures"] == 2


def test_receipt_without_a_fetch_carries_feed_rows():
    first = rd.build_receipt(None, REPORT, {"fetch": True}, "2026-10-24T18:00:00Z")
    doc = rd.build_receipt(first, None, {"maphunt": True}, "2026-10-25T18:00:00Z")
    assert doc["sources"]["cdn_schedule"] == first["sources"]["cdn_schedule"]
    assert doc["sources"]["daily_pipeline"]["last_good_tick"] == "2026-10-25T18:00:00Z"


def test_pr_body_starts_and_ends_as_required():
    body = rd.pr_body(
        "2026-10-24",
        [{"gameId": "0022600087", "date": "2026-10-21", "matchup": "A 1 @ B 2"}],
        "2026-11-14",
        [("scripts/check_site_facts.py", 0), ("scripts/budget_check.py", 1)],
        REPORT,
        [],
    )
    assert body.startswith("DO NOT MERGE without Cam's word (daily data PR; CI-gated)")
    assert body.rstrip().endswith("🤖 Generated with [Claude Code](https://claude.com/claude-code)")
    assert "0022600087" in body and "2026-11-14" in body
    assert "- [x] `scripts/check_site_facts.py`" in body and "- [ ] `scripts/budget_check.py`" in body


def test_run_lock_excludes_a_second_holder_and_reaps_a_dead_one(tmp_path):
    a, b = rd.RunLock(tmp_path / "run.lock"), rd.RunLock(tmp_path / "run.lock")
    assert a.acquire()
    assert not b.acquire()
    a.release()
    assert b.acquire()
    b.release()
    (tmp_path / "run.lock").mkdir()
    (tmp_path / "run.lock" / "holder").write_text("999999 0\n")  # dead pid, ancient
    assert a.acquire()
    a.release()


def test_copy_new_is_idempotent(tmp_path):
    src, dst = tmp_path / "s", tmp_path / "d"
    src.mkdir()
    (src / "boxscore_0022600001.json").write_text("{}")
    assert rd.copy_new(src, dst, "boxscore_*.json") == ["boxscore_0022600001.json"]
    assert rd.copy_new(src, dst, "boxscore_*.json") == []
    (src / "boxscore_0022600001.json").write_text('{"x":1}')
    assert rd.copy_new(src, dst, "boxscore_*.json") == ["boxscore_0022600001.json"]


def test_new_crlf_flags_only_text_files_that_gained_crlf():
    assert rd.new_crlf("assets/status.json", b"{\r\n}\r\n", b"{\n}\n")
    assert rd.new_crlf("assets/realtime/daily_pipeline.json", b"{\r\n}", None)
    assert not rd.new_crlf("assets/status.json", b"{\n}\n", b"{\n}\n")
    assert not rd.new_crlf("legacy.html", b"a\r\n", b"a\r\n")  # already CRLF upstream
    assert not rd.new_crlf("assets/map-hunt/puzzles/2026-11-14-mh.u8", b"\r\n", None)
