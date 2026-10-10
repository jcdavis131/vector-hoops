"""pipeline/artifact_io.py: atomic writes keep the old file, and write the same bytes.

The adoption in train_mtnn, integrate_context, build_vectors and enrich_vectors
is only safe because each helper writes exactly what the numpy / torch /
write_text call it replaced wrote. The bit-identity probe of the climb's
prepare chain covers the matrix, manifest and vectors.json, but it trains with
--no-best-checkpoint, so it never writes a checkpoint. The torch test here is
the only check of atomic_torch_save's bytes.

Run:  python -m pytest tests/test_artifact_io.py
"""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from importlib import metadata
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import artifact_io as aio  # noqa: E402

TRAIN_MATRIX = ROOT / "pipeline" / "data" / "train_matrix.npz"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def only_files(d: Path) -> set[str]:
    return {p.name for p in d.iterdir()}


def small_bundle() -> dict[str, np.ndarray]:
    """The dtypes train_matrix.npz holds: float32 Z/mask, int64 ids, <U strings."""
    rng = np.random.default_rng(7)
    Z = rng.standard_normal((6, 4)).astype(np.float32)
    return {
        "Z": Z,
        "mask": (rng.random((6, 4)) > 0.3).astype(np.float32),
        "player_id": np.array([11, 11, 12, 13, 13, 14], dtype=np.int64),
        "season": np.array(["2019-20", "2020-21", "2020-21", "1997-98", "1998-99", "2025-26"]),
        "name": np.array(["A One", "A One", "B Two", "C Three", "C Three", "D Four"]),
        "cluster": np.array([0, 0, 3, 1, 1, 2], dtype=np.int64),
    }


# --- the old file survives a failed write, and no temp file is left --------


def test_failed_replace_keeps_old_file_and_removes_temp(tmp_path, monkeypatch):
    target = tmp_path / "feature_manifest.json"
    target.write_text("old", encoding="utf-8")

    def boom(self, other):
        raise OSError("simulated failure at the rename")

    monkeypatch.setattr(Path, "replace", boom)
    with pytest.raises(OSError, match="simulated"):
        aio.atomic_write_text(target, "new contents")
    assert target.read_text(encoding="utf-8") == "old"
    assert only_files(tmp_path) == {"feature_manifest.json"}


def test_writer_raising_mid_npz_keeps_old_file(tmp_path):
    """numpy has already written the first member when the second one fails."""
    target = tmp_path / "train_matrix.npz"
    np.savez_compressed(target, Z=np.ones(3))
    before = sha(target)

    class Unconvertible:
        def __array__(self, *a, **k):
            raise RuntimeError("simulated failure inside the second member")

    with pytest.raises(RuntimeError, match="simulated"):
        aio.atomic_savez_compressed(target, Z=np.zeros(10_000), bad=Unconvertible())
    assert sha(target) == before
    assert only_files(tmp_path) == {"train_matrix.npz"}


def test_interrupt_during_fsync_keeps_old_file(tmp_path, monkeypatch):
    """KeyboardInterrupt is not an Exception; the temp file must still go."""
    target = tmp_path / "vectors.json"
    target.write_text('{"players": []}', encoding="utf-8")

    def interrupt(fd):
        raise KeyboardInterrupt

    monkeypatch.setattr(aio.os, "fsync", interrupt)
    with pytest.raises(KeyboardInterrupt):
        aio.atomic_write_json(target, {"players": [1, 2, 3]})
    assert target.read_text(encoding="utf-8") == '{"players": []}'
    assert only_files(tmp_path) == {"vectors.json"}


def test_success_leaves_only_the_target(tmp_path):
    aio.atomic_write_bytes(tmp_path / "a.bin", b"\x00\x01")
    aio.atomic_write_text(tmp_path / "b.json", "{}")
    aio.atomic_savez(tmp_path / "c.npz", x=np.arange(3))
    aio.atomic_savez_compressed(tmp_path / "d.npz", x=np.arange(3))
    assert only_files(tmp_path) == {"a.bin", "b.json", "c.npz", "d.npz"}
    assert (tmp_path / "a.bin").read_bytes() == b"\x00\x01"


