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

# The rows each component is scored on, as train_mtnn.py computes it. Four
# components, 0.34 of the weight, are scored over every row, and in a select
# run 11,027 of the 12,966 rows (85%) are train-split rows the loss saw. On the
# box's 2026-08-07 pipeline/data/embedding_v3.npz, archetype top-1 is 0.9745 on
# train rows against 0.8779 on test, and exact purity@20 over every anchor
# 0.7539 against 0.7103 (measured 2026-10-09), so these reward
# fitting the training clusters as well as generalizing [training#3]. Scoring
# them on test rows changes what CQS means and needs one re-baseline with the
# other protocol changes (--protocol-v2 in train_mtnn.py). Until then
# composite_quality says which rows each one used, and changes no number.
COMPONENT_ROWS = {
    "recall": "test-split pairs",
    "purity": "all rows (400 anchors drawn from every row)",
    "margin_14d": "test-split pairs",
    "archetype": "all rows",
    "position": "all rows with a position label",
    "skills_r2": "test-split rows",
    "skill_nn": "all rows with skill grades (400 anchors)",
    "next_r2": "rows whose next season is in the test split",
    "next_mae": "rows whose next season is in the test split",
    "aux_r2": "test-split rows",
}
ALL_ROW_COMPONENTS = ("purity", "archetype", "position", "skill_nn")

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
    This is what stops the gate adjudicating sampling noise. The measured sds
    live in BASELINE_SD and are read from there rather than restated here: an
    earlier version of this docstring said "measured test recall sd is 0.088"
    while BASELINE_SD said 0.031, and the same wrong figure appeared in
    composite_quality's promote_rule. A sentence that explains a threshold has
    to come from the same place the threshold does.
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


# A --protocol-v2 report (train_mtnn writes report["protocol"]) is scored
# without v1's two silent substitutions [eval#10]. A missing held-out test
# recall does not fall back to recall_at_10_same_player_next_season, which
# recall_at_k computes over every pair, most of them training pairs. And a
# missing component does not score 0.0 into a CQS that reads as a bad model:
# on tests/test_composite_score.py's hand report (CQS 60.48), dropping
# position_top1_acc gives 57.48, dropping the skills block 49.48, and a
# missing test recall with a 0.95 all-pairs recall 67.18, with nothing in the
# composite block saying why. With an expected component missing the v2 CQS
# is None, which herdmux's gpu/metrics.py read_result treats as a broken run,
# not a result. A v1 report is scored exactly as before; components_missing
# names what was missing either way.
#
# Expected, per protocol (2026-10-10). Requiring all of WEIGHTS but aux_r2
# also refused runs whose skills components are absent on purpose: a run with
# no skill labels writes "skills": None and trains no skill tower, as masking
# the families an aux head reads removes aux_r2 [eval#10 verifier note]. So
# the skills components are expected only from a run that trained skill
# towers (a skills block in the report); a block with nothing to score on
# test is still a broken run. A component outside the expected set scores
# 0.0, as aux_r2 always has, so such a CQS compares only with runs missing
# the same components (components_missing says which). v1 expects nothing:
# every recorded v1 number was scored that way.
EXPECTED_COMPONENTS: dict[str, tuple[str, ...]] = {
    "v1": (),
    "v2": tuple(k for k in WEIGHTS if k != "aux_r2"),
}
# Expected only when the report shows the run trained what they score.
SKILL_COMPONENTS = ("skills_r2", "skill_nn")
V2_REQUIRED = EXPECTED_COMPONENTS["v2"]  # every v2 component a full run produces


def _protocol(report: dict[str, Any]) -> str:
    """The report's protocol: v2 for a --protocol-v2 report, else v1 (older reports included)."""
    return "v2" if report.get("protocol") == "v2" else "v1"


def _is_v2(report: dict[str, Any]) -> bool:
    return _protocol(report) == "v2"


def expected_components(report: dict[str, Any]) -> list[str]:
    """The components a report of its protocol has to carry for its CQS to be scored."""
    expected = EXPECTED_COMPONENTS[_protocol(report)]
    trained_skills = isinstance(report.get("skills"), dict)
    return [k for k in expected if trained_skills or k not in SKILL_COMPONENTS]


def _test_recall(report: dict[str, Any]) -> float | None:
    """Held-out test recall@10; under v1, the all-pairs recall when it is missing."""
    recall = _num(_held_out_test(report).get("recall_at_10_mtnn"))
    if recall is None and not _is_v2(report):
        recall = _num(report.get("recall_at_10_same_player_next_season"))
    return recall


def missing_components(report: dict[str, Any]) -> list[str]:
    """The WEIGHTS components with no input in the report: component_scores scores each 0.0."""
    test = _held_out_test(report)
    recall = _test_recall(report)
    nxt = _next_test(report)
    aux = _aux_test_r2s(report)
    have = {
        "recall": recall,
        "purity": _num(report.get("cross_era_archetype_neighbor_purity_at_20")),
        "margin_14d": None if recall is None else _num(test.get("recall_at_10_transparent_14d")),
        "archetype": _num(report.get("archetype_top1_acc")),
        "position": _num(report.get("position_top1_acc")),
        "skills_r2": _skills_test_r2(report),
        "skill_nn": _num((report.get("skills") or {}).get("neighbor_consistency_pts_mtnn")),
        "next_r2": _num(nxt.get("r2")),
        "next_mae": _num(nxt.get("mae_z")),
        "aux_r2": sum(aux) / len(aux) if aux else None,
    }
    return [k for k in WEIGHTS if have[k] is None]


