"""Population-level representation diagnostics for Vector Hoops MTNN runs.

The report is intentionally derived from whole cohorts instead of spotlighting
individual players. It is a training gate, not an export contract.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    from pathlib import Path

POSITION_NAMES = ("PG", "SG", "SF", "PF", "C")
MIN_GROUP_ROWS = 10
MIN_NEXT_ROWS = 25


def _round(value: float | None, digits: int = 4) -> float | None:
    return round(float(value), digits) if value is not None else None


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=1, keepdims=True)


def _sample_rows(rows: np.ndarray, limit: int) -> np.ndarray:
    if len(rows) <= limit:
        return rows
    return rows[np.linspace(0, len(rows) - 1, limit, dtype=int)]


def _recall_at_k(
    embeddings: np.ndarray,
    pairs: np.ndarray,
    k: int = 10,
) -> float | None:
    if len(pairs) == 0 or len(embeddings) <= k:
        return None
    hits = 0
    sample = _sample_rows(pairs, 500)
    for source, target in sample:
        sims = embeddings @ embeddings[source]
        sims[source] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        hits += int(target in top)
    return hits / len(sample)


def _purity_at_k(
    embeddings: np.ndarray,
    labels: np.ndarray,
    seasons: np.ndarray,
    source_rows: np.ndarray,
    k: int = 20,
) -> float | None:
    if len(source_rows) == 0 or len(embeddings) <= k:
        return None
    years = np.array([int(str(s)[:4]) for s in seasons])
    values: list[float] = []
    for source in _sample_rows(source_rows, 400):
        sims = embeddings @ embeddings[source]
        sims[source] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        cross_era = top[years[top] != years[source]]
        if len(cross_era):
            values.append(float((labels[cross_era] == labels[source]).mean()))
    return float(np.mean(values)) if values else None


def _calibration(logits: np.ndarray, labels: np.ndarray) -> dict[str, float | int | None]:
    if len(logits) == 0:
        return {"rows": 0, "ece_10": None, "brier": None, "mean_confidence": None}
    probabilities = _softmax(logits)
    confidence = probabilities.max(axis=1)
    predicted = probabilities.argmax(axis=1)
    correct = (predicted == labels).astype(float)
    ece = 0.0
    for lo, hi in zip(np.linspace(0, 1, 11)[:-1], np.linspace(0, 1, 11)[1:], strict=False):
        in_bin = (confidence >= lo) & (confidence < hi if hi < 1 else confidence <= hi)
        if in_bin.any():
            ece += float(in_bin.mean() * abs(correct[in_bin].mean() - confidence[in_bin].mean()))
    one_hot = np.eye(logits.shape[1], dtype=np.float32)[labels]
    return {
        "rows": len(logits),
        "ece_10": _round(ece),
        "brier": _round(float(((probabilities - one_hot) ** 2).sum(axis=1).mean())),
        "mean_confidence": _round(float(confidence.mean())),
    }


def _next_profile_metrics(
    prediction: np.ndarray,
    target: np.ndarray,
    next_index: np.ndarray,
    rows: np.ndarray,
) -> dict[str, float | int | None]:
    valid_rows = rows[next_index[rows] >= 0]
    if len(valid_rows) == 0:
        return {"rows": 0, "r2": None, "mae_z": None}
    y = target[next_index[valid_rows]]
    residual = y - prediction[valid_rows]
    ss_total = float(((y - y.mean(axis=0, keepdims=True)) ** 2).sum())
    return {
        "rows": len(valid_rows),
        "r2": _round(1.0 - float((residual**2).sum()) / max(ss_total, 1e-9)),
        "mae_z": _round(float(np.abs(residual).mean())),
    }


def _summary(
    embeddings: np.ndarray,
    tower_spread: np.ndarray,
    confidence: np.ndarray,
    logits: np.ndarray,
    clusters: np.ndarray,
    seasons: np.ndarray,
    prediction: np.ndarray,
    target: np.ndarray,
    next_index: np.ndarray,
    distribution_rows: np.ndarray,
    calibration_rows: np.ndarray,
    next_rows: np.ndarray,
    retrieval_pairs: np.ndarray,
) -> dict[str, Any]:
    next_report = _next_profile_metrics(prediction, target, next_index, next_rows)
    return {
        "rows": len(distribution_rows),
        "tower_spread": {
            "mean": _round(float(tower_spread[distribution_rows].mean())),
            "p05": _round(float(np.percentile(tower_spread[distribution_rows], 5))),
            "p95": _round(float(np.percentile(tower_spread[distribution_rows], 95))),
        },
        "confidence": {
            "mean": _round(float(confidence[distribution_rows].mean())),
            "p95": _round(float(np.percentile(confidence[distribution_rows], 95))),
            "fraction_ge_0_99": _round(float((confidence[distribution_rows] >= 0.99).mean())),
        },
        "retrieval_recall_at_10": _round(_recall_at_k(embeddings, retrieval_pairs)),
        "archetype_purity_at_20": _round(_purity_at_k(embeddings, clusters, seasons, calibration_rows)),
        "next_profile": next_report,
        "calibration": _calibration(logits[calibration_rows], clusters[calibration_rows]),
    }


def _era_label(season: str) -> str:
    year = int(str(season)[:4])
    if year < 2000:
        return "pre_2000"
    if year < 2010:
        return "2000s"
    if year < 2020:
        return "2010s"
    return "2020s"


def role_labels_from_context(
    names: np.ndarray,
    seasons: np.ndarray,
    context_path: Path,
) -> np.ndarray:
    """Assign coarse team-role cohorts from the existing role context.

    The context exists only for 2015 onward. Unknown is retained as a cohort
    rather than silently dropping older player-seasons from validation.
    """
    labels = np.full(len(names), "unknown", dtype=object)
    if not context_path.exists():
        return labels
    data = json.loads(context_path.read_text(encoding="utf-8"))
    rows = {(str(row["name"]), str(row["season"])): row for row in data.get("entries", [])}
    for i, (name, season) in enumerate(zip(names, seasons, strict=False)):
        row = rows.get((str(name), str(season)))
        if row is None:
            continue
        usage = float(row["ROLE_USAGE_SHARE"])
        minutes = float(row["ROLE_MIN_SHARE"])
        score_rank = -float(row["ROLE_SCORE_RANK"])
        if score_rank <= 1 or usage >= 1.3:
            labels[i] = "lead"
        elif minutes >= 0.55:
            labels[i] = "primary_rotation"
        elif minutes >= 0.35:
            labels[i] = "rotation"
        else:
            labels[i] = "specialist"
    return labels


def _slice_summary(
    values: np.ndarray,
    held_out_pairs: np.ndarray,
    **kwargs: Any,
) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for value in sorted({str(v) for v in values}):
        rows = np.where(values.astype(str) == value)[0]
        group_pairs = held_out_pairs[np.isin(held_out_pairs[:, 1], rows)]
        entry = _summary(
            distribution_rows=rows,
            calibration_rows=np.intersect1d(rows, held_out_pairs[:, 1]),
            next_rows=group_pairs[:, 0] if len(group_pairs) else np.array([], dtype=int),
            retrieval_pairs=group_pairs,
            **kwargs,
        )
        entry["scorable"] = len(rows) >= MIN_GROUP_ROWS
        output[value] = entry
    return output


def build_validation_report(
    *,
    embeddings: np.ndarray,
    tower_stack: np.ndarray,
    archetype_logits: np.ndarray,
    clusters: np.ndarray,
    positions: np.ndarray,
    seasons: np.ndarray,
    role_labels: np.ndarray,
    next_profile_pred: np.ndarray,
    game_profile_target: np.ndarray,
    next_index: np.ndarray,
    pairs: np.ndarray,
    held_out_pairs: np.ndarray | None = None,
) -> dict[str, Any]:
    """Build diagnostics across all relevant player-season cohorts."""
    if len(embeddings) != len(tower_stack):
        raise ValueError("embeddings and tower_stack must have matching row counts")
    if tower_stack.ndim != 3:
        raise ValueError("tower_stack must be [rows, towers, dimensions]")

    probabilities = _softmax(archetype_logits)
    confidence = probabilities.max(axis=1)
    tower_spread = tower_stack.std(axis=1).mean(axis=1)
    rows = np.arange(len(embeddings))
    inputs = {
        "embeddings": embeddings,
        "tower_spread": tower_spread,
        "confidence": confidence,
        "logits": archetype_logits,
        "clusters": clusters,
        "seasons": seasons,
        "prediction": next_profile_pred,
        "target": game_profile_target,
        "next_index": next_index,
    }
    evaluation_pairs = held_out_pairs if held_out_pairs is not None else pairs
    eval_targets = np.unique(evaluation_pairs[:, 1]) if len(evaluation_pairs) else rows
    overall = _summary(
        distribution_rows=rows,
        calibration_rows=eval_targets,
        next_rows=evaluation_pairs[:, 0] if len(evaluation_pairs) else np.array([], dtype=int),
        retrieval_pairs=evaluation_pairs,
        **inputs,
    )
    position_labels = np.array(
        [POSITION_NAMES[p] if 0 <= int(p) < len(POSITION_NAMES) else "unknown" for p in positions]
    )
    slice_values = {
        "archetype": np.array([f"archetype_{int(c)}" for c in clusters]),
        "position": position_labels,
        "era": np.array([_era_label(str(s)) for s in seasons]),
        "player_role": role_labels,
    }
    slices = {name: _slice_summary(values, evaluation_pairs, **inputs) for name, values in slice_values.items()}

    eligible_next_groups = [
        item["next_profile"]
        for group in slices.values()
        for item in group.values()
        if item["next_profile"]["rows"] >= MIN_NEXT_ROWS and item["next_profile"]["r2"] is not None
    ]
    weak_next = [item for item in eligible_next_groups if float(item["r2"]) <= 0.0]
    overall_next = overall["next_profile"]
    overall_next_weak = bool(
        overall_next["rows"] >= MIN_NEXT_ROWS and overall_next["r2"] is not None and float(overall_next["r2"]) <= 0.0
    )
    flags = {
        "near_zero_tower_spread": {
            "flagged": bool(overall["tower_spread"]["mean"] <= 1e-6),
            "threshold": 1e-6,
            "observed_mean": overall["tower_spread"]["mean"],
        },
        "universally_extreme_confidence": {
            "flagged": bool(overall["confidence"]["fraction_ge_0_99"] >= 0.95),
            "threshold_fraction_ge_0_99": 0.95,
            "observed_fraction_ge_0_99": overall["confidence"]["fraction_ge_0_99"],
        },
        "systematically_weak_next_year_signal": {
            "flagged": bool(
                overall_next_weak
                or (len(eligible_next_groups) >= 3 and len(weak_next) / len(eligible_next_groups) >= 0.6)
            ),
            "overall_held_out_r2": overall_next["r2"],
            "groups_evaluated": len(eligible_next_groups),
            "groups_r2_le_0": len(weak_next),
        },
    }
    return {
        "version": 1,
        "evaluation_scope": (
            "Tower/confidence distributions use all player-seasons; retrieval, "
            "purity, calibration, and next-profile metrics use held-out target seasons."
        ),
        "overall": overall,
        "slices": slices,
        "collapse_flags": flags,
    }
