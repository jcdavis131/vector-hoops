"""pipeline/stage_contract.py: the matrix stage's data contract fails on each violation it names.

Every case is a tiny matrix built here, never the real one. The real matrix is
checked by `rebuild_all.py --stage matrix`, whose last step runs the contract;
that needs the gitignored pipeline/data and so cannot run in CI.

Run:  python -m pytest tests/test_stage_contract.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import stage_contract as sc  # noqa: E402

N = 200
COLUMNS = ["A1", "A2", "B1"]
FAMILIES = {"A1": "alpha", "A2": "alpha", "B1": "beta"}


def bundle(n: int = N) -> dict[str, np.ndarray]:
    """Fully observed, no zeros: every drop or rise below is the test's doing."""
    rng = np.random.default_rng(11)
    Z = (rng.random((n, len(COLUMNS))) + 0.5).astype(np.float32)
    return {
        "Z": Z,
        "mask": np.ones_like(Z),
        "player_id": np.arange(1000, 1000 + n, dtype=np.int64),
        "season": np.array(["2020-21"] * n),
    }


def stats_of(b: dict[str, np.ndarray], columns=COLUMNS, families=FAMILIES) -> dict:
    return sc.compute_stats(b["Z"], b["mask"], b["player_id"], b["season"], columns, families)


def contract_of(b: dict[str, np.ndarray]) -> dict:
    return sc.build_contract(stats_of(b), notes=["test"], generated={"by": "test"})


def kinds(violations: list[str]) -> set[str]:
    return {v.split(":", 1)[0] for v in violations}


def mask_out(b: dict[str, np.ndarray], col: str, frac: float) -> None:
    """Masked cells are stored as 0, the way integrate_context stores them."""
    j, k = COLUMNS.index(col), int(round(frac * len(b["Z"])))
    b["mask"][:k, j] = 0.0
    b["Z"][:k, j] = 0.0


# --- passes ------------------------------------------------------------------


def test_identical_matrix_passes():
    b = bundle()
    assert sc.compare(contract_of(b), stats_of(bundle())) == []


def test_changed_values_alone_pass():
    """values_sha256 is recorded, not compared: a cache refresh moves values."""
    base, new = bundle(), bundle()
    new["Z"] = new["Z"] * 1.5
    s = stats_of(new)
    assert s["values_sha256"] != contract_of(base)["values_sha256"]
    assert sc.compare(contract_of(base), s) == []


def test_small_drops_inside_the_limits_pass():
    base, new = bundle(), bundle()
    mask_out(new, "A2", 0.08)  # alpha coverage -4 points, A2 zeros +8 points
    assert sc.compare(contract_of(base), stats_of(new)) == []


# --- each violation ------------------------------------------------------------


def test_row_count_change_over_one_percent_fails():
    base = contract_of(bundle(N))
    assert kinds(sc.compare(base, stats_of(bundle(N + 3)), allow_key_change=True)) == {"rows"}
    # 1 row in 200 is 0.5%: inside the limit, so only the keys change shows.
    assert kinds(sc.compare(base, stats_of(bundle(N + 1)))) == {"keys"}


def test_column_order_change_fails():
    b = bundle()
    swapped = {**b, "Z": b["Z"][:, [1, 0, 2]], "mask": b["mask"][:, [1, 0, 2]]}
    v = sc.compare(contract_of(b), stats_of(swapped, columns=["A2", "A1", "B1"]))
    assert kinds(v) == {"columns"}
    assert "2 moved" in v[0]


def test_column_removed_fails():
    b = bundle()
    fewer = {**b, "Z": b["Z"][:, :2], "mask": b["mask"][:, :2]}
    v = sc.compare(contract_of(b), stats_of(fewer, columns=["A1", "A2"], families={"A1": "alpha", "A2": "alpha"}))
    assert "columns" in kinds(v)
    assert any("removed ['B1']" in x for x in v)


def test_column_moving_to_another_family_fails():
    b = bundle()
    v = sc.compare(contract_of(b), stats_of(b, families={**FAMILIES, "A2": "beta"}))
    assert kinds(v) == {"columns"}
    assert "changed family" in v[0]


def test_family_coverage_drop_over_five_points_fails():
    base, new = bundle(), bundle()
    mask_out(new, "A2", 0.12)  # alpha coverage 1.0 -> 0.94
    v = sc.compare(contract_of(base), stats_of(new))
    assert "coverage" in kinds(v)
    assert any("family 'alpha'" in x for x in v)


