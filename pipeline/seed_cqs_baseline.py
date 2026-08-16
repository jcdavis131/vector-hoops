"""One-shot: seed CQS baseline from the current mtnn_report.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

import composite_score as cqs

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "data" / "mtnn_report.json"
MOD = ROOT / "composite_score.py"


def main() -> None:
    r = json.loads(REPORT.read_text(encoding="utf-8"))
    r.pop("composite", None)
    r.pop("promote", None)
    base = cqs.seed_baseline_from_report(r)
    print("BASELINE", base)
    block = cqs.composite_quality(r)
    print("CQS", block["cqs"])
    print("components", json.dumps(block["components"], indent=2))

    text = MOD.read_text(encoding="utf-8")
    repl = (
        "BASELINE = {\n"
        f'    "cqs": {base["cqs"]},  # seeded from mtnn_report.json 2026-07-09 v5\n'
        f'    "recall": {round(base["recall"], 4)},\n'
        f'    "purity": {round(base["purity"], 4)},\n'
        "}"
    )
    new_text, n = re.subn(
        r"BASELINE = \{[\s\S]*?\n\}",
        repl,
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"BASELINE replace failed (n={n})")
    MOD.write_text(new_text, encoding="utf-8")

    # Reload module constants for promote check
    import importlib

    importlib.reload(cqs)
    r["composite"] = cqs.composite_quality(r)
    ok, why = cqs.should_promote(r)
    r["promote"] = {"ok": ok, "reason": why}
    REPORT.write_text(json.dumps(r, indent=2), encoding="utf-8")
    print("promote_self", ok, why)
    print("updated", REPORT)


if __name__ == "__main__":
    main()
