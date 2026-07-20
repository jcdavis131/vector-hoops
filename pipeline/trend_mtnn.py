"""Shared MTNN embedding + clustering helpers for trend research pipelines."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

ERAS = [
    ("1996-2003", "1996-97", "2002-03"),
    ("2003-2009", "2003-04", "2008-09"),
    ("2009-2015", "2009-10", "2014-15"),
    ("2015-2021", "2015-16", "2020-21"),
    ("2021-2026", "2021-22", "2025-26"),
]
GLOBAL_K = 8
ERA_K_RANGE = range(6, 13)
NOVELTY_THRESH = 0.75


def skill_index(skill_meta: list[dict]) -> dict[str, int]:
    return {s["key"]: i for i, s in enumerate(skill_meta)}


def era_for_season(season: str) -> tuple[str, str, str] | None:
    for era_name, s_lo, s_hi in ERAS:
        if s_lo <= season <= s_hi:
            return era_name, s_lo, s_hi
    return None


def era_percentiles(grades: np.ndarray, idxs: list[int]) -> dict[str, np.ndarray]:
    """Per-skill 25/50/75 within an era player pool."""
    G = grades[idxs]
    return {
        "p25": np.percentile(G, 25, axis=0),
        "p50": np.percentile(G, 50, axis=0),
        "p75": np.percentile(G, 75, axis=0),
    }


def tag_player_roles(
    grade_row: np.ndarray,
    idx: dict[str, int],
    pct: dict[str, np.ndarray],
) -> list[str]:
    """Era-relative role tags from one player's skill grades."""
    g = grade_row
    p50, p75 = pct["p50"], pct["p75"]
    tags: list[str] = []

    shoot_hi = g[idx["shooting"]] >= p75[idx["shooting"]]
    defense_hi = (
        g[idx["hands"]] >= p50[idx["hands"]] + 8
        or g[idx["dreb"]] >= p50[idx["dreb"]] + 8
    )
    pm_lo = g[idx["playmaking"]] <= p50[idx["playmaking"]]
    score_lo = g[idx["scoring"]] <= p75[idx["scoring"]]
    glass_hi = g[idx["oreb"]] >= p50[idx["oreb"]] + 5
    finish_hi = g[idx["finishing"]] >= p50[idx["finishing"]]

    if shoot_hi and defense_hi and pm_lo and score_lo:
        tags.append("three_and_d")
    if shoot_hi and defense_hi:
        tags.append("two_way_perimeter")
    if shoot_hi and (glass_hi or g[idx["rim"]] >= p50[idx["rim"]] + 5):
        tags.append("stretch_big")
    if finish_hi and glass_hi and g[idx["shooting"]] < p50[idx["shooting"]]:
        tags.append("traditional_big")
    if g[idx["playmaking"]] >= p75[idx["playmaking"]]:
        tags.append("primary_creator")
    if (
        g[idx["scoring"]] >= p75[idx["scoring"]]
        and g[idx["shooting"]] >= p50[idx["shooting"]]
    ):
        tags.append("volume_scorer")
    if g[idx["efficiency"]] >= p75[idx["efficiency"]] and shoot_hi:
        tags.append("spacing_role")
    return tags


def tag_cluster_from_profile(
    mean_g: np.ndarray,
    idx: dict[str, int],
    pct: dict[str, np.ndarray],
) -> list[str]:
    """Tag clusters from mean member skill grades vs era percentiles."""
    return tag_player_roles(mean_g, idx, pct)


def load_mtnn_embeddings() -> tuple[np.ndarray, dict]:
    meta = json.loads((ASSETS / "mtnn_meta.json").read_text(encoding="utf-8"))
    dim, rows = int(meta["dim"]), int(meta["rows"])
    f32 = ASSETS / "mtnn_embeddings.f32"
    if not f32.exists():
        raise SystemExit(f"missing {f32} — export MTNN embeddings first")
    E = np.fromfile(f32, dtype=np.float32)
    if E.size != rows * dim:
        raise SystemExit(f"mtnn f32 size {E.size} != {rows}×{dim}")
    return E.reshape(rows, dim), meta


