"""Browser-like HTTP for stats.nba.com.

Akamai on stats.nba.com fingerprints TLS handshakes. Plain ``requests`` /
``nba_api`` sessions are often reset or timed out even with correct headers.
``curl_cffi`` impersonates Chrome when installed; fetchers use it first and
fall back to ``nba_api`` only if the optional dependency is missing.

  pip install curl_cffi   # recommended on operator machines

Retries [ingest#10]. Until 2026-10-09 the warm-up GET to www.nba.com (the
request that collects the cookies Akamai expects) was guarded by a
process-global _WARMED flag while every attempt opened a fresh session, so
only the first session of a run was ever warm: a fake-session probe of two
calls logged ['session', 'warm', 'get', 'session', 'get']. The warm-up also
ran before the try, so a warm-up timeout escaped on attempt 1 with no retry.
Every error, HTTP 403 included, got the same un-jittered 5*2^n backoff: a
probe of a permanent 403 made 5 requests and slept 5+10+20+40+80 = 155 s
before raising a bare RuntimeError, and fetch_playoffs wrapped that in its
own 5-try loop, so a block cost up to 25 requests and ~13 minutes before
anyone saw the word "blocked". The nba_api fallback made one attempt.

Now each new session is warmed inside the try, and errors are classified:
  - 403: blocked. One more try on a fresh, re-warmed session, then
    BlockedError. Waiting does not lift a block; callers must not retry it.
  - 429 and 5xx, timeouts, resets, a non-JSON body: transient, retried with
    jittered exponential backoff up to RETRY_ATTEMPTS, then FetchError.
  - any other 4xx: the request itself is wrong; FetchError at once.
The nba_api fallback runs in the same loop with the same budget.
retry_call() is that loop for callers that use nba_api's endpoint classes
directly (build_vectors, fetch_team_season, fetch_gamelogs).
"""

from __future__ import annotations

import importlib.util
import random
import time
from collections.abc import Callable, Iterable
from typing import Any, TypeVar

from ingest import BlockedError, FetchError, require_columns

STATS_ORIGIN = "https://www.nba.com/stats/"
STATS_API = "https://stats.nba.com/stats/{endpoint}"

_STATS_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

# chrome120 is the profile most often cited for Akamai bypass (2025–26).
_IMPERSONATE = "chrome120"

RETRY_ATTEMPTS = 5
# A 403 gets this many attempts in total, each on a fresh warmed session.
BLOCKED_ATTEMPTS = 2
BACKOFF_BASE_S = 5.0
BACKOFF_CAP_S = 120.0

T = TypeVar("T")


class HTTPStatusError(Exception):
    """A response with status >= 400, raised before anything reads its body."""

    def __init__(self, status: int, url: str) -> None:
        super().__init__(f"HTTP {status} from {url}")
        self.status = status
        self.url = url


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


def _have_curl_cffi() -> bool:
    return importlib.util.find_spec("curl_cffi") is not None


def _curl_session():
    from curl_cffi import requests as cr

    return cr.Session(impersonate=_IMPERSONATE)


def _check_status(resp: Any, url: str) -> None:
    status = getattr(resp, "status_code", None)
    if isinstance(status, int) and status >= 400:
        raise HTTPStatusError(status, url)


def _warmup(session) -> None:
    """GET www.nba.com/stats on this session, so it carries the cookies the API expects."""
    _check_status(session.get(STATS_ORIGIN, timeout=30), STATS_ORIGIN)


def status_of(exc: BaseException) -> int | None:
    """The HTTP status an exception carries, if any (ours, urllib's, requests' or curl_cffi's)."""
    for attr in ("status", "code", "status_code"):
        val = getattr(exc, attr, None)
        if isinstance(val, int) and 100 <= val <= 599:
            return val
    resp = getattr(exc, "response", None)
    val = getattr(resp, "status_code", None)
    return val if isinstance(val, int) else None


def classify(exc: BaseException) -> str:
    """One of blocked (403), client (any other 4xx) or transient (429, 5xx, or no status at all)."""
    status = status_of(exc)
    if status == 403:
        return "blocked"
    if status is not None and 400 <= status < 500 and status != 429:
        return "client"
    return "transient"


def backoff_seconds(attempt: int) -> float:
    """5, 10, 20, 40, 80 ... capped at 120, plus up to 20% jitter so parallel runs spread out."""
    base = min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2**attempt)
    return base + random.uniform(0, 0.2 * base)


