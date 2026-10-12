"""Shared rules for the fetch_* scripts and build_vectors' fetch layer.

Three failures this module exists to stop, each reproduced on 2026-10-09
with fakes (no network):

1. Fetch failures exited 0 [ingest#7]. build_vectors.with_retries printed
   "EXHAUSTED retries -- skipping" and returned None, the season went into
   `missing`, and vectors.json plus the training matrix were still written
   with one WARNING line. fetch_advanced_tracking turned an HTTP 500 into {}
   (a zero-row success); fetch_gamelogs returned -1 and the script exited 0;
   fetch_bbref_advanced --offline with zero caches exited 0. A collector
   elsewhere in the estate sat on HTTP 403 for weeks that way. run_fetch()
   turns any FetchError or network error into exit code 2 and one summary
   line on stderr, so a cron run goes red. Failures collects per-season
   errors so a run still attempts every season and fails at the end.

2. Empty and half-written caches became permanent [ingest#8]. fetch_dash
   cached an empty [] response (probe: '[]' written to dashbase_<season>.json),
   fetch_playoffs wrote {"complete": true, "players": {}} for a season whose
   playoff split was empty, and every write went straight into the
   destination, so a crash mid-write left a truncated file that the
   skip-if-exists check then trusted forever. write_cache() refuses an empty
   payload and writes through artifact_io's temp-file-and-replace.

3. The current season froze at its first fetch [ingest#8]. Every fetcher
   skipped a season whose cache existed. That is right for a season whose
   playoffs are over; for one still being played it keeps opening-week
   numbers forever. write_cache() records when and from where each file was
   fetched; cache_is_fresh() keeps a final season as fetched and gives a
   non-final one a TTL (HOOPS_CACHE_TTL_HOURS, default 24). --offline never
   asks: it reads whatever is cached. With LAST_SEASON = 2025-26, final since
   2026-08-01 (seasons.is_final), no season in the list is subject to the
   TTL today; it starts to matter when 2026-27 is added.

The fetch record lives in a separate directory, `<cache dir>/_fetch_meta/
<file name>.json`, never next to the cache under a similar name. Readers glob
their own prefixes (bio_*.json, tracking_*.json, honors_award_*.json), and a
sibling like bio_2025-26.json.meta.json would match bio_*.json. The cache file
itself keeps exactly the format its readers expect; no key is added to it.

Fetch records are committed with their caches (decided 2026-10-10).
pipeline/cache/ is tracked: it is the input the offline climb and every
--offline build read, so where and when each file was fetched is part of the
data's provenance, and a cache committed without its record reads as
unrecorded (stale, if its season is still being played). Commit
pipeline/cache/_fetch_meta/<file>.json in the same commit as the cache file
it describes. .gitignore says so and ignores nothing under it. None exist
yet: no cache on this branch has been refetched since write_cache started
writing them.

Stdlib plus artifact_io (numpy at import), so every fetcher can use it.
"""

from __future__ import annotations

import datetime as _dt
import http.client
import json
import os
import sys
import urllib.error
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any, NoReturn

from artifact_io import atomic_write_text, sha256_file
from seasons import is_final

EXIT_FETCH_FAILED = 2

META_DIR = "_fetch_meta"
TTL_ENV = "HOOPS_CACHE_TTL_HOURS"
DEFAULT_TTL_HOURS = 24.0


class FetchError(RuntimeError):
    """A fetch did not produce the data it was asked for."""


class BlockedError(FetchError):
    """The server answered HTTP 403 on every attempt in the budget.

    Backing off does not fix a block, so this is raised early and callers
    must not retry it.
    """


class EmptyPayloadError(FetchError):
    """A payload with no rows. Never cached: an empty file reads as 'fetched, nothing there'."""


class MissingColumnsError(FetchError):
    """A payload without a column the fetcher reads.

    Fetchers read columns with `r.get(col) or 0.0`, so a renamed or dropped
    column became a column of zeros with complete: true. That is how
    wide_skills' d_fg_pct is 0.0 for every player of every season today.
    """


