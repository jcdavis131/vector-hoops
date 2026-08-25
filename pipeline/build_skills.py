"""Skills Lens builder — era-honest skill grades for every charted season.

Deterministic, numpy-only, additive: reads the frozen 14-dim era-z game
contract in assets/vectors.json and emits

  assets/skills.json            grades[12] per player-season, ORDER-ALIGNED
                                with vectors.json players[] + taxonomy metadata
  assets/skill_probe.json       12x14 composite weights + per-skill pooled
                                quantile knots so the client can tag ANY
                                14-dim era-z vector (e.g. the fused chimera)
  pipeline/data/skill_labels.npz  training targets for train_mtnn.py skill towers

Method (docs/SKILLS_LENS.md): each skill is a fixed linear composite of
era-z features; the composite is converted to a percentile grade 0-99
WITHIN its season pool, so every era carries the same grade distribution.

Run:  python pipeline/build_skills.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
SKILLS_OUT = ROOT / "assets" / "skills.json"
PROBE_OUT = ROOT / "assets" / "skill_probe.json"
DATA_DIR = ROOT / "pipeline" / "data"
LABELS_OUT = DATA_DIR / "skill_labels.npz"

BADGE_GRADE = 90
GOLD_GRADE = 97
N_QUANTILE_KNOTS = 101  # p0, p1, ..., p100

# Composite weights over the 14 era-z contract features. Keep in sync with
# docs/SKILLS_LENS.md section 1 — the doc is the review surface.
SKILLS: list[dict] = [
    {
        "key": "scoring",
        "label": "Scoring Volume",
        "badge": "Bucket Getter",
        "w": {"PTS": 0.70, "FGA": 0.30},
    },
    {
        "key": "shooting",
        "label": "Perimeter Shooting",
        "badge": "Sniper",
        "w": {"FG3A": 0.55, "FG3_PCT": 0.45},
    },
    {
        "key": "finishing",
        "label": "Interior Finishing",
        "badge": "Paint Presence",
        "w": {"FG_PCT": 0.45, "FTA": 0.40, "FG3A": -0.15},
    },
    {
        "key": "ft",
        "label": "Free-Throw Shooting",
        "badge": "Marksman",
        "w": {"FT_PCT": 1.0},
    },
    {
        "key": "playmaking",
        "label": "Playmaking",
        "badge": "Floor General",
        "w": {"AST": 0.90, "TOV": -0.10},
    },
    {
        "key": "security",
        "label": "Ball Security",
        "badge": "Safe Hands",
        # 0.65*load - 0.35*TOV with load = mean(FGA, AST, FTA); tuned so
        # high-usage careful stars outrank never-play low-TOV bench seasons
        "w": {"FGA": 0.65 / 3, "AST": 0.65 / 3, "FTA": 0.65 / 3, "TOV": -0.35},
    },
    {
        "key": "oreb",
        "label": "Offensive Glass",
        "badge": "Glass Crasher",
        "w": {"OREB": 1.0},
    },
    {
        "key": "dreb",
        "label": "Defensive Glass",
        "badge": "Board Vacuum",
        "w": {"DREB": 1.0},
    },
    {
        "key": "hands",
        "label": "Ball Pressure",
        "badge": "Pickpocket",
        "w": {"STL": 1.0},
    },
    {
        "key": "rim",
        "label": "Rim Protection",
        "badge": "Rim Protector",
        "w": {"BLK": 0.85, "DREB": 0.15},
    },
    {
        "key": "efficiency",
        "label": "Scoring Efficiency",
        "badge": "Efficient Engine",
        "w": {"FG_PCT": 0.45, "FG3_PCT": 0.30, "FT_PCT": 0.25},
    },
    {
        "key": "impact",
        "label": "Two-Way Impact",
        "badge": "Tide Turner",
        # small PTS stabilizer damps garbage-time per-100 plus-minus spikes
        "w": {"PLUS_MINUS": 0.80, "PTS": 0.20},
    },
]


def weight_matrix(features: list[str]) -> np.ndarray:
    """[n_skills, n_features] composite weights aligned to contract order."""
    W = np.zeros((len(SKILLS), len(features)), dtype=np.float64)
    for i, sk in enumerate(SKILLS):
        for feat, w in sk["w"].items():
            W[i, features.index(feat)] = w
    return W


def season_percentiles(
    scores: np.ndarray, volume: np.ndarray, season_idx: dict[str, np.ndarray]
) -> np.ndarray:
    """Grade 0-99 = within-season percentile rank of each composite score.

    Exact composite ties are broken by `volume` (a usage/volume proxy), so
    the higher-volume player always outranks a same-score bystander — e.g.
    two identical FT% seasons rank the one who carried more load above.
    """
    grades = np.zeros(scores.shape, dtype=np.int64)
    for rows in season_idx.values():
        s = scores[rows]
        vol = volume[rows]
        n = len(rows)
        for j in range(scores.shape[1]):
            # lexsort: primary key = composite score, secondary = volume
            order = np.lexsort((vol, s[:, j]))
            ranks = np.empty(n, dtype=np.int64)
            ranks[order] = np.arange(n)
            pct = (ranks + 0.5) / n * 100.0
            grades[rows, j] = np.clip(pct.astype(np.int64), 0, 99)
    return grades


def pooled_quantiles(scores: np.ndarray) -> list[list[float]]:
    """Per-skill quantile knots over all pooled rows (inputs are era-z,
    so pooling across seasons is legitimate); client interpolates a grade
    for arbitrary fused vectors."""
    qs = np.linspace(0.0, 1.0, N_QUANTILE_KNOTS)
    out = []
    for j in range(scores.shape[1]):
        out.append([round(float(v), 4) for v in np.quantile(scores[:, j], qs)])
    return out


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    features: list[str] = vec["features"]
    players = vec["players"]
    n = len(players)

    V = np.array([p["v"] for p in players], dtype=np.float64)
    seasons = np.array([p["season"] for p in players])
    names = np.array([p["name"] for p in players])

    W = weight_matrix(features)
    scores = V @ W.T  # [n, n_skills]

    # Volume/usage proxy for tie-breaking: era-z shot + free-throw + assist
    # load. All era-z, so it's a within-season "how much did he carry" signal.
    vol_cols = [features.index(f) for f in ("FGA", "FTA", "AST") if f in features]
    volume = V[:, vol_cols].sum(axis=1)

    season_idx: dict[str, np.ndarray] = {
        s: np.where(seasons == s)[0] for s in sorted(set(seasons.tolist()))
    }
    grades = season_percentiles(scores, volume, season_idx)

    built = time.strftime("%Y-%m-%d")
    keys = [sk["key"] for sk in SKILLS]

    skills_doc = {
        "built": built,
        "source": "assets/vectors.json (frozen 14-dim era-z contract)",
        "method": (
            "linear composite of era-z features -> percentile grade "
            "0-99 within season pool; see docs/SKILLS_LENS.md"
        ),
        "badgeGrade": BADGE_GRADE,
        "goldGrade": GOLD_GRADE,
        "skills": [
            {"key": sk["key"], "label": sk["label"], "badge": sk["badge"], "w": sk["w"]}
            for sk in SKILLS
        ],
        "grades": grades.tolist(),
    }
    SKILLS_OUT.write_text(
        json.dumps(skills_doc, separators=(",", ":")), encoding="utf-8"
    )

    probe_doc = {
        "built": built,
        "features": features,
        "skills": keys,
        "labels": [sk["label"] for sk in SKILLS],
        "badges": [sk["badge"] for sk in SKILLS],
        "badgeGrade": BADGE_GRADE,
        "goldGrade": GOLD_GRADE,
        "W": [[round(float(w), 6) for w in row] for row in W],
        "quantiles": dict(zip(keys, pooled_quantiles(scores), strict=False)),
        "note": (
            "grade(x) = interp(W@x through pooled all-era quantile "
            "knots); valid for any vector in the 14-dim era-z "
            "contract, including fused chimera blends. Reference "
            "pool is ALL charted seasons, so probe grades rank vs "
            "history, not vs one season (r>=0.98 with season grades)."
        ),
    }
    PROBE_OUT.write_text(json.dumps(probe_doc, separators=(",", ":")), encoding="utf-8")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        LABELS_OUT,
        grades=(grades / 100.0).astype(np.float32),
        name=names,
        season=seasons,
        keys=np.array(keys),
    )

    n_badges = int((grades >= BADGE_GRADE).sum())
    print(f"{n} player-seasons x {len(SKILLS)} skills")
    print(
        f"badges at >= {BADGE_GRADE}: {n_badges} ({n_badges / n:.2f} per player-season)"
    )
    for sk, col in zip(SKILLS, grades.T, strict=False):
        top = names[np.argsort(-scores[:, keys.index(sk["key"])])[:3]]
        print(
            f"  {sk['key']:<11} mean {col.mean():5.1f}  "
            f"top: {', '.join(t for t in top)}"
        )
    print(f"wrote {SKILLS_OUT.name}, {PROBE_OUT.name}, {LABELS_OUT.name}")


if __name__ == "__main__":
    main()
