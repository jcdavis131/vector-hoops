"""pipeline/nba_http.py: every session warmed, 403 fails fast as blocked, 429/5xx back off.

Fake sessions and a fake nba_api module only; no request leaves the machine,
and time.sleep is replaced so the backoff schedule is recorded, not waited.

Run:  python -m pytest tests/test_nba_http.py
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import ingest  # noqa: E402
import nba_http  # noqa: E402

OK_PAYLOAD = {"resultSets": [{"name": "X", "headers": ["PLAYER_ID", "PTS"], "rowSet": [[1, 20.0]]}]}


class FakeResp:
    def __init__(self, status: int, body=None):
        self.status_code = status
        self._body = OK_PAYLOAD if body is None else body

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


class Script:
    """Per-session plans: each new session pops the next (warmup_result, get_result)."""

    def __init__(self, plans):
        self.plans = list(plans)
        self.log: list[str] = []

    def session(self):
        warm, get = self.plans.pop(0) if self.plans else (200, 200)
        script = self

        class S:
            def get(self, url, params=None, headers=None, timeout=None):
                is_warm = url == nba_http.STATS_ORIGIN
                script.log.append("warm" if is_warm else "get")
                res = warm if is_warm else get
                if isinstance(res, Exception):
                    raise res
                return res if isinstance(res, FakeResp) else FakeResp(res)

            def close(self):
                script.log.append("close")

        self.log.append("session")
        return S()


@pytest.fixture
def curl(monkeypatch):
    """Pretend curl_cffi is installed and record sleeps instead of sleeping."""
    sleeps: list[float] = []
    monkeypatch.setattr(nba_http, "_have_curl_cffi", lambda: True)
    monkeypatch.setattr(nba_http, "_sleep", sleeps.append)

    def install(plans):
        script = Script(plans)
        monkeypatch.setattr(nba_http, "_curl_session", script.session)
        return script

    install.sleeps = sleeps
    return install


def test_every_session_is_warmed(curl):
    s = curl([(200, 200), (200, 200)])
    assert nba_http.fetch_stats_json("a", {}) == OK_PAYLOAD
    assert nba_http.fetch_stats_json("b", {}) == OK_PAYLOAD
    # Before: ['session', 'warm', 'get', 'session', 'get'] -- the second session went out cold.
    assert s.log == ["session", "warm", "get", "close", "session", "warm", "get", "close"]


def test_a_warmup_failure_is_retried(curl):
    s = curl([(TimeoutError("warm-up timed out"), 200), (200, 200)])
    assert nba_http.fetch_stats_json("a", {}) == OK_PAYLOAD
    assert s.log.count("warm") == 2
    assert len(curl.sleeps) == 1


def test_403_is_blocked_after_two_warmed_sessions(curl):
    s = curl([(200, 403)] * 5)
    with pytest.raises(ingest.BlockedError, match="403 on 2 attempts"):
        nba_http.fetch_stats_json("a", {})
    assert s.log.count("get") == 2
    assert s.log.count("warm") == 2
    # Before: 5 requests and 155 s of sleep before a RuntimeError that never said "blocked".
    assert len(curl.sleeps) == 1 and curl.sleeps[0] < 7


def test_a_403_on_the_warmup_counts_as_blocked(curl):
    curl([(403, 200)] * 5)
    with pytest.raises(ingest.BlockedError):
        nba_http.fetch_stats_json("a", {})


def test_429_and_5xx_back_off_then_succeed(curl):
    s = curl([(200, 429), (200, 503), (200, 200)])
    assert nba_http.fetch_stats_json("a", {}) == OK_PAYLOAD
    assert s.log.count("get") == 3
    assert len(curl.sleeps) == 2
    assert 5 <= curl.sleeps[0] <= 6 and 10 <= curl.sleeps[1] <= 12


def test_persistent_5xx_exhausts_the_budget_with_a_fetch_error(curl):
    s = curl([(200, 500)] * 5)
    with pytest.raises(ingest.FetchError, match="failed after 5 attempts") as ei:
        nba_http.fetch_stats_json("a", {})
    assert not isinstance(ei.value, ingest.BlockedError)
    assert s.log.count("get") == 5
    assert len(curl.sleeps) == 4, "no sleep after the last attempt"
    assert curl.sleeps == sorted(curl.sleeps)


def test_other_4xx_is_not_retried(curl):
    s = curl([(200, 404)] * 5)
    with pytest.raises(ingest.FetchError, match="not retrying"):
        nba_http.fetch_stats_json("a", {})
    assert s.log.count("get") == 1
    assert curl.sleeps == []


def test_a_200_with_a_non_json_body_is_retried(curl):
    s = curl([(200, FakeResp(200, ValueError("Expecting value: <html> Access Denied"))), (200, 200)])
    assert nba_http.fetch_stats_json("a", {}) == OK_PAYLOAD
    assert s.log.count("get") == 2
    assert len(curl.sleeps) == 1


@pytest.fixture
def fake_nba_api(monkeypatch):
    """A stand-in for nba_api.stats.library.http, which CI does not install."""
    monkeypatch.setattr(nba_http, "_have_curl_cffi", lambda: False)
    sleeps: list[float] = []
    monkeypatch.setattr(nba_http, "_sleep", sleeps.append)
    statuses: list[int] = []

    class Resp:
        def __init__(self, status):
            self._status_code = status

        def get_dict(self):
            if self._status_code >= 400:
                raise ValueError("Expecting value: line 1 column 1")  # what a 403 page looked like before
            return OK_PAYLOAD

    class NBAStatsHTTP:
        def send_api_request(self, endpoint, parameters, timeout):
            return Resp(statuses.pop(0))

    http = types.ModuleType("nba_api.stats.library.http")
    http.NBAStatsHTTP = NBAStatsHTTP
    for name in ("nba_api", "nba_api.stats", "nba_api.stats.library"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    monkeypatch.setitem(sys.modules, "nba_api.stats.library.http", http)
    return statuses, sleeps


def test_nba_api_fallback_has_the_same_retry_budget(fake_nba_api):
    statuses, sleeps = fake_nba_api
    statuses[:] = [500, 500, 200]
    assert nba_http.fetch_stats_json("a", {}) == OK_PAYLOAD
    assert len(sleeps) == 2  # before: one attempt, then whatever exception the body raised

    statuses[:] = [403, 403, 200]
    with pytest.raises(ingest.BlockedError):
        nba_http.fetch_stats_json("a", {})


def test_retry_call_does_not_retry_a_fetch_error(monkeypatch):
    monkeypatch.setattr(nba_http, "_sleep", lambda s: pytest.fail("slept"))
    calls = []

    def fn():
        calls.append(1)
        raise ingest.MissingColumnsError("no D_FG_PCT")

    with pytest.raises(ingest.MissingColumnsError):
        nba_http.retry_call(fn, "x")
    assert calls == [1]


def test_legacy_result_set_rows_required_columns():
    payload = {"resultSets": [{"name": "Defense", "headers": ["PLAYER_ID", "PLAYER_NAME"], "rowSet": [[1, "a"]]}]}
    assert nba_http.legacy_result_set_rows(payload, "Defense") == [{"PLAYER_ID": 1, "PLAYER_NAME": "a"}]
    with pytest.raises(ingest.MissingColumnsError, match="D_FG_PCT"):
        nba_http.legacy_result_set_rows(payload, "Defense", required=["PLAYER_ID", "D_FG_PCT"])
    assert nba_http.legacy_result_set_rows(payload, required=["PLAYER_ID"])[0]["PLAYER_ID"] == 1


def test_classify():
    assert nba_http.classify(nba_http.HTTPStatusError(403, "u")) == "blocked"
    assert nba_http.classify(nba_http.HTTPStatusError(429, "u")) == "transient"
    assert nba_http.classify(nba_http.HTTPStatusError(502, "u")) == "transient"
    assert nba_http.classify(nba_http.HTTPStatusError(400, "u")) == "client"
    assert nba_http.classify(ConnectionResetError()) == "transient"
    assert nba_http.classify(TimeoutError()) == "transient"
    assert nba_http.classify(ValueError("Expecting value")) == "transient"  # a non-JSON body
    for exc in (ModuleNotFoundError("No module named 'nba_api'"), AttributeError("x"), TypeError("x"), NameError("x")):
        assert nba_http.classify(exc) == "fatal", exc


def test_a_network_library_error_is_transient_whatever_else_it_subclasses():
    # A transport library's exception class that also subclasses TypeError is
    # still the network's: ingest.is_network_error is checked first.
    err_type = type("LibError", (TypeError,), {"__module__": "requests.exceptions"})
    assert nba_http.classify(err_type("x")) == "transient"


@pytest.mark.parametrize(
    "exc", [ModuleNotFoundError("No module named 'nba_api'"), AttributeError("'NoneType' object"), TypeError("bad arg")]
)
def test_a_programming_error_is_raised_at_once_unwrapped(monkeypatch, exc):
    """[final#14] A missing nba_api counted as transient: 5 attempts, about 85 s of sleep,
    then a FetchError, so the fetcher exited 2 ("fetch failed") instead of 1 with a traceback."""
    monkeypatch.setattr(nba_http, "_sleep", lambda s: pytest.fail(f"slept {s}"))
    calls = []

    def fn():
        calls.append(1)
        raise exc

    with pytest.raises(type(exc)) as ei:
        nba_http.retry_call(fn, "x")
    assert ei.value is exc and not isinstance(ei.value, ingest.FetchError)
    assert calls == [1]
    assert not ingest.is_network_error(ei.value)  # so ingest.run_fetch lets it propagate: exit 1


def test_the_nba_api_fallback_without_nba_api_fails_at_once(monkeypatch):
    monkeypatch.setattr(nba_http, "_have_curl_cffi", lambda: False)
    monkeypatch.setattr(nba_http, "_sleep", lambda s: pytest.fail(f"slept {s}"))
    # None in sys.modules makes `from nba_api... import` raise ModuleNotFoundError.
    monkeypatch.setitem(sys.modules, "nba_api", None)
    with pytest.raises(ModuleNotFoundError):
        nba_http.fetch_stats_json("a", {})


def test_patch_nba_api_session_without_curl_cffi(monkeypatch):
    monkeypatch.setattr(nba_http, "_have_curl_cffi", lambda: False)
    assert nba_http.patch_nba_api_session() is False
