"""Shared stdlib client for the ESPN NBA site API used by the realtime data plane.

The repo's existing ESPN usage (assets/live.js) is client-side against
``site.api.espn.com``. These pollers use the same endpoints server-side so the
static site can carry a last-known-good snapshot for honest degradation.

Endpoints (all under the BASE below):
    scoreboard?dates=YYYYMMDD        -- today's games: state, clock, scores
    summary?event=<eventId>          -- per-game detail (boxscore, leaders)
    teams                            -- 30 teams with records
    teams/<teamId>/roster            -- athlete identity for a team

No invented sources, no invented numbers. Every function raises EspnError on
transport or HTTP failure; callers decide what to do (the policy is: keep the
last-good snapshot, record the failure in feed_health.json, never fabricate).
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
# Note: ESPN's edge rejects a User-Agent containing a parenthetical URL
# (HTTP 403), so we identify plainly and send an explicit Accept header.
USER_AGENT = "vector-hoops-realtime/1.0"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}
TIMEOUT_S = 15


class EspnError(RuntimeError):
    """Transport or HTTP failure talking to the ESPN API."""

    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


def get(path: str, *, retries: int = 1) -> dict:
    """GET ``BASE + path`` and return the parsed JSON body.

    Retries once on transient failures (timeouts, 5xx, 429). Raises EspnError
    on persistent failure -- never returns placeholder data.
    """
    url = BASE + path
    last: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            last = EspnError(f"ESPN {path}: HTTP {e.code}", status=e.code)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2)
                continue
            raise last from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = EspnError(f"ESPN {path}: transport failure ({e})")
            if attempt < retries:
                time.sleep(2)
                continue
            raise last from e
    raise last  # pragma: no cover - loop always raises first


def utcnow_iso() -> str:
    """Current UTC time as ISO-8601 with a Z suffix (point-in-time marker)."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def et_today_yyyymmdd() -> str:
    """Today's date in America/New_York as YYYYMMDD (ESPN scoreboard days)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("America/New_York")).strftime("%Y%m%d")
