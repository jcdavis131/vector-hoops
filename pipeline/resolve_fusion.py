"""Is fusion-hidden 384 better than 256 at dim 64, or is it two seeds of luck?

Round 1's family search accepted nothing: every family whose removal lifted
recall cost purity, and the winner failed `same_sign` because seed 7 disagreed.
The one result that survived pairing was not a family at all — widening
fusion-hidden from 256 to 384 at dim 64 raised purity on both seeds:

    s7   0.7345 -> 0.7531   (+0.0187, 4.4 sd of the 0.0042 measured here)
    s13  0.7396 -> 0.7641   (+0.0245, 5.8 sd)

Two seeds agreeing is `same_sign`'s bar, and `same_sign` is a sign test: with
n=2 it fires on a coin flip one time in four. That is not enough to change a
deployed model over, and those rows were also written in an earlier session —
measured run-to-run drift for an identical config on an identical seed is about
0.02 CQS and 0.024 recall, so cross-session rows are only loosely comparable.

This adds seeds 5 and 21 to both configurations. `evaluate` caches by
(tag, seed, epochs), so 7 and 13 are reused and only the new work runs. Four
seeds is `composite_score.PROMOTE_SEEDS_TARGET`.

It reports **paired** differences, not means. Seed variance is largely shared —
a seed that draws badly draws badly for both configurations — and pairing
removes that shared term. Comparing the means is what made round 1's family
table look like a leaderboard when every entry was one seed's bad draw.

Nothing here writes a model. train_mtnn.py ships artifacts only under
--write-artifacts and hill_climb never passes it.

    python pipeline/resolve_fusion.py --seeds 5,7,13,21
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hill_climb as hc  # noqa: E402

CONTROL = "fusion_concat_256_d64"
WIDER = "fusion_concat_384_d64"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="5,7,13,21")
    ap.add_argument("--epochs", type=int, default=20)
    args = ap.parse_args()
    seeds = [int(s) for s in args.seeds.split(",") if s]

    cache = hc.load_cache()
    arch_c = hc.override(hc.BASE_ARCH, hc.FUSION_GRID["concat_256_d64"])
    arch_w = hc.override(hc.BASE_ARCH, hc.FUSION_GRID["concat_384_d64"])

    have = [s for s in seeds if f"{CONTROL}|s{s}|e{args.epochs}" in cache
            and f"{WIDER}|s{s}|e{args.epochs}" in cache]
    print(f"seeds {seeds}, {len(have)} already cached for both: {have}", flush=True)

    # Seed outer, configuration inner. Running every seed of the control first
    # means the first *paired* comparison costs five trials; this way each seed
    # completes a pair, so two trials already say something and a run that is
    # interrupted leaves whole pairs rather than a lopsided cache.
    for s in seeds:
        hc.evaluate(CONTROL, arch_c, [], [s], args.epochs, cache)
        hc.evaluate(WIDER, arch_w, [], [s], args.epochs, cache)

    print("\n  seed   cqs 256 -> 384        purity 256 -> 384         recall 256 -> 384")
    rows = []
    for s in seeds:
        a = cache.get(f"{CONTROL}|s{s}|e{args.epochs}")
        b = cache.get(f"{WIDER}|s{s}|e{args.epochs}")
        if not a or not b:
            continue
        rows.append((s, b["cqs"] - a["cqs"], b["purity"] - a["purity"],
                     b["test_recall"] - a["test_recall"]))
        print(f"  s{s:<4}  {a['cqs']:6.2f} -> {b['cqs']:6.2f} ({b['cqs']-a['cqs']:+5.2f})   "
              f"{a['purity']:.4f} -> {b['purity']:.4f} ({b['purity']-a['purity']:+.4f})   "
              f"{a['test_recall']:.3f} -> {b['test_recall']:.3f}")

    if len(rows) < 2:
        print("\n  not enough paired seeds yet — run again, the cache resumes")
        return 2

    for name, i in (("cqs", 1), ("purity", 2), ("recall", 3)):
        d = [r[i] for r in rows]
        pos = sum(1 for x in d if x > 0)
        mean = st.mean(d)
        sd = st.stdev(d) if len(d) > 1 else float("nan")
        print(f"\n  {name}: mean {mean:+.4f}  sd {sd:.4f}  n {len(d)}  "
              f"positive on {pos} of {len(d)} seeds")
        if len(d) > 1 and sd > 0:
            print(f"    paired t {mean / (sd / len(d) ** 0.5):+.2f}")

    out = hc.OUT / "fusion_384_vs_256_d64.json"
    out.write_text(json.dumps({"seeds": seeds, "epochs": args.epochs,
                               "rows": [{"seed": r[0], "dcqs": r[1], "dpurity": r[2],
                                         "drecall": r[3]} for r in rows]}, indent=1),
                   encoding="utf-8")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
