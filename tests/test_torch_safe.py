"""safe_torch_load refuses an arbitrary pickle unless the caller opts in [health#9].

It used to retry with weights_only=False on any exception, so the file the
safe path refused was then unpickled with full code execution.
"""

from __future__ import annotations

import argparse
import pickle
import sys
from pathlib import Path

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