def load_skill_grades() -> tuple[np.ndarray, list[dict]]:
    skills = json.loads((ASSETS / "skills.json").read_text(encoding="utf-8"))
    grades = np.array(skills["grades"], dtype=np.float64)
    return grades, skills["skills"]


def kmeans(
    X: np.ndarray, k: int, seed: int = 42, iters: int = 60
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    cents = X[rng.choice(len(X), k, replace=False)]
    lab = np.zeros(len(X), dtype=int)
    for _ in range(iters):
        d = ((X[:, None, :] - cents[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        new = np.stack(
            [X[lab == i].mean(0) if (lab == i).any() else cents[i] for i in range(k)]
        )
        if np.allclose(new, cents):
            break
        cents = new
    return lab, cents


def silhouette_sample(
    X: np.ndarray,
    lab: np.ndarray,
    max_n: int = 2000,
    seed: int = 7,
) -> float:
    n = len(X)
    if n < 50 or len(set(lab.tolist())) < 2:
        return float("nan")
    rng = np.random.default_rng(seed)
    idx = rng.choice(n, size=min(n, max_n), replace=False)
    Xs, ls = X[idx], lab[idx]
    sil = []
    for i, xi in enumerate(Xs):
        same = ls == ls[i]
        if same.sum() <= 1:
            continue
        a = np.linalg.norm(Xs[same] - xi, axis=1).sum() / (same.sum() - 1)
        b_vals = []
        for c in set(ls.tolist()):
            if c == ls[i]:
                continue
            mask = ls == c
            if mask.any():
                b_vals.append(np.linalg.norm(Xs[mask] - xi, axis=1).mean())
        if not b_vals:
            continue
        b = min(b_vals)
        sil.append((b - a) / max(a, b) if max(a, b) > 1e-9 else 0.0)
    return float(np.mean(sil)) if sil else float("nan")


def optimal_k(X: np.ndarray, k_range: range, seed: int = 7) -> tuple[int, list[dict]]:
    rows = []
    for k in k_range:
        lab, _ = kmeans(X, k, seed=seed)
        sil = silhouette_sample(X, lab, seed=seed)
        rows.append({"k": k, "silhouette": round(sil, 4)})
    best = max(rows, key=lambda r: r["silhouette"])
    return best["k"], rows


# Distinctive naming: rank skills by z vs the full player pool, then pick
# cross-family pairs so glass/rim clones do not collapse to the same label.
SKILL_FAMILY: dict[str, str] = {
    "scoring": "creation",
    "shooting": "spacing",
    "finishing": "paint",
    "ft": "touch",
    "playmaking": "creation",
    "security": "creation",
    "oreb": "glass",
    "dreb": "glass",
    "hands": "disruption",
    "rim": "paint",
    "efficiency": "spacing",
    "impact": "impact",
}

# Chimera half-court zone recipe (assets/game.js zoneRaw) on era-z 14-d vectors.
GAME_FEATURES = [
    "PTS",
    "AST",
    "OREB",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FG3A",
    "FGA",
    "FTA",
    "FG3_PCT",
    "FG_PCT",
    "FT_PCT",
    "PLUS_MINUS",
]
ZONE_KEYS = (
    "rim",
    "paintFT",
    "mid",
    "arc",
    "oreb",
    "ast",
    "paintD",
    "perimeterD",
    "glassD",
)


def _skill_pool_stats(grades: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean = grades.mean(0)
    std = grades.std(0)
    std = np.where(std < 1e-6, 1.0, std)
    return mean, std


def _rank_distinctive(
    mean_g: np.ndarray,
    skill_meta: list[dict],
    pool_mean: np.ndarray,
    pool_std: np.ndarray,
) -> list[int]:
    z = (mean_g - pool_mean) / pool_std
    return list(np.argsort(-z))


def _pick_cross_family(
    ranked: list[int],
    skill_meta: list[dict],
    n: int = 2,
) -> list[int]:
    picked: list[int] = []
    used_families: set[str] = set()
    for j in ranked:
        fam = SKILL_FAMILY.get(skill_meta[j]["key"], skill_meta[j]["key"])
        if fam in used_families:
            continue
        picked.append(j)
        used_families.add(fam)
        if len(picked) >= n:
            return picked
    for j in ranked:
        if j not in picked:
            picked.append(j)
        if len(picked) >= n:
            break
    return picked


def _format_skill_name(indices: list[int], skill_meta: list[dict]) -> str:
    return " + ".join(skill_meta[j]["label"] for j in indices)


def assign_cluster_names_from_members(
    member_lists: list[list[int]],
    grades: np.ndarray,
    skill_meta: list[dict],
) -> list[str]:
    """Name each cluster from distinctive skill z-scores (cross-family pairs)."""
    pool_mean, pool_std = _skill_pool_stats(grades)
    names: list[str] = []
    seen: Counter[str] = Counter()
    for i, members in enumerate(member_lists):
        mean_g = grades[members].mean(0) if members else pool_mean.copy()
        ranked = _rank_distinctive(mean_g, skill_meta, pool_mean, pool_std)
        pair = _pick_cross_family(ranked, skill_meta, n=2)
        base = _format_skill_name(pair, skill_meta)
        if seen[base]:
            trio = _pick_cross_family(ranked, skill_meta, n=3)
            base = _format_skill_name(trio, skill_meta)
        if seen[base]:
            # Last resort: append next unused distinctive skill not already named.
            for j in ranked:
                lab = skill_meta[j]["label"]
                if lab in base:
                    continue
                cand = f"{base} / {lab}"
                if not seen[cand]:
                    base = cand
                    break
            else:
                base = f"{base} ({i + 1})"
        seen[base] += 1
        names.append(base)
    return names


def assign_cluster_names(
    lab: np.ndarray,
    k: int,
    ids: list[int],
    grades: np.ndarray,
    skill_meta: list[dict],
) -> list[str]:
    """Name each cluster; disambiguate collisions with a third skill dimension."""
    member_lists = [[ids[j] for j in range(len(ids)) if lab[j] == i] for i in range(k)]
    return assign_cluster_names_from_members(member_lists, grades, skill_meta)


def name_cluster_from_skills(
    member_ids: list[int],
    grades: np.ndarray,
    skill_meta: list[dict],
) -> str:
    if not member_ids:
        return "Unlabeled"
    return assign_cluster_names_from_members(
        [member_ids],
        grades,
        skill_meta,
    )[0]


def zone_from_vector(v: np.ndarray | list[float]) -> dict[str, float]:
    """Map a 14-d era-z vector to Chimera half-court zone intensities."""
    a = np.asarray(v, dtype=np.float64)
    if a.shape[0] != 14:
        raise ValueError(f"expected 14-d vector, got {a.shape[0]}")
    fga, fg3a, fta = a[8], a[7], a[9]
    return {
        "rim": float((fta + max(0.0, fga - fg3a)) / 2.0),
        "paintFT": float(fta),
        "mid": float(fga),
        "arc": float(fg3a),
        "oreb": float(a[2]),
        "ast": float(a[1]),
        "paintD": float(a[5]),
        "perimeterD": float(a[4]),
        "glassD": float(a[3]),
    }


def mean_zone_profile(
    vectors: np.ndarray,
    member_row_idxs: list[int],
) -> dict[str, float]:
    if not member_row_idxs:
        return dict.fromkeys(ZONE_KEYS, 0.0)
    mean_v = vectors[member_row_idxs].mean(0)
    z = zone_from_vector(mean_v)
    return {k: round(z[k], 4) for k in ZONE_KEYS}


def mix_zone_profiles(
    profiles: list[dict[str, float]],
    shares: list[float],
) -> dict[str, float]:
    out = dict.fromkeys(ZONE_KEYS, 0.0)
    for profile, share in zip(profiles, shares, strict=False):
        for k in ZONE_KEYS:
            out[k] += float(share) * float(profile.get(k, 0.0))
    return {k: round(out[k], 4) for k in ZONE_KEYS}


def zone_delta(
    late: dict[str, float],
    early: dict[str, float],
) -> dict[str, float]:
    return {k: round(late.get(k, 0.0) - early.get(k, 0.0), 4) for k in ZONE_KEYS}


def cosine_rows(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a) or 1.0, np.linalg.norm(b) or 1.0
    return float(np.dot(a, b) / (na * nb))