def component_scores(report: dict[str, Any]) -> dict[str, float]:
    """Map a mtnn_report-shaped dict to named 0–1 component scores."""
    test = _held_out_test(report)
    recall = _test_recall(report) or 0.0
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
    recall = _test_recall(report)
    purity = _num(report.get("cross_era_archetype_neighbor_purity_at_20"))
    missing = missing_components(report)
    expected = expected_components(report)
    unscored = [k for k in missing if k in expected]
    block = {
        "cqs": None if unscored else round(cqs, 2),
        "components": {k: round(v, 4) for k, v in comps.items()},
        "weights": dict(WEIGHTS),
        "promote_metric": "cqs",
        "promote_rule": (
            "promote if CQS >= baseline_cqs + delta, test recall@10 and "
            "purity@20 stay within their floors, and continuity spread stays "
            "under its bar. Thresholds are 2x the standard error of the seed "
            "mean (measured seed sd: recall "
            f"{BASELINE_SD['recall']:g}, CQS {BASELINE_SD['cqs']:g}, purity "
            f"{BASELINE_SD['purity']:g}), so they widen when a decision rests "
            "on few seeds and tighten toward the hand floors at "
            f"{PROMOTE_SEEDS_TARGET} seeds."
        ),
        "baseline_provenance": dict(BASELINE_PROVENANCE),
        "baseline_sd": dict(BASELINE_SD),
        "baseline_cqs": BASELINE.get("cqs"),
        "baseline_recall": BASELINE.get("recall"),
        "baseline_purity": BASELINE.get("purity"),
        "test_recall_at_10": recall,
        "purity_at_20": purity,
        # Labels only [training#3]: which rows each component used, and the
        # weight scored over all rows, most of them training rows.
        "component_rows": dict(COMPONENT_ROWS),
        "all_rows_weight": round(sum(WEIGHTS[k] for k in ALL_ROW_COMPONENTS), 4),
        # [eval#10] each scored 0.0 above; one in components_expected leaves
        # the CQS unscored instead (none under v1).
        "components_missing": missing,
        "components_expected": expected,
    }
    if unscored:
        block["cqs_unscored"] = (
            f"protocol {_protocol(report)} scores no CQS without {', '.join(unscored)}: a missing component "
            "means a broken run (no enrich_vectors, skill towers with no test rows, no held-out test pairs), "
            "not a score of 0.0"
        )
    return block


def partial_cqs(recall: float | None, purity: float | None) -> float:
    """Mid-epoch checkpoint proxy on [0, 1]: recall and purity, weighted as CQS weights them.

    (WEIGHTS["recall"] * recall + WEIGHTS["purity"] * purity) / (the two
    weights), each clipped to [0, 1]: (0.18 r + 0.16 p) / 0.34 today. It is
    not the full CQS; the other eight components are not scored while
    training, which is why train_mtnn calls this checkpoint metric
    'recall-purity'.

    It used to average that with a "legacy" blend that jumped from
    0.3 r + 0.3 p to 0.4 r + 0.6 p at recall 0.85 [eval#11]. Measured with
    that code on 2026-10-09: partial_cqs(0.849, 0.80) = 0.6603,
    (0.851, 0.70) = 0.7702, (0.851, 0.60) = 0.7166. A 0.002 recall gain
    outweighed a 0.20 purity loss, so which epoch train_mtnn restored hinged
    on whether smoothed val recall happened to cross 0.85.
    """
    tr = recall or 0.0
    pu = purity or 0.0
    mass = WEIGHTS["recall"] + WEIGHTS["purity"]
    return float((WEIGHTS["recall"] * _clip01(tr) + WEIGHTS["purity"] * _clip01(pu)) / mass)


def in_sample_reason(report: dict[str, Any]) -> str | None:
    """Why a report's held-out numbers are not held out, or None when it does not say they are not.

    train_mtnn marks a run whose loss saw every row (fit_rows 'all': --phase
    final-refit, or --fit-rows all) with metrics_source 'in_sample_refit'.
    Reports written before that mark existed said 'selection_holdout' for
    every run, so selection.fit_rows is checked as well [training#0]. A report
    with neither key (a hand-built one, or one older than both) is not judged
    here.
    """
    sel = report.get("selection") or {}
    if report.get("metrics_source") != "in_sample_refit" and sel.get("fit_rows") != "all":
        return None
    n_fit = sel.get("n_fit")
    rows = f" ({n_fit} rows)" if n_fit else ""
    return (
        f"metrics are in-sample: the loss trained on every row{rows}, val and test included "
        "(fit_rows 'all'), so its test recall, purity and CQS are not held out. Promote on the "
        "held-out numbers of a select-phase run of the same recipe"
    )


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
    # Before anything else: no bar below means anything on in-sample numbers.
    in_sample = in_sample_reason(new_report)
    if in_sample is not None:
        return False, in_sample
    block = new_report.get("composite") or composite_quality(new_report)
    if block.get("cqs") is None:
        return False, f"CQS was not scored: {block.get('cqs_unscored') or 'the composite block has no cqs'}"
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
    """Compute and return the baseline dict for the current shipped report.

    Raises ValueError for a report whose CQS is unscored (a v2 report missing
    an expected component). It did float(block["cqs"]), a TypeError on None,
    and it took the all-pairs recall fallback under v2 as well; the recall is
    _test_recall's now, the same one the CQS used.
    """
    block = composite_quality(report)
    if block["cqs"] is None:
        raise ValueError(f"no baseline from an unscored report: {block.get('cqs_unscored')}")
    recall = _test_recall(report) or 0.0
    purity = _num(report.get("cross_era_archetype_neighbor_purity_at_20")) or 0.0
    return {
        "cqs": float(block["cqs"]),
        "recall": float(recall),
        "purity": float(purity),
    }
