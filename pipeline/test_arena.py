"""Arena bundle gates — run after every build_arena.py.

Gates: byte-exact alignment with the source assets (names, seasons, skills,
map coords, archetype pulls), embedding quantization honesty, pool sanity,
daily-pick determinism (the shipped assets/arena/daily.js run under node must
agree with the Python mirror), and face-validity spot checks.

Run:  python pipeline/test_arena.py        (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import struct
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ARENA = ROOT / "assets" / "arena"
CORE = ARENA / "core.json"
ROWS = ARENA / "rows.bin"
EMBQ = ARENA / "emb_q8.bin"
DAILY_JS = ARENA / "daily.js"
VECTORS = ROOT / "assets" / "vectors.json"
SKILLS = ROOT / "assets" / "skills.json"
MAP = ROOT / "assets" / "mtnn_map.json"
EMB = ROOT / "assets" / "mtnn_embeddings.f32"
HEADS = ROOT / "assets" / "mtnn_heads.f32"
MTNN_META = ROOT / "assets" / "mtnn_meta.json"

ROW_BYTES = 34
EMB_DIM = 48

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        FAILURES.append(msg)


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def imul(x: int, y: int) -> int:
        return (x * y) & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), (1 | a) & 0xFFFFFFFF)
        t = ((t + imul(t ^ (t >> 7), (61 | t) & 0xFFFFFFFF)) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rand


def pick_daily(pool: list[list[int]], day: int) -> int:
    seed = ((day * 2654435761) & 0xFFFFFFFF) ^ 0x9E3779B9
    rng = mulberry32(seed)
    total = sum(w for _, w in pool)
    t = rng() * total
    for idx, w in pool:
        t -= w
        if t <= 0:
            return idx
    return pool[-1][0]


def main() -> None:
    core = json.loads(CORE.read_text(encoding="utf-8"))
    buf = ROWS.read_bytes()
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    n = core["rows"]

    print("alignment")
    check(n == len(players), f"rows == vectors players ({n})")
    check(len(buf) == n * ROW_BYTES, f"rows.bin is {ROW_BYTES} B/row")
    names = core["players"]
    seasons = core["seasons"]
    grades = json.loads(SKILLS.read_text(encoding="utf-8"))["grades"]
    coords = np.asarray(json.loads(MAP.read_text(encoding="utf-8"))["coords"])
    name_ok = season_ok = skill_ok = coord_ok = True
    worst_coord = 0.0
    for i in range(0, n, 7):
        o = i * ROW_BYTES
        ni, so, _pos, _gc, _mt, _tg, _gp, x, y, z = struct.unpack_from(
            "<HBBBBBBHHH", buf, o
        )
        p = players[i]
        name_ok &= names[ni] == p["name"]
        season_ok &= seasons[so] == p["season"]
        skill_ok &= list(buf[o + 14 : o + 26]) == [
            max(0, min(99, g)) for g in grades[i]
        ]
        err = max(
            abs(x / 65535 - coords[i, 0]),
            abs(y / 65535 - coords[i, 1]),
            abs(z / 65535 - coords[i, 2]),
        )
        worst_coord = max(worst_coord, float(err))
        coord_ok &= err <= 1.0 / 65535 + 1e-9
    check(name_ok, "decoded names match vectors.json (every 7th row)")
    check(season_ok, "decoded seasons match vectors.json")
    check(skill_ok, "skill bytes byte-match skills.json grades")
    check(coord_ok, f"map coords within 1 quantum (worst {worst_coord:.2e})")

    print("archetype pulls + model read")
    emb = np.fromfile(EMB, dtype=np.float32).reshape(n, EMB_DIM)
    emb_n = emb / np.maximum(np.linalg.norm(emb, axis=1, keepdims=True), 1e-9)
    cents = np.asarray(
        json.loads(MTNN_META.read_text(encoding="utf-8"))["centroids"], dtype=np.float64
    )
    cents /= np.linalg.norm(cents, axis=1, keepdims=True)
    cos = emb_n @ cents.T
    heads = np.fromfile(HEADS, dtype=np.float32).reshape(n, -1)
    top_head = heads[:, :8].argmax(axis=1)
    pull_ok = True
    worst_pull = 0.0
    sampled, agree = 0, 0
    for i in range(0, n, 7):
        o = i * ROW_BYTES
        stored = (
            np.frombuffer(buf, dtype=np.uint8, count=8, offset=o + 26) / 127.5 - 1.0
        )
        err = float(np.abs(stored - cos[i]).max())
        worst_pull = max(worst_pull, err)
        pull_ok &= err <= 1.0 / 127.5 + 1e-9
        sampled += 1
        agree += buf[o + 4] == top_head[i]
    check(
        pull_ok,
        f"archetype pull within 1 quantum of true cosine (worst {worst_pull:.2e})",
    )
    # Head argmax and nearest-centroid don't always coincide (two different
    # readings of the same embedding) — gate the agreement rate, not a
    # byte-exact match on every row.
    agree_rate = agree / sampled
    check(
        agree_rate >= 0.9,
        f"mtnnTop == archetype head argmax on >=90% of rows (got {agree_rate:.3f})",
    )

    print("embedding quantization honesty")
    q8 = np.fromfile(EMBQ, dtype=np.int8).reshape(n, EMB_DIM)
    deq = q8.astype(np.float64) / 127.0
    deq /= np.maximum(np.linalg.norm(deq, axis=1, keepdims=True), 1e-9)
    rng = np.random.default_rng(20260715)
    ii = rng.integers(0, n, 20000)
    jj = rng.integers(0, n, 20000)
    drift = np.abs((emb_n[ii] * emb_n[jj]).sum(1) - (deq[ii] * deq[jj]).sum(1))
    check(float(drift.max()) < 0.02, f"cosine drift max < 0.02 (got {drift.max():.5f})")
    check(
        float(drift.mean()) < 0.005,
        f"cosine drift mean < 0.005 (got {drift.mean():.5f})",
    )
    check(
        abs(core["embed"]["maxCosDrift"] - float(drift.max())) < 1e-4,
        "core.json states the measured drift",
    )

    print("pool sanity")
    pool = core["pool"]
    per_player: dict[str, int] = defaultdict(int)
    pool_gp_ok, pool_w_ok = True, True
    for idx, w in pool:
        p = players[idx]
        per_player[p["name"]] += 1
        pool_gp_ok &= int(p.get("gp") or 0) >= 40
        pool_w_ok &= 1 <= w <= 255
    check(len(pool) == 2000, f"pool size 2000 (got {len(pool)})")
    check(pool_gp_ok, "every pool row has gp >= 40")
    check(pool_w_ok, "pool weights in [1, 255]")
    check(max(per_player.values()) <= 6, "max 6 seasons per player in pool")
    pool_names = set(per_player)
    for famous in (
        "Stephen Curry",
        "LeBron James",
        "Michael Jordan",
        "Tim Duncan",
        "Nikola Jokic",
    ):
        check(famous in pool_names, f"pool includes {famous}")

    print("daily determinism (node vs python mirror)")
    days = list(range(1, 61))
    py_picks = [pick_daily(pool, d) for d in days]
    check(
        len(set(py_picks)) > 45,
        f"60 days draw >45 distinct rows (got {len(set(py_picks))})",
    )
    try:
        script = (
            "const d=require(process.argv[1]);"
            "const core=require(process.argv[2]);"
            "const days=[...Array(60)].map((_,i)=>i+1);"
            "console.log(JSON.stringify(days.map(x=>d.pickDaily(core.pool,x))));"
            "console.log(d.dayNumber('2026-07-15', Date.UTC(2026,6,15,12)));"
        )
        out = (
            subprocess.run(
                ["node", "-e", script, str(DAILY_JS), str(CORE)],
                capture_output=True,
                text=True,
                timeout=60,
                check=True,
            )
            .stdout.strip()
            .splitlines()
        )
        js_picks = json.loads(out[0])
        check(js_picks == py_picks, "node daily.js picks == python mirror (60 days)")
        check(int(out[1]) == 1, "epoch date itself is day #1")
    except FileNotFoundError:
        print("  [SKIP] node not available; python mirror only")
    except subprocess.CalledProcessError as exc:
        check(False, f"node run failed: {exc.stderr[:200]}")

    print("face validity")
    row_of = {(p["name"], p["season"]): i for i, p in enumerate(players)}
    clusters = core["clusters"]

    def spot_cluster(name: str, season: str, needle: str) -> None:
        i = row_of.get((name, season))
        if i is None:
            check(False, f"{name} {season} present")
            return
        got = clusters[buf[i * ROW_BYTES + 4]]
        check(
            needle.lower() in got.lower(),
            f"{name} {season} model read contains '{needle}' (got '{got}')",
        )

    spot_cluster("Stephen Curry", "2015-16", "Volume")
    spot_cluster("Dennis Rodman", "1996-97", "Glass")
    spot_cluster("Dikembe Mutombo", "1996-97", "Rim")
    spot_cluster("John Stockton", "1996-97", "Playmaking")
    check(
        str(row_of[("Allen Iverson", "1996-97")]) in core["honors"],
        "honors carry Iverson 1996-97",
    )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all arena gates passed")


if __name__ == "__main__":
    main()
