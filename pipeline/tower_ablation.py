"""Mask-one-family MTNN ablation, paired by seed.

Every arm trains the climb's measured recipe (pipeline/recipes/measure.json,
held equal to herdmux gpu/climb.py by tests/test_recipes.py) with one family's
values and mask bits zeroed, over the same seed list as the full model, and
is scored on CQS deltas paired by seed with the climb's rule: a family's
effect counts only when the paired t of (arm CQS - full CQS) clears 3.5
(herdmux gpu/climb.py PAIRED_T).

Until 2026-10-09 this ran one seed (7) for 25 epochs on a hardcoded recipe
that no longer shipped (--dim 48, NCE 0.7/0.3, hard-neg 0.3, against the
climb's dim 64 and the trainer's 0.65/0.35/0.4), labelled each family KEEP
when its test recall fell by less than 0.01 -- one subsample sd and a third
of the seed sd (0.031) -- and read pipeline/data/mtnn_report.json, the shared
last-run report, after each arm [eval#13].

Each run trains into its own train_mtnn --run-dir under
pipeline/data/tower_ablation/ and is read from there.

Run:  python pipeline/tower_ablation.py --device cuda [--seeds 5,7,13,21] [--families context]
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
MANIFEST = DATA / "feature_manifest.json"
OUT = DATA / "tower_ablation"
SUMMARY = DATA / "tower_ablation.json"
RECIPE = "measure"
REPORT_NAME = "mtnn_report.json"
# herdmux gpu/climb.py PAIRED_T: |t| >= 3.5 on per-seed differences.
PAIRED_T = 3.5

# All context / extension families in integrate_context.py (2026-07).
CONTEXT_FAMS = (
    "roster",
    "career",
    "competition",
    "market",
    "team",
    "form",
    "pedigree",
    "playoffs",
)

# injury never becomes an input tower (see train_mtnn.INJURY_FEATURES) -- it is
# the durability head's target, so ablating it as a tower is meaningless.
NON_TOWER_FAMS = {"injury"}


def manifest_families() -> list[str]:
    """Every family that actually becomes a tower, read from the manifest."""
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return sorted(set(man.get("families", {}).values()) - NON_TOWER_FAMS)


def run_dir(name: str, seed: int) -> Path:
    return OUT / f"{name}_s{seed}"


def train_cmd(exclude: list[str], seed: int, epochs: int | None, device: str | None) -> list[str]:
    cmd = [sys.executable, str(ROOT / "pipeline" / "train_mtnn.py"), "--recipe", RECIPE, "--seed", str(seed)]
    if epochs is not None:
        cmd += ["--epochs", str(epochs)]
    if device is not None:
        cmd += ["--device", device]
    if exclude:
        # mask, don't delete: keeps fusion width constant across arms so the
        # delta measures information content, not a re-shaped architecture
        cmd += ["--mask-families", ",".join(exclude)]
    return cmd


def run_train(name: str, exclude: list[str], seed: int, epochs: int | None, device: str | None) -> dict:
    out = run_dir(name, seed)
    subprocess.run([*train_cmd(exclude, seed, epochs, device), "--run-dir", str(out)], cwd=ROOT, check=True)
    return json.loads((out / REPORT_NAME).read_text(encoding="utf-8"))


def row(rep: dict) -> dict:
    h = rep["held_out_recall"]
    return {
        "cqs": rep["composite"]["cqs"],
        "test_recall": h["test"]["recall_at_10_mtnn"],
        "val_recall": h["val"]["recall_at_10_mtnn"],
        # test is ~790 pairs; the all-pairs figure is ~10k pairs, so its
        # sampling noise is ~3.5x smaller.
        "all_recall": h.get("all", {}).get("recall_at_10_mtnn"),
        "purity": rep.get("cross_era_archetype_neighbor_purity_at_20"),
    }


def paired(arm: list[float], base: list[float]) -> dict:
    """Mean and paired t of arm - base over seeds (same order)."""
    d = [a - b for a, b in zip(arm, base, strict=True)]
    mean = statistics.fmean(d)
    sd = statistics.stdev(d) if len(d) > 1 else float("nan")
    t = mean / (sd / math.sqrt(len(d))) if len(d) > 1 and sd > 0 else None
    return {"n": len(d), "mean": round(mean, 4), "sd": round(sd, 4), "t": None if t is None else round(t, 2)}


def verdict(cqs: dict) -> str:
    t = cqs["t"]
    if t is not None and t <= -PAIRED_T:
        return "family helps"  # masking it lowers CQS beyond paired seed noise
    if t is not None and t >= PAIRED_T:
        return "family hurts"
    return "inside paired noise"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="5,7,13,21", help="comma-separated; at least 2, the same for every arm")
    ap.add_argument("--epochs", type=int, default=None, help="override the recipe's --epochs (40)")
    ap.add_argument(
        "--device",
        default=None,
        help="passed to train_mtnn (its default is cpu). The climb measures on cuda; a cpu run is not comparable",
    )
    ap.add_argument(
        "--families",
        choices=("all", "context"),
        default="all",
        help="'all' ablates every tower in the manifest; 'context' only the "
        "integrate_context extensions (the original 2026-07 scope)",
    )
    args = ap.parse_args()

    seeds = [int(s) for s in args.seeds.split(",") if s.strip()]
    if len(seeds) < 2:
        raise SystemExit(f"--seeds {args.seeds!r}: a paired comparison needs at least 2 seeds")
    fams = manifest_families() if args.families == "all" else list(CONTEXT_FAMS)
    configs: list[tuple[str, list[str]]] = [("full", [])]
    configs += [(f"drop_{fam}", [fam]) for fam in fams]
    configs.append(("drop_form_pedigree", ["form", "pedigree"]))

    # train_mtnn refuses a --run-dir that already holds a report; say so before
    # training anything.
    taken = [run_dir(n, s) for n, _ in configs for s in seeds if (run_dir(n, s) / REPORT_NAME).exists()]
    if taken:
        raise SystemExit(
            "these run directories already hold a run; move or delete them first: "
            + ", ".join(str(p.relative_to(ROOT)) for p in taken)
        )
    print(f"ablating {len(fams)} families over seeds {seeds}: {fams}")

    per: dict[str, list[dict]] = {}
    for name, excl in configs:
        per[name] = []
        for seed in seeds:
            print(f"\n=== {name} seed {seed} exclude={excl or 'none'} ===", flush=True)
            per[name].append(row(run_train(name, excl, seed, args.epochs, args.device)))

    def col(name: str, k: str) -> list[float]:
        return [r[k] for r in per[name]]

    base_test = statistics.fmean(col("full", "test_recall"))
    results = {}
    print(f"\n=== ABLATION SUMMARY (vs full, paired over {len(seeds)} seeds; |t| >= {PAIRED_T} to count) ===")
    for name, excl in configs:
        res = {
            "exclude": excl,
            "seeds": seeds,
            "per_seed": per[name],
            # Means over seeds, under the keys feature_stress.py reads.
            "test_recall": round(statistics.fmean(col(name, "test_recall")), 4),
            "val_recall": round(statistics.fmean(col(name, "val_recall")), 4),
            "cqs": round(statistics.fmean(col(name, "cqs")), 4),
        }
        if name != "full":
            res["paired"] = {k: paired(col(name, k), col("full", k)) for k in ("cqs", "val_recall", "test_recall")}
            res["verdict"] = verdict(res["paired"]["cqs"])
            p = res["paired"]["cqs"]
            print(f"  {name:22s} dCQS {p['mean']:+.2f} (sd {p['sd']:.2f}, t {p['t']}) -> {res['verdict']}")
        results[name] = res

    SUMMARY.write_text(
        json.dumps(
            {
                "recipe": RECIPE,
                "epochs": args.epochs,
                "device": args.device,
                "seeds": seeds,
                "paired_t": PAIRED_T,
                "baseline_test": round(base_test, 4),
                "runs": results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nwrote {SUMMARY}")


if __name__ == "__main__":
    main()
