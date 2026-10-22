"""Recompute the Vector Hoops scorecard: coverage, freshness, speed, accuracy and the model.

    python -I scripts/scorecard/run.py --out <file> [--offline] [--root DIR]
        [--stats-cache DIR] [--acc-cache DIR] [--cdn-cache DIR] [--site URL] [--ttfb-runs N]

Writes one JSON: {schema, git_sha, git_dirty, command, generated_at, mode, dimensions: {dimension: {metric:
{value, unit, command, inputs[], fetched_at, reason?, detail?}}}}. Unknown is null with a reason, never 0.

--offline     no network at all: what the checkout (and any cache given) can answer.
default       plain GETs to the live site (--site) for the realtime snapshot and server time per page.
NBA side      stats.nba.com and cdn.nba.com are not fetched in this wave. NBA-side numbers come from cache
              directories of saved responses (--stats-cache in the B-COV layout, --acc-cache in the B-ACC
              layout, --cdn-cache with scheduleLeagueV2.json), else they are null "no-fetch-this-wave".
              --fetch-nba exits with EXIT_NBA_REFUSED and writes nothing.
Stdlib only. Exit 0 when the document was written and validates; 1 when it does not validate.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "scorecard"  # noqa: A001

from scorecard import accuracy, common, coverage, freshness, model, nbafetch, speed  # noqa: E402

EXIT_NBA_REFUSED = 3
MODULES = (("coverage", coverage), ("freshness", freshness), ("speed", speed), ("accuracy", accuracy), ("model", model))


def _args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent.parent)
    ap.add_argument("--stats-cache", type=Path)
    ap.add_argument("--acc-cache", type=Path)
    ap.add_argument("--cdn-cache", type=Path)
    ap.add_argument("--budget-check", type=Path, help="scripts/budget_check.py to import (default: the root's own)")
    ap.add_argument("--site", default="https://hoops.dumbmodel.com")
    ap.add_argument("--ttfb-runs", type=int, default=3)
    ap.add_argument("--fetch-log", type=Path, help="fetch_log.jsonl for live requests (default: next to --out)")
    ap.add_argument("--fetch-nba", action="store_true", help="refused in this wave")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    a = _args(argv)
    if a.fetch_nba:
        print("run.py: no stats.nba.com / cdn.nba.com request in this wave; use a cache directory", file=sys.stderr)
        raise SystemExit(EXIT_NBA_REFUSED)
    root = a.root.resolve()
    for d in (a.stats_cache, a.acc_cache, a.cdn_cache):
        if d is not None and not d.is_dir():
            print(f"run.py: cache directory {d} does not exist", file=sys.stderr)
            return 2
    command = "python -I scripts/scorecard/run.py " + " ".join(argv if argv is not None else sys.argv[1:])
    fetcher = None
    if not a.offline:
        fetcher = nbafetch.Fetcher(log_path=a.fetch_log or a.out.with_name(a.out.stem + ".fetch_log.jsonl"))
    ctx = common.Ctx(
        root=root,
        command=command.strip(),
        offline=a.offline,
        now=common.utcnow(),
        stats_cache=a.stats_cache.resolve() if a.stats_cache else None,
        acc_cache=a.acc_cache.resolve() if a.acc_cache else None,
        cdn_cache=a.cdn_cache.resolve() if a.cdn_cache else None,
        budget_check=a.budget_check.resolve() if a.budget_check else None,
        site_url=a.site,
        fetcher=fetcher,
        ttfb_runs=a.ttfb_runs,
    )
    doc = {
        "schema": common.SCHEMA,
        "git_sha": common.git_sha(root),
        "git_dirty": common.git_dirty(root),
        "root": root.as_posix(),
        "command": ctx.command,
        "generated_at": common.iso(ctx.now),
        "mode": "offline" if a.offline else "live-site",
        "nba_fetch": common.NO_FETCH,
        "caches": {
            "stats": ctx.stats_cache.as_posix() if ctx.stats_cache else None,
            "acc": ctx.acc_cache.as_posix() if ctx.acc_cache else None,
            "cdn": ctx.cdn_cache.as_posix() if ctx.cdn_cache else None,
        },
        "dimensions": {},
    }
    for name, mod in MODULES:
        doc["dimensions"][name] = mod.measure(ctx)
    doc["finished_at"] = common.iso(common.utcnow())
    doc["notes"] = ctx.notes
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, indent=1, sort_keys=False, default=str) + "\n", encoding="utf-8")
    errors = common.validate(doc)
    for e in errors:
        print("invalid:", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