def require_columns(columns: Iterable[str], required: Iterable[str], what: str) -> None:
    """Raise MissingColumnsError naming every column of `required` not in `columns`."""
    have = set(columns)
    missing = [c for c in required if c not in have]
    if missing:
        raise MissingColumnsError(f"{what}: payload has no column(s) {missing}; refusing to read them as zeros")


# ---------------------------------------------------------------------------
# cache writes and the fetch record
# ---------------------------------------------------------------------------


def meta_path(path: str | os.PathLike[str]) -> Path:
    p = Path(path)
    return p.parent / META_DIR / f"{p.name}.json"


def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.UTC)


def write_cache_text(
    path: str | os.PathLike[str],
    text: str,
    *,
    source: str,
    n_rows: int,
    season: str | None = None,
) -> Path:
    """Write a fetched payload's serialized text atomically, then its fetch record.

    Refuses n_rows < 1. The data file is written before the record: if the
    second write fails, the record is the older one, which can only make the
    cache look staler than it is (a refetch), never fresher.
    """
    p = Path(path)
    if n_rows < 1:
        raise EmptyPayloadError(f"{p.name}: {source} returned no rows; not caching an empty payload")
    p.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(p, text, encoding="utf-8")
    record = {
        "file": p.name,
        "source": source,
        "season": season,
        "rows": int(n_rows),
        "fetched_at": _utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": sha256_file(p),
    }
    m = meta_path(p)
    m.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(m, json.dumps(record, indent=1), encoding="utf-8")
    return p


def write_cache(
    path: str | os.PathLike[str],
    doc: Any,
    *,
    source: str,
    n_rows: int | None = None,
    season: str | None = None,
    **json_kwargs: Any,
) -> Path:
    """json.dumps(doc) to path atomically, refusing None or an empty row list.

    n_rows is the number of rows the doc carries. Leave it out for a doc that
    IS its row list or row mapping (a list of player rows, a dict keyed by
    player id); pass it for a doc whose rows sit under a key, e.g.
    n_rows=len(doc["players"]). json_kwargs default to the compact
    separators=(",", ":") most caches use; pass indent=... to keep another
    file's existing layout.
    """
    p = Path(path)
    if doc is None:
        raise EmptyPayloadError(f"{p.name}: {source} returned nothing; not caching")
    if n_rows is None:
        if not isinstance(doc, list | dict):
            raise TypeError(f"write_cache({p.name}): pass n_rows for a {type(doc).__name__} doc")
        n_rows = len(doc)
    kwargs = json_kwargs or {"separators": (",", ":")}
    return write_cache_text(p, json.dumps(doc, **kwargs), source=source, n_rows=n_rows, season=season)