def test_overwrites_an_existing_target(tmp_path):
    target = tmp_path / "mtnn_report.json"
    target.write_text("old", encoding="utf-8")
    aio.atomic_write_text(target, "new")
    assert target.read_text(encoding="utf-8") == "new"


def test_replace_retries_a_held_target_then_succeeds(tmp_path, monkeypatch):
    """Windows: PermissionError while a reader has the target open."""
    target = tmp_path / "embedding_v3.npz"
    real_replace = Path.replace
    calls = {"n": 0}

    def flaky(self, other):
        calls["n"] += 1
        if calls["n"] < 3:
            raise PermissionError("held open")
        return real_replace(self, other)

    monkeypatch.setattr(aio, "REPLACE_ATTEMPTS", 5)
    monkeypatch.setattr(aio.time, "sleep", lambda s: None)
    monkeypatch.setattr(Path, "replace", flaky)
    aio.atomic_write_bytes(target, b"ok")
    assert calls["n"] == 3
    assert target.read_bytes() == b"ok"
    assert only_files(tmp_path) == {"embedding_v3.npz"}


def test_replace_gives_up_after_the_last_attempt(tmp_path, monkeypatch):
    target = tmp_path / "x.json"
    target.write_text("old", encoding="utf-8")

    def held(self, other):
        raise PermissionError("held open")

    monkeypatch.setattr(aio, "REPLACE_ATTEMPTS", 3)
    monkeypatch.setattr(aio.time, "sleep", lambda s: None)
    monkeypatch.setattr(Path, "replace", held)
    with pytest.raises(PermissionError):
        aio.atomic_write_text(target, "new")
    assert target.read_text(encoding="utf-8") == "old"
    assert only_files(tmp_path) == {"x.json"}


# --- same bytes as the call each helper replaces ----------------------------


def test_write_text_bytes_match_path_write_text(tmp_path):
    """Including newline translation: CRLF on Windows, LF elsewhere, like write_text."""
    doc = {"features": ["PTS", "AST"], "families": {"PTS": "volume", "AST": "playmaking"}, "é": 1}
    text = json.dumps(doc, indent=2)
    (tmp_path / "ref.json").write_text(text, encoding="utf-8")
    aio.atomic_write_text(tmp_path / "new.json", text)
    assert sha(tmp_path / "new.json") == sha(tmp_path / "ref.json")
    aio.atomic_write_json(tmp_path / "via_json.json", doc, indent=2)
    assert sha(tmp_path / "via_json.json") == sha(tmp_path / "ref.json")


@pytest.mark.parametrize("compressed", [False, True])
def test_savez_bytes_match_numpy(tmp_path, compressed):
    arrays = small_bundle()
    ref, new = tmp_path / "ref.npz", tmp_path / "new.npz"
    if compressed:
        np.savez_compressed(ref, **arrays)
        aio.atomic_savez_compressed(new, **arrays)
    else:
        np.savez(ref, **arrays)
        aio.atomic_savez(new, **arrays)
    assert sha(new) == sha(ref)


def test_savez_appends_npz_like_numpy_and_only_once(tmp_path):
    arrays = small_bundle()
    np.savez_compressed(tmp_path / "ref", **arrays)  # numpy writes ref.npz
    out = aio.atomic_savez_compressed(tmp_path / "new", **arrays)
    assert out == tmp_path / "new.npz"
    assert only_files(tmp_path) == {"ref.npz", "new.npz"}
    assert sha(out) == sha(tmp_path / "ref.npz")


def test_savez_accepts_an_array_named_path(tmp_path):
    out = aio.atomic_savez(tmp_path / "p.npz", path=np.arange(2))
    with np.load(out) as z:
        assert z.files == ["path"]


@pytest.mark.local_data
def test_savez_bytes_match_numpy_on_the_real_train_matrix(tmp_path):
    if not TRAIN_MATRIX.exists():
        pytest.skip(f"missing {TRAIN_MATRIX}")
    with np.load(TRAIN_MATRIX) as z:
        arrays = {k: z[k] for k in z.files}
    for name, ref_fn, new_fn in (
        ("stored", np.savez, aio.atomic_savez),
        ("compressed", np.savez_compressed, aio.atomic_savez_compressed),
    ):
        ref_fn(tmp_path / f"ref_{name}.npz", **arrays)
        new_fn(tmp_path / f"new_{name}.npz", **arrays)
        assert sha(tmp_path / f"new_{name}.npz") == sha(tmp_path / f"ref_{name}.npz"), name


