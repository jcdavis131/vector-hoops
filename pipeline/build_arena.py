"""Build assets/arena/ — the compact bundle for the mobile-first guessing game.

The game (index.html) shows one anonymized player-season as pure model output
(MTNN constellation position, archetype read, skill DNA) and the player guesses
who it is. This builder derives a phone-sized payload from the existing
row-aligned assets; it invents nothing.

Inputs (all committed, all index-aligned on 12,966 rows):
  assets/vectors.json         names, seasons, gp, game cluster, position
  assets/skills.json          12 transparent skill grades 0-99
  assets/mtnn_map.json        PCA(3) coords of the 48-d MTNN embedding
  assets/mtnn_heads.f32       [8 arch | 18 skill | 5 pos | 14 next] per row
  assets/mtnn_embeddings.f32  L2-normalized 48-d MTNN v5 embeddings
  assets/mtnn_meta.json       8 archetype centroids in the 48-d space
  assets/player_meta.json     puzzleWeight (honors+minutes+popularity blend)
  assets/archetype_assignments.json  eraTags per row

Outputs:
  assets/arena/core.json   meta + names + daily pool + honors (first paint)
  assets/arena/rows.bin    34 B/row: identity, map coords, skills, arch probs
  assets/arena/emb_q8.bin  int8-quantized embeddings (lazy; guess scoring)

Run:  python pipeline/build_arena.py
Gate: python pipeline/test_arena.py
"""

from __future__ import annotations

import json
import struct
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
ARENA = ASSETS / "arena"

VECTORS = ASSETS / "vectors.json"
SKILLS = ASSETS / "skills.json"
MAP = ASSETS / "mtnn_map.json"
HEADS = ASSETS / "mtnn_heads.f32"
EMB = ASSETS / "mtnn_embeddings.f32"
META = ASSETS / "player_meta.json"
ASSIGN = ASSETS / "archetype_assignments.json"
MTNN_META = ASSETS / "mtnn_meta.json"

N_ARCH, N_SKILL_HEADS, N_POS, N_NEXT = 8, 18, 5, 14
HEAD_STRIDE = N_ARCH + N_SKILL_HEADS + N_POS + N_NEXT
EMB_DIM = 48
ROW_BYTES = 34
EPOCH = "2026-07-15"  # day #1

# Pool: recognizable seasons only. Both knobs stated in core.json.
POOL_MIN_GP = 40
POOL_SIZE = 2000
POOL_MAX_PER_PLAYER = 6

