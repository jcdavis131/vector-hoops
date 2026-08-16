"""VH-105 — The Fall: expectation residuals for quiz pool generation.

Method (stated in fall_pool.json):

- Expected 14-d era-z profile = ridge regression on draft_z, age_z, position
  one-hot, and prior-season vector when >=200 labeled training rows exist;
  otherwise falls back to prior-season vector or position-season mean.
- Residual = actual − expected (14 dimensions).
- Quiz pool: largest |residual| among player-seasons with GP >= 65 — an
  honest non-injury proxy (real injury reasons are not freely clean).

Limitations (honest):
- GP >= 65 excludes short absences but NOT load management, off-court issues,
  role changes, or skill regression — not a medical diagnosis.
- Draft/age from pipeline/cache/bio_{season}.json when present; missing bio
  rows use draft_z=0, age_z=0 (neutral) — flagged via bioMissing when no
  cache row exists for that name-season.
- Pre-2015 charted seasons and rows without game logs get gp=0 and are
  excluded from the GP-qualified quiz pool.
- Ridge on era-z vectors is descriptive, not causal — busts and breakouts
  both surface; role-change false positives remain possible.
- Tier C injury reports would be better; not freely available.

Output: pipeline/data/fall_pool.json

Run:  python pipeline/fall_analysis.py
      python pipeline/fall_analysis.py --dry-run
Deps: assets/vectors.json, optional pipeline/cache/bio_*.json,
      pipeline/data/gamelogs_*.jsonl for GP counts
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CACHE = HERE / "cache"
ASSETS = HERE.parent / "assets"
OUT = DATA / "fall_pool.json"

D = 14
MIN_GP = 65
POOL_EACH = 40
ALPHA = 1.0
POSITIONS = ["PG", "SG", "SF", "PF", "C"]


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def season_start(season: str) -> int:
    return int(season[:4])


def load_bio() -> tuple[dict[tuple[str, str], tuple[float, float]], set[tuple[str, str]]]:
    """Return (name, season) -> (draft_z, age_z) and set of rows with real bio."""
    out: dict[tuple[str, str], tuple[float, float]] = {}
    present: set[tuple[str, str]] = set()
    for path in sorted(CACHE.glob("bio_*.json")):
        season = path.stem.split("_", 1)[1]
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        drafts = [float(r["DRAFT_NUMBER"]) for r in rows if r.get("DRAFT_NUMBER") is not None]
        ages = [float(r["AGE"]) for r in rows if r.get("AGE") is not None]
        d_mu, d_sd = (float(np.mean(drafts)), float(np.std(drafts)) or 1.0) if drafts else (30.5, 15.0)
        a_mu, a_sd = (float(np.mean(ages)), float(np.std(ages)) or 1.0) if ages else (27.0, 4.0)
        for r in rows:
            name = str(r.get("PLAYER_NAME", ""))
            if not name:
                continue
            key = (name, season)
            present.add(key)
            dz = (float(r["DRAFT_NUMBER"]) - d_mu) / d_sd if r.get("DRAFT_NUMBER") is not None else 0.0
            az = (float(r["AGE"]) - a_mu) / a_sd if r.get("AGE") is not None else 0.0
            out[key] = (dz, az)
    return out, present


def load_gp() -> dict[tuple[str, str], int]:
    gp: dict[tuple[str, str], int] = defaultdict(int)
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                g = json.loads(line)
                if g.get("MIN"):
                    gp[(str(g["PLAYER_NAME"]), season)] += 1
    return gp


def build_features(draft_z: float, age_z: float, pos: int, lag1: np.ndarray | None) -> np.ndarray | None:
    if pos < 0 or lag1 is None:
        return None
    onehot = np.zeros(len(POSITIONS))
    onehot[pos] = 1.0
    return np.concatenate(([1.0, draft_z, age_z], onehot, lag1))


def underperf_score(actual: np.ndarray, expected: np.ndarray) -> float:
    """Negative = profile fell short of expectation direction."""
    exp_norm = float(np.linalg.norm(expected)) or 1.0
    projection = float(np.dot(actual, expected) / exp_norm)
    return round(projection - exp_norm, 4)


def main() -> None:
    ap = argparse.ArgumentParser(description="VH-105 Fall expectation residuals")
    ap.add_argument("--dry-run", action="store_true", help="stats only; no write")
    args = ap.parse_args()

    players = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))["players"]
    bio, bio_present = load_bio()
    gp_map = load_gp()

    by_name: dict[str, list[dict]] = defaultdict(list)
    for p in players:
        by_name[norm_name(p["name"])].append(p)

    records: list[dict] = []
    for p in players:
        history = sorted(by_name[norm_name(p["name"])], key=lambda x: season_start(x["season"]))
        lag1 = next(
            (
                np.array(x["v"], dtype=np.float64)
                for x in reversed(history)
                if season_start(x["season"]) < season_start(p["season"])
            ),
            None,
        )
        pos = int(p.get("p", -1))
        key = (p["name"], p["season"])
        draft_z, age_z = bio.get(key, (0.0, 0.0))
        records.append(
            {
                "name": p["name"],
                "season": p["season"],
                "position": POSITIONS[pos] if 0 <= pos < len(POSITIONS) else None,
                "pos": pos,
                "lag1": lag1,
                "actual": np.array(p["v"], dtype=np.float64),
                "draft_z": draft_z,
                "age_z": age_z,
                "bioMissing": key not in bio_present,
                "gp": gp_map.get(key, 0),
                "x": build_features(draft_z, age_z, pos, lag1),
            }
        )

    train = [r for r in records if r["x"] is not None]
    use_ridge = len(train) >= 200
    beta = None
    if use_ridge:
        x_mat = np.vstack([r["x"] for r in train])
        y_mat = np.vstack([r["actual"] for r in train])
        penalty = np.eye(x_mat.shape[1]) * ALPHA
        penalty[0, 0] = 0.0
        beta = np.linalg.solve(x_mat.T @ x_mat + penalty, x_mat.T @ y_mat)

    pos_season_mean: dict[tuple[int, str], np.ndarray] = {}
    for r in records:
        if r["pos"] >= 0:
            pos_season_mean.setdefault((r["pos"], r["season"]), []).append(r["actual"])
    pos_season_mean = {k: np.mean(v, axis=0) for k, v in pos_season_mean.items()}

    scored: list[dict] = []
    for r in records:
        if use_ridge and r["x"] is not None:
            expected = (r["x"] @ beta).ravel()
            model_used = "ridge"
        elif r["lag1"] is not None:
            expected = r["lag1"]
            model_used = "lag1_baseline"
        elif r["pos"] >= 0:
            expected = pos_season_mean.get((r["pos"], r["season"]), np.zeros(D))
            model_used = "position_mean"
        else:
            expected = np.zeros(D)
            model_used = "zero_baseline"

        residual = r["actual"] - expected
        gp = r["gp"]
        scored.append(
            {
                "name": r["name"],
                "season": r["season"],
                "position": r["position"],
                "gp": gp,
                "gpQualified": gp >= MIN_GP,
                "bioMissing": r["bioMissing"],
                "modelUsed": model_used,
                "residualNorm": round(float(np.linalg.norm(residual)), 4),
                "underperfScore": underperf_score(r["actual"], expected),
                "residual": [round(float(x), 4) for x in residual],
                "expected": [round(float(x), 4) for x in expected],
                "actual": [round(float(x), 4) for x in r["actual"]],
            }
        )

    qualified = [s for s in scored if s["gpQualified"]]
    collapses = sorted(qualified, key=lambda s: s["underperfScore"])[:POOL_EACH]
    exceeded = sorted(qualified, key=lambda s: -s["underperfScore"])[:POOL_EACH]

    payload = {
        "method": (
            "expected 14-d era-z = ridge(draft_z, age_z, position, lag1_v) when "
            f">=200 train rows else lag1/position-mean baseline; residual = actual "
            f"− expected; quiz pool from GP>={MIN_GP} rows only (non-injury proxy — "
            "real injury reasons not freely clean; stated caveat)"
        ),
        "minGp": MIN_GP,
        "gpCaveat": (
            f"GP>={MIN_GP} filters short absences but not load management, off-court "
            "issues, or role changes — not a medical diagnosis"
        ),
        "model": "ridge" if use_ridge else "mean_baseline",
        "trainingRows": len(train),
        "playersScored": len(scored),
        "qualifiedRows": len(qualified),
        "collapses": collapses,
        "exceeded": exceeded,
        "quizPool": collapses + exceeded,
    }

    print(
        f"fall_analysis: {len(scored)} scored ({payload['model']}) | "
        f"GP>={MIN_GP}: {len(qualified)} | pool: {len(payload['quizPool'])}"
    )

    if args.dry_run:
        if collapses:
            print(
                "sample collapse:",
                collapses[0]["name"],
                collapses[0]["season"],
                "underperf=",
                collapses[0]["underperfScore"],
            )
        return

    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
