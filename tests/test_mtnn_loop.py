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