TAG_ORDER = [
    "three_and_d", "stretch_big", "traditional_big", "spacing_role",
    "two_way_perimeter", "primary_creator", "volume_scorer",
]


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    n = len(players)
    seasons = sorted({p["season"] for p in players})

    skills_doc = json.loads(SKILLS.read_text(encoding="utf-8"))
    grades = skills_doc["grades"]
    if len(grades) != n:
        raise SystemExit(f"skills rows {len(grades)} != vectors rows {n}")

    map_doc = json.loads(MAP.read_text(encoding="utf-8"))
    coords = np.asarray(map_doc["coords"], dtype=np.float64)
    if coords.shape != (n, 3):
        raise SystemExit(f"map coords shape {coords.shape} != ({n}, 3)")

    heads = np.fromfile(HEADS, dtype=np.float32)
    if heads.size != n * HEAD_STRIDE:
        raise SystemExit(
            f"mtnn_heads.f32 has {heads.size} floats, expected {n}x{HEAD_STRIDE}")
    heads = heads.reshape(n, HEAD_STRIDE)
    arch_probs = softmax(heads[:, :N_ARCH].astype(np.float64))

    emb = np.fromfile(EMB, dtype=np.float32)
    if emb.size != n * EMB_DIM:
        raise SystemExit(
            f"mtnn_embeddings.f32 has {emb.size} floats, expected {n}x{EMB_DIM}")
    emb = emb.reshape(n, EMB_DIM)

    # Archetype fingerprint = cosine to the 8 MTNN centroids. The softmax head
    # is saturated (88% of rows sit above 0.99 top-1), so probabilities carry
    # no shape for a viz; centroid pull does, and it agrees with the head
    # argmax on 98.8% of rows. The head argmax stays the "model's read".
    mtnn_meta = json.loads(MTNN_META.read_text(encoding="utf-8"))
    cents = np.asarray(mtnn_meta["centroids"], dtype=np.float64)
    if cents.shape != (N_ARCH, EMB_DIM):
        raise SystemExit(f"centroids shape {cents.shape} != ({N_ARCH},{EMB_DIM})")
    cents /= np.linalg.norm(cents, axis=1, keepdims=True)
    emb_n = emb / np.maximum(np.linalg.norm(emb, axis=1, keepdims=True), 1e-9)
    cent_cos = emb_n @ cents.T  # (n, 8) in [-1, 1]

    meta = json.loads(META.read_text(encoding="utf-8"))
    weight = meta["puzzleWeight"]
    honors = meta.get("honors", {})

    assign_doc = json.loads(ASSIGN.read_text(encoding="utf-8"))
    assigns = assign_doc["assignments"]
    if len(assigns) != n:
        raise SystemExit(f"assignments rows {len(assigns)} != vectors rows {n}")
    tag_labels = assign_doc.get("tagLabels", {})

    # --- name table -------------------------------------------------------
    names = sorted({p["name"] for p in players})
    name_idx = {nm: i for i, nm in enumerate(names)}
    if len(names) > 65535:
        raise SystemExit("name table overflows u16")

    # --- rows.bin ---------------------------------------------------------
    season_off = {s: i for i, s in enumerate(seasons)}
    buf = bytearray(n * ROW_BYTES)
    q16 = lambda v: max(0, min(65535, int(round(v * 65535))))
    for i, p in enumerate(players):
        a = assigns[i]
        if a["id"] != p["id"]:
            raise SystemExit(f"assignment id mismatch at row {i}")
        tag_bits = 0
        for t in a.get("eraTags", []):
            if t in TAG_ORDER:
                tag_bits |= 1 << TAG_ORDER.index(t)
        # positions is an optional enrichment layer (pipeline/enrich_vectors.py);
        # not every build of vectors.json carries it, so degrade to "unlisted"
        # rather than fail the build.
        pos = p.get("p")
        if pos is None or not (0 <= int(pos) <= 4):
            pos = None
        pulls = np.round((cent_cos[i] + 1.0) / 2.0 * 255).astype(int).clip(0, 255)
        struct.pack_into(
            "<HBBBBBBHHH", buf, i * ROW_BYTES,
            name_idx[p["name"]],
            season_off[p["season"]],
            255 if pos is None else int(pos),
            int(p["c"]),
            int(np.argmax(arch_probs[i])),
            tag_bits,
            min(255, int(p.get("gp") or 0)),
            q16(coords[i, 0]), q16(coords[i, 1]), q16(coords[i, 2]),
        )
        base = i * ROW_BYTES + 14
        for j, g in enumerate(grades[i]):
            buf[base + j] = max(0, min(99, int(g)))
        for j in range(N_ARCH):
            buf[base + 12 + j] = int(pulls[j])

    # --- emb_q8.bin + quantization honesty check ---------------------------
    q8 = np.clip(np.round(emb * 127.0), -127, 127).astype(np.int8)
    deq = q8.astype(np.float64) / 127.0
    deq_norm = deq / np.maximum(np.linalg.norm(deq, axis=1, keepdims=True), 1e-9)
    true_norm = emb / np.maximum(
        np.linalg.norm(emb, axis=1, keepdims=True), 1e-9)
    # Cosine drift on a deterministic sample of pairs (full 13k^2 is wasteful).
    rng = np.random.default_rng(20260715)
    ii = rng.integers(0, n, 20000)
    jj = rng.integers(0, n, 20000)
    cos_true = (true_norm[ii] * true_norm[jj]).sum(axis=1)
    cos_q = (deq_norm[ii] * deq_norm[jj]).sum(axis=1)
    drift = np.abs(cos_true - cos_q)
    max_drift, mean_drift = float(drift.max()), float(drift.mean())

    # --- daily pool ---------------------------------------------------------
    cands = []
    for i, p in enumerate(players):
        key = f"{p['name']}|{p['season']}"
        w = float(weight.get(key, 0.0))
        if int(p.get("gp") or 0) >= POOL_MIN_GP and w > 0:
            cands.append((i, w))
    cands.sort(key=lambda t: (-t[1], t[0]))
    per_player: dict[str, int] = defaultdict(int)
    pool: list[tuple[int, float]] = []
    for i, w in cands:
        nm = players[i]["name"]
        if per_player[nm] >= POOL_MAX_PER_PLAYER:
            continue
        per_player[nm] += 1
        pool.append((i, w))
        if len(pool) >= POOL_SIZE:
            break
    max_w = max(w for _, w in pool)
    pool_out = [[i, max(1, min(255, int(round(w / max_w * 255))))]
                for i, w in sorted(pool)]

    # --- honors keyed by row ------------------------------------------------
    row_of = {f"{p['name']}|{p['season']}": i for i, p in enumerate(players)}
    honors_out = {}
    for key, h in honors.items():
        i = row_of.get(key)
        if i is None:
            continue
        vals = [int(h.get("asg") or 0), int(h.get("allNbaTeam") or 0),
                int(h.get("finalsMvp") or 0), int(h.get("allNbaVotePts") or 0)]
        if any(vals):
            honors_out[str(i)] = vals

    core = {
        "built": time.strftime("%Y-%m-%d"),
        "method": (
            "Row-aligned repack of vectors.json + skills.json + mtnn_map.json "
            "+ mtnn_heads.f32 (archetype argmax) + mtnn_embeddings.f32 x "
            "mtnn_meta.json centroids (archetype pull = cosine to each of the "
            "8 MTNN centroids) + player_meta.json puzzleWeight. Every value "
            "traces to a committed asset."),
        "sources": {
            "vectors": vec.get("built"),
            "skills": skills_doc.get("built"),
            "map": map_doc.get("built"),
            "meta": meta.get("built"),
        },
        "epoch": EPOCH,
        "rows": n,
        "rowBytes": ROW_BYTES,
        "rowLayout": (
            "<u16 nameIdx, u8 seasonOff, u8 pos(255=unk), u8 gameCluster, "
            "u8 mtnnTop, u8 tagBits, u8 gp, u16 x, u16 y, u16 z> "
            "+ 12xu8 skill grades + 8xu8 archetype-centroid cosine "
            "(byte/127.5 - 1)"),
        "seasons": seasons,
        "players": names,
        "clusters": vec["clusters"],
        "positions": vec.get("positions") or ["PG", "SG", "SF", "PF", "C"],
        "skillDefs": [{"key": s["key"], "label": s["label"], "badge": s["badge"]}
                      for s in skills_doc["skills"]],
        "badgeGrade": skills_doc.get("badgeGrade", 90),
        "goldGrade": skills_doc.get("goldGrade", 97),
        "tagOrder": TAG_ORDER,
        "tagLabels": tag_labels,
        "mapAxes": map_doc.get("axes", []),
        "pool": pool_out,
        "poolRule": (
            f"top {POOL_SIZE} rows by player_meta puzzleWeight with gp >= "
            f"{POOL_MIN_GP}, max {POOL_MAX_PER_PLAYER} seasons per player; "
            "daily pick = weight-proportional draw seeded by UTC day number"),
        "honors": honors_out,
        "embed": {
            "file": "emb_q8.bin",
            "dim": EMB_DIM,
            "scale": 127,
            "note": ("int8 quantization of the L2-normalized 48-d MTNN v5 "
                     "embedding; similarity = cosine after dequant+renorm"),
            "maxCosDrift": round(max_drift, 6),
            "meanCosDrift": round(mean_drift, 6),
        },
    }

    ARENA.mkdir(parents=True, exist_ok=True)
    (ARENA / "core.json").write_text(
        json.dumps(core, separators=(",", ":")), encoding="utf-8")
    (ARENA / "rows.bin").write_bytes(bytes(buf))
    (ARENA / "emb_q8.bin").write_bytes(q8.tobytes(order="C"))

    kb = lambda p: (ARENA / p).stat().st_size / 1024
    print(f"arena bundle: core.json {kb('core.json'):.0f} KB, "
          f"rows.bin {kb('rows.bin'):.0f} KB, emb_q8.bin {kb('emb_q8.bin'):.0f} KB")
    print(f"pool {len(pool_out)} rows across {len(per_player)} players; "
          f"cos drift max {max_drift:.5f} mean {mean_drift:.5f}")


if __name__ == "__main__":
    main()
