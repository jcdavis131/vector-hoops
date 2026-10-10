"""update_dataset runs enrich_vectors.py whenever a build_vectors step rewrote vectors.json.

The default run (no --offline, no --keep-vectors) rebuilt assets/vectors.json
with build_vectors and never ran enrich_vectors, the only writer of each
player's position `p`. Steps are recorded, not executed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import update_dataset as ud  # noqa: E402


@pytest.fixture
def recorded(tmp_path, monkeypatch):
    calls: list[list[str]] = []
    fail: set[str] = set()

    def run_step(name, cmd, required):
        calls.append(cmd[1:])
        ok = not any(cmd[1:] == f.split() for f in fail)
        return {"step": name, "ok": ok, "rc": 0 if ok else 2, "seconds": 0.0}

    monkeypatch.setattr(ud, "run_step", run_step)
    monkeypatch.setattr(ud, "snapshot", lambda: {"player_seasons": 0, "grade_sha1": "x"})
    monkeypatch.setattr(ud, "ROOT", tmp_path)
    monkeypatch.setattr(ud, "LEDGER", tmp_path / "ledger.json")
    return calls, fail


def _scripts(calls):
    return [" ".join(c) for c in calls]


def test_default_run_enriches_right_after_the_vectors_rebuild(recorded, monkeypatch):
    calls, _ = recorded
    monkeypatch.setattr(sys, "argv", ["update_dataset.py"])
    ud.main()
    s = _scripts(calls)
    i = s.index("pipeline/build_vectors.py --offline")
    assert s[i + 1] == "pipeline/enrich_vectors.py"
    assert s.index("pipeline/enrich_vectors.py") < s.index("pipeline/build_skills.py")


def test_offline_run_enriches_too(recorded, monkeypatch):
    calls, _ = recorded
    monkeypatch.setattr(sys, "argv", ["update_dataset.py", "--offline"])
    ud.main()
    assert "pipeline/enrich_vectors.py" in _scripts(calls)


def test_keep_vectors_does_not_touch_vectors_json(recorded, monkeypatch):
    calls, _ = recorded
    monkeypatch.setattr(sys, "argv", ["update_dataset.py", "--keep-vectors"])
    ud.main()
    s = _scripts(calls)
    assert not any(x.startswith("pipeline/build_vectors.py") for x in s)
    assert "pipeline/enrich_vectors.py" not in s


def test_no_enrich_when_no_build_rewrote_the_file(recorded, monkeypatch):
    calls, fail = recorded
    fail |= {"pipeline/build_vectors.py", "pipeline/build_vectors.py --offline"}
    monkeypatch.setattr(sys, "argv", ["update_dataset.py"])
    ud.main()
    assert "pipeline/enrich_vectors.py" not in _scripts(calls)


def test_a_successful_online_build_alone_still_enriches(recorded, monkeypatch):
    calls, fail = recorded
    fail.add("pipeline/build_vectors.py --offline")
    monkeypatch.setattr(sys, "argv", ["update_dataset.py"])
    ud.main()
    assert "pipeline/enrich_vectors.py" in _scripts(calls)
