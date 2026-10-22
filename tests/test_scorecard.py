"""Tests for scripts/scorecard/ (K1): schema, null-with-reason, the offline mode, and the fetch helper.

Every fixture under tests/fixtures/scorecard/ is a trimmed slice of a real file (see its README). Nothing here
touches the network: the fetch helper is driven with a fake opener, and stats.nba.com / cdn.nba.com are refused.
"""

from __future__ import annotations

import ast
import json
import sys
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests" / "fixtures" / "scorecard"
sys.path.insert(0, str(ROOT / "scripts"))

from scorecard import common, nbafetch, run  # noqa: E402

DIMENSIONS = ("coverage", "freshness", "speed", "accuracy", "model")


def _run(tmp_path: Path, *extra: str) -> dict:
    out = tmp_path / "scorecard.json"
    rc = run.main(["--offline", "--root", str(FIX / "site"), "--out", str(out), *extra])
    assert rc == 0
    return json.loads(out.read_text(encoding="utf-8"))


def _with_caches() -> list[str]:
    return [
        "--stats-cache",
        str(FIX / "stats_cache"),
        "--acc-cache",
        str(FIX / "acc_cache"),
        "--cdn-cache",
        str(FIX / "cdn_cache"),
        "--budget-check",
        str(ROOT / "scripts" / "budget_check.py"),
    ]


@pytest.fixture
def no_network(monkeypatch):
    def refuse(*_a, **_k):
        raise AssertionError("the offline scorecard opened a network connection")

    monkeypatch.setattr(urllib.request, "urlopen", refuse)
    monkeypatch.setattr(urllib.request.OpenerDirector, "open", refuse)


# ---- schema -------------------------------------------------------------------------------------------------


