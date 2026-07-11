"""Composite Quality Score (CQS) for Vector Hoops MTNN + promote helpers.

CQS is higher-is-better on [0, 100]. It blends the multi-task outputs the
net actually ships — career continuity, cross-era purity, decode heads
(archetype / position / skills / next-profile), and aux regressions —
so promote decisions are not recall@10-only (which can saturate at 1.0
while craft heads drift).

Promote rule:
  CQS_new >= CQS_base + 0.5
  AND test recall@10 >= recall_base - 0.02
  AND purity@20     >= purity_base - 0.02
"""

from __future__ import annotations

from typing import Any

# Soft scales for 0–1 transforms (chosen so the 2026-07-09 v5 report sits
# mid-high without collapsing every component to 1.0).
SKILL_NN_SCALE = 25.0          # grade-point neighbor gap; lower is better
NEXT_MAE_SCALE = 1.0           # z-units
AUX_MAE_SCALE = 0.5

WEIGHTS = {
    "recall": 0.18,
    "purity": 0.16,
    "margin_14d": 0.08,
    "archetype": 0.08,
    "position": 0.05,
    "skills_r2": 0.14,
    "skill_nn": 0.05,
    "next_r2": 0.12,
    "next_mae": 0.06,
    "aux_r2": 0.08,
}

# Soft floors used by should_promote (absolute, not CQS components).
RECALL_SLACK = 0.02
PURITY_SLACK = 0.02
CQS_DELTA = 0.5

# Promoted baseline — update when a trial promotes under the CQS gate.
# Seeded from pipeline/data/mtnn_report.json (mtnn_v5_concat_b2… 2026-07-09).
BASELINE = {
    "cqs": 85.87,  # Bet D promote 2026-07-10; floors below are soft
    "recall": 1.0,
    "purity": 0.8726,
}


def _clip01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _num(x: Any) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN
        return None
    return v


def _held_out_test(report: dict[str, Any]) -> dict[str, Any]:
    ho = report.get("held_out_recall") or {}
    return ho.get("test") or {}


def _skills_test_r2(report: dict[str, Any]) -> float | None:
    skills = report.get("skills") or {}
    hold = skills.get("holdout") or {}
    test = hold.get("test") or {}
    return _num(test.get("mean_r2"))


def _next_test(report: dict[str, Any]) -> dict[str, Any]:
    nxt = report.get("next_profile") or {}
    return nxt.get("test") or {}


def _aux_test_r2s(report: dict[str, Any]) -> list[float]:
    keys = (
        "team_fit",
        "roster_lift",
        "career_slope",
        "competition",
        "pedigree_expectation",
        "playoff_riser",
        "honors_recognition",
    )
    out: list[float] = []
    for k in keys:
        block = report.get(k) or {}
        test = block.get("test") if isinstance(block, dict) else None
        if not isinstance(test, dict):
            continue
        r2 = _num(test.get("r2"))
        if r2 is not None:
            out.append(r2)
    return out


def component_scores(report: dict[str, Any]) -> dict[str, float]:
    """Map a mtnn_report-shaped dict to named 0–1 component scores."""
    test = _held_out_test(report)
    recall = _num(test.get("recall_at_10_mtnn"))
    if recall is None:
        recall = _num(report.get("recall_at_10_same_player_next_season")) or 0.0
    base14 = _num(test.get("recall_at_10_transparent_14d")) or 0.0
    margin = max(0.0, recall - base14)

    purity = _num(report.get("cross_era_archetype_neighbor_purity_at_20")) or 0.0
    arch = _num(report.get("archetype_top1_acc")) or 0.0
    pos = _num(report.get("position_top1_acc")) or 0.0

    skills_r2 = _skills_test_r2(report)
    skills = report.get("skills") or {}
    nn_gap = _num(skills.get("neighbor_consistency_pts_mtnn"))

    nxt = _next_test(report)
    next_r2 = _num(nxt.get("r2")) if nxt else None
    next_mae = _num(nxt.get("mae_z")) if nxt else None

    aux = _aux_test_r2s(report)
    aux_mean = sum(aux) / len(aux) if aux else None

    return {
        "recall": _clip01(recall),
        "purity": _clip01(purity),
        # 0.05 was the old promote margin vs 14-d; scale so +0.05 → 0.5, +0.10 → 1.0
        "margin_14d": _clip01(margin / 0.10),
        "archetype": _clip01(arch),
        "position": _clip01(pos),
        "skills_r2": _clip01(skills_r2 if skills_r2 is not None else 0.0),
        "skill_nn": _clip01(
            1.0 - (nn_gap / SKILL_NN_SCALE) if nn_gap is not None else 0.0
        ),
        "next_r2": _clip01(next_r2 if next_r2 is not None else 0.0),
        "next_mae": _clip01(
            1.0 - (next_mae / NEXT_MAE_SCALE) if next_mae is not None else 0.0
        ),
        "aux_r2": _clip01(aux_mean if aux_mean is not None else 0.0),
    }


