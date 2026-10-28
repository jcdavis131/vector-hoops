#!/usr/bin/env python3
"""Post-hoc interleaved latency benchmark over saved Arm 1 checkpoints.

The in-run timer in train.py measures a 397-row forward pass, which is
microseconds of compute under Python overhead — identical models came
out 4x apart. This benchmark instead times a 3,970-row tiled batch,
interleaves variants round-robin (so a slow CPU minute hits all of
them), and reports the median seconds per 1000 rows per variant.
Model size (params x 4 bytes, float32) is deterministic and is
reported alongside; the pre-registered cost leg is judged on size
primarily, with latency as the corroborating measure.
"""
import json, time, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import train as T

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[3]

def main():
    d, feats, groups = T.load()
    Z, mask = d["Z"].astype(np.float64), d["mask"]
    pid, seas = d["player_id"], d["season"]
    by_pid = {}
    for i, (p, s) in enumerate(zip(pid, seas)):
        by_pid.setdefault(int(p), {})[int(s[:4])] = i
    fwd_in = np.array([i for i, s in enumerate(seas)
                       if s == "2024-25" and 2025 in by_pid[int(pid[i])]])
    big = np.tile(fwd_in, 10)  # 3970 rows
    tags = ["full_seed0", "full_seed1", "pruned30_seed0", "pruned30_seed1",
            "pruned50_seed0", "random30_seed0"]
    models = {}
    for tag in tags:
        f = OUT / "checkpoints" / f"{tag}.npz"
        if not f.exists():
            print(f"missing checkpoint {tag}, skipping"); continue
        z = np.load(f, allow_pickle=True)
        glist = [str(g) for g in z["groups"]]
        odims = {g: int(v) for g, v in zip(glist, z["out_dims"])}
        m = T.TowerModel({g: groups[g] for g in glist}, out_dims=odims, seed=0)
        m.P = {k: z[k] for k in z.files if k not in ("groups", "out_dims")}
        models[tag] = m
        print(tag, "params", m.n_params())
    # warmup
    for m in models.values():
        T.predict(m, Z, mask, big)
    times = {t: [] for t in models}
    for rnd in range(5):
        for tag, m in models.items():
            t0 = time.perf_counter()
            for _ in range(200):
                T.predict(m, Z, mask, big)
            times[tag].append((time.perf_counter() - t0) / 200)
    res = {}
    for tag, ts in times.items():
        med = float(np.median(ts))  # seconds per 3970-row pass
        res[tag] = {"s_per_1000_rows": med / len(big) * 1000,
                    "rounds_s_per_pass": ts,
                    "n_params": models[tag].n_params(),
                    "size_bytes_float32": models[tag].n_params() * 4}
    print(json.dumps(res, indent=1))
    (OUT / "latency_bench.json").write_text(json.dumps(res, indent=1))

if __name__ == "__main__":
    main()
