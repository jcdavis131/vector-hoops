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

import math
from typing import Any

# Soft scales for 0–1 transforms (chosen so the 2026-07-09 v5 report sits
# mid-high without collapsing every component to 1.0).
SKILL_NN_SCALE = 25.0  # grade-point neighbor gap; lower is better
NEXT_MAE_SCALE = 1.0  # z-units
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

# Minimum floors used by should_promote. These are *floors*, not the whole
# story: the effective threshold widens with measured seed noise (see
# _threshold), so a decision made from one seed has to clear a taller bar than
# one averaged over four.
RECALL_SLACK = 0.02
PURITY_SLACK = 0.015
CQS_DELTA = 0.5

# Promoted baseline — update when a trial promotes under the CQS gate.
#
# 2026-07-31 re-anchor (systems-thinking pass: a stale rule, not a stale
# parameter -- the prior baseline's dispersion was sized off concat fusion's
# OLD seed-42-inflated noise, a property of the 130-feature recipe. Two
# feature additions since (hustle-tracking defense, docs/MTNN_STABILITY_
# 2026-07-30_hustle_defense.md; team system tags, docs/MTNN_STABILITY_2026-
# 07-30_system_tags.md) plus the val_recall checkpoint-selection smoothing
# fix collapsed that dispersion by 82% on CQS -- the gate was still charging
# a noise premium against a recipe that had already gotten far more stable.
# Previous constants were {"cqs": 75.82, "recall": 0.732, "purity": 0.7813},
# recorded 2026-07-25 over the 130-feature matrix.
BASELINE = {
    "cqs": 77.74,
    "recall": 0.835,
    "purity": 0.7820,
    "continuity_spread": 0.1436,  # not re-measured this round, carried forward
}

# Seed dispersion measured over seeds 5/7/13/21/42/99, 142-feature matrix
# (hustle-defense + system-tags), sweep protocol (--val-every 0
# --no-best-checkpoint, forces full 40 epochs so the internal checkpoint-
# selection proxy can't skew the cross-seed comparison). cqs/recall/purity
# sd all dropped sharply vs the 2026-07-25 baseline (cqs 3.40->0.60, recall
# 0.176->0.031, purity 0.0038->0.0055 -- purity ticked up slightly but
# remains tiny). continuity_spread sd carried forward, not re-measured this
# round (single spot-check on seed 99: 0.108, consistent with the old
# baseline's range).
BASELINE_SD = {
    "cqs": 0.60,
    "recall": 0.031,
    "purity": 0.0055,
    "continuity_spread": 0.1012,
}

BASELINE_PROVENANCE = {
    "recorded": "2026-07-31",
    "recipe": (
        "concat fusion, tower 32/160, 2 blocks, dim 64, mlp-heads, "
        "d-head-hidden 128, fusion-hidden 256, hybrid NCE, onecycle, 40 epochs "
        "(= train_mtnn.py defaults as of dfbdd54, --dim 64); 142-feature "
        "matrix (hustle-tracking defense + team system tags); val_recall "
        "smoothed over last 3 checks for select-phase checkpoint selection"
    ),
    "seeds": [5, 7, 13, 21, 42, 99],
    "protocol": (
        "temporal split train y<=2021 / val y<=2023 / test y>=2024; "
        "142-feature matrix; position labels restored (vectors.json "
        "re-enriched); sweep protocol (--val-every 0 --no-best-checkpoint) "
        "for cross-seed comparability, matching the 2026-07-24 methodology"
    ),
    "source": (
        "docs/MTNN_STABILITY_2026-07-30_hustle_defense.md, "
        "docs/MTNN_STABILITY_2026-07-30_system_tags.md, and this session's "
        "6-seed completion (5/99 added 2026-07-31)"
    ),
    "deployed_artifact": (
        "seed 7 of this recipe, select-phase with the smoothed checkpoint "
        "selector (CQS 77.46, test recall 0.844, purity 0.7675, best_epoch "
        "30), deployed 2026-07-30/31. Sits close to but slightly below the "
        "6-seed sweep mean (77.74) -- a representative draw, not cherry-"
        "picked, unlike the 2026-07-25 baseline's seed 7 (78.11, a good draw "
        "over a 75.82 recipe mean). Re-anchoring the gate on the sweep mean "
        "means the deployed artifact itself sits almost exactly at the new "
        "baseline rather than comfortably above it -- expected once the gate "
        "reflects the recipe's own real performance instead of a stale, "
        "wider one."
    ),
    "dispersion_note": (
        "Seed 42's historical bad-basin collapse for concat fusion (CQS "
        "~70.7, recall ~0.47 under the 130-feature recipe) is gone under "
        "this recipe -- 76.72 / 0.786, in line with the other 5 seeds. "
        "Whether hustle-defense, system-tags, or their combination is "
        "responsible for fixing that basin specifically was not isolated "
        "further; both additions independently reduced dispersion in their "
        "own before/after sweeps (see the two 07-30 docs)."
    ),
    "warning": (
        "Numbers from different protocols are not comparable. Re-anchor this "
        "block only from a run whose protocol is recorded here, and update "
        "BASELINE_SD in the same commit."
    ),
}