def composite_quality(report: dict[str, Any]) -> dict[str, Any]:
    comps = component_scores(report)
    cqs = 100.0 * sum(WEIGHTS[k] * comps[k] for k in WEIGHTS)
    test = _held_out_test(report)
    recall = _num(test.get("recall_at_10_mtnn"))
    if recall is None:
        recall = _num(report.get("recall_at_10_same_player_next_season"))
    purity = _num(report.get("cross_era_archetype_neighbor_purity_at_20"))
    return {
        "cqs": round(cqs, 2),
        "components": {k: round(v, 4) for k, v in comps.items()},
        "weights": dict(WEIGHTS),
        "promote_metric": "cqs",
        "promote_rule": (
            "promote if CQS >= baseline_cqs + 0.5 "
            "and test recall@10 >= baseline_recall - 0.02 "
            "and purity@20 >= baseline_purity - 0.02"
        ),
        "baseline_cqs": BASELINE.get("cqs"),
        "baseline_recall": BASELINE.get("recall"),
        "baseline_purity": BASELINE.get("purity"),
        "test_recall_at_10": recall,
        "purity_at_20": purity,
    }


def partial_cqs(recall: float | None, purity: float | None) -> float:
    """Cheap mid-epoch proxy (0–1) when full heads aren't scored yet.

    Keeps the old recall/purity ranking shape so checkpoint restore stays
    stable, but lives next to the full CQS definition.
    """
    tr = recall or 0.0
    pu = purity or 0.0
    # Mirror legacy promotion_composite, then scale toward CQS weights.
    if tr < 0.85:
        legacy = 0.3 * tr + 0.3 * pu
    else:
        legacy = 0.4 * tr + 0.6 * pu
    # Blend toward the CQS recall/purity share so the proxy isn't alien.
    cqs_share = WEIGHTS["recall"] * _clip01(tr) + WEIGHTS["purity"] * _clip01(pu)
    # Normalize by the two-component weight mass so proxy stays ~[0,1].
    mass = WEIGHTS["recall"] + WEIGHTS["purity"]
    blended = 0.5 * legacy + 0.5 * (cqs_share / mass)
    return float(blended)


def should_promote(
    new_report: dict[str, Any],
    *,
    baseline_cqs: float | None = None,
    baseline_recall: float | None = None,
    baseline_purity: float | None = None,
    cqs_delta: float = CQS_DELTA,
    recall_slack: float = RECALL_SLACK,
    purity_slack: float = PURITY_SLACK,
) -> tuple[bool, str]:
    block = new_report.get("composite") or composite_quality(new_report)
    new_cqs = float(block["cqs"])
    new_recall = _num(block.get("test_recall_at_10"))
    if new_recall is None:
        new_recall = _num(_held_out_test(new_report).get("recall_at_10_mtnn")) or 0.0
    new_purity = _num(block.get("purity_at_20"))
    if new_purity is None:
        new_purity = _num(
            new_report.get("cross_era_archetype_neighbor_purity_at_20")
        ) or 0.0

    base_cqs = baseline_cqs if baseline_cqs is not None else BASELINE.get("cqs")
    base_r = baseline_recall if baseline_recall is not None else BASELINE.get("recall")
    base_p = baseline_purity if baseline_purity is not None else BASELINE.get("purity")

    if base_cqs is None:
        return False, "no baseline_cqs yet — record current CQS as baseline first"
    if base_r is None or base_p is None:
        return False, "baseline recall/purity missing"

    validation = new_report.get("population_validation")
    if not isinstance(validation, dict):
        return False, "population validation missing"
    flags = validation.get("collapse_flags")
    if not isinstance(flags, dict):
        return False, "population validation collapse flags missing"
    failed_flags = [
        name for name, detail in flags.items()
        if isinstance(detail, dict) and detail.get("flagged") is True
    ]
    if failed_flags:
        return False, "population validation failed: " + ", ".join(failed_flags)

    if new_recall < float(base_r) - recall_slack:
        return False, (
            f"recall {new_recall:.3f} < floor {float(base_r) - recall_slack:.3f}"
        )
    if new_purity < float(base_p) - purity_slack:
        return False, (
            f"purity {new_purity:.3f} < floor {float(base_p) - purity_slack:.3f}"
        )
    if new_cqs < float(base_cqs) + cqs_delta:
        return False, (
            f"CQS {new_cqs:.2f} < promote bar {float(base_cqs) + cqs_delta:.2f}"
        )
    return True, (
        f"CQS {new_cqs:.2f} >= {float(base_cqs) + cqs_delta:.2f} "
        f"and recall/purity floors ok"
    )


def seed_baseline_from_report(report: dict[str, Any]) -> dict[str, float]:
    """Compute and return the baseline dict for the current shipped report."""
    block = composite_quality(report)
    test = _held_out_test(report)
    recall = _num(test.get("recall_at_10_mtnn"))
    if recall is None:
        recall = _num(report.get("recall_at_10_same_player_next_season")) or 0.0
    purity = _num(report.get("cross_era_archetype_neighbor_purity_at_20")) or 0.0
    return {
        "cqs": float(block["cqs"]),
        "recall": float(recall),
        "purity": float(purity),
    }
