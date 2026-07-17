"""Enriched career-continuous features keyed by stable NBA PLAYER_ID.

Extends the shallow career_arc (YEAR_IN_LEAGUE, LAG1_COSINE, DELTA_NORM,
GP_RATIO, DRAFT_SLOT_Z) with multi-year slopes, calendar gaps, team-change
flags, and experience years — so the career tower sees a continuous entity
rather than an independent season bag.

Writes:
  pipeline/data/career_arc.json   (integrate_context career family)
  pipeline/data/career_sequences.npz  (ordered indices + next-box labels)

Run:  python pipeline/build_career_context.py
"""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
OUT_JSON = DATA / "career_arc.json"
OUT_NPZ = DATA / "career_sequences.npz"
TRAIN_NPZ = DATA / "train_matrix.npz"

FEATURE_KEYS = (
    "YEAR_IN_LEAGUE",
    "LAG1_COSINE",
    "DELTA_NORM",
    "GP_RATIO",
    "DRAFT_SLOT_Z",
    "CAREER_SLOPE_3Y",
    "CAREER_GAP_YEARS",
    "CAREER_TEAM_CHANGE",
    "CAREER_EXP_YEARS",
    "CAREER_MPG_SLOPE",
    "CAREER_GP_SLOPE",
    "CAREER_ACTIVE_FRAC",
    "CAREER_GP_PCT",
    "CAREER_MISS_STREAK",
    "CAREER_AVAIL_3Y",
)


def norm_name(name: str) -> str:
    s = re.sub(r"[.'’-]", "", name.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def vec_cos(a: list[float], b: list[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return num / (na * nb)


def season_start(s: str) -> int:
    return int(str(s)[:4])


def linear_slope(ys: list[float]) -> float | None:
    n = len(ys)
    if n < 2:
        return None
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs) or 1.0
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def load_gp_ratios() -> dict[tuple[str, str], float]:
    ratios: dict[tuple[str, str], float] = {}
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        gp: dict[tuple[int, str], int] = defaultdict(int)
        roster: dict[int, set[str]] = defaultdict(set)
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                g = json.loads(line)
                if not g.get("MIN"):
                    continue
                gp[(g["TEAM_ID"], g["PLAYER_NAME"])] += 1
                roster[g["TEAM_ID"]].add(g["PLAYER_NAME"])
        for tid, names in roster.items():
            mean = sum(gp[(tid, n)] for n in names) / max(1, len(names))
            if mean <= 0:
                continue
            for n in names:
                ratios[(n, season)] = round(gp[(tid, n)] / mean, 4)
    return ratios


def load_draft_z() -> dict[tuple[str, str], float]:
    raw: dict[tuple[str, str], float] = {}
    pools: dict[str, list[float]] = defaultdict(list)
    cache = HERE / "cache"
    for path in sorted(cache.glob("bio_*.json")):
        season = path.stem.split("_", 1)[1]
        for row in json.loads(path.read_text(encoding="utf-8")):
            if row.get("DRAFT_NUMBER") is None or not row.get("PLAYER_NAME"):
                continue
            pick = float(row["DRAFT_NUMBER"])
            key = (norm_name(row["PLAYER_NAME"]), season)
            raw[key] = pick
            pools[season].append(pick)
    out: dict[tuple[str, str], float] = {}
    for key, pick in raw.items():
        vals = pools[key[1]]
        if len(vals) < 2:
            continue
        mu = sum(vals) / len(vals)
        sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals)) or 1.0
        out[key] = round((pick - mu) / sd, 4)
    return out


def load_min_gp() -> dict[tuple[int, str], tuple[float, float]]:
    """(player_id, season) -> (MPG, GP) from build_min_gp.py — honest
    per-game values (vectors.json mpg is minutes/100 possessions)."""
    path = DATA / "min_gp.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {
        (int(r["player_id"]), str(r["season"])): (float(r["MPG"]), float(r["GP"]))
        for r in doc.get("players", [])
    }


def load_availability() -> dict[tuple[int, str], dict]:
    """(player_id, season) -> availability row from build_availability.py."""
    path = DATA / "availability.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {(int(r["player_id"]), str(r["season"])): r
            for r in doc.get("players", [])}


def load_team_by_name_season() -> dict[tuple[str, str], int]:
    path = DATA / "roster_context.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], int] = {}
    for e in doc.get("entries") or []:
        if e.get("teamId") is None:
            continue
        out[(str(e["name"]), str(e["season"]))] = int(e["teamId"])
    return out


