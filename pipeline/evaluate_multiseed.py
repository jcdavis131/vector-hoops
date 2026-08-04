#!/usr/bin/env python3
"""Judge a config by its EXPECTED metric, not by whichever seed was run last.

Solo personal project, no connection to employer, built with public/free-tier only

WHY. pipeline/seed_floor.json measured this model over 8 seeds with an identical matrix and
config: test_recall mean 0.7582, sd 0.0942, bimodal, 3 of 8 seeds in a bad basin. The
enforced promotion gate (feature_stress.py promotion_gates, S2) requires
test_recall >= 0.80.

    the config's expected test_recall   0.7582
    the gate                            0.80
    single-seed pass rate               4 of 8  (50%, by luck)
    shipped model's recorded value      0.844   = +0.9 sd above the mean

The shipped mtnn_report.json records 0.844 and does not record which seed produced it. That
value is reproducible — it matches a seed-7 run of the same config exactly — but it is a
HIGH DRAW, not what a retrain of this config should be expected to deliver. A single run
therefore decides promotion on a coin flip, and it has been landing heads.

WHAT THIS DOES. Runs K seeds on the current matrix and reports mean and standard error per
metric, so a promotion decision is made against the expected value with a stated
uncertainty. It does not make the model better and it does not lower any bar. Its most
likely effect is that this config STOPS passing S2, because averaging converges to 0.7582
and P(K-seed mean >= 0.80) falls as K rises: 0.33 at K=1, 0.19 at K=4, 0.10 at K=8, 0.04 at
K=16. That is the correct behaviour of an honest estimator, not a regression.

WHICH METRICS TO TRUST AT SMALL K, from seed_floor.json's minimum detectable effects for a
3-vs-3 comparison:

    next_r2    0.0092      usable
    archetype  0.0142      usable
    purity     0.0158      usable
    cqs        4.27        NOT usable at small K
    recall     0.2138      NOT usable at small K

corr(cqs, test_recall) = +0.980, so CQS inherits recall's instability and is no safer.

    python pipeline/evaluate_multiseed.py --seeds 7 11 13 17
    python pipeline/evaluate_multiseed.py --seeds 7 11 13 --gate 0.80
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "pipeline" / "data" / "mtnn_report.json"
PY = str(ROOT / "pipeline" / ".venv" / "Scripts" / "python.exe")

BASE_ARGS = ["--epochs", "40", "--dim", "64", "--tower-width", "32",
             "--tower-hidden", "160", "--tower-blocks", "2", "--fusion", "concat",
             "--mlp-heads", "--d-head-hidden", "128", "--fusion-hidden", "256"]
METRICS = ("test_recall", "purity", "archetype", "next_r2", "cqs")
# From pipeline/seed_floor.json, measured over 8 seeds on this config.
MDE_3V3 = {"next_r2": 0.0092, "archetype": 0.0142, "purity": 0.0158,
           "cqs": 4.2657, "test_recall": 0.2138}


def one_run(seed: int, extra: list[str]) -> dict | None:
    p = subprocess.run([PY, "pipeline/train_mtnn.py", *BASE_ARGS, *extra,
                        "--seed", str(seed)], cwd=ROOT, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        print(f"  seed={seed} FAILED rc={p.returncode}")
        print((p.stderr or "")[-500:])
        return None
    r = json.loads(REPORT.read_text(encoding="utf-8"))
    c = r["composite"]["components"]
    return {"seed": seed, "cqs": r["composite"]["cqs"],
            "test_recall": r["held_out_recall"]["test"]["recall_at_10_mtnn"],
            "purity": c.get("purity"), "archetype": c.get("archetype"),
            "next_r2": c.get("next_r2")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seeds", type=int, nargs="+", default=[7, 11, 13, 17])
    ap.add_argument("--gate", type=float, default=0.80,
                    help="S2 test_recall threshold enforced by feature_stress.py")
    ap.add_argument("--out", default="")
    ap.add_argument("extra", nargs="*", help="extra args passed to train_mtnn.py")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    rows = [r for s in args.seeds if (r := one_run(s, args.extra)) is not None]
    if len(rows) < 2:
        print("need at least 2 successful runs to report a standard error")
        return 2

    K = len(rows)
    print(f"\n{K} seeds: {[r['seed'] for r in rows]}\n")
    print(f"  {'metric':13} {'mean':>9} {'sd':>8} {'SE':>8} {'95% CI':>19}  usable@K")
    summary = {}
    for m in METRICS:
        v = [r[m] for r in rows if r.get(m) is not None]
        if len(v) < 2:
            continue
        mu = sum(v) / len(v)
        sd = math.sqrt(sum((x - mu) ** 2 for x in v) / (len(v) - 1))
        se = sd / math.sqrt(len(v))
        lo, hi = mu - 1.96 * se, mu + 1.96 * se
        ok = "yes" if MDE_3V3.get(m, 9e9) < 0.02 else "NO"
        summary[m] = {"mean": round(mu, 4), "sd": round(sd, 4), "se": round(se, 4),
                      "ci95": [round(lo, 4), round(hi, 4)], "n": len(v)}
        print(f"  {m:13} {mu:>9.4f} {sd:>8.4f} {se:>8.4f} "
              f"[{lo:>8.4f},{hi:>8.4f}]  {ok}")

    tr = summary.get("test_recall")
    if tr:
        passes = sum(1 for r in rows if r["test_recall"] >= args.gate)
        print(f"\n  S2 gate (test_recall >= {args.gate}):")
        print(f"    individual seeds passing : {passes}/{K}")
        print(f"    K-seed MEAN              : {tr['mean']:.4f} "
              f"-> {'PASS' if tr['mean'] >= args.gate else 'FAIL'}")
        print(f"    95% CI                   : [{tr['ci95'][0]:.4f}, {tr['ci95'][1]:.4f}]")
        if tr["ci95"][0] < args.gate < tr["ci95"][1]:
            print(f"    THE CI STRADDLES THE GATE — this K cannot decide it. More seeds, "
                  f"or accept the decision is not supported by the evidence.")

    if args.out:
        Path(args.out).write_text(json.dumps(
            {"seeds": [r["seed"] for r in rows], "gate": args.gate,
             "summary": summary, "runs": rows}, indent=1) + "\n", encoding="utf-8")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
