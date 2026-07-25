"""Gates for the promote gate itself.

The gate shipped for two weeks in a state where no honest model could pass it:
BASELINE was seeded from the pre-protocol loop that trained on held-out
positives, so `recall: 1.0` was memorization and the rule demanded >= 0.98
against a best real measurement of 0.768. Nothing failed loudly -- candidates
were just silently rejected. These tests exist so that specific failure, and
its neighbours, cannot come back.

Run:  python -m unittest pipeline.test_composite_gate
      python pipeline/test_composite_gate.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import composite_score as cqs  # noqa: E402
from composite_score import (  # noqa: E402
    BASELINE,
    BASELINE_SD,
    PROMOTE_SEEDS_TARGET,
    should_promote,
)


def _report(
    *,
    cqs_value: float,
    recall: float,
    purity: float,
    continuity: float | None = None,
    flagged: bool = False,
) -> dict:
    """Minimal report shaped like train_mtnn's, with the composite pre-filled."""
    rep: dict = {
        "composite": {
            "cqs": cqs_value,
            "test_recall_at_10": recall,
            "purity_at_20": purity,
        },
        "population_validation": {
            "collapse_flags": {
                "near_zero_tower_spread": {"flagged": flagged},
                "universally_extreme_confidence": {"flagged": False},
                "systematically_weak_next_year_signal": {"flagged": False},
            }
        },
    }
    if continuity is not None:
        rep["continuity_spread"] = continuity
    return rep


class BaselineProvenanceTests(unittest.TestCase):
    def test_baseline_is_not_the_memorization_artifact(self) -> None:
        """recall 1.0 was leakage. If it returns, the gate is unpassable again."""
        self.assertLess(
            BASELINE["recall"],
            0.99,
            "BASELINE['recall'] is back at the memorization value; see "
            "docs/MTNN_V5_PROMOTE_GATE.md and MTNN_STABILITY_2026-07-24.md §4",
        )

    def test_baseline_has_dispersion_for_every_gated_metric(self) -> None:
        """Thresholds derive from BASELINE_SD; a missing key silently
        collapses that metric's bar back to the hand floor."""
        for key in ("cqs", "recall", "purity"):
            self.assertIn(key, BASELINE, f"BASELINE missing {key}")
            self.assertIn(key, BASELINE_SD, f"BASELINE_SD missing {key}")
            self.assertGreater(BASELINE_SD[key], 0.0)

    def test_provenance_records_protocol_and_seeds(self) -> None:
        prov = cqs.BASELINE_PROVENANCE
        for key in ("recipe", "seeds", "protocol", "recorded"):
            self.assertTrue(prov.get(key), f"BASELINE_PROVENANCE missing {key}")
        self.assertGreaterEqual(len(prov["seeds"]), 2)


class ThresholdScalingTests(unittest.TestCase):
    def test_fewer_seeds_means_a_taller_bar(self) -> None:
        one = cqs._threshold("cqs", 1, cqs.CQS_DELTA)
        four = cqs._threshold("cqs", 4, cqs.CQS_DELTA)
        self.assertGreater(one, four)

    def test_threshold_never_drops_below_hand_floor(self) -> None:
        huge = cqs._threshold("purity", 10_000, cqs.PURITY_SLACK)
        self.assertGreaterEqual(huge, cqs.PURITY_SLACK)

    def test_unknown_metric_falls_back_to_floor(self) -> None:
        self.assertEqual(cqs._threshold("not_a_metric", 1, 0.25), 0.25)

    def test_recall_slack_reflects_measured_noise(self) -> None:
        """A flat 0.02 slack sat ~4x below the real seed sd on test recall."""
        self.assertGreater(cqs._threshold("recall", 1, cqs.RECALL_SLACK), 0.02)


class PromoteDecisionTests(unittest.TestCase):
    def test_collapsed_run_is_rejected(self) -> None:
        """The 2026-07-24 profile: val held up, test recall went to zero."""
        ok, why = should_promote(
            _report(cqs_value=43.5, recall=0.0, purity=0.6729), n_seeds=1
        )
        self.assertFalse(ok)
        self.assertIn("recall", why)

    def test_population_validation_precedes_metric_checks(self) -> None:
        """Order matters: a flagged collapse must report as such, not as a
        metric miss."""
        ok, why = should_promote(
            _report(cqs_value=99.0, recall=1.0, purity=1.0, flagged=True)
        )
        self.assertFalse(ok)
        self.assertIn("population validation failed", why)

    def test_clear_winner_promotes(self) -> None:
        ok, why = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 10.0,
                recall=BASELINE["recall"] + 0.05,
                purity=BASELINE["purity"] + 0.02,
            ),
            n_seeds=PROMOTE_SEEDS_TARGET,
        )
        self.assertTrue(ok, why)

    def test_marginal_gain_rejected_when_only_one_seed(self) -> None:
        """+1.0 CQS is inside one-seed noise (sd 1.61) and must not promote."""
        ok, _ = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 1.0,
                recall=BASELINE["recall"],
                purity=BASELINE["purity"],
            ),
            n_seeds=1,
        )
        self.assertFalse(ok)

    def test_single_seed_promotion_is_flagged_as_provisional(self) -> None:
        ok, why = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 20.0,
                recall=BASELINE["recall"] + 0.1,
                purity=BASELINE["purity"] + 0.05,
            ),
            n_seeds=1,
        )
        self.assertTrue(ok, why)
        self.assertIn("seeds", why)

    def test_continuity_spread_blocks_a_memorizing_model(self) -> None:
        """Guards the failure that actually shipped: strong headline numbers
        while same-player continuity falls apart outside the training window."""
        ok, why = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 20.0,
                recall=BASELINE["recall"] + 0.1,
                purity=BASELINE["purity"] + 0.05,
                continuity=0.646,
            ),
            n_seeds=PROMOTE_SEEDS_TARGET,
        )
        self.assertFalse(ok)
        self.assertIn("continuity", why)

    def test_healthy_continuity_does_not_block(self) -> None:
        ok, why = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 20.0,
                recall=BASELINE["recall"] + 0.1,
                purity=BASELINE["purity"] + 0.05,
                continuity=BASELINE["continuity_spread"],
            ),
            n_seeds=PROMOTE_SEEDS_TARGET,
        )
        self.assertTrue(ok, why)

    def test_missing_continuity_is_not_treated_as_a_failure(self) -> None:
        """Older reports predate the field; absence must not block promotion."""
        ok, why = should_promote(
            _report(
                cqs_value=BASELINE["cqs"] + 20.0,
                recall=BASELINE["recall"] + 0.1,
                purity=BASELINE["purity"] + 0.05,
            ),
            n_seeds=PROMOTE_SEEDS_TARGET,
        )
        self.assertTrue(ok, why)


if __name__ == "__main__":
    unittest.main(verbosity=2)