def load_matrix_identity() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    if not TRAIN_NPZ.exists():
        raise SystemExit("missing train_matrix.npz — run build_vectors + integrate")
    npz = np.load(TRAIN_NPZ, allow_pickle=False)
    return (
        npz["player_id"].astype(np.int64),
        np.asarray([str(x) for x in npz["name"]]),
        np.asarray([str(x) for x in npz["season"]]),
        np.arange(len(npz["player_id"]), dtype=np.int64),
    )


def main() -> None:
    vec = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    players = vec["players"]
    # Prefer matrix PLAYER_ID when available; fall back to name grouping.
    pid_by_ns: dict[tuple[str, str], int] = {}
    if TRAIN_NPZ.exists():
        m_pids, m_names, m_seasons, _ = load_matrix_identity()
        for pid, name, season in zip(m_pids, m_names, m_seasons):
            pid_by_ns[(str(name), str(season))] = int(pid)

    gp_ratios = load_gp_ratios()
    draft_z = load_draft_z()
    teams = load_team_by_name_season()
    min_gp = load_min_gp()
    if not min_gp:
        print("WARN: min_gp.json missing — falling back to vectors.json mpg "
              "(minutes/100 poss, NOT per-game). Run build_min_gp.py first.")
    avail = load_availability()

    # Attach pid + build by career
    rows_in: list[dict] = []
    for p in players:
        name, season = str(p["name"]), str(p["season"])
        pid = pid_by_ns.get((name, season))
        if pid is None:
            # synthetic: hash name (rare for rows outside matrix)
            pid = abs(hash(norm_name(name))) % (10**9)
        honest = min_gp.get((pid, season))
        rows_in.append({
            "pid": pid,
            "name": name,
            "season": season,
            "v": p.get("v") or [],
            "gp": honest[1] if honest else float(p.get("gp") or 0),
            "mpg": honest[0] if honest else 0.0,
            "year": season_start(season),
            "teamId": teams.get((name, season)),
        })

    by_pid: dict[int, list[dict]] = defaultdict(list)
    for r in rows_in:
        by_pid[r["pid"]].append(r)
    for seq in by_pid.values():
        seq.sort(key=lambda r: r["year"])

    out_rows: list[dict] = []
    seq_pids: list[int] = []
    seq_row_idx: list[list[int]] = []
    seq_years: list[list[int]] = []
    row_index_by_ns: dict[tuple[str, str], int] = {}
    if TRAIN_NPZ.exists():
        _, m_names, m_seasons, m_idx = load_matrix_identity()
        for i, name, season in zip(m_idx, m_names, m_seasons):
            row_index_by_ns[(str(name), str(season))] = int(i)

    for pid, seq in by_pid.items():
        debut = seq[0]["year"]
        deltas: list[float] = []
        matrix_idxs: list[int] = []
        years: list[int] = []

        for i, cur in enumerate(seq):
            feat: dict = {
                "name": cur["name"],
                "season": cur["season"],
                "player_id": int(pid),
                "YEAR_IN_LEAGUE": i + 1,
                "CAREER_EXP_YEARS": float(cur["year"] - debut + 1),
            }
            calendar_span = max(1, cur["year"] - debut + 1)
            feat["CAREER_ACTIVE_FRAC"] = round((i + 1) / calendar_span, 4)

            if i:
                prev = seq[i - 1]
                gap = float(cur["year"] - prev["year"] - 1)
                feat["CAREER_GAP_YEARS"] = max(0.0, gap)
                if cur["v"] and prev["v"] and len(cur["v"]) == len(prev["v"]):
                    feat["LAG1_COSINE"] = round(vec_cos(cur["v"], prev["v"]), 4)
                    dnorm = math.sqrt(sum(
                        (a - b) ** 2 for a, b in zip(cur["v"], prev["v"])))
                    feat["DELTA_NORM"] = round(dnorm, 4)
                    deltas.append(dnorm)
                if len(deltas) >= 1:
                    window = deltas[-3:]
                    feat["CAREER_SLOPE_3Y"] = round(sum(window) / len(window), 4)
                pt, ct = prev.get("teamId"), cur.get("teamId")
                if pt is not None and ct is not None:
                    feat["CAREER_TEAM_CHANGE"] = 1.0 if int(pt) != int(ct) else 0.0

            # Trailing MPG / GP slopes (include current)
            window = seq[max(0, i - 2): i + 1]
            mpg_s = linear_slope([r["mpg"] for r in window])
            gp_s = linear_slope([r["gp"] for r in window])
            if mpg_s is not None:
                feat["CAREER_MPG_SLOPE"] = round(float(mpg_s), 4)
            if gp_s is not None:
                feat["CAREER_GP_SLOPE"] = round(float(gp_s), 4)

            if (cur["name"], cur["season"]) in gp_ratios:
                feat["GP_RATIO"] = gp_ratios[(cur["name"], cur["season"])]
            dz = draft_z.get((norm_name(cur["name"]), cur["season"]))
            if dz is not None:
                feat["DRAFT_SLOT_Z"] = dz

            # Availability (injury proxy): GP_PCT, miss streak, trailing 3y
            av = avail.get((int(pid), cur["season"]))
            if av is not None:
                feat["CAREER_GP_PCT"] = av["GP_PCT"]
                if av.get("LONGEST_MISS_STREAK") is not None:
                    feat["CAREER_MISS_STREAK"] = float(av["LONGEST_MISS_STREAK"])
                trail = [
                    avail[(int(pid), s["season"])]["GP_PCT"]
                    for s in seq[max(0, i - 2): i + 1]
                    if (int(pid), s["season"]) in avail
                ]
                if trail:
                    feat["CAREER_AVAIL_3Y"] = round(sum(trail) / len(trail), 4)

            out_rows.append(feat)

            mi = row_index_by_ns.get((cur["name"], cur["season"]))
            if mi is not None:
                matrix_idxs.append(mi)
                years.append(cur["year"])

        if len(matrix_idxs) >= 1:
            seq_pids.append(int(pid))
            seq_row_idx.append(matrix_idxs)
            seq_years.append(years)

        # Next-box labels written into career_sequences.npz after the loop.

    out_rows.sort(key=lambda r: (season_start(r["season"]), r["name"]))
    payload = {
        "method": (
            "Career-continuous features on NBA PLAYER_ID sequences: lag "
            "cosine/norm, 3y mean delta, calendar gap, team-change, "
            "experience years, MPG/GP slopes, active fraction. "
            "Joins integrate_context as career family."
        ),
        "features": list(FEATURE_KEYS),
        "n_players": len(by_pid),
        "n_rows": len(out_rows),
        "players": out_rows,
    }
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT_JSON} rows={len(out_rows)} careers={len(by_pid)}")

    # Sequence NPZ — pad ragged lists
    if seq_pids and TRAIN_NPZ.exists():
        max_len = max(len(s) for s in seq_row_idx)
        n_c = len(seq_pids)
        idx_pad = np.full((n_c, max_len), -1, dtype=np.int64)
        year_pad = np.zeros((n_c, max_len), dtype=np.int32)
        length = np.zeros(n_c, dtype=np.int32)
        for i, (idxs, yrs) in enumerate(zip(seq_row_idx, seq_years)):
            length[i] = len(idxs)
            idx_pad[i, : len(idxs)] = idxs
            year_pad[i, : len(yrs)] = yrs

        # Per matrix-row next box + availability aux (train_matrix row order)
        n_rows = int(np.load(TRAIN_NPZ, allow_pickle=False)["Z"].shape[0])
        y_mpg = np.zeros(n_rows, dtype=np.float32)
        y_gp = np.zeros(n_rows, dtype=np.float32)
        y_m = np.zeros(n_rows, dtype=np.float32)
        aux_mpg = np.zeros(n_rows, dtype=np.float32)
        aux_gp_pct = np.zeros(n_rows, dtype=np.float32)
        aux_miss_streak = np.zeros(n_rows, dtype=np.float32)
        aux_streak_known = np.zeros(n_rows, dtype=np.float32)
        for pid, seq in by_pid.items():
            for i, cur in enumerate(seq):
                mi = row_index_by_ns.get((cur["name"], cur["season"]))
                if mi is None:
                    continue
                aux_mpg[mi] = float(cur["mpg"])
                av = avail.get((int(pid), cur["season"]))
                if av is not None:
                    aux_gp_pct[mi] = float(av["GP_PCT"])
                    if av.get("LONGEST_MISS_STREAK") is not None:
                        aux_miss_streak[mi] = float(av["LONGEST_MISS_STREAK"])
                        aux_streak_known[mi] = 1.0
                if i + 1 >= len(seq):
                    continue
                nxt = seq[i + 1]
                if nxt["year"] - cur["year"] != 1:
                    continue
                y_mpg[mi] = float(nxt["mpg"])
                y_gp[mi] = float(nxt["gp"])
                y_m[mi] = 1.0

        np.savez_compressed(
            OUT_NPZ,
            career_id=np.asarray(seq_pids, dtype=np.int64),
            row_index=idx_pad,
            year=year_pad,
            length=length,
            next_mpg=y_mpg,
            next_gp=y_gp,
            next_mask=y_m,
            aux_mpg=aux_mpg,
            aux_gp_pct=aux_gp_pct,
            aux_miss_streak=aux_miss_streak,
            aux_streak_known=aux_streak_known,
        )
        print(f"wrote {OUT_NPZ} careers={n_c} max_len={max_len} "
              f"next_labeled={int(y_m.sum())}")


if __name__ == "__main__":
    main()
