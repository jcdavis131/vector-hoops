"""integrate_context ends with the data contract check, so the climb's prepare stops on stale side files.

The herdmux climb prepares vector-hoops with build_vectors --offline, enrich_vectors
and integrate_context only. On a box whose side files predate a builder fix every
step exited 0 and the climb trained a matrix no contract recorded [final#5]. Now
integrate_context runs stage_contract's check on what it wrote and exits 2 with the
violations and the remedy; a matching matrix is written byte for byte as without the
check, and the exit is 0.

In process: ic.main() with every path it reads or writes pointed into tmp_path, and
the two builders it spawns (build_salary_market, build_game_ratings) stubbed, since
they write the real pipeline/data. The base matrix (what build_vectors hands it) is a
small synthetic one in tmp_path. honors.json is the side file: fresh, one row per
matrix row keyed by player_id; stale, the shape an old builder wrote (a fifth of the
rows, no player_id, joined by name).

Run:  python -m pytest tests/test_integrate_context_contract.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import types
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import integrate_context as ic  # noqa: E402
import stage_contract  # noqa: E402

SEASONS = ("2020-21", "2021-22")
PER_SEASON = 20
BASE = {"PTS": "volume", "AST": "playmaking", "REB": "rebounding"}
HON = [f for f, fam in ic.V4_FEATURES.items() if fam == "honors"]


def players():
    for s_i, season in enumerate(SEASONS):
        for k in range(PER_SEASON):
            yield 1000 + k, f"Player {k}", season, s_i * PER_SEASON + k


def write_base(d: Path) -> None:
    d.mkdir(parents=True)
    rows = list(players())
    rng = np.random.default_rng(0)
    np.savez_compressed(
        d / "train_matrix.npz",
        Z=rng.normal(size=(len(rows), len(BASE))).astype(np.float32),
        mask=np.ones((len(rows), len(BASE)), np.float32),
        player_id=np.array([r[0] for r in rows], dtype=np.int64),
        season=np.array([r[2] for r in rows]),
        name=np.array([r[1] for r in rows]),
        cluster=np.zeros(len(rows), np.int64),
    )
    manifest = {"features": list(BASE), "families": dict(BASE)}
    (d / "feature_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def honors_doc(*, stale: bool) -> dict:
    out = []
    for pid, name, season, i in players():
        if stale and i % 5:
            continue  # an old build: a fifth of the rows
        row = {"name": name, "season": season, **{f: float((i * (j + 3)) % 11) for j, f in enumerate(HON)}}
        if not stale:
            row["player_id"] = pid
        out.append(row)
    return {"players": out}


@pytest.fixture
def box(tmp_path, monkeypatch):
    """ic pointed into tmp_path: data/ (the matrix), side/ (the side files), contract.json."""
    base, data, side = tmp_path / "base", tmp_path / "data", tmp_path / "side"
    write_base(base)
    side.mkdir()
    for attr in dir(ic):
        if attr.endswith("_JSON"):
            monkeypatch.setattr(ic, attr, side / getattr(ic, attr).name)
    monkeypatch.setattr(ic, "DATA_DIR", data)
    monkeypatch.setattr(ic, "CACHE_DIR", side)
    monkeypatch.setattr(ic, "CONTRACT", tmp_path / "contract.json")
    monkeypatch.delenv(ic.NO_CONTRACT_ENV, raising=False)
    # Not ic.subprocess.run: that would stub subprocess for git_state too.
    ok = subprocess.CompletedProcess(args=[], returncode=0)
    monkeypatch.setattr(ic, "subprocess", types.SimpleNamespace(run=lambda *a, **k: ok))

    real = ROOT / "pipeline" / "data" / "train_matrix.npz"
    before = real.stat().st_mtime_ns if real.exists() else None

    def run(*flags: str, stale: bool = False) -> tuple[bytes, bytes]:
        """build_vectors' output installed afresh, then integrate_context; the bytes it wrote."""
        shutil.rmtree(data, ignore_errors=True)
        shutil.copytree(base, data)
        ic.HONORS_JSON.write_text(json.dumps(honors_doc(stale=stale)), encoding="utf-8")
        monkeypatch.setattr(sys, "argv", ["integrate_context.py", *flags])
        ic.main()
        return (data / "train_matrix.npz").read_bytes(), (data / "feature_manifest.json").read_bytes()

    yield types.SimpleNamespace(run=run, data=data, contract=tmp_path / "contract.json")
    assert (real.stat().st_mtime_ns if real.exists() else None) == before, "the real train_matrix.npz was written"


def accept(box) -> None:
    m, man = box.data / "train_matrix.npz", box.data / "feature_manifest.json"
    argv = ["--matrix", str(m), "--manifest", str(man), "--contract", str(box.contract), "--accept-drift"]
    assert stage_contract.main(argv) == 0


def test_a_matching_matrix_is_written_byte_for_byte_and_exits_0(box, capsys):
    unchecked = box.run("--no-contract")
    accept(box)  # the contract a reviewed --accept-drift would have committed
    capsys.readouterr()
    assert box.run() == unchecked
    out = capsys.readouterr().out
    assert "matches contract.json" in out and "NOT checked" not in out


def test_a_stale_side_file_exits_2_with_the_violations_and_the_remedy(box, capsys):
    box.run("--no-contract")
    accept(box)
    capsys.readouterr()
    with pytest.raises(SystemExit) as ei:
        box.run(stale=True)
    assert ei.value.code == stage_contract.EXIT_VIOLATION == 2
    out = capsys.readouterr().out
    assert "coverage: family 'honors' 1.0000 -> 0.2000" in out
    assert ic.CONTRACT_REMEDY in out
    assert "rebuild_all.py --refresh-context --stage matrix" in ic.CONTRACT_REMEDY


def test_no_contract_and_the_env_switch_skip_the_check_and_say_so(box, capsys, monkeypatch):
    box.run("--no-contract")
    accept(box)
    capsys.readouterr()
    box.run("--no-contract", stale=True)
    assert "--no-contract: the matrix was NOT checked" in capsys.readouterr().out
    monkeypatch.setenv(ic.NO_CONTRACT_ENV, "1")
    box.run(stale=True)
    assert "HOOPS_NO_CONTRACT=1: the matrix was NOT checked" in capsys.readouterr().out


def test_no_contract_file_is_a_failure_not_a_pass(box, capsys):
    with pytest.raises(SystemExit) as ei:
        box.run()
    assert ei.value.code == 2
    out = capsys.readouterr().out
    assert "no contract at" in out and ic.CONTRACT_REMEDY in out


def test_the_climb_and_rebuild_all_run_integrate_context_with_no_flag():
    """The gate is on where it matters only if the prepare step passes no opt-out."""
    import rebuild_all

    step = next(s for s in rebuild_all.build_plan() if s.name == "integrate_context")
    assert step.argv == ("pipeline/integrate_context.py",)
