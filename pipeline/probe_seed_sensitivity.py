"""Per-player diagnosis of why some seeds land in sweep_stability's "bad basin".

2026-07-30 finding (long arm, seed 42 vs seed 7, transition 2024-25->2025-26):
seed 42's continuity_min=0.5556 and test_recall=0.484 (vs 0.75-0.83 / 0.79-0.83
for the other 5 seeds) look like a broad collapse, but purity/position_acc and
every earlier-season transition are normal for seed 42 — the damage is confined
to the newest partial season. Per-player diff vs seed 7 shows it is NOT a few
outliers: the whole 397-player cohort shifts down (median cos 0.783->0.565,
p1 0.496->0.180), and the worst-hit names (Quenton Jackson, Collin Gillespie,
Peyton Watson, Rayan Rupert, Julian Strawther, Reed Sheppard, ...) are deep
bench/rookie/2-way players, while the least-affected (SGA, Mitchell, Randle,
Lonzo Ball) are high-minutes stars. Reading: that seed's init/batch-order
reaches a basin that is specifically fragile on low-signal (low-GP/MIN, noisy
per-game stat) player-seasons, not a generic quality regression. test_recall
and continuity_min are both defined on this same newest-season slice, so one
fragile seed tanks two headline metrics at once and looks worse than it is.
Actionable lever this points at (not yet tried): sample-weight or regularize
by games-played/minutes reliability so low-signal rows can't swing a seed's
basin this hard — distinct from the four already-exhausted levers (inputs,
features, capacity, fusion).

Run:  python pipeline/probe_seed_sensitivity.py --arm long --seed-a 42 --seed-b 7 --y0 2024 --y1 2025
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SNAP = ROOT / "pipeline" / "data" / "sweep_stability"


def load(p: Path):
    d = np.load(p, allow_pickle=True)
    E = d["E"].astype(np.float32)
    pid = np.array(d["player_id"])
    yr = np.array([int(str(s)[:4]) for s in d["season"]])
    name = np.array(d["name"])
    by_player: dict[int, dict[int, tuple[int, str]]] = {}
    for i, (p_, y, n) in enumerate(zip(pid, yr, name, strict=False)):
        by_player.setdefault(int(p_), {})[int(y)] = (i, str(n))
    return E, by_player


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default="long")
    ap.add_argument("--seed-a", type=int, required=True, help="the seed under investigation")
    ap.add_argument("--seed-b", type=int, required=True, help="reference/healthy seed")
    ap.add_argument("--y0", type=int, required=True, help="transition start year")
    ap.add_argument("--y1", type=int, required=True, help="transition end year")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()

    pa = SNAP / f"{args.arm}_s{args.seed_a}" / "embedding_v3.npz"
    pb = SNAP / f"{args.arm}_s{args.seed_b}" / "embedding_v3.npz"
    Ea, bpa = load(pa)
    Eb, bpb = load(pb)

    rows = []
    for pid, mm in bpa.items():
        if args.y0 not in mm or args.y1 not in mm or pid not in bpb:
            continue
        mmb = bpb[pid]
        if args.y0 not in mmb or args.y1 not in mmb:
            continue
        i0, name = mm[args.y0]
        i1, _ = mm[args.y1]
        j0, _ = mmb[args.y0]
        j1, _ = mmb[args.y1]
        cos_a = float(np.dot(Ea[i0], Ea[i1]))
        cos_b = float(np.dot(Eb[j0], Eb[j1]))
        rows.append((pid, name, cos_a, cos_b, cos_b - cos_a))

    rows.sort(key=lambda r: r[4], reverse=True)
    ca = np.array([r[2] for r in rows])
    cb = np.array([r[3] for r in rows])

    print(f"transition {args.y0}->{args.y1}: n_players={len(rows)}")
    print(f"seed{args.seed_a} mean={ca.mean():.4f}  seed{args.seed_b} mean={cb.mean():.4f}")
    print(f"\nWorst {args.top} — seed{args.seed_a} much worse than seed{args.seed_b}:")
    for pid, name, c_a, c_b, gap in rows[: args.top]:
        print(f"  {name:28s} pid={pid:7d}  seed{args.seed_a}={c_a:.3f}  seed{args.seed_b}={c_b:.3f}  gap={gap:.3f}")
    print("\nBest 10 (least affected, for contrast):")
    for pid, name, c_a, c_b, gap in rows[-10:]:
        print(f"  {name:28s} pid={pid:7d}  seed{args.seed_a}={c_a:.3f}  seed{args.seed_b}={c_b:.3f}  gap={gap:.3f}")
    print(f"\nseed{args.seed_a} percentiles p1/p5/p25/p50:", np.percentile(ca, [1, 5, 25, 50]).round(3))
    print(f"seed{args.seed_b} percentiles p1/p5/p25/p50:", np.percentile(cb, [1, 5, 25, 50]).round(3))
    print(f"count cos<0.3 -> seed{args.seed_a}:", int((ca < 0.3).sum()), f" seed{args.seed_b}:", int((cb < 0.3).sum()))


if __name__ == "__main__":
    main()
