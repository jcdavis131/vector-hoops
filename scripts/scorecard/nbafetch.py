"""One fetch helper for the scorecard: header set, box-wide per-host spacing, disk cache, fetch log.

Stdlib only (urllib). Rules it enforces:

- stats.nba.com and cdn.nba.com are refused unless the caller passes allow_nba=True. run.py never passes it in
  this wave (no NBA requests), so every NBA-side number comes from a cache file or is null "no-fetch-this-wave".
- The stats header set is pipeline/nba_http.py's _STATS_HEADERS plus one Chrome 120 User-Agent (the H1 set wave 1
  recorded in evidence/B-COV/header-rules.json; Cam's D8). No cookie warm-up, no Sec-Fetch-* headers.
  tests/test_scorecard.py pins the dict to nba_http.py by AST.
- Spacing: at least MIN_SPACING_S between two requests to one host from any process on the box. The last request
  time per host lives in <state_dir>/<host>.last, read and written under an mkdir lock (<host>.lock), so two
  scorecard processes cannot undercut it (wave 1 finding P-2).
- Disk cache keyed by the URL's sha256; every request, cached or not, is one line of fetch_log.jsonl
  (url, headers sent, status, bytes, sha256, requested_at, retrieved_at, from_cache).
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

CHROME120_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
STATS_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "User-Agent": CHROME120_UA,
}
SITE_HEADERS = {
    "User-Agent": "vector-hoops-scorecard/1.0",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.5",
}
NBA_HOSTS = frozenset({"stats.nba.com", "cdn.nba.com"})
MIN_SPACING_S = {"stats.nba.com": 2.0, "cdn.nba.com": 2.0}
DEFAULT_SPACING_S = 1.0
LOCK_STALE_S = 120.0
TIMEOUT_S = 30


class NBAFetchRefusedError(RuntimeError):
    """A request to stats.nba.com or cdn.nba.com without allow_nba=True."""


@dataclass
class FetchResult:
    url: str
    status: int | None
    body: bytes | None
    sha256: str | None
    requested_at: str
    retrieved_at: str | None
    from_cache: bool
    error: str | None
    seconds_to_headers: float | None = None


def _iso(epoch: float) -> str:
    return _dt.datetime.fromtimestamp(epoch, _dt.UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def default_state_dir() -> Path:
    return Path(os.environ.get("SCORECARD_FETCH_STATE", Path(tempfile.gettempdir()) / "vector-hoops-fetch-state"))


def _urlopen(req: urllib.request.Request, timeout: int):
    return urllib.request.urlopen(req, timeout=timeout)  # noqa: S310 (https only, checked by the caller)


class Fetcher:
    def __init__(
        self,
        state_dir: Path | None = None,
        cache_dir: Path | None = None,
        log_path: Path | None = None,
        opener: Callable = _urlopen,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.state_dir = Path(state_dir) if state_dir else default_state_dir()
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.log_path = Path(log_path) if log_path else None
        self.opener = opener
        self.clock = clock
        self.sleep = sleep
        self.state_dir.mkdir(parents=True, exist_ok=True)
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    # -- spacing ----------------------------------------------------------------------------------------------

    def _lock(self, host: str) -> Path:
        lock = self.state_dir / f"{host}.lock"
        while True:
            try:
                lock.mkdir()
                return lock
            except FileExistsError:
                try:
                    if time.time() - lock.stat().st_mtime > LOCK_STALE_S:
                        lock.rmdir()
                        continue
                except FileNotFoundError:
                    continue
                time.sleep(0.05)

    def _wait_turn(self, host: str) -> None:
        spacing = MIN_SPACING_S.get(host, DEFAULT_SPACING_S)
        lock = self._lock(host)
        try:
            stamp = self.state_dir / f"{host}.last"
            last = None
            try:
                last = float(stamp.read_text(encoding="utf-8").strip())
            except (FileNotFoundError, ValueError):
                pass
            now = self.clock()
            if last is not None and now - last < spacing:
                self.sleep(spacing - (now - last))
            stamp.write_text(repr(self.clock()), encoding="utf-8")
        finally:
            lock.rmdir()

    # -- cache and log ----------------------------------------------------------------------------------------

    def _cache_paths(self, url: str) -> tuple[Path, Path] | None:
        if not self.cache_dir:
            return None
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
        return self.cache_dir / f"{key}.body", self.cache_dir / f"{key}.meta.json"

    def _log(self, rec: dict) -> None:
        if not self.log_path:
            return
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.log_path, "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(rec, sort_keys=True) + "\n")

    # -- the request ------------------------------------------------------------------------------------------

    def get(self, url: str, headers: dict | None = None, allow_nba: bool = False, use_cache: bool = True) -> FetchResult:
        parts = urllib.parse.urlsplit(url)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https":
            raise ValueError(f"https only: {url}")
        if host in NBA_HOSTS and not allow_nba:
            raise NBAFetchRefusedError(f"{host} is not fetched in this wave (pass allow_nba=True to override): {url}")
        sent = dict(headers if headers is not None else (STATS_HEADERS if host in NBA_HOSTS else SITE_HEADERS))
        paths = self._cache_paths(url) if use_cache else None
        if paths and paths[0].is_file() and paths[1].is_file():
            meta = json.loads(paths[1].read_text(encoding="utf-8"))
            body = paths[0].read_bytes()
            res = FetchResult(
                url, meta.get("status"), body, meta.get("sha256"), _iso(self.clock()), meta.get("retrieved_at"), True, None
            )
            self._log(self._record(res, sent))
            return res
        self._wait_turn(host)
        req = urllib.request.Request(url, headers=sent)
        t0 = self.clock()
        requested_at = _iso(t0)
        status, body, error, t_headers = None, None, None, None
        try:
            with self.opener(req, timeout=TIMEOUT_S) as resp:
                t_headers = self.clock() - t0
                status = getattr(resp, "status", None)
                body = resp.read()
        except urllib.error.HTTPError as e:
            status, error = e.code, f"HTTP {e.code}"
        except (urllib.error.URLError, OSError) as e:
            error = repr(e)[:200]
        digest = hashlib.sha256(body).hexdigest() if body is not None else None
        res = FetchResult(url, status, body, digest, requested_at, _iso(self.clock()), False, error, t_headers)
        if paths and status == 200 and body is not None:
            paths[0].write_bytes(body)
            meta = {"url": url, "status": status, "sha256": digest, "retrieved_at": res.retrieved_at, "headers": sent}
            paths[1].write_text(json.dumps(meta, sort_keys=True), encoding="utf-8")
        self._log(self._record(res, sent))
        return res

    @staticmethod
    def _record(res: FetchResult, sent: dict) -> dict:
        return {
            "url": res.url,
            "headers_sent": sent,
            "status": res.status,
            "bytes": len(res.body) if res.body is not None else None,
            "sha256": res.sha256,
            "requested_at": res.requested_at,
            "retrieved_at": res.retrieved_at,
            "from_cache": res.from_cache,
            "error": res.error,
            "seconds_to_headers": res.seconds_to_headers,
        }