def test_zero_fraction_rise_over_ten_points_fails():
    """A constant 0 under mask=1: coverage is unchanged, only the zeros catch it."""
    base, new = bundle(), bundle()
    new["Z"][: int(0.15 * N), COLUMNS.index("B1")] = 0.0
    v = sc.compare(contract_of(base), stats_of(new))
    assert kinds(v) == {"zeros"}
    assert "column 'B1'" in v[0]


def test_key_change_fails_unless_allowed():
    base, new = bundle(), bundle()
    new["player_id"] = new["player_id"][::-1].copy()
    assert kinds(sc.compare(contract_of(base), stats_of(new))) == {"keys"}
    assert sc.compare(contract_of(base), stats_of(new), allow_key_change=True) == []


# --- CLI -----------------------------------------------------------------------


def write_matrix(d: Path, b: dict[str, np.ndarray]) -> tuple[Path, Path]:
    d.mkdir(parents=True, exist_ok=True)
    n = len(b["Z"])
    np.savez_compressed(
        d / "train_matrix.npz",
        Z=b["Z"],
        mask=b["mask"],
        player_id=b["player_id"],
        season=b["season"],
        name=np.array([f"P{i}" for i in range(n)]),
        cluster=np.zeros(n, dtype=np.int64),
    )
    (d / "feature_manifest.json").write_text(
        json.dumps({"features": COLUMNS, "families": FAMILIES, "source": "test"}), encoding="utf-8"
    )
    return d / "train_matrix.npz", d / "feature_manifest.json"


def cli(matrix: Path, manifest: Path, contract: Path, *extra: str) -> int:
    return sc.main(["--matrix", str(matrix), "--manifest", str(manifest), "--contract", str(contract), *extra])


def test_cli_creates_checks_and_rejects(tmp_path, capsys):
    contract = tmp_path / "contracts" / "train_matrix.contract.json"
    m, man = write_matrix(tmp_path / "good", bundle())
    assert cli(m, man, contract) == sc.EXIT_VIOLATION  # no contract yet
    assert cli(m, man, contract, "--accept-drift") == 0
    assert cli(m, man, contract) == 0

    bad = bundle()
    mask_out(bad, "A1", 0.5)
    m2, man2 = write_matrix(tmp_path / "bad", bad)
    capsys.readouterr()
    assert cli(m2, man2, contract) == sc.EXIT_VIOLATION
    out = capsys.readouterr().out
    assert "coverage: family 'alpha'" in out
    assert "zeros: column 'A1'" in out


def test_cli_accept_drift_keeps_notes_and_then_passes(tmp_path):
    contract = tmp_path / "c.json"
    m, man = write_matrix(tmp_path / "a", bundle())
    assert cli(m, man, contract, "--accept-drift") == 0
    doc = json.loads(contract.read_text(encoding="utf-8"))
    doc["notes"] = ["why this matrix is the reference"]
    contract.write_text(json.dumps(doc), encoding="utf-8")

    m2, man2 = write_matrix(tmp_path / "b", bundle(N + 10))
    assert cli(m2, man2, contract) == sc.EXIT_VIOLATION
    assert cli(m2, man2, contract, "--accept-drift") == 0
    assert json.loads(contract.read_text(encoding="utf-8"))["notes"] == ["why this matrix is the reference"]
    assert cli(m2, man2, contract) == 0
    assert b"\r\n" not in contract.read_bytes()


def test_cli_stats_out(tmp_path):
    contract = tmp_path / "c.json"
    m, man = write_matrix(tmp_path / "a", bundle())
    out = tmp_path / "run" / "stats.json"
    assert cli(m, man, contract, "--accept-drift", "--stats-out", str(out)) == 0
    stats = json.loads(out.read_text(encoding="utf-8"))
    assert stats["rows"] == N
    assert stats["column_stats"]["A1"] == {"observed": 1.0, "zero": 0.0}


def test_missing_matrix_is_an_error_not_a_pass(tmp_path):
    with pytest.raises(SystemExit, match="missing"):
        cli(tmp_path / "nope.npz", tmp_path / "nope.json", tmp_path / "c.json")


# --- the committed contract ----------------------------------------------------


def test_committed_contract_is_self_consistent():
    """Catches a hand edit that leaves the contract describing no possible matrix."""
    doc = json.loads(sc.CONTRACT.read_text(encoding="utf-8"))
    cols = doc["columns"]
    assert len(cols) == doc["cols"] == len(set(cols))
    lines = hashlib.sha256("".join(f"{c}\n" for c in cols).encode("utf-8")).hexdigest()
    assert lines == doc["columns_sha256"]
    assert set(doc["families"]) == set(cols) == set(doc["column_stats"])
    assert set(doc["family_coverage"]) == set(doc["families"].values())
    assert doc["notes"], "the contract's notes say which matrix it was taken from"
