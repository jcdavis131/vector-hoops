"""pipeline/mtnn_loop.py: the non-finite guard train_mtnn's loop calls.

A finite step must cost nothing and change nothing, so the first test hands
check_loss a terms mapping that fails if it is read at all. The rest check
that a NaN or inf stops the run with exit code 3 and says where. No torch:
check_loss reads terms with float(), which a 0-d tensor and a plain float
both support.

Run:  python -m pytest tests/test_mtnn_loop.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mtnn_loop  # noqa: E402


class Untouchable(dict):
    def items(self):
        raise AssertionError("a finite loss must not read its terms")


def test_exit_code_is_three_and_distinct():
    assert mtnn_loop.EXIT_NON_FINITE == 3
    err = mtnn_loop.NonFiniteError("x")
    assert isinstance(err, SystemExit) and err.code == 3 and str(err) == "x"


def test_a_finite_loss_passes_without_reading_its_terms():
    assert mtnn_loop.check_loss(1.25, Untouchable(), epoch=0, step=0) is None


def test_a_nan_loss_exits_3_naming_the_epoch_step_and_term(capsys):
    terms = {"contrastive": 2.1, "archetype": float("nan"), "profile": 0.4}
    with pytest.raises(SystemExit) as e:
        mtnn_loop.check_loss(float("nan"), terms, epoch=7, step=12)
    assert e.value.code == 3
    msg = str(e.value)
    assert "epoch 7 step 12" in msg and "non-finite term(s): archetype" in msg
    assert "contrastive" not in msg and "profile" not in msg
    assert "NON-FINITE" in capsys.readouterr().err


def test_every_bad_term_is_named():
    terms = {"vicreg": float("inf"), "skills": float("-inf"), "salary": 0.1}
    with pytest.raises(SystemExit, match="vicreg, skills"):
        mtnn_loop.check_loss(float("inf"), terms, epoch=0, step=3)


def test_an_overflowed_sum_of_finite_terms_says_so():
    with pytest.raises(SystemExit, match="weighted sum overflowed") as e:
        mtnn_loop.check_loss(math.inf, {"a": 1e308, "b": 1e308}, epoch=1, step=0)
    assert e.value.code == 3


@pytest.mark.parametrize(
    ("no_best", "fit_rows", "metric", "want"),
    [
        # A select run keeps what --no-best-checkpoint says, as before.
        (False, "train", "recall", (True, "recall")),
        (True, "train", "purity", (False, "purity")),
        # 'cqs' and 'composite' are the recall-purity proxy, not the full CQS.
        (False, "train", "cqs", (True, "recall-purity")),
        (False, "train", "composite", (True, "recall-purity")),
        (False, "train", "recall-purity", (True, "recall-purity")),
        # Every row in the loss: val rows are training rows, nothing is selected.
        (False, "all", "cqs", (False, "recall-purity")),
        (True, "all", "recall", (False, "recall")),
    ],
)
def test_checkpoint_selection(no_best, fit_rows, metric, want):
    assert mtnn_loop.checkpoint_selection(no_best_checkpoint=no_best, fit_rows=fit_rows, metric=metric) == want


def loop_steps(n_rows: int, batch: int, grad_accum: int) -> int:
    """train_mtnn's epoch loop with the model taken out: count the optimizer steps."""
    steps = accum = 0
    for s in range(0, n_rows, batch):
        if min(batch, n_rows - s) < 8:
            continue
        accum += 1
        if accum < grad_accum:
            continue
        steps += 1
        accum = 0
    if accum > 0:
        steps += 1
    return steps


@pytest.mark.parametrize("n_rows", [0, 7, 8, 511, 512, 519, 520, 1023, 1031, 11027, 12966])
@pytest.mark.parametrize("batch", [4, 8, 512])
@pytest.mark.parametrize("grad_accum", [1, 2, 3])
def test_scheduler_steps_per_epoch_is_what_the_loop_takes(n_rows, batch, grad_accum):
    assert mtnn_loop.scheduler_steps_per_epoch(n_rows, batch, grad_accum) == loop_steps(n_rows, batch, grad_accum)


def test_scheduler_sizing_on_the_real_split():
    """[training#7]: 11,027 fit rows of 12,966 at batch 512. v1 sizes every
    row: ceil(12966 / 512) = 26 an epoch, 1,040 over 40; the loop trains 21
    full batches and a 275-row tail of the fit rows, 22 an epoch, 880."""
    assert mtnn_loop.trained_batches(11027, 512) == 22
    assert mtnn_loop.scheduler_steps_per_epoch(11027, 512, 1) * 40 == 880
    assert -(-12966 // 512) * 40 == 1040
    # A tail under 8 rows is skipped, and with grad accumulation the partial
    # last accumulation still steps.
    assert mtnn_loop.trained_batches(1031, 512) == 2
    assert mtnn_loop.scheduler_steps_per_epoch(1536, 512, 2) == 2


def test_finite_arrays_pass():
    assert mtnn_loop.require_finite({"E": np.ones((3, 2)), "w": np.zeros(4)}, before="writing x") is None


def test_a_nan_in_any_array_exits_3_before_the_write(capsys):
    E = np.ones((4, 2), np.float32)
    E[1, 0] = np.nan
    heads = np.ones(5)
    heads[[0, 4]] = np.inf
    with pytest.raises(SystemExit) as e:
        mtnn_loop.require_finite({"E": E, "ok": np.ones(2), "heads": heads}, before="writing embedding_v3.npz")
    assert e.value.code == 3
    msg = str(e.value)
    assert "before writing embedding_v3.npz" in msg
    assert "E (1 of 8 values)" in msg and "heads (2 of 5 values)" in msg and "ok" not in msg
    assert "NON-FINITE" in capsys.readouterr().err
