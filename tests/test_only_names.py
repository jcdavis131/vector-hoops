"""ablate_v5 and sweep_v5 refuse an --only name they do not know, before training anything.

The filter was `if not only or k in only`, so `--only typo` trained nothing and
exited 0, and one misspelt name in a list dropped that config silently.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

pytest.importorskip("torch")
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import ablate_v5 as AB  # noqa: E402
import sweep_v5 as SW  # noqa: E402


def _exit_status(exc: SystemExit) -> int:
    # SystemExit("message") exits 1; SystemExit(None) or 0 exits 0.
    code = exc.code
    return code if isinstance(code, int) else (0 if code is None else 1)


def test_select_only_keeps_known_order_and_takes_all_when_empty():
    assert AB.select_only("", ["a", "b", "c"]) == ["a", "b", "c"]
    assert AB.select_only(" c, a ", ["a", "b", "c"]) == ["a", "c"]


def test_select_only_names_the_unknown_ones():
    with pytest.raises(SystemExit, match=r"unknown name.*nope") as e:
        AB.select_only("a,nope", ["a", "b"])
    assert _exit_status(e.value) != 0


@pytest.mark.parametrize(("mod", "script"), [(AB, "ablate_v5.py"), (SW, "sweep_v5.py")])
def test_main_exits_nonzero_before_touching_the_output_dir(mod, script, tmp_path, monkeypatch):
    out = tmp_path / "ablation"
    monkeypatch.setattr(mod, "OUT", out)

    def no_device(*a, **k):
        raise AssertionError("resolved a device before checking --only")

    monkeypatch.setattr(AB, "resolve_device", no_device)  # sweep_v5 calls AB.resolve_device too
    monkeypatch.setattr(sys, "argv", [script, "--only", "no_such_config"])
    with pytest.raises(SystemExit) as e:
        mod.main()
    assert _exit_status(e.value) != 0
    assert "no_such_config" in str(e.value.code)
    assert not out.exists()


def test_sweep_set_members_are_all_grid_names():
    # --set adds SWEEP_SETS members unchecked; a stale member would be dropped the same way.
    for name, members in SW.SWEEP_SETS.items():
        assert set(members) <= set(SW.GRID), name
