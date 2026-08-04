"""Re-judge the two hoops A/Bs with PAIRED statistics, the design they actually used.

f25702b established the floor was computed unpaired for paired experiments. Both verdicts
were "inside seed noise". A paired t-test on the per-seed differences is the test the design
called for, and it is ~7x more sensitive on test_recall.

Nothing is re-run. The per-seed numbers are already on disk.
"""
import json
import sys

import numpy as np
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SC = (r"C:\Users\jcdav\AppData\Local\Temp\claude\C--Users-jcdav"
      r"\be69d382-ce38-4d23-b6d1-d92c62546c02\scratchpad\hoops_ab")

EXPTS = {
    "honors mask fix (a5c20b0)": ("ab_results.json", "A_prefix", "B_postfix"),
    "reliability-weight 0.4 (2d894fd)": (("seedfloor.json", "relweight04.json"), None, None),
}

# --- experiment 1: honors, 3 paired seeds -------------------------------------
rows = json.load(open(rf"{SC}\ab_results.json", encoding="utf-8"))
A = {r["seed"]: r for r in rows if r["arm"].startswith("A")}
B = {r["seed"]: r for r in rows if r["arm"].startswith("B")}
seeds = sorted(set(A) & set(B))
print(f"=== honors mask fix (a5c20b0) — {len(seeds)} paired seeds {seeds} ===")
print(f"  {'metric':12} {'mean delta':>11} {'sd of delta':>12} {'paired t p':>11}  verdict")
for m in ("cqs", "recall", "purity", "archetype", "next_r2"):
    if any(m not in A[s] or m not in B[s] for s in seeds):
        continue
    a = np.array([A[s][m] for s in seeds], float)
    b = np.array([B[s][m] for s in seeds], float)
    d = b - a
    t = stats.ttest_rel(b, a)
    v = "SIGNIFICANT" if t.pvalue < 0.05 else "not significant"
    print(f"  {m:12} {d.mean():>+11.4f} {d.std(ddof=1):>12.4f} {t.pvalue:>11.3f}  {v}")

# --- experiment 2: reliability weight, 8 paired seeds -------------------------
b8 = {x["seed"]: x for x in json.load(open(rf"{SC}\seedfloor.json", encoding="utf-8"))}
r8 = {x["seed"]: x for x in json.load(open(rf"{SC}\relweight04.json", encoding="utf-8"))}
seeds8 = sorted(set(b8) & set(r8))
print(f"\n=== reliability-weight 0.4 (2d894fd) — {len(seeds8)} paired seeds ===")
print(f"  {'metric':12} {'mean delta':>11} {'sd of delta':>12} {'paired t p':>11}  verdict")
for m in ("test_recall", "cqs", "purity"):
    a = np.array([b8[s][m] for s in seeds8], float)
    b = np.array([r8[s][m] for s in seeds8], float)
    d = b - a
    t = stats.ttest_rel(b, a)
    v = "SIGNIFICANT" if t.pvalue < 0.05 else "not significant"
    print(f"  {m:12} {d.mean():>+11.4f} {d.std(ddof=1):>12.4f} {t.pvalue:>11.3f}  {v}")

print("\n  Note: a paired t-test on n=3 has 2 degrees of freedom. It is more sensitive than")
print("  the unpaired floor implied, and still weak in absolute terms.")
