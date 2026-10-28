#!/usr/bin/env python3
"""MTNN training-data pipelines — single entrypoint.

Usage (from the worktree root):
  python3 pipeline/mlops_v2/run.py audit-cache   # stage 1, read-only
  python3 pipeline/mlops_v2/run.py features73   # stage 2, offline rebuild
  python3 pipeline/mlops_v2/run.py towers       # stage 3, tower inputs
  python3 pipeline/mlops_v2/run.py splits       # stage 4, folds + targets
  python3 pipeline/mlops_v2/run.py fetch-plans  # gamelog plan + PBP plan
  python3 pipeline/mlops_v2/run.py qa           # stage 5, aggregate gate
  python3 pipeline/mlops_v2/run.py all          # every runnable stage

What this NEVER does: train a model, merge, deploy, write to assets/
or public/, download permission-gated data, invent data, or push
anything through git. Gamelog live fetch is a separate, explicitly
gated command (see gamelog_fetcher.py) for an operator machine only.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mlops_v2 import cache_audit, features73, towers, splits, qa  # noqa: E402
from mlops_v2 import gamelog_fetcher, pbp_plan  # noqa: E402

STAGES = {
    "audit-cache": cache_audit.run,
    "features73": features73.run,
    "towers": towers.run,
    "splits": splits.run,
    "fetch-plans": lambda: (gamelog_fetcher.main([]),
                            pbp_plan.run()),
    "qa": qa.run,
}


def main(argv):
    if len(argv) != 1 or argv[0] not in STAGES and argv[0] != "all":
        print(__doc__)
        return 2
    names = list(STAGES) if argv[0] == "all" else [argv[0]]
    for name in names:
        print(f"== stage: {name} ==")
        STAGES[name]()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
