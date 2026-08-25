"""Browser-like HTTP for stats.nba.com.

Akamai on stats.nba.com fingerprints TLS handshakes. Plain ``requests`` /
``nba_api`` sessions are often reset or timed out even with correct headers.
``curl_cffi`` impersonates Chrome when installed; fetchers use it first and
fall back to ``nba_api`` only if the optional dependency is missing.

  pip install curl_cffi   # recommended on operator machines
"""

from __future__ import annotations

import time
from typing import Any

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
_WARMED = False


def _curl_session():
    from curl_cffi import requests as cr

    return cr.Session(impersonate=_IMPERSONATE)


def _warmup(session) -> None:
    global _WARMED
    if _WARMED:
        return
    session.get(STATS_ORIGIN, timeout=30)
    _WARMED = True


def fetch_stats_json(
    endpoint: str,
    params: dict[str, Any],
    *,
    timeout: int = 90,
) -> dict:
    """GET ``stats.nba.com/stats/{endpoint}`` and return parsed JSON."""
    try:
        from curl_cffi import requests as cr  # noqa: F401 — optional dep
    except ImportError:
        return _fetch_via_nba_api(endpoint, params, timeout=timeout)

    url = STATS_API.format(endpoint=endpoint)
    last_err: Exception | None = None
    for attempt in range(5):
        # Fresh session per attempt — reusing one session across burst calls
        # often triggers Akamai 500 / RemoteDisconnected after synergy/hustle.
        session = _curl_session()
        _warmup(session)
        try:
            r = session.get(url, params=params, headers=_STATS_HEADERS, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = e
            wait = min(120, 5 * 2**attempt)
            print(
                f"  stats.nba.com/{endpoint}: attempt {attempt + 1} "
                f"failed ({e}); backoff {wait}s"
            )
            time.sleep(wait)
        finally:
            try:
                session.close()
            except Exception:
                pass
    raise RuntimeError(f"stats.nba.com/{endpoint} failed after retries: {last_err}")


def _fetch_via_nba_api(
    endpoint: str,
    params: dict[str, Any],
    *,
    timeout: int,
) -> dict:
    """Legacy path when curl_cffi is not installed (often blocked)."""
    from nba_api.stats.library.http import NBAStatsHTTP

    resp = NBAStatsHTTP().send_api_request(
        endpoint=endpoint,
        parameters=params,
        timeout=timeout,
    )
    return resp.get_dict()


def legacy_result_set_rows(
    payload: dict,
    set_name: str | None = None,
) -> list[dict]:
    """Convert ``resultSets`` / ``resultSet`` JSON to list[dict]."""
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

    rows: list[dict] = []
    for block in blocks:
        headers = block["headers"]
        for raw in block["rowSet"]:
            rows.append({headers[i]: raw[i] for i in range(len(headers))})
    return rows


def patch_nba_api_session() -> bool:
    """Route ``nba_api`` through curl_cffi when available. Returns True if patched."""
    try:
        from curl_cffi import requests as cr
        from nba_api.stats.library.http import NBAStatsHTTP
    except ImportError:
        return False
    session = cr.Session(impersonate=_IMPERSONATE)
    _warmup(session)
    NBAStatsHTTP.get_session = lambda self: session  # type: ignore[method-assign]
    return True


def real_playoff_cache_paths(cache_dir) -> list:
    """Per-season playoff caches only — excludes playoffs.example.json."""
    import re

    pat = re.compile(r"playoffs_\d{4}-\d{2}\.json$")
    return sorted(p for p in cache_dir.glob("playoffs_*.json") if pat.match(p.name))
