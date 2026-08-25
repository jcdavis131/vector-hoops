"""Greedy hill-climb over MTNN feature inputs (per family) and the fusion that
brings them together.

Why multi-seed is not optional here: measured seed spread on the shipping recipe
is test recall sd 0.088-0.122, CQS sd 1.61-2.30, purity sd 0.0046-0.0143
(docs/MTNN_STABILITY_2026-07-24.md §3b). Single-family effects in the 2026-07-24
masked ablation were ~0.06 test recall -- smaller than that noise. A single-seed
climb therefore chases sampling noise and will happily "improve" a model into a
worse one. Every candidate here is scored as a mean over >=2 seeds, and a step is
only accepted when the gain clears the noise floor AND every seed agrees on the
sign.

Objective: mean CQS (the project's promote metric, and the most stable of the
headline numbers). Guards mirror composite_score's promote slack -- a step that
wins on CQS but drops purity or test recall past the slack is rejected.

Families are *masked*, not excluded: values and mask bits are zeroed while the
tower stays, so fusion width is constant across arms and the delta measures
information content rather than a reshaped architecture.

Run:
  python pipeline/hill_climb.py --mode families --seeds 7,13 --rounds 2
  python pipeline/hill_climb.py --mode fusion  --seeds 7,13
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pipeline" / "data"
REPORT = DATA / "mtnn_report.json"
EMB = DATA / "embedding_v3.npz"
MANIFEST = DATA / "feature_manifest.json"
OUT = DATA / "hill_climb"
CACHE = OUT / "eval_cache.json"

# injury is a durability read-out head, never an input tower (see cf45fdb):
# as an input it measured -0.088 test recall.
NON_TOWER = {"injury"}

# Winner of the 2026-07-24 stability sweep: concat 32/160/2 @40ep, CQS mean
# 75.87 over 4 seeds. Climb starts from here.
# fmt: off
BASE_ARCH = [
    "--dim", "48",
    "--tower-width", "32",
    "--tower-hidden", "160",
    "--tower-blocks", "2",
    "--mlp-heads",
    "--d-head-hidden", "128",
    "--fusion", "concat",
    "--fusion-hidden", "256",
    "--nce-loss", "hybrid",
    "--nce-player-weight", "0.7",
    "--nce-arch-weight", "0.3",
    "--hard-neg-boost", "0.3",
    "--drop-p", "0.12",
    "--weight-decay", "0.0001",
    "--lr-schedule", "onecycle",
    "--warmup-pct", "0.1",
    "--anneal-strategy", "linear",
    "--batch", "512",
    "--val-every", "0",
    "--no-best-checkpoint",
]
# fmt: on

# Fusion / capacity candidates for the "universal MTNN" stage. Each entry
# overrides BASE_ARCH flags by name.
FUSION_GRID: dict[str, dict[str, str]] = {
    "concat_256_d48": {},
    "concat_384_d48": {"--fusion-hidden": "384"},
    "concat_512_d48": {"--fusion-hidden": "512"},
    "concat_256_d64": {"--dim": "64"},
    "concat_384_d64": {"--fusion-hidden": "384", "--dim": "64"},
    "concat_256_d32": {"--dim": "32"},
    # valid --fusion choices are gated|concat|transformer
    "transformer_256_d48": {"--fusion": "transformer"},
    "gated_256_d48": {"--fusion": "gated"},
}

# Accept a step only if mean CQS gains more than this. Noise on a 2-seed mean is
# ~1.61/sqrt(2) ~= 1.14, so 1.2 keeps steps above the floor.
MIN_GAIN = 1.2
PURITY_SLACK = 0.02
RECALL_SLACK = 0.02


def override(base: list[str], ov: dict[str, str]) -> list[str]:
    """Replace flag values in a flag list by name; append if absent."""
    out = list(base)
    for flag, val in ov.items():
        if flag in out:
            out[out.index(flag) + 1] = val
        else:
            out += [flag, val]
    return out


def families() -> list[str]:
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    fams = sorted(set(man["families"].values()) - NON_TOWER)
    return fams


def continuity(emb_path: Path) -> dict:
    """Same-player consecutive-season cosine; flat across eras = generalizing."""
    d = np.load(emb_path, allow_pickle=True)
    E = d["E"].astype(np.float32)
    pid = np.array(d["player_id"])
    yr = np.array([int(str(s)[:4]) for s in d["season"]])
    by_player: dict[int, dict[int, int]] = defaultdict(dict)
    for i, (p, y) in enumerate(zip(pid, yr, strict=False)):
        by_player[int(p)][int(y)] = i
    per_year: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for mm in by_player.values():
        for y, i in mm.items():
            j = mm.get(y + 1)
            if j is not None:
                per_year[y].append((i, j))
    vals = {}
    for y, prs in per_year.items():
        if len(prs) < 30:
            continue
        P = np.array(prs)
        vals[y] = float((E[P[:, 0]] * E[P[:, 1]]).sum(1).mean())
    modern = [v for y, v in vals.items() if y >= 2016]
    return {
        "continuity_min": round(min(modern), 4) if modern else None,
        "continuity_spread": round(max(modern) - min(modern), 4) if modern else None,
    }


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(c: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(c, indent=1), encoding="utf-8")


def run_one(
    tag: str, arch: list[str], masked: list[str], seed: int, epochs: int
) -> dict:
    cmd = [
        sys.executable,
        str(ROOT / "pipeline" / "train_mtnn.py"),
        "--seed",
        str(seed),
        "--epochs",
        str(epochs),
        *arch,
    ]
    if masked:
        cmd += ["--mask-families", ",".join(sorted(masked))]
    subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True)
    rep = json.loads(REPORT.read_text(encoding="utf-8"))
    dest = OUT / f"{tag}_s{seed}"
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy(REPORT, dest / "mtnn_report.json")
    h = rep["held_out_recall"]
    row = {
        "cqs": rep["composite"]["cqs"],
        "test_recall": h["test"]["recall_at_10_mtnn"],
        "all_recall": h["all"]["recall_at_10_mtnn"],
        "purity": rep.get("cross_era_archetype_neighbor_purity_at_20"),
        "position_acc": rep.get("position_top1_acc"),
    }
    row.update(continuity(EMB))
    return row


def evaluate(
    tag: str,
    arch: list[str],
    masked: list[str],
    seeds: list[int],
    epochs: int,
    cache: dict,
) -> dict:
    """Mean over seeds, cached by (tag, seed, epochs)."""
    rows = []
    for seed in seeds:
        key = f"{tag}|s{seed}|e{epochs}"
        if key not in cache:
            cache[key] = run_one(tag, arch, masked, seed, epochs)
            save_cache(cache)
        rows.append(cache[key])
    agg = {"tag": tag, "masked": sorted(masked), "seeds": seeds, "n": len(rows)}
    for k in ("cqs", "test_recall", "all_recall", "purity", "continuity_spread"):
        vals = [r[k] for r in rows if r.get(k) is not None]
        agg[k] = round(float(np.mean(vals)), 4) if vals else None
        agg[f"{k}_per_seed"] = vals
    return agg


def passes_guards(cand: dict, incumbent: dict) -> tuple[bool, str]:
    if cand["purity"] < incumbent["purity"] - PURITY_SLACK:
        return False, f"purity {cand['purity']:.4f} < {incumbent['purity']:.4f}-slack"
    if cand["test_recall"] < incumbent["test_recall"] - RECALL_SLACK:
        return (
            False,
            f"test {cand['test_recall']:.3f} < {incumbent['test_recall']:.3f}-slack",
        )
    return True, ""


def same_sign(cand: dict, incumbent: dict) -> bool:
    """Every seed must agree the candidate is better -- kills noise-driven steps."""
    a, b = cand.get("cqs_per_seed") or [], incumbent.get("cqs_per_seed") or []
    if len(a) != len(b) or not a:
        return False
    return all(x > y for x, y in zip(a, b, strict=False))


def climb_families(seeds: list[int], epochs: int, rounds: int) -> dict:
    cache = load_cache()
    fams = families()
    masked: list[str] = []
    incumbent = evaluate("full", BASE_ARCH, [], seeds, epochs, cache)
    print(
        f"start: cqs={incumbent['cqs']:.2f} test={incumbent['test_recall']:.3f} "
        f"purity={incumbent['purity']:.4f}",
        flush=True,
    )
    history = [incumbent]
    for rnd in range(1, rounds + 1):
        best, best_fam, best_reason = None, None, ""
        for fam in fams:
            if fam in masked:
                continue
            trial = sorted([*masked, fam])
            tag = "drop_" + "_".join(trial)
            cand = evaluate(tag, BASE_ARCH, trial, seeds, epochs, cache)
            ok, why = passes_guards(cand, incumbent)
            gain = cand["cqs"] - incumbent["cqs"]
            flag = "" if ok else f"  [guard: {why}]"
            print(
                f"  r{rnd} mask {fam:12s} cqs={cand['cqs']:7.2f} "
                f"({gain:+.2f}) test={cand['test_recall']:.3f} "
                f"purity={cand['purity']:.4f}{flag}",
                flush=True,
            )
            if not ok:
                continue
            if best is None or cand["cqs"] > best["cqs"]:
                best, best_fam, best_reason = cand, fam, ""
        if best is None:
            print(f"  r{rnd}: no candidate passed guards — stop", flush=True)
            break
        gain = best["cqs"] - incumbent["cqs"]
        if gain <= MIN_GAIN:
            print(
                f"  r{rnd}: best gain {gain:+.2f} <= MIN_GAIN {MIN_GAIN} — stop",
                flush=True,
            )
            break
        if not same_sign(best, incumbent):
            print(
                f"  r{rnd}: best ({best_fam}) gain {gain:+.2f} but seeds disagree — stop",
                flush=True,
            )
            break
        masked.append(best_fam)
        incumbent = best
        history.append(best)
        print(
            f"  r{rnd}: ACCEPT mask {best_fam} -> cqs={best['cqs']:.2f} {best_reason}",
            flush=True,
        )
    return {
        "mode": "families",
        "masked": masked,
        "incumbent": incumbent,
        "history": history,
    }


def climb_fusion(seeds: list[int], epochs: int) -> dict:
    cache = load_cache()
    rows = []
    for name, ov in FUSION_GRID.items():
        arch = override(BASE_ARCH, ov)
        cand = evaluate(f"fusion_{name}", arch, [], seeds, epochs, cache)
        cand["override"] = ov
        rows.append(cand)
        print(
            f"  {name:16s} cqs={cand['cqs']:7.2f} test={cand['test_recall']:.3f} "
            f"purity={cand['purity']:.4f} spread={cand['continuity_spread']}",
            flush=True,
        )
    rows.sort(key=lambda r: -r["cqs"])
    return {"mode": "fusion", "ranked": rows, "winner": rows[0]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["families", "fusion"], default="families")
    ap.add_argument("--seeds", default="7,13")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--rounds", type=int, default=2)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    seeds = [int(s) for s in args.seeds.split(",") if s]
    OUT.mkdir(parents=True, exist_ok=True)
    if args.mode == "families":
        res = climb_families(seeds, args.epochs, args.rounds)
    else:
        res = climb_fusion(seeds, args.epochs)
    out = OUT / (args.out or f"{args.mode}_result.json")
    out.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
