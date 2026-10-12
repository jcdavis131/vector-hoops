"""safe_torch_load refuses an arbitrary pickle unless the caller opts in [health#9].

It used to retry with weights_only=False on any exception, so the file the
safe path refused was then unpickled with full code execution.
"""

from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

import numpy as np
import pytest

torch = pytest.importorskip("torch")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from _torch_safe import safe_torch_load  # noqa: E402


def _train_mtnn_shaped(path: Path) -> None:
    # What train_mtnn saves: a state_dict and vars(args), primitives only.
    net = torch.nn.Linear(3, 2)
    torch.save({"model": net.state_dict(), "args": {"dim": 64, "fusion": "concat", "seed": 7, "x": None}}, path)


def test_a_checkpoint_of_tensors_and_primitives_loads_by_default(tmp_path):
    p = tmp_path / "ok.pt"
    _train_mtnn_shaped(p)
    ck = safe_torch_load(p, map_location="cpu")
    assert ck["args"]["dim"] == 64
    assert ck["model"]["weight"].shape == (2, 3)


def test_an_arbitrary_object_is_refused_by_default(tmp_path):
    p = tmp_path / "obj.pt"
    torch.save({"args": argparse.Namespace(dim=64)}, p)
    with pytest.raises(pickle.UnpicklingError):
        safe_torch_load(p, map_location="cpu")


def test_a_caller_cannot_turn_the_check_off_with_weights_only(tmp_path):
    p = tmp_path / "obj.pt"
    torch.save({"args": argparse.Namespace(dim=64)}, p)
    with pytest.raises(pickle.UnpicklingError):
        safe_torch_load(p, map_location="cpu", weights_only=False)


def test_unsafe_pickle_is_the_explicit_opt_in(tmp_path):
    p = tmp_path / "obj.pt"
    torch.save({"args": argparse.Namespace(dim=64)}, p)
    ck = safe_torch_load(p, map_location="cpu", unsafe_pickle=True)
    assert ck["args"].dim == 64


def _career_stats():
    # train_career_mtnn's mu/sd: per-column mean/std of float32 residuals.
    y = np.array([[1.5, -2.0], [0.5, 3.0], [-1.0, 1.0]], dtype=np.float32)
    sd = y.std(axis=0)
    return y.mean(axis=0), np.where(sd < 1e-6, 1.0, sd).astype(np.float32)


def test_train_career_mtnn_reloads_its_own_checkpoint(tmp_path):
    # train_career_mtnn reloads OUT_PT through safe_torch_load after training.
    # Its checkpoint used to carry numpy mu/sd, which weights_only refuses, so
    # every run died there; this builds the payload with the script's own
    # function so the test cannot drift from what it saves.
    import train_career_mtnn as tcm

    mu, sd = _career_stats()
    model = tcm.CareerGRU(5, d_hid=8, d_out=2)
    p = tmp_path / "career_mtnn_best.pt"
    torch.save(tcm.checkpoint_payload(model, mu, sd, 8, 7), p)
    ck = safe_torch_load(p, map_location="cpu")
    tcm.CareerGRU(5, d_hid=8, d_out=2).load_state_dict(ck["model"])
    np.testing.assert_array_equal(ck["mu"].numpy(), mu)
    np.testing.assert_array_equal(ck["sd"].numpy(), sd)
    assert (ck["hid"], ck["seed"], ck["mode"]) == (8, 7, "residual")


def test_the_old_career_checkpoint_with_numpy_stats_is_refused(tmp_path):
    # Why checkpoint_payload stores tensors: the ndarray form fails here.
    mu, sd = _career_stats()
    p = tmp_path / "old.pt"
    torch.save({"model": torch.nn.Linear(3, 2).state_dict(), "mu": mu, "sd": sd, "hid": 8}, p)
    with pytest.raises(pickle.UnpicklingError):
        safe_torch_load(p, map_location="cpu")


def test_a_truncated_file_fails_once_without_an_unsafe_retry(tmp_path, monkeypatch):
    p = tmp_path / "torn.pt"
    _train_mtnn_shaped(p)
    p.write_bytes(p.read_bytes()[:40])
    calls = []
    real = torch.load

    def spy(*a, **k):
        calls.append(k.get("weights_only"))
        return real(*a, **k)

    monkeypatch.setattr(torch, "load", spy)
    with pytest.raises(Exception):  # noqa: B017 - torch raises RuntimeError or UnpicklingError by version
        safe_torch_load(p, map_location="cpu")
    assert calls == [True]
