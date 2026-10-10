"""The profile and next-season targets nobody measured stay out of the losses and the scores.

Since 078b75df a percentage with no attempt behind it is mask 0 with z 0.0, and
FG3_PCT and FT_PCT are two of the 14 game columns the profile and next_profile
heads predict. Every consumer that reads those columns as a target counts only
the measured cells: the two losses in train_mtnn and ablate_v5
(train_mtnn.masked_cell_mean), CQS v1's next_profile
(train_mtnn.next_profile_holdout_metrics), CQS v2's next head
(tests/test_composite_v2.py), the population-validation next-year flag
(mtnn_validation) and ablate_v5's leakfree.next_profile_metrics. When every
game cell is measured, as in every matrix before
078b75df, each of them runs its original code [final#8 follow-up].

Run:  python -m pytest tests/test_game_target_mask.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mtnn_metrics as mm  # noqa: E402
from mtnn_validation import _next_profile_metrics  # noqa: E402

# Six rows; pairs (0 -> 1) and (2 -> 3) target 2024-25 (test), (4 -> 5) 2022-23 (val).
SEASONS = np.array(["2023-24", "2024-25", "2023-24", "2024-25", "2021-22", "2022-23"])
NEXT = np.array([1, -1, 3, -1, 5, -1])
TARGET = np.array([[0, 0], [1.0, 4.0], [0, 0], [3.0, 0.0], [0, 0], [2.0, 2.0]], dtype=np.float32)
PRED = np.array([[0.5, 5.0], [0, 0], [2.0, 5.0], [0, 0], [1.0, 1.0], [0, 0]], dtype=np.float32)
MEASURED = np.ones((6, 2), dtype=bool)
MEASURED[3, 1] = False  # row 3's second game cell: no attempt, stored as 0.0


def test_population_validation_next_metrics_count_only_measured_targets():
    rows = np.array([0, 2])
    # Measured test targets: col 0 [1, 3] vs [0.5, 2] and col 1 [4] vs [5].
    # Residuals [0.5, 1.0, -1.0]: MAE 2.5 / 3; SS_res 2.25, SS_tot 2 + 0 -> R2 -0.125.
    got = _next_profile_metrics(PRED, TARGET, NEXT, rows, MEASURED)
    assert got == {"rows": 2, "r2": pytest.approx(-0.125), "mae_z": pytest.approx(0.8333)}
    # Without the mask the unmeasured 0.0 is a target: residual -5.0 joins.
    assert _next_profile_metrics(PRED, TARGET, NEXT, rows)["mae_z"] == pytest.approx(7.5 / 4)


@pytest.fixture(scope="module")
def T():
    pytest.importorskip("torch")
    import train_mtnn

    return train_mtnn


def test_v1_next_profile_counts_only_measured_targets(T):
    names = ["G0", "G1"]
    out = T.next_profile_holdout_metrics(PRED, TARGET, NEXT, SEASONS, names, target_mask=MEASURED)
    assert out["test"]["r2"] == pytest.approx(-0.125)
    assert out["test"]["mae_z"] == pytest.approx(0.8333)
    assert out["test"]["rmse_z"] == pytest.approx(round(float(np.sqrt(2.25 / 3)), 4))
    assert out["test"]["target_cells_unmeasured"] == 1
    # Per-feature MAE over each feature's measured cells: col 0 0.75, col 1 1.0.
    worst = {w["feature"]: w["mae_z"] for w in out["test"]["worst_features_mae_z"]}
    assert worst == {"G0": pytest.approx(0.75), "G1": pytest.approx(1.0)}
    # The val split has no unmeasured target and still reports the count.
    assert out["val"]["target_cells_unmeasured"] == 0


def test_v1_next_profile_without_a_mask_is_the_original_report(T):
    names = ["G0", "G1"]
    out = T.next_profile_holdout_metrics(PRED, TARGET, NEXT, SEASONS, names)
    assert "target_cells_unmeasured" not in out["test"]
    # The unmeasured 0.0 counts: residuals [0.5, 1.0, -1.0, -5.0] -> MAE 1.875.
    assert out["test"]["mae_z"] == pytest.approx(1.875)


def test_leakfree_next_metrics_count_only_measured_targets(T):
    import leakfree as LF

    split = np.array([mm.eval_split(s) for s in SEASONS])
    out = LF.next_profile_metrics(PRED, TARGET, NEXT, split, ["G0", "G1"], target_mask=MEASURED)
    assert out["test"] == {
        "rows": 2,
        "mae_z": pytest.approx(0.8333),
        "rmse_z": pytest.approx(round(float(np.sqrt(2.25 / 3)), 4)),
        "r2": pytest.approx(-0.125),
    }
    assert LF.next_profile_metrics(PRED, TARGET, NEXT, split, ["G0", "G1"])["test"]["mae_z"] == pytest.approx(1.875)


def test_masked_cell_mean_ignores_the_unmeasured_cells_and_their_gradient(T):
    torch = pytest.importorskip("torch")
    pred = torch.tensor([[1.0, 2.0], [3.0, 4.0]], requires_grad=True)
    target = torch.tensor([[0.0, 0.0], [0.0, 100.0]])
    mask = torch.tensor([[1.0, 1.0], [1.0, 0.0]])
    loss = T.masked_cell_mean((pred - target) ** 2, mask)
    assert loss.detach().item() == pytest.approx((1 + 4 + 9) / 3)
    loss.backward()
    assert pred.grad[1, 1].item() == 0.0
    # Smooth L1 too, as the next_profile loss uses it.
    l1 = torch.nn.functional.smooth_l1_loss(pred, target, reduction="none")
    assert T.masked_cell_mean(l1, mask).detach().item() == pytest.approx((0.5 + 1.5 + 2.5) / 3)
    # No measured cell: a zero that keeps the graph.
    empty = T.masked_cell_mean((pred - target) ** 2, torch.zeros_like(mask))
    assert empty.detach().item() == 0.0 and empty.requires_grad


def test_trainer_takes_the_target_mask_from_the_matrix_as_built(T):
    """A --mask-* ablation zeroes M in place after Z_built / M_built are copied; the target
    mask must come from M_built, so an ablated input is not dropped as a target. The two
    losses keep their original calls on the all-measured path."""
    src = (ROOT / "pipeline" / "train_mtnn.py").read_text(encoding="utf-8")
    assert "game_measured = game_target_mask(M_built, game_cols)" in src
    assert src.index("Z_built, M_built = Z.copy(), M.copy()") < src.index("game_measured = game_target_mask(")
    assert "target_mask=game_measured" in src and "game_profile_mask=game_measured" in src
    assert "masked_cell_mean(profile_se, game_m[idx_t])" in src
    assert "masked_cell_mean(next_l1, game_m[next_t])" in src
    assert 'term("profile", F.mse_loss(out_a["profile"], game_z[idx_t]))' in src
    assert 'term("next_profile", F.smooth_l1_loss(pred_next, game_z[next_t]))' in src


def test_every_pre_fa2_matrix_takes_the_original_path():
    # game_target_mask is None exactly when no game cell is unmeasured.
    assert mm.game_target_mask(MEASURED | True, [0, 1]) is None
    assert mm.game_target_mask(MEASURED, [0, 1]) is not None