def read_fetch_record(path: str | os.PathLike[str]) -> dict[str, Any] | None:
    """The fetch record for a cache file, or None when there is none or it is unreadable."""
    m = meta_path(path)
    if not m.exists():
        return None
    try:
        rec = json.loads(m.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        # Treated as "no record", which makes a non-final season stale. Bytes
        # that are not UTF-8 (UnicodeDecodeError) and a path that cannot be
        # read (OSError: a directory, a lock) used to escape and crash the
        # fetcher's freshness check instead (P12).
        return None
    return rec if isinstance(rec, dict) else None


def cache_age_hours(path: str | os.PathLike[str], now: _dt.datetime | None = None) -> float | None:
    """Hours since the cache was fetched, or None when that is unknown.

    Unknown means: no record, an unreadable one, or one whose sha256 no
    longer matches the file (something rewrote the cache without going
    through write_cache, so the record describes other bytes).
    """
    p = Path(path)
    rec = read_fetch_record(p)
    if rec is None or not p.exists() or rec.get("sha256") != sha256_file(p):
        return None
    try:
        fetched = _dt.datetime.strptime(str(rec["fetched_at"]), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.UTC)
    except (KeyError, ValueError):
        return None
    return ((now or _utcnow()) - fetched).total_seconds() / 3600.0


def ttl_hours() -> float:
    """HOOPS_CACHE_TTL_HOURS, or 24. A value that is not a positive number is an error, not a default."""
    raw = os.environ.get(TTL_ENV)
    if raw is None or not raw.strip():
        return DEFAULT_TTL_HOURS
    try:
        val = float(raw)
    except ValueError:
        raise ValueError(f"{TTL_ENV}={raw!r} is not a number of hours") from None
    if val <= 0:
        raise ValueError(f"{TTL_ENV}={raw!r} must be > 0")
    return val


def cache_is_fresh(
    path: str | os.PathLike[str],
    season: str,
    *,
    today: _dt.date | None = None,
    now: _dt.datetime | None = None,
    ttl: float | None = None,
) -> bool:
    """May an online run keep this season's cache instead of refetching it?

    A final season: yes whenever the file exists (skip-if-exists, as before).
    A season still being played: only if its fetch record is younger than the
    TTL. Never consulted by --offline, which reads whatever is cached.
    """
    p = Path(path)
    if not p.exists():
        return False
    if is_final(season, today):
        return True
    age = cache_age_hours(p, now)
    return age is not None and age < (ttl if ttl is not None else ttl_hours())


# ---------------------------------------------------------------------------
# failures and the exit code
# ---------------------------------------------------------------------------


class Failures:
    """Attempt every season, remember the ones that failed, fail at the end.

    A fetcher wraps each season in `try: ... except FetchError as e:
    failures.add(season, e)`, keeps going, and calls failures.raise_if_any()
    after the loop, so one bad season neither stops the rest nor hides behind
    their success.
    """

    def __init__(self, what: str) -> None:
        self.what = what
        self.failed: dict[str, str] = {}

    def add(self, key: str, exc: BaseException) -> None:
        kind = "BLOCKED" if isinstance(exc, BlockedError) else type(exc).__name__
        self.failed[key] = f"{kind}: {exc}"
        print(f"  {key}: FAILED ({kind}: {exc})", file=sys.stderr, flush=True)

    def __bool__(self) -> bool:
        return bool(self.failed)

    def raise_if_any(self) -> None:
        if not self.failed:
            return
        keys = ", ".join(self.failed)
        blocked = all(v.startswith("BLOCKED") for v in self.failed.values())
        cls = BlockedError if blocked else FetchError
        raise cls(f"{self.what}: {len(self.failed)} failed ({keys}); nothing was written for them")


_NETWORK_MODULES = ("requests", "urllib3", "curl_cffi")


def is_network_error(exc: BaseException) -> bool:
    """A transport failure: connection, timeout, HTTP protocol, or a requests/curl_cffi error."""
    if isinstance(exc, urllib.error.URLError | ConnectionError | TimeoutError | http.client.HTTPException):
        return True
    return any(c.__module__.split(".")[0] in _NETWORK_MODULES for c in type(exc).__mro__)


def run_fetch(main: Callable[[], Any], *, name: str | None = None) -> NoReturn:
    """Run a fetcher's main() and exit: 0, main's int return code, or 2 on a fetch failure.

    A FetchError (BlockedError included) or a network error prints one line,
    `FETCH FAILED <name>: <what>`, to stderr and exits 2. Anything else is a
    bug and propagates with its traceback (exit 1). main() returning an int
    is used as the exit code; any other return value means success.
    """
    label = name or getattr(main, "__module__", "fetch")
    try:
        rc = main()
    except FetchError as e:
        kind = "BLOCKED" if isinstance(e, BlockedError) else "FAILED"
        print(f"FETCH {kind} {label}: {e}", file=sys.stderr, flush=True)
        sys.exit(EXIT_FETCH_FAILED)
    except Exception as e:
        if not is_network_error(e):
            raise
        print(f"FETCH FAILED {label}: network error {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        sys.exit(EXIT_FETCH_FAILED)
    sys.exit(rc if isinstance(rc, int) and not isinstance(rc, bool) else 0)
