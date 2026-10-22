"""Shared pieces of the scorecard: the metric record, validation, file inputs, git and cache readers.

Stdlib only. A metric is {value, unit, command, inputs[], fetched_at, reason?, detail?}. A value that could not be
computed is null with a reason, never 0. Every non-null value names at least one input it came from.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

SCHEMA = "vector-hoops-scorecard/1"
NO_FETCH = "no-fetch-this-wave"
METRIC_KEYS = ("value", "unit", "command", "inputs", "fetched_at")


def utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.UTC).replace(microsecond=0)


def iso(t: _dt.datetime) -> str:
    return t.astimezone(_dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(s: str | None) -> _dt.datetime | None:
    """ISO 8601 with Z, +hh:mm or -hhmm offsets; None when it cannot be read."""
    if not s:
        return None
    t = s.strip().replace("Z", "+00:00")
    if len(t) >= 5 and t[-5] in "+-" and t[-3] != ":":
        t = t[:-2] + ":" + t[-2:]
    try:
        d = _dt.datetime.fromisoformat(t)
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=_dt.UTC)


def metric(
    value: Any,
    unit: str,
    *,
    command: str,
    inputs: list[dict],
    fetched_at: str | None,
    reason: str | None = None,
    detail: Any = None,
) -> dict:
    m: dict[str, Any] = {
        "value": value,
        "unit": unit,
        "command": command,
        "inputs": inputs,
        "fetched_at": fetched_at,
    }
    if reason is not None:
        m["reason"] = reason
    if detail is not None:
        m["detail"] = detail
    return m


def null(unit: str, reason: str, *, command: str, inputs: list[dict] | None = None, detail: Any = None) -> dict:
    return metric(None, unit, command=command, inputs=inputs or [], fetched_at=None, reason=reason, detail=detail)


def validate(doc: dict) -> list[str]:
    """Every problem with a scorecard document, as strings. An empty list means it is well formed."""
    errors: list[str] = []
    for key in ("schema", "git_sha", "command", "generated_at", "mode", "dimensions"):
        if key not in doc:
            errors.append(f"document lacks {key}")
    if doc.get("schema") != SCHEMA:
        errors.append(f"schema is {doc.get('schema')!r}, not {SCHEMA!r}")
    for dim, metrics in (doc.get("dimensions") or {}).items():
        if not isinstance(metrics, dict) or not metrics:
            errors.append(f"{dim} has no metrics")
            continue
        for name, m in metrics.items():
            where = f"{dim}.{name}"
            missing = [k for k in METRIC_KEYS if k not in m]
            if missing:
                errors.append(f"{where} lacks {', '.join(missing)}")
                continue
            if not m["command"]:
                errors.append(f"{where} has no command")
            if m["value"] is None:
                if not m.get("reason"):
                    errors.append(f"{where} is null without a reason")
            elif not m["inputs"]:
                errors.append(f"{where} has a value but names no input")
    return errors


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def file_input(root: Path, rel: str) -> dict:
    p = root / rel
    if not p.is_file():
        return {"path": rel, "missing": True}
    return {"path": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size}


def load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _git(root: Path, *args: str) -> str | None:
    try:
        r = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def is_git_toplevel(root: Path) -> bool:
    top = _git(root, "rev-parse", "--show-toplevel")
    if not top:
        return False
    return os.path.normcase(os.path.realpath(top.strip())) == os.path.normcase(os.path.realpath(str(root)))


def git_sha(root: Path) -> str | None:
    if not is_git_toplevel(root):
        return None
    out = _git(root, "rev-parse", "HEAD")
    return out.strip() if out else None


def git_dirty(root: Path) -> bool | None:
    if not is_git_toplevel(root):
        return None
    out = _git(root, "status", "--porcelain", "--untracked-files=no")
    return None if out is None else bool(out.strip())


def git_blob_sizes(root: Path) -> dict[str, int] | None:
    """{path: blob bytes} at HEAD, when root is a git checkout's top level; else None."""
    if not is_git_toplevel(root):
        return None
    out = _git(root, "ls-tree", "-r", "-l", "HEAD")
    if out is None:
        return None
    sizes: dict[str, int] = {}
    for line in out.splitlines():
        meta, path = line.split("\t", 1)
        parts = meta.split()
        if parts[1] == "blob" and parts[3] != "-":
            sizes[path] = int(parts[3])
    return sizes


@dataclass
class Ctx:
    root: Path
    command: str
    offline: bool
    now: _dt.datetime
    stats_cache: Path | None = None
    acc_cache: Path | None = None
    cdn_cache: Path | None = None
    budget_check: Path | None = None
    site_url: str = "https://hoops.dumbmodel.com"
    fetcher: Any = None
    ttfb_runs: int = 3
    notes: list[str] = field(default_factory=list)
    speed_pages: list[str] = field(default_factory=list)

    def cmd(self, fn: str) -> str:
        return f"{self.command} :: {fn}"


# ---- cached NBA responses -----------------------------------------------------------------------------------


def stats_saved(cache: Path | None, name: str) -> tuple[dict | None, str | None]:
    """A saved stats.nba.com response in the B-COV layout (<name>.body + <name>.meta.json).

    Returns ({"headers", "rows", "meta", "input"}, None) or (None, reason).
    """
    if cache is None:
        return None, NO_FETCH
    mp, bp = cache / f"{name}.meta.json", cache / f"{name}.body"
    if not mp.is_file():
        return None, f"{name}: not in the cache"
    meta = load_json(mp)
    if not meta.get("works"):
        return None, f"{name}: saved response did not work (status {meta.get('status')})"
    body = load_json(bp)
    rs = body.get("resultSets", body.get("resultSet"))
    if isinstance(rs, dict):
        rs = [rs]
    first = rs[0]
    inp = {
        "path": bp.as_posix(),
        "sha256": sha256_file(bp),
        "url": meta.get("url"),
        "upstream_sha256": meta.get("sha256"),
    }
    return {"headers": first["headers"], "rows": first["rowSet"], "meta": meta, "input": inp}, None


def as_dicts(headers: list[str], rows: list[list]) -> list[dict]:
    return [dict(zip(headers, r)) for r in rows]


def latest_time(times: list[str | None]) -> str | None:
    parsed = [(parse_time(t), t) for t in times if t]
    parsed = [p for p in parsed if p[0] is not None]
    return max(parsed)[1] if parsed else None