def retry_call(fn: Callable[[], T], label: str, *, attempts: int = RETRY_ATTEMPTS) -> T:
    """Call fn until it returns, under the classification in the module docstring.

    Raises BlockedError after BLOCKED_ATTEMPTS 403s, FetchError at once on
    another 4xx, and FetchError naming the last error once attempts run out.
    A FetchError raised by fn itself (a missing column, say) is not retried.
    """
    blocked = 0
    last: BaseException | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except FetchError:
            raise
        except Exception as e:
            last = e
            kind = classify(e)
            if kind == "client":
                raise FetchError(f"{label}: {e}; the request is rejected as made, not retrying") from e
            if kind == "blocked":
                blocked += 1
                if blocked >= BLOCKED_ATTEMPTS:
                    raise BlockedError(
                        f"{label}: HTTP 403 on {blocked} attempts, each on a fresh warmed session. "
                        "stats.nba.com is refusing this machine; run from an operator machine "
                        "(residential IP, curl_cffi installed)"
                    ) from e
            if attempt == attempts - 1:
                break
            wait = backoff_seconds(attempt)
            print(
                f"  {label}: attempt {attempt + 1}/{attempts} failed ({kind}: {type(e).__name__}: {e}); "
                f"backoff {wait:.0f}s"
            )
            _sleep(wait)
    raise FetchError(f"{label}: failed after {attempts} attempts; last error {type(last).__name__}: {last}") from last


def _curl_attempt(url: str, params: dict[str, Any], timeout: int) -> dict:
    # Fresh session per attempt: reusing one session across burst calls often
    # triggers Akamai 500 / RemoteDisconnected after synergy/hustle. Each new
    # session is warmed, because its cookies are what the warm-up is for.
    session = _curl_session()
    try:
        _warmup(session)
        r = session.get(url, params=params, headers=_STATS_HEADERS, timeout=timeout)
        _check_status(r, url)
        return r.json()
    finally:
        # Closing is best effort: the attempt's result (or its exception, which
        # this must not replace) is already decided.
        try:
            session.close()
        except Exception:
            pass


def _nba_api_attempt(endpoint: str, params: dict[str, Any], timeout: int) -> dict:
    """Legacy path when curl_cffi is not installed (often blocked)."""
    from nba_api.stats.library.http import NBAStatsHTTP

    resp = NBAStatsHTTP().send_api_request(endpoint=endpoint, parameters=params, timeout=timeout)
    # nba_api 1.11.4's NBAResponse keeps the status only in this private
    # attribute and returns the body unchecked, so a 403 page would otherwise
    # surface as a JSONDecodeError with no status to classify.
    status = getattr(resp, "_status_code", None)
    if isinstance(status, int) and status >= 400:
        raise HTTPStatusError(status, STATS_API.format(endpoint=endpoint))
    return resp.get_dict()


def fetch_stats_json(
    endpoint: str,
    params: dict[str, Any],
    *,
    timeout: int = 90,
) -> dict:
    """GET ``stats.nba.com/stats/{endpoint}`` and return parsed JSON, or raise FetchError."""
    url = STATS_API.format(endpoint=endpoint)
    label = f"stats.nba.com/{endpoint}"
    if _have_curl_cffi():
        return retry_call(lambda: _curl_attempt(url, params, timeout), label)
    return retry_call(lambda: _nba_api_attempt(endpoint, params, timeout), label)


def legacy_result_set_rows(
    payload: dict,
    set_name: str | None = None,
    *,
    required: Iterable[str] = (),
) -> list[dict]:
    """Convert ``resultSets`` / ``resultSet`` JSON to list[dict].

    required: columns the caller reads. A block whose headers lack one raises
    MissingColumnsError instead of letting `r.get(col) or 0.0` turn the
    column into zeros [ingest#11].
    """
    if "resultSets" in payload:
        blocks = payload["resultSets"]
        if isinstance(blocks, dict) and "Meta" in blocks:
            blocks = [blocks]
    elif "resultSet" in payload:
        blocks = [payload["resultSet"]]
    else:
        raise KeyError("no resultSets in stats.nba.com payload")

    if set_name:
        blocks = [b for b in blocks if b.get("name") == set_name]
        if not blocks:
            raise KeyError(f"result set {set_name!r} not found")

    required = tuple(required)
    rows: list[dict] = []
    for block in blocks:
        headers = block["headers"]
        if required:
            require_columns(headers, required, f"result set {block.get('name') or set_name!r}")
        for raw in block["rowSet"]:
            rows.append({headers[i]: raw[i] for i in range(len(headers))})
    return rows


def patch_nba_api_session() -> bool:
    """Route ``nba_api`` through curl_cffi when available. Returns True if patched.

    nba_api reuses this one session for every call, so it is warmed once
    here, under the same retry rules as any request.
    """
    if not _have_curl_cffi():
        return False
    try:
        from nba_api.stats.library.http import NBAStatsHTTP
    except ImportError:
        return False
    session = _curl_session()
    retry_call(lambda: _warmup(session), "www.nba.com warm-up")
    NBAStatsHTTP.get_session = lambda self: session  # type: ignore[method-assign]
    return True


def real_playoff_cache_paths(cache_dir) -> list:
    """Per-season playoff caches only — excludes playoffs.example.json."""
    import re

    pat = re.compile(r"playoffs_\d{4}-\d{2}\.json$")
    return sorted(p for p in cache_dir.glob("playoffs_*.json") if pat.match(p.name))
