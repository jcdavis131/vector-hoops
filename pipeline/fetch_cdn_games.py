"""Fetch finished games' box scores and play-by-play from cdn.nba.com into a cache.

The daily runner (scripts/daily/run_daily.py) calls this under
``wt/locks/nba-fetch.sh`` so only one NBA fetcher runs on the box at a time (D8).

What it does:

1. GET ``staticData/scheduleLeagueV2_1.json`` (one request; a copy younger than
   ``--schedule-max-age-min`` in the cache directory is reused instead);
2. pick the finished games (``gameStatus == 3``) dated on or after the cursor
   (the state file's ``cursor``, else ``--since``) whose files are not cached yet;
3. GET ``liveData/playbyplay/playbyplay_<id>.json`` for each of them first (Pixel
   Replay needs these), then ``liveData/boxscore/boxscore_<id>.json``, oldest game
   first, stopping at ``--max-requests`` (retries count);
4. write each file as the bytes cdn.nba.com sent, next to an ingest-style fetch
   record in ``_fetch_meta/``, and move the cursor to the oldest game still missing
   a file, so a capped or failed run is finished by the next one.

Headers: pipeline/nba_http.py's ``_STATS_HEADERS`` plus a Chrome User-Agent, the
set Cam allowed on 2026-10-22 (D8). No cookie warm-up, no other headers. At most
one request per ``MIN_SPACING_S`` seconds. Every request is appended to the
request log as one JSON line. Errors follow nba_http's classes: a 403 is retried
once and then counts as blocked (two blocked games in a row stop the run), a 429,
5xx or network error backs off and retries, any other 4xx fails that file at once.

Only regular-season (002), playoff (004) and play-in (005) games are fetched.

    python pipeline/fetch_cdn_games.py --cache-dir DIR [--also-have DIR] [--state FILE]
        [--since YYYY-MM-DD] [--max-requests 30] [--log FILE] [--report FILE] [--dry-run]

Exit 0 when every planned file landed, 3 when some files were deferred (cap or a
per-game failure), 2 when the schedule could not be read or cdn.nba.com blocked us.
Stdlib only (plus nba_http / ingest from this directory).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest import BlockedError, FetchError, meta_path  # noqa: E402
from nba_http import _STATS_HEADERS, HTTPStatusError, retry_call  # noqa: E402

CDN = "https://cdn.nba.com/static/json"
SCHEDULE_URL = f"{CDN}/staticData/scheduleLeagueV2_1.json"
PBP_URL = f"{CDN}/liveData/playbyplay/playbyplay_{{gid}}.json"
BOX_URL = f"{CDN}/liveData/boxscore/boxscore_{{gid}}.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
HEADERS = {**_STATS_HEADERS, "User-Agent": UA}

MIN_SPACING_S = 2.5  # D8: at most one request per 2 s per host; 0.5 s of margin
TIMEOUT_S = 30
ATTEMPTS = 3  # per file; a 403 gets nba_http.BLOCKED_ATTEMPTS (2) of these
GAME_ID_RE = re.compile(r"^00[245]\d{7}$")
FINAL = 3
# A game still not final this long after its scheduled tip is treated as postponed:
# it no longer holds the cursor back (a rescheduled game reappears under its new date).
POSTPONED_AFTER = dt.timedelta(days=2)

KINDS = ("pbp", "box")
SUBDIR = {"pbp": "cdn_pbp", "box": "cdn_box"}
PREFIX = {"pbp": "playbyplay_", "box": "boxscore_"}
URL = {"pbp": PBP_URL, "box": BOX_URL}


# ---------------------------------------------------------------------------
# pure parts (tested in tests/test_daily_pipeline.py)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Game:
    game_id: str
    date: str  # the schedule's game date (US Eastern), YYYY-MM-DD
    status: int
    start_utc: str  # ISO-8601, "" when the schedule has none


def parse_schedule(doc: dict) -> list[Game]:
    """Every fetchable game in a scheduleLeagueV2 document, in schedule order."""
    out = []
    for day in (doc.get("leagueSchedule") or {}).get("gameDates") or []:
        for g in day.get("games") or []:
            gid = str(g.get("gameId") or "")
            if not GAME_ID_RE.match(gid):
                continue
            raw_date = g.get("gameDateEst") or day.get("gameDate") or ""
            date = _iso_date(raw_date)
            if not date:
                continue
            out.append(Game(gid, date, int(g.get("gameStatus") or 0), str(g.get("gameDateTimeUTC") or "")))
    return out


def _iso_date(raw: str) -> str:
    """YYYY-MM-DD from '2026-10-21T00:00:00Z' or '10/21/2026 00:00:00'; '' when neither."""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return m.group(0)
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", raw)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return ""


def _parse_utc(s: str) -> dt.datetime | None:
    try:
        t = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.UTC)


def is_postponed(g: Game, now: dt.datetime) -> bool:
    if g.status == FINAL:
        return False
    start = _parse_utc(g.start_utc) or _parse_utc(g.date + "T23:59:59+00:00")
    return start is not None and now - start > POSTPONED_AFTER


@dataclass
class Plan:
    requests: list[tuple[str, str]] = field(default_factory=list)  # (kind, game_id), in fetch order
    deferred: list[tuple[str, str]] = field(default_factory=list)  # over the cap
    finals: list[str] = field(default_factory=list)  # finished games in the window


def plan_fetch(games: Iterable[Game], have: dict[str, set[str]], since: str | None, budget: int) -> Plan:
    """Which files to GET: play-by-play for every missing final first, then box scores.

    have maps kind -> game ids already cached. Oldest game first within each kind.
    budget is the number of file requests allowed (the schedule is already paid for).
    """
    finals = sorted(
        (g for g in games if g.status == FINAL and (since is None or g.date >= since)),
        key=lambda g: (g.date, g.game_id),
    )
    want = [(k, g.game_id) for k in KINDS for g in finals if g.game_id not in have.get(k, set())]
    budget = max(0, budget)
    return Plan(requests=want[:budget], deferred=want[budget:], finals=[g.game_id for g in finals])


def next_cursor(games: Iterable[Game], have: dict[str, set[str]], since: str | None, now: dt.datetime) -> str | None:
    """The oldest date the next run must look at again.

    That is the oldest of: a finished game missing either file, and a game not yet
    finished (unless it looks postponed). With nothing outstanding it is the date of
    the newest finished game, so the next run starts there and pays nothing for it.
    """
    window = [g for g in games if since is None or g.date >= since]
    pending = [
        g.date
        for g in window
        if (g.status == FINAL and any(g.game_id not in have.get(k, set()) for k in KINDS))
        or (g.status != FINAL and not is_postponed(g, now))
    ]
    if pending:
        return min(pending)
    finals = [g.date for g in window if g.status == FINAL]
    return max(finals) if finals else since


def pbp_is_final(doc: dict) -> bool:
    """The feed has its game-end action. Not necessarily the last one: a late correction can follow it."""
    acts = (doc.get("game") or {}).get("actions") or []
    return any(a.get("actionType") == "game" and a.get("subType") == "end" for a in acts)


def box_is_final(doc: dict) -> bool:
    return int((doc.get("game") or {}).get("gameStatus") or 0) == FINAL


def cached_ids(dirs: Iterable[Path], kind: str) -> set[str]:
    """Game ids with a file of this kind in any of dirs (each dir is a cache root)."""
    ids = set()
    pat = re.compile(rf"^{PREFIX[kind]}(\d{{10}})\.json$")
    for d in dirs:
        sub = d / SUBDIR[kind]
        if sub.is_dir():
            for p in sub.iterdir():
                m = pat.match(p.name)
                if m:
                    ids.add(m.group(1))
    return ids


# ---------------------------------------------------------------------------
# network
# ---------------------------------------------------------------------------


class BudgetExhaustedError(FetchError):
    """The request cap was reached; not retried."""


class Client:
    """GETs with the D8 header set, spacing, a request cap and a JSONL request log."""

    def __init__(
        self,
        max_requests: int,
        log_path: Path | None,
        *,
        opener: Callable[[urllib.request.Request, int], Any] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_requests = max_requests
        self.used = 0
        self.log_path = log_path
        self._open = opener or (lambda req, timeout: urllib.request.urlopen(req, timeout=timeout))
        self._sleep = sleep
        self._clock = clock
        self._last: float | None = None
        self.latency_ms: dict[str, int] = {}

    def _log(self, rec: dict) -> None:
        if self.log_path is None:
            return
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(rec) + "\n")

    def _attempt(self, url: str, label: str) -> bytes:
        if self.used >= self.max_requests:
            raise BudgetExhaustedError(f"{label}: request cap {self.max_requests} reached")
        if self._last is not None:
            wait = MIN_SPACING_S - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self.used += 1
        t0 = self._clock()
        self._last = t0
        rec: dict[str, Any] = {"ts": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "url": url}
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with self._open(req, TIMEOUT_S) as resp:
                status = getattr(resp, "status", 200)
                if status >= 400:
                    raise HTTPStatusError(status, url)
                body = resp.read()
            rec.update(status=status, bytes=len(body))
            json.loads(body)  # a non-JSON 200 (an Akamai page) is transient, per nba_http
            return body
        except urllib.error.HTTPError as e:
            rec.update(status=e.code)
            raise HTTPStatusError(e.code, url) from e
        except Exception as e:
            rec.setdefault("status", None)
            rec.update(error=f"{type(e).__name__}: {e}"[:200])
            raise
        finally:
            ms = int((self._clock() - t0) * 1000)
            rec["ms"] = ms
            self.latency_ms[label.split(":")[0]] = ms
            self._log(rec)

    def get(self, url: str, label: str) -> bytes:
        return retry_call(lambda: self._attempt(url, label), label, attempts=ATTEMPTS)


def write_raw(path: Path, body: bytes, *, source: str, rows: int) -> None:
    """The response bytes as sent, then an ingest-style fetch record (same fields as ingest.write_cache_text)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(body)
    tmp.replace(path)
    rec = {
        "file": path.name,
        "source": source,
        "season": None,
        "rows": int(rows),
        "fetched_at": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    m = meta_path(path)
    m.parent.mkdir(parents=True, exist_ok=True)
    m.write_text(json.dumps(rec, indent=1), encoding="utf-8", newline="\n")


def load_schedule(client: Client, cache_dir: Path, max_age_min: float) -> tuple[dict, str]:
    """The schedule document and where it came from ("cache" or "network")."""
    path = cache_dir / "scheduleLeagueV2_1.json"
    if path.exists() and max_age_min > 0:
        age_min = (time.time() - path.stat().st_mtime) / 60
        if age_min <= max_age_min:
            return json.loads(path.read_bytes()), f"cache ({age_min:.0f} min old)"
    body = client.get(SCHEDULE_URL, "schedule")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)
    return json.loads(body), "network"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cache-dir", type=Path, required=True, help="cache root that gets cdn_pbp/ and cdn_box/")
    ap.add_argument(
        "--also-have",
        type=Path,
        action="append",
        default=[],
        help="another cache root whose files count as cached (e.g. the repo's pipeline/cache)",
    )
    ap.add_argument("--state", type=Path, help="JSON state file holding the cursor (read and written)")
    ap.add_argument("--since", help="YYYY-MM-DD lower bound when the state file has no cursor")
    ap.add_argument("--max-requests", type=int, default=30, help="hard cap on requests, retries included")
    ap.add_argument(
        "--schedule-max-age-min",
        type=float,
        default=30.0,
        help="reuse a cached schedule younger than this (0: always fetch)",
    )
    ap.add_argument("--log", type=Path, help="append one JSON line per request here")
    ap.add_argument("--report", type=Path, help="write a JSON report of the run here")
    ap.add_argument("--dry-run", action="store_true", help="read the schedule, print the plan, fetch no game files")
    a = ap.parse_args(argv)

    state = {}
    if a.state and a.state.exists():
        state = json.loads(a.state.read_text(encoding="utf-8"))
    since = state.get("cursor") or a.since
    client = Client(a.max_requests, a.log)
    roots = [a.cache_dir, *a.also_have]
    report: dict[str, Any] = {
        "started_at": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "since": since,
        "fetched": {"pbp": [], "box": []},
        "failed": [],
        "deferred": [],
        "not_final": [],
        "blocked": False,
    }

    def finish(rc: int) -> int:
        report.update(
            requests=client.used,
            latency_ms=client.latency_ms,
            rc=rc,
            finished_at=dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        if a.report:
            a.report.parent.mkdir(parents=True, exist_ok=True)
            a.report.write_text(json.dumps(report, indent=1), encoding="utf-8", newline="\n")
        print(
            f"requests {client.used}/{a.max_requests}; fetched pbp={len(report['fetched']['pbp'])} "
            f"box={len(report['fetched']['box'])}; deferred {len(report['deferred'])}; "
            f"failed {len(report['failed'])}; rc={rc}"
        )
        return rc

    try:
        doc, origin = load_schedule(client, a.cache_dir, a.schedule_max_age_min)
    except FetchError as e:
        report["schedule_error"] = str(e)
        report["blocked"] = isinstance(e, BlockedError)
        print(f"FETCH {'BLOCKED' if report['blocked'] else 'FAILED'} schedule: {e}", file=sys.stderr)
        return finish(2)
    games = parse_schedule(doc)
    report["schedule"] = {"origin": origin, "games": len(games)}
    have = {k: cached_ids(roots, k) for k in KINDS}
    plan = plan_fetch(games, have, since, a.max_requests - client.used)
    report["finals_in_window"] = len(plan.finals)
    report["deferred"] = [f"{k}:{g}" for k, g in plan.deferred]
    print(
        f"schedule: {len(games)} games ({origin}); window from {since}: {len(plan.finals)} final; "
        f"plan {len(plan.requests)} file(s), {len(plan.deferred)} over the cap"
    )
    for k, g in plan.requests:
        print(f"  {k} {g}")
    if a.dry_run:
        return finish(0)

    blocked_run = 0
    for i, (kind, gid) in enumerate(plan.requests):
        label = f"{kind}:{gid}"
        try:
            body = client.get(URL[kind].format(gid=gid), label)
        except BudgetExhaustedError:
            report["deferred"] = [f"{k}:{g}" for k, g in plan.requests[i:]] + report["deferred"]
            break
        except FetchError as e:
            report["failed"].append({"file": label, "error": str(e)[:300]})
            if isinstance(e, BlockedError):
                blocked_run += 1
                if blocked_run >= 2:
                    report["blocked"] = True
                    report["deferred"] = [f"{k}:{g}" for k, g in plan.requests[i + 1 :]] + report["deferred"]
                    print(f"FETCH BLOCKED: two files in a row answered 403; stopping ({e})", file=sys.stderr)
                    break
            continue
        blocked_run = 0
        doc_g = json.loads(body)
        final = pbp_is_final(doc_g) if kind == "pbp" else box_is_final(doc_g)
        if not final:
            # The schedule says final but the file does not yet: keep nothing, retry next run.
            report["not_final"].append(label)
            continue
        rows = len(doc_g["game"].get("actions") or []) if kind == "pbp" else 2
        path = a.cache_dir / SUBDIR[kind] / f"{PREFIX[kind]}{gid}.json"
        write_raw(path, body, source=URL[kind].format(gid=gid), rows=rows)
        report["fetched"][kind].append(gid)
        have[kind].add(gid)

    cursor = next_cursor(games, have, since, dt.datetime.now(dt.UTC))
    report["cursor"] = cursor
    if a.state:
        state.update(cursor=cursor, last_fetch_at=report["started_at"])
        a.state.parent.mkdir(parents=True, exist_ok=True)
        a.state.write_text(json.dumps(state, indent=1), encoding="utf-8", newline="\n")
    if report["blocked"]:
        return finish(2)
    if report["failed"] or report["deferred"] or report["not_final"]:
        return finish(3)
    return finish(0)


if __name__ == "__main__":
    raise SystemExit(main())