def test_torch_save_bytes_match_torch(tmp_path):
    torch = pytest.importorskip("torch")
    obj = {
        "epoch": 3,
        "model": {"w": torch.arange(12, dtype=torch.float32).reshape(3, 4), "b": torch.zeros(4)},
        "args": {"dim": 64, "seed": 5, "device": "cpu"},
        "weights": {"nce": 1.0},
    }
    (tmp_path / "ref").mkdir()
    (tmp_path / "new").mkdir()
    torch.save(obj, tmp_path / "ref" / "mtnn_best.pt")
    aio.atomic_torch_save(obj, tmp_path / "new" / "mtnn_best.pt")
    assert sha(tmp_path / "new" / "mtnn_best.pt") == sha(tmp_path / "ref" / "mtnn_best.pt")
    assert only_files(tmp_path / "new") == {"mtnn_best.pt"}  # temp dir removed
    back = torch.load(tmp_path / "new" / "mtnn_best.pt", weights_only=True)
    assert torch.equal(back["model"]["w"], obj["model"]["w"])


def test_torch_save_failure_keeps_old_checkpoint(tmp_path, monkeypatch):
    pytest.importorskip("torch")
    target = tmp_path / "mtnn_best.pt"
    target.write_bytes(b"old checkpoint")

    def boom(self, other):
        raise OSError("simulated failure at the rename")

    monkeypatch.setattr(Path, "replace", boom)
    with pytest.raises(OSError, match="simulated"):
        aio.atomic_torch_save({"x": 1}, target)
    assert target.read_bytes() == b"old checkpoint"
    assert only_files(tmp_path) == {"mtnn_best.pt"}


# --- hashes ------------------------------------------------------------------


def test_sha256_file_matches_hashlib_across_chunks(tmp_path):
    data = bytes(range(256)) * 41 + b"tail"
    p = tmp_path / "blob.bin"
    p.write_bytes(data)
    want = hashlib.sha256(data).hexdigest()
    assert aio.sha256_file(p) == want
    assert aio.sha256_file(p, chunk=7) == want


def fingerprint(b: dict[str, np.ndarray], columns: list[str], families) -> dict:
    return aio.matrix_fingerprint(b["Z"], b["mask"], b["player_id"], b["season"], columns, families)


COLUMNS = ["PTS", "AST", "TRK_DRIVES", "HON_ASG_LAG"]
FAMILIES = {"PTS": "volume", "AST": "playmaking", "TRK_DRIVES": "tracking", "HON_ASG_LAG": "honors"}


def test_fingerprint_is_stable_for_identical_inputs():
    a = fingerprint(small_bundle(), COLUMNS, FAMILIES)
    b = fingerprint({k: v.copy() for k, v in small_bundle().items()}, list(COLUMNS), dict(FAMILIES))
    assert a == b
    assert a["rows"] == 6 and a["cols"] == 4
    assert json.loads(json.dumps(a)) == a  # goes into a JSON report as is


def test_fingerprint_keys_hash_is_the_documented_lines():
    b = small_bundle()
    lines = "".join(f"{p}|{s}\n" for p, s in zip(b["player_id"].tolist(), b["season"].tolist(), strict=True))
    assert fingerprint(b, COLUMNS, FAMILIES)["keys_sha256"] == hashlib.sha256(lines.encode()).hexdigest()
    cols = "".join(c + "\n" for c in COLUMNS)
    assert fingerprint(b, COLUMNS, FAMILIES)["columns_sha256"] == hashlib.sha256(cols.encode()).hexdigest()


def test_fingerprint_sees_row_order():
    b = small_bundle()
    order = np.array([1, 0, 2, 3, 4, 5])
    swapped = {k: v[order] for k, v in b.items()}
    a, s = fingerprint(b, COLUMNS, FAMILIES), fingerprint(swapped, COLUMNS, FAMILIES)
    assert a["keys_sha256"] != s["keys_sha256"]
    assert a["values_sha256"] != s["values_sha256"]
    assert a["columns_sha256"] == s["columns_sha256"]
    assert a["family_coverage"] == s["family_coverage"]