def test_offline_doc_has_every_dimension_and_validates(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    assert doc["schema"] == common.SCHEMA
    assert doc["mode"] == "offline"
    assert "git_sha" in doc and "command" in doc and "generated_at" in doc
    for dim in DIMENSIONS:
        assert dim in doc["dimensions"], dim
        assert doc["dimensions"][dim], f"{dim} has no metrics"
    assert common.validate(doc) == []


def test_validate_rejects_null_without_reason_and_value_without_inputs():
    good = common.metric(3, "count", command="c", inputs=[{"path": "x"}], fetched_at=None)
    bad_null = common.metric(None, "count", command="c", inputs=[], fetched_at=None, reason="")
    bad_value = common.metric(3, "count", command="c", inputs=[], fetched_at=None)
    doc = {
        "schema": common.SCHEMA,
        "git_sha": None,
        "command": "c",
        "generated_at": "t",
        "mode": "offline",
        "dimensions": {"coverage": {"good": good, "bad_null": bad_null, "bad_value": bad_value}},
    }
    errors = common.validate(doc)
    assert any("bad_null" in e for e in errors)
    assert any("bad_value" in e for e in errors)
    assert not any("coverage.good" in e for e in errors)


def test_every_metric_carries_command_inputs_and_fetch_time_keys(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    for dim, metrics in doc["dimensions"].items():
        for name, m in metrics.items():
            for key in ("value", "unit", "command", "inputs", "fetched_at"):
                assert key in m, f"{dim}.{name} lacks {key}"
            if m["value"] is None:
                assert m.get("reason"), f"{dim}.{name} is null without a reason"


# ---- null with reason, never 0 ------------------------------------------------------------------------------


def test_no_cache_means_null_no_fetch_this_wave_never_zero(tmp_path, no_network):
    doc = _run(tmp_path, "--budget-check", str(ROOT / "scripts" / "budget_check.py"))
    nba = [
        ("coverage", "nba_player_seasons_1996_2025"),
        ("coverage", "nba_regular_season_games_1946_2025"),
        ("coverage", "seasons_site_equals_nba_face_value"),
        ("freshness", "nba_finals_listed"),
        ("accuracy", "served_mismatches"),
    ]
    for dim, name in nba:
        m = doc["dimensions"][dim][name]
        assert m["value"] is None, (dim, name, m["value"])
        assert m["reason"] == common.NO_FETCH, (dim, name, m["reason"])
    assert common.validate(doc) == []


def test_site_side_numbers_need_no_cache(tmp_path, no_network):
    doc = _run(tmp_path, "--budget-check", str(ROOT / "scripts" / "budget_check.py"))
    cov = doc["dimensions"]["coverage"]
    assert cov["site_player_seasons"]["value"] == 4
    assert cov["site_players_distinct_pid"]["value"] == 4
    assert cov["site_rows_mpg_over_48"]["value"] == 4  # every served mpg in the slice is per-100 MIN (> 48)
    fr = doc["dimensions"]["freshness"]
    assert fr["site_scoreboard_as_of"]["value"] == "2026-10-20T19:01:25Z"


# ---- the known mismatch is counted --------------------------------------------------------------------------


def test_served_mpg_vs_official_min_per_game_is_a_mismatch(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    acc = doc["dimensions"]["accuracy"]
    served = acc["served_mismatches"]
    assert served["value"] is not None
    detail = served["detail"]
    # 4 player-seasons x (gp, mpg, total_min); gp matches exactly, mpg and total_min do not.
    assert detail["by_stat"]["gp"]["mismatch"] == 0
    assert detail["by_stat"]["gp"]["match"] == 4
    assert detail["by_stat"]["mpg"]["mismatch"] == 4
    assert detail["by_stat"]["total_min"]["mismatch"] == 4
    assert served["value"] == 8
    rows = {(r["pid"], r["stat"]): r for r in detail["rows"]}
    duck = rows[(404, "mpg")]
    assert duck["site_value"] == 51.4 and duck["verdict"] == "mismatch"
    assert duck["official"] < 48
    under = acc["served_rows_under_stated_minutes_gate"]
    assert under["value"] == 2  # Duckworth 1996-97 and McCaskill 1996-97 (B-ACC D_gate_check rows)


# ---- coverage join over cached stats.nba.com responses ------------------------------------------------------


def test_coverage_join_from_cached_responses(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    cov = doc["dimensions"]["coverage"]
    assert cov["nba_player_seasons_1996_2025"]["value"] == 6  # the trimmed Totals slice: 4 site pids + 2 others
    assert cov["nba_regular_season_games_1946_2025"]["value"] == 3
    assert cov["site_regular_season_games"]["value"] is None
    assert cov["site_regular_season_games"]["reason"]
    assert cov["seasons_site_equals_nba_face_value"]["value"] == 0
    assert cov["nba_player_seasons_1996_2025"]["fetched_at"] == "2026-10-21T21:20:41-0500"
    rows = cov["seasons_site_equals_nba_face_value"]["detail"]["per_season"]
    assert rows["1996-97"]["site_player_seasons"] == 4
    assert rows["1996-97"]["nba_dash_players"] == 6


# ---- freshness from a cached cdn.nba.com schedule -----------------------------------------------------------


def test_freshness_counts_finals_from_cached_schedule(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    fr = doc["dimensions"]["freshness"]
    finals = fr["nba_finals_listed"]
    assert finals["value"] is not None and finals["value"] >= 3
    assert finals["fetched_at"] == "2026-10-22T02:19:27Z"
    on_site = fr["finals_with_result_on_site"]
    assert on_site["value"] == 0  # the served scoreboard has every game in state "pre"
    assert fr["site_scoreboard_age_minutes"]["value"] is not None


# ---- speed: gate bytes and the bare-path undercount ---------------------------------------------------------


def test_speed_counts_gate_bytes_and_flags_the_bare_path_in_js(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    sp = doc["dimensions"]["speed"]
    site = FIX / "site"
    size = {p: (site / p).stat().st_size for p in ("index.html", "assets/app.js", "assets/app.css", "assets/data.json")}
    page = sp["page_bytes"]["detail"]["pages"]["index.html"]
    assert page["gate_bytes"] == size["index.html"] + size["assets/app.js"] + size["assets/app.css"]
    assert page["budget_bytes"] == 4096
    assert page["referenced_uncounted_css_js_json_bytes"] == size["assets/data.json"]
    assert sp["index_referenced_uncounted_bytes"]["value"] == size["assets/data.json"]
    assert sp["ttfb_median_ms"]["value"] is None
    assert sp["ttfb_median_ms"]["reason"]


# ---- model --------------------------------------------------------------------------------------------------


def test_model_served_products_scored_and_lineage(tmp_path, no_network):
    doc = _run(tmp_path, *_with_caches())
    mo = doc["dimensions"]["model"]
    assert mo["served_products_scored_2026_27"]["value"] == 0
    assert mo["served_lineage_cqs"]["value"] is None
    assert mo["served_lineage_cqs"]["reason"]
    assert mo["served_lineage_forced"]["value"] is True
    assert mo["retrieval_test_top1"]["value"] == 0.438
    assert mo["retrieval_test_top1"]["detail"]["baseline_transparent_14d"] == 0.0785


# ---- the fetch helper ---------------------------------------------------------------------------------------


def _stats_headers_from_nba_http() -> dict:
    tree = ast.parse((ROOT / "pipeline" / "nba_http.py").read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "_STATS_HEADERS" for t in node.targets):
            return ast.literal_eval(node.value)
    raise AssertionError("pipeline/nba_http.py has no _STATS_HEADERS literal")


def test_stats_headers_equal_nba_http_plus_one_user_agent():
    repo = _stats_headers_from_nba_http()
    ours = dict(nbafetch.STATS_HEADERS)
    ua = ours.pop("User-Agent")
    assert ours == repo
    assert "Chrome/120" in ua
    for key in nbafetch.STATS_HEADERS:
        assert key.lower() != "cookie"
        assert not key.lower().startswith("sec-fetch")


class _FakeResp:
    def __init__(self, body: bytes, status: int = 200):
        self._body = body
        self.status = status
        self.headers = {"content-type": "application/json"}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _Clock:
    def __init__(self):
        self.t = 1_000_000.0
        self.slept: list[float] = []

    def time(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def _fetcher(tmp_path, clock, calls):
    def opener(req, timeout):
        calls.append(req.full_url)
        return _FakeResp(b'{"ok": true}')

    return nbafetch.Fetcher(
        state_dir=tmp_path / "state",
        cache_dir=tmp_path / "cache",
        log_path=tmp_path / "fetch_log.jsonl",
        opener=opener,
        clock=clock.time,
        sleep=clock.sleep,
    )


@pytest.mark.parametrize("url", ["https://stats.nba.com/stats/leaguedashplayerstats", "https://cdn.nba.com/x.json"])
def test_nba_hosts_are_refused_without_allow_nba(tmp_path, url):
    calls: list[str] = []
    f = _fetcher(tmp_path, _Clock(), calls)
    with pytest.raises(nbafetch.NBAFetchRefusedError):
        f.get(url)
    assert calls == []


def test_spacing_is_shared_across_fetcher_instances(tmp_path):
    clock, calls = _Clock(), []
    a = _fetcher(tmp_path, clock, calls)
    b = _fetcher(tmp_path, clock, calls)
    a.get("https://stats.nba.com/stats/a", allow_nba=True, use_cache=False)
    clock.t += 0.5
    b.get("https://stats.nba.com/stats/b", allow_nba=True, use_cache=False)
    assert len(calls) == 2
    assert clock.slept and abs(sum(clock.slept) - (nbafetch.MIN_SPACING_S["stats.nba.com"] - 0.5)) < 1e-6


def test_cache_and_fetch_log(tmp_path):
    clock, calls = _Clock(), []
    f = _fetcher(tmp_path, clock, calls)
    r1 = f.get("https://hoops.dumbmodel.com/assets/status.json")
    r2 = f.get("https://hoops.dumbmodel.com/assets/status.json")
    assert len(calls) == 1
    assert r1.status == 200 and r2.from_cache and r2.body == r1.body
    lines = [json.loads(x) for x in (tmp_path / "fetch_log.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(lines) == 2
    for rec in lines:
        for key in ("url", "headers_sent", "status", "bytes", "sha256", "requested_at", "retrieved_at", "from_cache"):
            assert key in rec, key
    assert lines[0]["from_cache"] is False and lines[1]["from_cache"] is True


def test_run_refuses_nba_fetch_flag_this_wave(tmp_path):
    with pytest.raises(SystemExit) as exc:
        run.main(["--root", str(FIX / "site"), "--out", str(tmp_path / "x.json"), "--fetch-nba"])
    assert exc.value.code == run.EXIT_NBA_REFUSED
    assert not (tmp_path / "x.json").exists()


# ---- the real repo, offline ---------------------------------------------------------------------------------


def test_offline_run_on_this_checkout_validates(tmp_path, no_network):
    out = tmp_path / "repo.json"
    assert run.main(["--offline", "--root", str(ROOT), "--out", str(out)]) == 0
    doc = json.loads(out.read_text(encoding="utf-8"))
    assert common.validate(doc) == []
    assert doc["dimensions"]["coverage"]["site_player_seasons"]["value"] > 0
