"""pipeline/composite_score.py: the CQS arithmetic and should_promote's rules, by hand.

pipeline/test_composite_gate.py tests should_promote on reports whose
composite block is filled in already, so component_scores and
composite_quality (the weights, the clipping, the fallbacks) had no test at
all [tests#7]. The cases here build a report by hand and check the number.

Two current behaviours are pinned as they are, not endorsed: a missing
component scores 0.0, and a missing held-out test recall falls back to
recall_at_10_same_player_next_season, which train_mtnn computes over all
pairs, training pairs included. The tests#7 verifier asked that the CQS
arithmetic stay unchanged so recorded baselines stay comparable; if it does
change, these tests should fail and be updated in the same commit.

should_promote is run against BASELINE and BASELINE_SD values set by each
test, so re-anchoring the real baseline does not break these.

Run:  python -m pytest tests/test_composite_score.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import composite_score as cqs  # noqa: E402

COMPONENTS = {
    "recall",
    "purity",
    "margin_14d",
    "archetype",
    "position",
    "skills_r2",
    "skill_nn",
    "next_r2",
    "next_mae",
    "aux_r2",
}


def hand_report(**over) -> dict:
    """Every input composite_score reads, at values chosen to be easy by hand."""
    rep = {
        "held_out_recall": {"test": {"recall_at_10_mtnn": 0.8, "recall_at_10_transparent_14d": 0.75}},
        "cross_era_archetype_neighbor_purity_at_20": 0.78,
        "archetype_top1_acc": 0.9,
        "position_top1_acc": 0.6,
        "skills": {"holdout": {"test": {"mean_r2": 0.5}}, "neighbor_consistency_pts_mtnn": 5.0},
        "next_profile": {"test": {"r2": 0.3, "mae_z": 0.6}},
        "team_fit": {"test": {"r2": 0.2}},
        "roster_lift": {"test": {"r2": 0.4}},
    }
    rep.update(over)
    return rep


def test_weights_cover_every_component_and_sum_to_one():
    assert set(cqs.WEIGHTS) == COMPONENTS
    assert set(cqs.component_scores({})) == COMPONENTS
    assert sum(cqs.WEIGHTS.values()) == pytest.approx(1.0, abs=1e-12)
    assert all(w > 0 for w in cqs.WEIGHTS.values())


def test_cqs_of_a_hand_built_report():
    """components, then 100 x the weighted sum:
    recall .80 | purity .78 | margin (.80 - .75) / .10 = .50 | archetype .90
    position .60 | skills_r2 .50 | skill_nn 1 - 5/25 = .80 | next_r2 .30
    next_mae 1 - .6/1 = .40 | aux_r2 mean(.2, .4) = .30
    .18*.8 + .16*.78 + .08*.5 + .08*.9 + .05*.6 + .14*.5 + .05*.8 + .12*.3
      + .06*.4 + .08*.3 = .6048  ->  CQS 60.48"""
    block = cqs.composite_quality(hand_report())
    assert block["components"] == {
        "recall": 0.8,
        "purity": 0.78,
        "margin_14d": 0.5,
        "archetype": 0.9,
        "position": 0.6,
        "skills_r2": 0.5,
        "skill_nn": 0.8,
        "next_r2": 0.3,
        "next_mae": 0.4,
        "aux_r2": 0.3,
    }
    assert block["cqs"] == 60.48
    assert block["test_recall_at_10"] == 0.8
    assert block["purity_at_20"] == 0.78
    assert block["weights"] == cqs.WEIGHTS


def test_every_component_is_clipped_to_unit_range():
    low = hand_report(
        held_out_recall={"test": {"recall_at_10_mtnn": 0.5, "recall_at_10_transparent_14d": 0.7}},  # margin < 0
        skills={"holdout": {"test": {"mean_r2": -0.4}}, "neighbor_consistency_pts_mtnn": 30.0},  # 1 - 30/25 < 0
        next_profile={"test": {"r2": -1.0, "mae_z": 1.5}},  # 1 - 1.5 < 0
        team_fit={"test": {"r2": -0.5}},
        roster_lift={"test": {"r2": -0.1}},
    )
    comps = cqs.component_scores(low)
    for key in ("margin_14d", "skills_r2", "skill_nn", "next_r2", "next_mae", "aux_r2"):
        assert comps[key] == 0.0, key

    high = hand_report(
        held_out_recall={"test": {"recall_at_10_mtnn": 0.9, "recall_at_10_transparent_14d": 0.6}},  # margin 3.0
        skills={"holdout": {"test": {"mean_r2": 1.0}}, "neighbor_consistency_pts_mtnn": -2.0},  # 1.08
        next_profile={"test": {"r2": 1.0, "mae_z": -0.5}},  # 1.5
    )
    comps = cqs.component_scores(high)
    for key in ("margin_14d", "skills_r2", "skill_nn", "next_r2", "next_mae"):
        assert comps[key] == 1.0, key


def test_extremes_score_zero_and_one_hundred():
    best = {
        "held_out_recall": {"test": {"recall_at_10_mtnn": 1.0, "recall_at_10_transparent_14d": 0.0}},
        "cross_era_archetype_neighbor_purity_at_20": 1.0,
        "archetype_top1_acc": 1.0,
        "position_top1_acc": 1.0,
        "skills": {"holdout": {"test": {"mean_r2": 1.0}}, "neighbor_consistency_pts_mtnn": 0.0},
        "next_profile": {"test": {"r2": 1.0, "mae_z": 0.0}},
        "competition": {"test": {"r2": 1.0}},
    }
    assert cqs.composite_quality(best)["cqs"] == 100.0
    assert cqs.composite_quality({})["cqs"] == 0.0


def test_a_missing_component_scores_zero():
    """Pinned as current behaviour (tests#7): no position labels means the
    position component is 0.0 and CQS drops by its weight, silently."""
    full = cqs.composite_quality(hand_report())["cqs"]
    rep = hand_report()
    del rep["position_top1_acc"]
    block = cqs.composite_quality(rep)
    assert block["components"]["position"] == 0.0
    assert block["cqs"] == pytest.approx(full - 100 * cqs.WEIGHTS["position"] * 0.6, abs=0.01)


def test_missing_test_recall_falls_back_to_the_all_pairs_recall():
    """Pinned as current behaviour (tests#7): the fallback is computed over
    every adjacent-season pair, training pairs included."""
    rep = hand_report(
        held_out_recall={"test": {"recall_at_10_transparent_14d": 0.75}},
        recall_at_10_same_player_next_season=0.95,
    )
    block = cqs.composite_quality(rep)
    assert block["components"]["recall"] == 0.95
    assert block["components"]["margin_14d"] == pytest.approx(1.0)  # (.95 - .75) / .10, clipped
    assert block["test_recall_at_10"] == 0.95


def test_only_the_seven_named_aux_heads_count():
    """durability is reported but kept out of aux_r2 on purpose (train_mtnn's
    report says adding it would change what CQS means)."""
    base = cqs.composite_quality(hand_report())
    more = cqs.composite_quality(hand_report(durability={"test": {"r2": 0.99}}))
    assert more["cqs"] == base["cqs"]
    seven = hand_report(
        career_slope={"test": {"r2": 0.6}},
        competition={"test": {"r2": 0.6}},
        pedigree_expectation={"test": {"r2": 0.6}},
        playoff_riser={"test": {"r2": 0.6}},
        honors_recognition={"test": {"r2": 0.6}},
    )
    # mean(.2, .4, .6, .6, .6, .6, .6) = 3.6 / 7
    assert cqs.component_scores(seven)["aux_r2"] == pytest.approx(3.6 / 7)


# --- partial_cqs, the checkpoint proxy [eval#11] ---------------------------------


def test_partial_cqs_is_recall_and_purity_at_their_cqs_weights():
    # (.18 * .8 + .16 * .7) / .34 = .256 / .34
    assert cqs.partial_cqs(0.8, 0.7) == pytest.approx(0.256 / 0.34)
    assert cqs.partial_cqs(None, None) == 0.0
    assert cqs.partial_cqs(1.5, -0.2) == pytest.approx(0.18 / 0.34)  # clipped to [0, 1]


def test_partial_cqs_has_no_step_at_recall_085():
    """The old proxy scored (0.851, 0.60) = 0.7166 above (0.849, 0.80) = 0.6603."""
    assert cqs.partial_cqs(0.849, 0.80) > cqs.partial_cqs(0.851, 0.60)
    below, above = cqs.partial_cqs(0.8499, 0.7), cqs.partial_cqs(0.8501, 0.7)
    assert above - below == pytest.approx(0.18 * 0.0002 / 0.34)


# --- should_promote --------------------------------------------------------------


@pytest.fixture
def anchored(monkeypatch):
    """A baseline whose bars are easy to work out:
    n_seeds=1: recall floor .80 - max(.02, 2*.05) = .70; purity floor
      .75 - max(.015, 2*.01) = .73; continuity bar .10 + max(.02, 2*.05) = .20;
      CQS bar 70 + max(.5, 2*1.0) = 72.
    n_seeds=4: recall .80 - .05 = .75; purity .75 - .015 = .735;
      continuity .10 + .05 = .15; CQS 70 + 1.0 = 71."""
    monkeypatch.setattr(cqs, "BASELINE", {"cqs": 70.0, "recall": 0.80, "purity": 0.75, "continuity_spread": 0.10})
    monkeypatch.setattr(cqs, "BASELINE_SD", {"cqs": 1.0, "recall": 0.05, "purity": 0.01, "continuity_spread": 0.05})


def scored(cqs_value=72.5, recall=0.71, purity=0.74, continuity=0.19, flags=None) -> dict:
    rep = {
        "composite": {"cqs": cqs_value, "test_recall_at_10": recall, "purity_at_20": purity},
        "population_validation": {
            "collapse_flags": flags
            if flags is not None
            else {"near_zero_tower_spread": {"flagged": False}, "universally_extreme_confidence": {"flagged": False}}
        },
    }
    if continuity is not None:
        rep["continuity_spread"] = continuity
    return rep


@pytest.mark.parametrize(
    ("over", "reason"),
    [
        ({"recall": 0.69}, "recall 0.690 < floor 0.700 (n_seeds=1)"),
        ({"purity": 0.72}, "purity 0.720 < floor 0.730 (n_seeds=1)"),
        ({"continuity": 0.21}, "continuity spread 0.210 > bar 0.200"),
        ({"cqs_value": 71.9}, "CQS 71.90 < promote bar 72.00 (n_seeds=1"),
    ],
)
def test_each_bar_refuses_on_its_own(anchored, over, reason):
    ok, why = cqs.should_promote(scored())
    assert ok, why
    ok, why = cqs.should_promote(scored(**over))
    assert not ok
    assert why.startswith(reason), why


def test_one_seed_passes_with_a_note_to_recheck(anchored):
    ok, why = cqs.should_promote(scored())
    assert ok
    assert why.startswith("CQS 72.50 >= 72.00 and recall/purity/continuity floors ok (n_seeds=1)")
    assert "re-check across 4 seeds" in why


def test_more_seeds_lower_every_bar(anchored):
    rep = scored(cqs_value=71.5, recall=0.76, purity=0.74, continuity=0.14)
    ok, why = cqs.should_promote(rep, n_seeds=1)
    assert not ok and why.startswith("CQS 71.50 < promote bar 72.00 (n_seeds=1"), why
    ok, why = cqs.should_promote(rep, n_seeds=4)
    assert ok, why
    assert "NOTE" not in why
    ok, why = cqs.should_promote(scored(cqs_value=72.5, recall=0.74), n_seeds=4)
    assert not ok and why.startswith("recall 0.740 < floor 0.750 (n_seeds=4)")


def test_recall_is_checked_before_cqs(anchored):
    ok, why = cqs.should_promote(scored(cqs_value=10.0, recall=0.1))
    assert not ok and why.startswith("recall 0.100")


def test_no_continuity_spread_skips_that_guard(anchored):
    ok, why = cqs.should_promote(scored(continuity=None))
    assert ok, why


@pytest.mark.parametrize(
    ("validation", "reason"),
    [
        (None, "population validation missing"),
        ({"collapse_flags": None}, "population validation collapse flags missing"),
        (
            {"collapse_flags": {"near_zero_tower_spread": {"flagged": True}, "other": {"flagged": False}}},
            "population validation failed: near_zero_tower_spread",
        ),
    ],
)
def test_population_validation_is_required_and_comes_first(anchored, validation, reason):
    rep = scored(cqs_value=99.0, recall=1.0, purity=1.0)
    if validation is None:
        del rep["population_validation"]
    else:
        rep["population_validation"] = validation
    assert cqs.should_promote(rep) == (False, reason)


def test_explicit_baseline_arguments_override_the_module_baseline(anchored):
    ok, why = cqs.should_promote(scored(cqs_value=62.5), baseline_cqs=60.0)
    assert ok and why.startswith("CQS 62.50 >= 62.00")
    ok, why = cqs.should_promote(scored(), baseline_recall=0.95)
    assert not ok and why.startswith("recall 0.710 < floor 0.850")


def test_without_a_composite_block_the_report_is_scored_first(anchored):
    """The hand report scores 60.48 (test_cqs_of_a_hand_built_report)."""
    rep = hand_report(population_validation={"collapse_flags": {}})
    ok, why = cqs.should_promote(rep, baseline_cqs=58.0)
    assert ok and why.startswith("CQS 60.48 >= 60.00"), why
    ok, why = cqs.should_promote(rep, baseline_cqs=59.0)
    assert not ok and why.startswith("CQS 60.48 < promote bar 61.00"), why


def test_no_baseline_cqs_refuses(monkeypatch):
    monkeypatch.setattr(cqs, "BASELINE", {"recall": 0.8, "purity": 0.75})
    assert cqs.should_promote(scored()) == (False, "no baseline_cqs yet — record current CQS as baseline first")


# --- in-sample reports [training#0] ------------------------------------------------


@pytest.mark.parametrize(
    "mark",
    [
        {"metrics_source": "in_sample_refit", "selection": {"fit_rows": "all", "n_fit": 12966}},
        # Written before the mark existed: every report said selection_holdout.
        {"metrics_source": "selection_holdout", "selection": {"fit_rows": "all", "n_fit": 12966}},
        {"metrics_source": "in_sample_refit"},
    ],
)
def test_an_in_sample_report_is_refused_whatever_its_numbers(anchored, mark):
    rep = scored(cqs_value=99.0, recall=1.0, purity=1.0)
    rep.update(mark)
    ok, why = cqs.should_promote(rep)
    assert not ok and why.startswith("metrics are in-sample"), why
    assert ("12966 rows" in why) == ("selection" in mark)
    # It comes before every other check, population validation included.
    del rep["population_validation"]
    assert cqs.should_promote(rep)[1].startswith("metrics are in-sample")


def test_a_held_out_report_is_judged_on_its_numbers(anchored):
    rep = scored()
    rep.update({"metrics_source": "selection_holdout", "selection": {"fit_rows": "train", "n_fit": 11027}})
    assert cqs.in_sample_reason(rep) is None
    assert cqs.should_promote(rep) == cqs.should_promote(scored())


def test_the_composite_block_says_which_rows_each_component_used():
    block = cqs.composite_quality(hand_report())
    assert set(block["component_rows"]) == COMPONENTS
    assert block["all_rows_weight"] == 0.34  # purity .16 + archetype .08 + position .05 + skill_nn .05
    assert all(block["component_rows"][k].startswith("all rows") for k in cqs.ALL_ROW_COMPONENTS)