def test_fingerprint_sees_column_order():
    b = small_bundle()
    order = [1, 0, 2, 3]
    swapped = dict(b, Z=b["Z"][:, order], mask=b["mask"][:, order])
    a = fingerprint(b, COLUMNS, FAMILIES)
    s = fingerprint(swapped, [COLUMNS[j] for j in order], FAMILIES)
    assert a["columns_sha256"] != s["columns_sha256"]
    assert a["keys_sha256"] == s["keys_sha256"]
    assert a["family_coverage"] == s["family_coverage"]


def test_fingerprint_sees_a_changed_value_under_the_same_labels():
    b = small_bundle()
    changed = dict(b, Z=b["Z"].copy())
    changed["Z"][4, 3] += 0.5
    a, c = fingerprint(b, COLUMNS, FAMILIES), fingerprint(changed, COLUMNS, FAMILIES)
    assert a["values_sha256"] != c["values_sha256"]
    assert (a["keys_sha256"], a["columns_sha256"]) == (c["keys_sha256"], c["columns_sha256"])


def test_fingerprint_family_coverage_is_the_mask_mean():
    b = small_bundle()
    mask = np.zeros((6, 4), dtype=np.float32)
    mask[:, 0] = 1  # volume fully measured
    mask[:3, 2] = 1  # tracking half measured
    fams = {"PTS": "volume", "AST": "volume", "TRK_DRIVES": "tracking", "HON_ASG_LAG": "honors"}
    fp = fingerprint(dict(b, mask=mask), COLUMNS, fams)
    assert fp["family_coverage"] == {"honors": 0.0, "tracking": 0.5, "volume": 0.5}
    aligned = fingerprint(dict(b, mask=mask), COLUMNS, [fams[c] for c in COLUMNS])
    assert aligned == fp


def test_fingerprint_refuses_a_column_without_a_family():
    b = small_bundle()
    with pytest.raises(KeyError, match="no family"):
        fingerprint(b, COLUMNS, {"PTS": "volume"})


def test_fingerprint_refuses_mismatched_shapes():
    b = small_bundle()
    with pytest.raises(ValueError):
        fingerprint(b, COLUMNS[:3], FAMILIES)


def test_fingerprint_from_files_equals_fingerprint_of_the_loaded_arrays(tmp_path):
    """train_mtnn fingerprints the arrays it loaded; promote.py fingerprints the
    files. The two have to agree, or every promotion is refused."""
    b = small_bundle()
    np.savez_compressed(tmp_path / "train_matrix.npz", **b)
    (tmp_path / "feature_manifest.json").write_text(
        json.dumps({"features": COLUMNS, "families": FAMILIES}), encoding="utf-8"
    )
    loaded = np.load(tmp_path / "train_matrix.npz")
    from_arrays = aio.matrix_fingerprint(
        loaded["Z"].astype(np.float32),
        loaded["mask"].astype(np.float32),
        loaded["player_id"],
        loaded["season"],
        COLUMNS,
        FAMILIES,
    )
    from_files = aio.load_matrix_fingerprint(tmp_path / "train_matrix.npz", tmp_path / "feature_manifest.json")
    assert from_files == from_arrays == fingerprint(b, COLUMNS, FAMILIES)
    assert aio.fingerprint_differences(from_arrays, from_files) == []


def test_short_fingerprint_prints_keys_cols_and_coverage():
    b = small_bundle()
    fp = fingerprint(b, COLUMNS, FAMILIES)
    cov = json.dumps(fp["family_coverage"], sort_keys=True, separators=(",", ":"))
    want = f"keys {fp['keys_sha256'][:8]} cols {fp['columns_sha256'][:8]} cov {hashlib.sha256(cov.encode()).hexdigest()[:8]}"
    assert aio.short_matrix_fingerprint(fp) == want


def test_short_fingerprint_moves_with_coverage_under_the_same_rows_and_columns():
    # The [features#2] case: same keys and columns, one family masked differently.
    b = small_bundle()
    masked = dict(b, mask=b["mask"].copy())
    masked["mask"][:, 3] = 0
    a = aio.short_matrix_fingerprint(fingerprint(b, COLUMNS, FAMILIES))
    m = aio.short_matrix_fingerprint(fingerprint(masked, COLUMNS, FAMILIES))
    assert a.split(" cov ")[0] == m.split(" cov ")[0]
    assert a != m


