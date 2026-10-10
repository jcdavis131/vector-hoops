"""Embedding-map manifest: which players the map shows, one point and one trajectory each.

Reads assets/vectors.json (per player-season x/y/z/c), assets/data/honors_extended.json
(all-star names) and pipeline/cache/bio_2025-26.json (current players), and writes
assets/embedding_map_manifest.json, embedding_map_points_limited.json and
embedding_map_trajectories.json.

A current player (in the 2025-26 bio) with no vectors.json row is listed with
missing_vector true and only what was measured: player_id, the bio name, is_current,
and is_allstar from the same name lookup the other rows use (null when the bio has no
name, since there is nothing to look up). Until 2026-10-09 these
rows were filled in as is_recent_rookie True, is_allstar False and seasons/best/latest
"2025-26" for every one of them -- 50 rows in the shipped asset, veterans such as
Mac McClung (27) and Trevon Scott (29) among them -- and "built" was the literal
"2026-08-10 embed v7.1.5" on every run [artifacts#10]. Now is_recent_rookie, is_3plus,
best_season and latest_season are null, seasons is [] (seasons with a vector row),
and built is the run's UTC time with the vectors.json sha256.

Run:  python pipeline/build_embedding_map_manifest.py [--out-root DIR]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from _out_root import add_out_root, rerooted, shown
from name_utils import norm_name

VECTORS = ROOT / "assets" / "vectors.json"
HONORS = ROOT / "assets" / "data" / "honors_extended.json"
BIO = ROOT / "pipeline" / "cache" / "bio_2025-26.json"
MANIFEST_OUT = ROOT / "assets" / "embedding_map_manifest.json"
POINTS_OUT = ROOT / "assets" / "embedding_map_points_limited.json"
TRAJ_OUT = ROOT / "assets" / "embedding_map_trajectories.json"

RECENT = {"2023-24", "2024-25", "2025-26"}


def _score(e: dict) -> float:
    tm = e.get("total_min") or 0
    if tm:
        return tm
    return e.get("gp", 0) * (e.get("mpg", 0) or 0)


def build_manifest(vec: dict, honors: dict, cur_bio: list[dict]) -> tuple[list[dict], dict]:
    """(rows, filter counts). Rows with a vector come first, then missing-vector current players."""
    by_pid: dict = defaultdict(list)
    for p in vec["players"]:
        by_pid[p["pid"]].append(p)
    allstar_norms = {norm_name(k.split("|")[0], keep_suffix=True) for k in honors.get("players", {})}
    current_pids = {r.get("PLAYER_ID") for r in cur_bio if r.get("PLAYER_ID") is not None}

    pid_to_display = {pid: lst[0]["name"] for pid, lst in by_pid.items()}
    pid_to_norm = {pid: norm_name(d, keep_suffix=True) for pid, d in pid_to_display.items()}
    three_plus = {pid for pid, lst in by_pid.items() if len(lst) >= 3}
    allstar_pids = {pid for pid, n in pid_to_norm.items() if n in allstar_norms}
    recent_pids = {pid for pid, lst in by_pid.items() if min(x["season"] for x in lst) in RECENT}
    qualifying = (current_pids & set(by_pid)) | allstar_pids | three_plus | recent_pids

    rows = []
    for pid in qualifying:
        seasons_sorted = sorted(by_pid[pid], key=lambda x: x["season"])
        best_entry = max(seasons_sorted, key=_score)
        rows.append(
            {
                "player_id": pid,
                "norm": pid_to_norm.get(pid, ""),
                "display_name": pid_to_display.get(pid, ""),
                "seasons": [x["season"] for x in seasons_sorted],
                "seasons_count": len(seasons_sorted),
                "is_current": pid in current_pids,
                "is_allstar": pid in allstar_pids,
                "is_recent_rookie": pid in recent_pids,
                "is_3plus": pid in three_plus,
                "best_season": best_entry["season"],
                "latest_season": seasons_sorted[-1]["season"],
                "best_score": _score(best_entry),
            }
        )
    rows.sort(key=lambda x: (not x["is_current"], -x["seasons_count"], x["display_name"]))

    bio_name = {r["PLAYER_ID"]: r.get("PLAYER_NAME") for r in cur_bio if r.get("PLAYER_ID") is not None}
    missing = sorted(current_pids - set(by_pid))
    for pid in missing:
        name = bio_name.get(pid)
        rows.append(
            {
                "player_id": pid,
                "norm": norm_name(name, keep_suffix=True) if name else None,
                "display_name": name,
                "seasons": [],
                "seasons_count": 0,
                "is_current": True,
                # No bio name means no name to look up: unknown, not False.
                "is_allstar": norm_name(name, keep_suffix=True) in allstar_norms if name else None,
                "is_recent_rookie": None,
                "is_3plus": None,
                "best_season": None,
                "latest_season": None,
                "missing_vector": True,
            }
        )
    filters = {
        "current": len(current_pids),
        "allstar": len(allstar_pids),
        "three_plus": len(three_plus),
        "recent": len(recent_pids),
        "qualifying_vectors": len(qualifying),
        "missing_vector": len(missing),
    }
    return rows, filters


def build_points(rows: list[dict], by_pid: dict) -> list[dict]:
    points = []
    for entry in rows:
        if entry.get("missing_vector"):
            continue
        lst = by_pid[entry["player_id"]]
        target = entry["latest_season"] if entry["is_current"] else entry["best_season"]
        rec = next((r for r in lst if r["season"] == target), lst[-1])
        points.append(
            {
                "pid": entry["player_id"],
                "season": rec["season"],
                "x": rec["x"],
                "y": rec["y"],
                "z": rec.get("z", 0),
                "c": rec.get("c", 0),
                "display_name": entry["display_name"],
                "is_current": entry["is_current"],
                "is_allstar": entry["is_allstar"],
            }
        )
    return points


def build_trajectories(rows: list[dict], by_pid: dict) -> dict:
    out = {}
    for entry in rows:
        if entry.get("missing_vector"):
            continue
        lst = sorted(by_pid[entry["player_id"]], key=lambda x: x["season"])
        out[str(entry["player_id"])] = [
            {
                "season": r["season"],
                "x": r["x"],
                "y": r["y"],
                "z": r.get("z", 0),
                "c": r.get("c", 0),
                "gp": r.get("gp"),
                "mpg": r.get("mpg"),
            }
            for r in lst
        ]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    add_out_root(ap)
    args = ap.parse_args()

    raw = VECTORS.read_bytes()
    vec = json.loads(raw)
    honors = json.loads(HONORS.read_text(encoding="utf-8"))
    cur_bio = json.loads(BIO.read_text(encoding="utf-8"))
    rows, filters = build_manifest(vec, honors, cur_bio)
    by_pid: dict = defaultdict(list)
    for p in vec["players"]:
        by_pid[p["pid"]].append(p)
    built = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(
        f"qualifying {filters['qualifying_vectors']} with vectors; {filters['missing_vector']} current players "
        f"have no vectors.json row and are listed with measured fields only (missing_vector true)"
    )

    manifest_out = rerooted(MANIFEST_OUT, args.out_root)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(
        json.dumps(
            {
                "built": built,
                "vectors_sha256": hashlib.sha256(raw).hexdigest(),
                "total_players": len(rows),
                "filters": filters,
                "players": rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"wrote {shown(manifest_out)} ({len(rows)} players)")

    points = build_points(rows, by_pid)
    points_out = rerooted(POINTS_OUT, args.out_root)
    points_out.write_text(
        json.dumps({"built": "limited 1 per player", "count": len(points), "points": points}), encoding="utf-8"
    )
    print(f"wrote {shown(points_out)} ({len(points)} points)")

    traj = build_trajectories(rows, by_pid)
    traj_out = rerooted(TRAJ_OUT, args.out_root)
    traj_out.write_text(
        json.dumps({"built": "trajectories", "count": len(traj), "trajectories": traj}), encoding="utf-8"
    )
    print(f"wrote {shown(traj_out)} ({len(traj)} trajectories)")


if __name__ == "__main__":
    main()
