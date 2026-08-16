"""Embedding-quality scoreboard — held-out adjacent-season retrieval.

The one number that says whether the shipped embedding space actually
works: query with a player's season N, does that SAME player's season
N+1 come back in the top-5 nearest neighbors? Computed exclusively from
committed assets, so anyone cloning the repo reproduces it bit-for-bit:

  assets/mtnn_embeddings.f32   the shipped 48-d L2 space (row-major f32)
  assets/vectors.json          row alignment + the transparent 14-d v
  pipeline/cache/dashbase_*    committed season caches -> stable PLAYER_ID

Protocol (mirrors train_mtnn.recall_at_k, but exhaustive — no sampling):
  - pairs keyed by stats.nba.com PLAYER_ID, never display name
    (names collide across careers; ambiguous (name, season) rows are
    EXCLUDED and counted, never guessed)
  - cohort = the full space minus the query row itself. Era honesty is
    built into the space (features are z-scored within season), so every
    era is a fair candidate — same doctrine as the training metric.
  - ties handled pessimistically: rank = #(strictly greater) + #(equal,
    excluding the target), so a hit never depends on sort order.
  - splits follow train_mtnn.eval_split on the TARGET season: train
    <=2021, val 2022-23, test >=2024. Only val/test targets are truly
    held out — pairs with train-split targets were InfoNCE positives.

Named baselines: the transparent 14-d era-z game profile (vectors.json
"v", L2-normalized cosine — the exact promotion-gate baseline) and the
random-rank expectation k/(n-1). No invented numbers anywhere.

Run:  python pipeline/build_eval_scoreboard.py
Gate: python pipeline/test_eval_scoreboard.py   (wired in update_dataset.py)
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import canonical_name  # noqa: E402

ASSETS = ROOT / "assets"
CACHE = ROOT / "pipeline" / "cache"
VECTORS = ASSETS / "vectors.json"
EMB = ASSETS / "mtnn_embeddings.f32"
META = ASSETS / "mtnn_meta.json"
OUT = ASSETS / "eval_scoreboard.json"

TOP_KS = (1, 5)
BATCH = 512


def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def eval_split(season: str) -> str:
    """Same doctrine as train_mtnn.eval_split (keyed on the target row)."""
    y = season_start_year(season)
    if y <= 2021:
        return "train"
    if y <= 2023:
        return "val"
    return "test"


def decade_label(season: str) -> str:
    y = season_start_year(season)
    if y < 2000:
        return "1996-1999"
    return f"{(y // 10) * 10}s"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_space() -> tuple[list[dict], np.ndarray, np.ndarray, dict]:
    """Committed assets only: players, MTNN space, transparent 14-d space."""
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    meta = json.loads(META.read_text(encoding="utf-8"))
    n, dim = int(meta["rows"]), int(meta["dim"])
    raw = EMB.read_bytes()
    if len(raw) != n * dim * 4:
        raise SystemExit(f"{EMB.name}: {len(raw)} bytes != rows*dim*4 ({n}x{dim}x4)")
    if n != len(players):
        raise SystemExit(f"row mismatch: meta {n} vs vectors {len(players)}")
    E = np.frombuffer(raw, dtype=np.float32).reshape(n, dim).astype(np.float64)
    # Shipped space is L2-normalized; renormalize defensively for cosine.
    E /= np.maximum(np.linalg.norm(E, axis=1, keepdims=True), 1e-12)

    V = np.array([p["v"] for p in players], dtype=np.float64)
    V /= np.maximum(np.linalg.norm(V, axis=1, keepdims=True), 1e-12)
    return players, E, V, meta


def resolve_pids(players: list[dict]) -> tuple[np.ndarray, dict]:
    """(name, season) -> stable PLAYER_ID from the committed dashbase caches.

    Returns pid per row (-1 where the name is ambiguous inside its own
    season — those rows are excluded from pairing, never guessed).
    """
    seasons = sorted({p["season"] for p in players})
    by_season: dict[str, dict[str, set[int]]] = {}
    for s in seasons:
        path = CACHE / f"dashbase_{s}.json"
        rows = json.loads(path.read_text(encoding="utf-8"))
        m: dict[str, set[int]] = defaultdict(set)
        for r in rows:
            m[canonical_name(str(r["PLAYER_NAME"]))].add(int(r["PLAYER_ID"]))
        by_season[s] = m

    pids = np.full(len(players), -1, dtype=np.int64)
    missing = ambiguous = 0
    for i, p in enumerate(players):
        cand = by_season[p["season"]].get(canonical_name(p["name"]), set())
        if len(cand) == 1:
            pids[i] = next(iter(cand))
        elif len(cand) == 0:
            missing += 1
        else:
            ambiguous += 1
    return pids, {"rows_name_not_in_cache": missing, "rows_ambiguous_name": ambiguous}


def adjacent_pairs(players: list[dict], pids: np.ndarray) -> np.ndarray:
    """Same-PLAYER_ID consecutive-start-year row pairs (query, target)."""
    by_pid: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for i, p in enumerate(players):
        if pids[i] >= 0:
            by_pid[int(pids[i])].append((season_start_year(p["season"]), i))
    pairs = []
    for rows in by_pid.values():
        rows.sort()
        for (y1, i1), (y2, i2) in zip(rows, rows[1:]):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return np.array(sorted(pairs), dtype=np.int64)


def retrieval_ranks(space: np.ndarray, pairs: np.ndarray) -> np.ndarray:
    """Pessimistic rank of each target among all non-self candidates."""
    ranks = np.empty(len(pairs), dtype=np.int64)
    for lo in range(0, len(pairs), BATCH):
        chunk = pairs[lo : lo + BATCH]
        q, t = chunk[:, 0], chunk[:, 1]
        sims = space[q] @ space.T  # (b, n)
        rows = np.arange(len(chunk))
        target_sim = sims[rows, t]
        sims[rows, q] = -np.inf  # exclude self from the cohort
        greater = (sims > target_sim[:, None]).sum(axis=1)
        ties = (sims == target_sim[:, None]).sum(axis=1) - 1  # minus target
        ranks[lo : lo + BATCH] = greater + np.maximum(ties, 0)
    return ranks


def bucket_rates(ranks: np.ndarray, pairs: np.ndarray, players: list[dict]) -> dict:
    def rates(idx: np.ndarray) -> dict:
        sub = ranks[idx]
        out = {"n": int(len(sub))}
        for k in TOP_KS:
            out[f"top{k}"] = round(float((sub < k).mean()), 4) if len(sub) else None
        return out

    all_idx = np.arange(len(pairs))
    by_split: dict[str, list[int]] = defaultdict(list)
    by_decade: dict[str, list[int]] = defaultdict(list)
    for j, (a, b) in enumerate(pairs):
        by_split[eval_split(players[b]["season"])].append(j)
        by_decade[decade_label(players[a]["season"])].append(j)
    return {
        "overall": rates(all_idx),
        "by_split": {s: rates(np.array(ix)) for s, ix in sorted(by_split.items())},
        "by_decade": {d: rates(np.array(ix)) for d, ix in sorted(by_decade.items())},
    }


def compute_scoreboard() -> dict:
    players, E, V, meta = load_space()
    n = len(players)
    pids, pid_notes = resolve_pids(players)
    pairs = adjacent_pairs(players, pids)

    mtnn = bucket_rates(retrieval_ranks(E, pairs), pairs, players)
    base = bucket_rates(retrieval_ranks(V, pairs), pairs, players)

    last_year = max(season_start_year(p["season"]) for p in players)
    final_season_rows = sum(1 for p in players if season_start_year(p["season"]) == last_year)
    return {
        "metric": "held_out_adjacent_season_retrieval",
        "description": (
            "Query the shipped 48-d MTNN space with a player's season N; "
            "hit if that same player's season N+1 (keyed by stable NBA "
            "PLAYER_ID) ranks in the top-k nearest neighbors among all "
            f"{n} player-seasons (self excluded). Only val/test-split "
            "targets are truly held out; train-split pairs were InfoNCE "
            "positives during training."
        ),
        "protocol": {
            "cohort": (
                f"full {n}-row space minus the query row; features are "
                "z-scored within season, so cross-era candidates are "
                "era-honest by construction (train_mtnn.recall_at_k "
                "doctrine, computed exhaustively — no sampling)"
            ),
            "pairing": "stable PLAYER_ID from committed dashbase_* caches",
            "tie_handling": "pessimistic (ties count against the target)",
            "splits": "target season: train <=2021, val 2022-23, test >=2024",
            "decades": "keyed on the query season start year",
        },
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "embedding_asset": {
            "path": "assets/mtnn_embeddings.f32",
            "sha256": sha256_file(EMB),
            "rows": n,
            "dim": int(meta["dim"]),
            "model": meta.get("model"),
            "built": meta.get("built"),
        },
        "vectors_asset": {
            "path": "assets/vectors.json",
            "sha256": sha256_file(VECTORS),
            "rows": n,
        },
        "eligible_pairs": int(len(pairs)),
        "pair_accounting": {
            "player_season_rows": n,
            **pid_notes,
            "rows_final_season_cannot_have_next": final_season_rows,
            "note": (
                "rows without an eligible pair: final charted season, "
                "career gap/end, seasons below the vectors.json "
                "eligibility floor, or ambiguous name-in-season rows "
                "(excluded, never guessed)"
            ),
        },
        "results": {
            "mtnn": mtnn,
            "baseline_transparent_14d": {
                "name": "transparent 14-d era-z game profile (vectors.json v, cosine)",
                **base,
            },
            "baseline_random": {
                "name": "random-rank expectation k/(n-1)",
                "top1": round(1.0 / (n - 1), 6),
                "top5": round(5.0 / (n - 1), 6),
            },
        },
    }


def main() -> None:
    board = compute_scoreboard()
    OUT.write_text(json.dumps(board, indent=1), encoding="utf-8")
    r = board["results"]
    print(
        f"wrote {OUT.name}: {board['eligible_pairs']} eligible pairs | "
        f"mtnn top1/top5 {r['mtnn']['overall']['top1']}/"
        f"{r['mtnn']['overall']['top5']} vs 14d "
        f"{r['baseline_transparent_14d']['overall']['top1']}/"
        f"{r['baseline_transparent_14d']['overall']['top5']}"
    )
    for split, row in r["mtnn"]["by_split"].items():
        print(f"  {split:5s} n={row['n']:5d} top1={row['top1']} top5={row['top5']}")


if __name__ == "__main__":
    main()