def test_fingerprint_differences_names_the_fields():
    b = small_bundle()
    a = fingerprint(b, COLUMNS, FAMILIES)
    changed = dict(b, Z=b["Z"].copy())
    changed["Z"][0, 0] += 1
    diffs = aio.fingerprint_differences(a, fingerprint(changed, COLUMNS, FAMILIES))
    assert len(diffs) == 1 and diffs[0].startswith("values_sha256: ")


# --- copies and records ----------------------------------------------------------


def test_atomic_copy_is_a_byte_copy_and_leaves_no_temp(tmp_path):
    src = tmp_path / "src" / "mtnn_best.pt"
    src.parent.mkdir()
    src.write_bytes(bytes(range(256)) * 9000)  # > one copy chunk
    dst_dir = tmp_path / "run"
    dst_dir.mkdir()
    (dst_dir / "mtnn_best.pt").write_bytes(b"older run")
    aio.atomic_copy(src, dst_dir / "mtnn_best.pt")
    assert sha(dst_dir / "mtnn_best.pt") == sha(src)
    assert only_files(dst_dir) == {"mtnn_best.pt"}


def test_atomic_copy_failure_keeps_the_old_file(tmp_path):
    dst = tmp_path / "embedding_v3.npz"
    dst.write_bytes(b"old")
    with pytest.raises(FileNotFoundError):
        aio.atomic_copy(tmp_path / "missing.npz", dst)
    assert dst.read_bytes() == b"old"
    assert only_files(tmp_path) == {"embedding_v3.npz"}


def test_file_record_paths_are_relative_to_the_root_when_inside(tmp_path):
    f = tmp_path / "pipeline" / "data" / "x.bin"
    f.parent.mkdir(parents=True)
    f.write_bytes(b"abc")
    rec = aio.file_record(f, tmp_path)
    assert rec == {"path": "pipeline/data/x.bin", "sha256": hashlib.sha256(b"abc").hexdigest(), "bytes": 3}
    elsewhere = aio.file_record(f, tmp_path / "pipeline" / "other")
    assert elsewhere["path"] == f.resolve().as_posix()


# --- run identity --------------------------------------------------------------


def test_git_state_is_all_null_when_git_is_missing(monkeypatch, tmp_path):
    def no_git(*a, **k):
        raise FileNotFoundError("git")

    monkeypatch.setattr(aio.subprocess, "run", no_git)
    assert aio.git_state(tmp_path) == {"sha": None, "short": None, "dirty": None, "branch": None}


def test_git_state_is_all_null_outside_a_checkout(monkeypatch, tmp_path):
    class Failed:
        returncode = 128
        stdout = ""

    monkeypatch.setattr(aio.subprocess, "run", lambda *a, **k: Failed())
    assert aio.git_state(tmp_path) == {"sha": None, "short": None, "dirty": None, "branch": None}


def test_git_state_on_this_checkout():
    if not (ROOT / ".git").exists():
        pytest.skip(f"{ROOT} is not a git checkout")
    st = aio.git_state(ROOT)
    if st["sha"] is None:
        pytest.skip("git is not available here")
    assert len(st["sha"]) == 40 and int(st["sha"], 16) >= 0
    assert st["short"] == st["sha"][:8]
    assert isinstance(st["dirty"], bool)


def test_env_versions_reads_metadata():
    v = aio.env_versions()
    assert set(v) == {"python", "numpy", "pandas", "torch", "sklearn", "vector_core"}
    assert v["python"] == platform.python_version()
    assert v["numpy"] == np.__version__


def test_env_versions_missing_library_is_none(monkeypatch):
    real = metadata.version

    def version(dist):
        if dist == "torch":
            raise metadata.PackageNotFoundError(dist)
        return real(dist) if dist == "numpy" else "1.0"

    monkeypatch.setattr(aio.metadata, "version", version)
    v = aio.env_versions()
    assert v["torch"] is None
    assert v["numpy"] == np.__version__
