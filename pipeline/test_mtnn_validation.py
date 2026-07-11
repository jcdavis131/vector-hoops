"""Focused gates for MTNN population validation diagnostics."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mtnn_validation import build_validation_report


class MTNNValidationTests(unittest.TestCase):
    def test_reports_all_required_population_slices(self) -> None:
        rng = np.random.default_rng(7)
        n = 32
        emb = rng.normal(size=(n, 4)).astype(np.float32)
        emb /= np.linalg.norm(emb, axis=1, keepdims=True)
        towers = rng.normal(size=(n, 3, 4)).astype(np.float32)
        logits = np.full((n, 2), -2.0, dtype=np.float32)
        logits[np.arange(n), np.arange(n) % 2] = 2.0
        target = rng.normal(size=(n, 2)).astype(np.float32)
        pred = target + 0.1
        next_idx = np.roll(np.arange(n), -1)
        next_idx[-1] = -1
        pairs = np.array([[i, i + 1] for i in range(n - 1)], dtype=int)

        report = build_validation_report(
            embeddings=emb,
            tower_stack=towers,
            archetype_logits=logits,
            clusters=np.arange(n) % 2,
            positions=np.arange(n) % 5,
            seasons=np.array(["2024-25"] * n),
            role_labels=np.array(["rotation"] * n),
            next_profile_pred=pred,
            game_profile_target=target,
            next_index=next_idx,
            pairs=pairs,
        )

        self.assertEqual(
            set(report["slices"]),
            {"archetype", "position", "era", "player_role"},
        )
        self.assertIn("retrieval_recall_at_10", report["overall"])
        self.assertIn("archetype_purity_at_20", report["overall"])
        self.assertIn("calibration", report["overall"])
        self.assertIn("tower_spread", report["overall"])
        self.assertIn("collapse_flags", report)

    def test_flags_collapsed_towers_and_universally_extreme_confidence(self) -> None:
        n = 24
        emb = np.eye(n, dtype=np.float32)
        shared_tower = np.ones((n, 1, 4), dtype=np.float32)
        towers = np.repeat(shared_tower, 3, axis=1)
        logits = np.tile(np.array([20.0, -20.0], dtype=np.float32), (n, 1))
        target = np.zeros((n, 2), dtype=np.float32)
        pairs = np.array([[i, (i + 1) % n] for i in range(n)], dtype=int)

        report = build_validation_report(
            embeddings=emb,
            tower_stack=towers,
            archetype_logits=logits,
            clusters=np.zeros(n, dtype=int),
            positions=np.zeros(n, dtype=int),
            seasons=np.array(["2024-25"] * n),
            role_labels=np.array(["rotation"] * n),
            next_profile_pred=target,
            game_profile_target=target,
            next_index=np.full(n, -1, dtype=int),
            pairs=pairs,
        )

        self.assertTrue(report["collapse_flags"]["near_zero_tower_spread"]["flagged"])
        self.assertTrue(report["collapse_flags"]["universally_extreme_confidence"]["flagged"])


if __name__ == "__main__":
    unittest.main()