# A promote decision from a single seed is not decision-grade; below this the
# gate still runs but the CQS bar is widened by the seed noise (see _threshold).
PROMOTE_SEEDS_TARGET = 4


def _threshold(metric: str, n_seeds: int, floor: float) -> float:
    """Effective slack: max(hand floor, 2 x standard error of the seed mean).

    With one seed the standard error is the full seed sd, so the bar is wide;
    averaging over PROMOTE_SEEDS_TARGET seeds shrinks it back toward the floor.
    This is what stops the gate adjudicating sampling noise -- measured test
    recall sd is 0.088, more than 4x the old hand-picked 0.02 slack.
    """
    sd = BASELINE_SD.get(metric)
    if not sd:
        return floor
    sem = float(sd) / math.sqrt(max(1, int(n_seeds)))
    return max(floor, 2.0 * sem)


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
        "skill_nn": _clip01(1.0 - (nn_gap / SKILL_NN_SCALE) if nn_gap is not None else 0.0),
        "next_r2": _clip01(next_r2 if next_r2 is not None else 0.0),
        "next_mae": _clip01(1.0 - (next_mae / NEXT_MAE_SCALE) if next_mae is not None else 0.0),
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
            "promote if CQS >= baseline_cqs + delta, test recall@10 and "
            "purity@20 stay within their floors, and continuity spread stays "
            "under its bar. Thresholds are 2x the standard error of the seed "
            "mean (measured seed sd: recall 0.088, CQS 1.61, purity 0.0046), "
            "so they widen when a decision rests on few seeds and tighten "
            f"toward the hand floors at {PROMOTE_SEEDS_TARGET} seeds."
        ),
        "baseline_provenance": dict(BASELINE_PROVENANCE),
        "baseline_sd": dict(BASELINE_SD),
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
    n_seeds: int = 1,
) -> tuple[bool, str]:
    block = new_report.get("composite") or composite_quality(new_report)
    new_cqs = float(block["cqs"])
    new_recall = _num(block.get("test_recall_at_10"))
    if new_recall is None:
        new_recall = _num(_held_out_test(new_report).get("recall_at_10_mtnn")) or 0.0
    new_purity = _num(block.get("purity_at_20"))
    if new_purity is None:
        new_purity = _num(new_report.get("cross_era_archetype_neighbor_purity_at_20")) or 0.0

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
        name for name, detail in flags.items() if isinstance(detail, dict) and detail.get("flagged") is True
    ]
    if failed_flags:
        return False, "population validation failed: " + ", ".join(failed_flags)

    eff_recall = _threshold("recall", n_seeds, recall_slack)
    eff_purity = _threshold("purity", n_seeds, purity_slack)
    eff_cqs = _threshold("cqs", n_seeds, cqs_delta)

    if new_recall < float(base_r) - eff_recall:
        return False, (f"recall {new_recall:.3f} < floor {float(base_r) - eff_recall:.3f} (n_seeds={n_seeds})")
    if new_purity < float(base_p) - eff_purity:
        return False, (f"purity {new_purity:.3f} < floor {float(base_p) - eff_purity:.3f} (n_seeds={n_seeds})")
    # Direct guard on the failure mode that actually shipped: the 2026-07-24 run
    # held val recall 0.438 while test went to 0.000, because same-player
    # continuity fell off a cliff outside the training window (spread 0.646 vs
    # 0.100 baseline). Recall alone did not catch it early; this does.
    new_spread = _num(new_report.get("continuity_spread"))
    base_spread = _num(BASELINE.get("continuity_spread"))
    if new_spread is not None and base_spread is not None:
        spread_bar = base_spread + _threshold("continuity_spread", n_seeds, 0.02)
        if new_spread > spread_bar:
            return False, (
                f"continuity spread {new_spread:.3f} > bar {spread_bar:.3f} — "
                "model is memorizing the training window, not generalizing "
                f"(n_seeds={n_seeds})"
            )
    if new_cqs < float(base_cqs) + eff_cqs:
        return False, (
            f"CQS {new_cqs:.2f} < promote bar {float(base_cqs) + eff_cqs:.2f} "
            f"(n_seeds={n_seeds}; bar widens when seeds are few)"
        )
    verdict = (
        f"CQS {new_cqs:.2f} >= {float(base_cqs) + eff_cqs:.2f} "
        f"and recall/purity/continuity floors ok (n_seeds={n_seeds})"
    )
    if n_seeds < PROMOTE_SEEDS_TARGET:
        verdict += (
            f" — NOTE: measured seed sd is recall {BASELINE_SD['recall']}, "
            f"CQS {BASELINE_SD['cqs']}; re-check across "
            f"{PROMOTE_SEEDS_TARGET} seeds before promoting for real"
        )
    return True, verdict


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
