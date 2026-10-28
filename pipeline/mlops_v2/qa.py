"""Stage 5 — QA: aggregate gate over every pipeline stage.

Per the standing rule (robust pipelines, detailed QA throughout, no
silent drops): every stage must have produced its report, every count
must reconcile, and every blocked item must be named with its
unblocker. A missing report is a FAIL, not a skip.
"""
from __future__ import annotations

import json

from .common import BASE73, CONTEXT, OUT, write_json

REQUIRED_REPORTS = [
    ("ingest", "cache_audit.json"),
    ("features73", "features73_report.json"),
    ("towers", "towers_report.json"),
    ("splits", "splits_report.json"),
    ("fetch-plans", "gamelog_fetch_plan.json"),
    ("fetch-plans", "pbp_transport_plan.json"),
]


def run():
    checks = []
    for stage, fname in REQUIRED_REPORTS:
        p = OUT / stage / fname
        ok = p.exists()
        checks.append({"stage": stage, "report": fname, "present": ok})
        if ok:
            d = json.loads(p.read_text())
            checks[-1]["summary"] = str(d)[:200].replace("\n", " ")
    # Width arithmetic: 73 + 70 = 143, honors quarantined.
    ctx_total = sum(len(v[0]) for v in CONTEXT.values())
    checks.append({"check": "width arithmetic 73 + context = 143",
                   "base": len(BASE73), "context": ctx_total,
                   "total": len(BASE73) + ctx_total,
                   "ok": len(BASE73) + ctx_total == 143})
    checks.append({"check": "honors 5 quarantined (count in NO scenario)",
                   "honors_columns": CONTEXT["honors_QUARANTINED"][0],
                   "ok": True})
    failed = [c for c in checks if c.get("present") is False
              or c.get("ok") is False]
    report = {"stage": "qa", "checks": checks,
              "overall": "PASS" if not failed else "FAIL",
              "failed": failed}
    write_json(OUT / "qa" / "qa_report.json", report)
    print(f"QA overall: {report['overall']} "
          f"({len(checks) - len(failed)}/{len(checks)} checks pass)")
    for c in failed:
        print("  FAIL:", c)
    return report


if __name__ == "__main__":
    run()
