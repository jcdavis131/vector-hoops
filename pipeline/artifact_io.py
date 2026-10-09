"""Atomic writes, content hashes and run identity for promoted artifacts.

Writes. Every promoted artifact used to be written in place: torch.save(...,
BEST_CKPT), np.savez_compressed(ART_DIR / "embedding_v3.npz", ...), and
Path.write_text() on assets/vectors.json, feature_manifest.json and
mtnn_report.json. Opening a file for writing truncates it first, so a crash,
an OOM kill or a Ctrl-C between the truncate and the last byte leaves a short
file where the only copy used to be. pipeline/data is gitignored, so for the
checkpoint, the embedding and the matrix there is no other copy. On
2026-10-09, `grep -nE 'os\\.replace|\\.rename\\(|NamedTemporaryFile|shutil\\.move'
pipeline/*.py` matched nothing [health#7].

Each writer here writes to a temp file in the target's own directory (same
volume, so the rename is atomic), flushes and fsyncs it, then replaces the
target with it. A reader sees the old file or the new one, never part of
either. On any exception, KeyboardInterrupt included, the temp file is removed
and the old file is left as it was. A hard kill (power loss, SIGKILL, the
WSL VM dying) can leave a `.<name>.<pid>-<hex>.tmp` file behind, but the
target is still intact.

The bytes are the same as the call each helper replaces. That was measured,
not assumed, and the tests in tests/test_artifact_io.py re-check it:
  - np.savez / np.savez_compressed into an open file give the same bytes as
    the same call given a path. Checked on the real train_matrix.npz arrays
    (12,966 x 142): savez 231b07f1df283205 and savez_compressed
    220d0e36cc7b1bf9 (sha256/16) both ways.
  - torch.save does NOT. It names the zip's top-level folder after the file
    it is given: torch.save(obj, "mtnn_best.pt") writes mtnn_best/data.pkl
    (8202546f4c6aabdb), a file object gives archive/data.pkl
    (97b4c7fc507d820d), and a temp name "mtnn_best.pt.tmp123" gives
    mtnn_best.pt/data.pkl (69f2377aebb5a2b5). Only a file with the target's
    own basename, inside a temp directory, matched (8202546f4c6aabdb). So
    atomic_torch_save writes there.
  - Text is written in text mode with the default newline handling, exactly as
    Path.write_text does. On Windows that turns json.dumps(..., indent=2)
    newlines into CRLF; writing encoded bytes instead would change the hash of
    every indented JSON artifact built on this box.

Hashes and identity. Nothing in train_mtnn, integrate_context or the report
recorded a git sha, a library version or an input hash on 2026-10-09
(`grep -nE 'sha256|hashlib|rev-parse|__version__|importlib.metadata'` over
train_mtnn, integrate_context, build_vectors and enrich_vectors: 0 hits), and
no mtnn_report.json key named a seed, device, commit or matrix hash
[artifacts#4, orchestration#9, features#11]. sha256_file, git_state,
env_versions and matrix_fingerprint are what a report or manifest calls when
it starts recording that.

Stdlib and numpy only at import. torch is imported inside atomic_torch_save,
so the CPU-only build steps never load it.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import secrets
import subprocess
import tempfile
import time
from collections import defaultdict
from collections.abc import Callable, Mapping, Sequence
from importlib import metadata
from pathlib import Path
from typing import IO, Any

import numpy as np

# os.replace on Windows fails with PermissionError while another process has
# the target open (a reader polling the file, an editor, an indexer). That is
# usually gone in well under a second, so retry a few times before giving up.
# On POSIX a PermissionError is a real permission problem; retrying would only
# delay the error.
REPLACE_ATTEMPTS = 5 if os.name == "nt" else 1
REPLACE_BACKOFF_S = 0.1

# Distribution name for each version env_versions() reports. scikit-learn is
# installed as "scikit-learn" and imported as sklearn. vector-core supplies
# the --era-align and --robust-scaling code paths in train_mtnn.
_VERSION_DISTS = {
    "numpy": "numpy",
    "pandas": "pandas",
    "torch": "torch",
    "sklearn": "scikit-learn",
    "vector_core": "vector-core",
}


# ---------------------------------------------------------------------------
# atomic writes
# ---------------------------------------------------------------------------


def _temp_sibling(path: Path) -> Path:
    """A fresh name in the target's directory. Same volume, so replace is a rename."""
    return path.parent / f".{path.name}.{os.getpid()}-{secrets.token_hex(4)}.tmp"


def _replace(tmp: Path, path: Path) -> None:
    for attempt in range(1, REPLACE_ATTEMPTS + 1):
        try:
            tmp.replace(path)
            return
        except PermissionError:
            if attempt == REPLACE_ATTEMPTS:
                raise
            from runlog import get_logger

            get_logger("artifact_io").warning(
                "replace %s -> %s failed (attempt %d/%d, target held open?); retrying",
                tmp.name,
                path,
                attempt,
                REPLACE_ATTEMPTS,
            )
            time.sleep(REPLACE_BACKOFF_S * attempt)


def _atomic_write(path: Path, write: Callable[[IO[Any]], None], *, text: bool, encoding: str | None) -> Path:
    tmp = _temp_sibling(path)
    try:
        # "x": the temp name must not exist. Text mode keeps write_text's
        # newline translation; see the module docstring.
        with open(tmp, "x" if text else "xb", encoding=encoding) as f:
            write(f)
            f.flush()
            os.fsync(f.fileno())
        _replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return path


def atomic_write_bytes(path: str | os.PathLike[str], data: bytes) -> Path:
    """Path(path).write_bytes(data), but the old file survives a failed write."""
    return _atomic_write(Path(path), lambda f: f.write(data), text=False, encoding=None)


def atomic_write_text(path: str | os.PathLike[str], text: str, encoding: str = "utf-8") -> Path:
    """Path(path).write_text(text, encoding=encoding), same bytes, written atomically."""
    return _atomic_write(Path(path), lambda f: f.write(text), text=True, encoding=encoding)


def atomic_write_json(path: str | os.PathLike[str], obj: Any, *, encoding: str = "utf-8", **json_kwargs: Any) -> Path:
    """atomic_write_text(path, json.dumps(obj, **json_kwargs)). No trailing newline is added."""
    return atomic_write_text(path, json.dumps(obj, **json_kwargs), encoding=encoding)


def _npz_path(path: str | os.PathLike[str]) -> Path:
    # np.savez(path) appends ".npz" when the name lacks it. Keep that, so a
    # call moved over from numpy writes to the same file it did before.
    p = os.fspath(path)
    return Path(p if p.endswith(".npz") else p + ".npz")


def atomic_savez(path: str | os.PathLike[str], /, **arrays: Any) -> Path:
    """np.savez(path, **arrays), same bytes, written atomically.

    numpy is handed an open file, not the temp name, so it cannot append a
    second ".npz" to the temp file.
    """
    return _atomic_write(_npz_path(path), lambda f: np.savez(f, **arrays), text=False, encoding=None)


def atomic_savez_compressed(path: str | os.PathLike[str], /, **arrays: Any) -> Path:
    """np.savez_compressed(path, **arrays), same bytes, written atomically."""
    return _atomic_write(_npz_path(path), lambda f: np.savez_compressed(f, **arrays), text=False, encoding=None)


def atomic_torch_save(obj: Any, path: str | os.PathLike[str]) -> Path:
    """torch.save(obj, path), same bytes, written atomically.

    Not through a file object: torch.save names the zip's top-level folder
    after the file it is given ("archive/" for a file object), so a file
    object or a renamed temp file changes the checkpoint's bytes. torch.save
    writes to <temp dir>/<target basename> instead, and that file is renamed
    over the target. The temp dir sits next to the target, on the same volume.
    """
    import torch

    path = Path(path)
    tmp_dir = Path(tempfile.mkdtemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent))
    tmp = tmp_dir / path.name
    try:
        torch.save(obj, tmp)
        # "r+b", not "rb": on Windows os.fsync needs a handle with write access.
        with open(tmp, "r+b") as f:
            os.fsync(f.fileno())
        _replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    finally:
        try:
            tmp_dir.rmdir()
        except OSError:
            pass
    return path


# ---------------------------------------------------------------------------
# hashes and run identity
# ---------------------------------------------------------------------------


def sha256_file(path: str | os.PathLike[str], chunk: int = 1 << 20) -> str:
    """Hex sha256 of a file, read in chunks so a large checkpoint is never held whole."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            h.update(block)
    return h.hexdigest()


def _git(root: Path, *args: str) -> str | None:
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), *args],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def git_state(root: str | os.PathLike[str]) -> dict[str, Any]:
    """{sha, short, dirty, branch} for the checkout at root.

    Every value is None when git is not installed or root is not a checkout
    (the herdmux scratch copy is a plain copy, not a repo). A run record
    should say "unknown" there, not fail.

    dirty counts tracked files only, like `git describe --dirty`: a commit sha
    with dirty=True does not describe the code that ran. branch is None on a
    detached HEAD.
    """
    root = Path(root)
    sha = _git(root, "rev-parse", "HEAD")
    if not sha:
        return {"sha": None, "short": None, "dirty": None, "branch": None}
    status = _git(root, "status", "--porcelain", "--untracked-files=no")
    branch = _git(root, "rev-parse", "--abbrev-ref", "HEAD")
    return {
        "sha": sha,
        "short": sha[:8],
        "dirty": None if status is None else bool(status),
        "branch": None if branch in (None, "HEAD") else branch,
    }


def env_versions() -> dict[str, str | None]:
    """Python and library versions, from installed metadata.

    Nothing heavy is imported to get them; reading torch's metadata does not
    load torch. torch reports its build tag (e.g. 2.11.0+cu128), which is how
    a CUDA run and a CPU-wheel run tell apart. A library that is not installed
    is None.
    """
    out: dict[str, str | None] = {"python": platform.python_version()}
    for key, dist in _VERSION_DISTS.items():
        try:
            out[key] = metadata.version(dist)
        except metadata.PackageNotFoundError:
            out[key] = None
    return out


def _sha256_lines(lines: Sequence[str]) -> str:
    h = hashlib.sha256()
    for line in lines:
        h.update(line.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def matrix_fingerprint(
    Z: np.ndarray,
    mask: np.ndarray,
    player_id: Sequence[Any] | np.ndarray,
    season: Sequence[Any] | np.ndarray,
    columns: Sequence[str],
    families: Mapping[str, str] | Sequence[str],
) -> dict[str, Any]:
    """Identity of a training matrix, as train_matrix.npz + feature_manifest.json hold it.

    Returns:
      rows, cols         Z's shape.
      keys_sha256        sha256 of the "player_id|season" lines in row order,
                         one per row, each ending in a newline.
      columns_sha256     sha256 of the column names in order, one per line.
      values_sha256      sha256 of Z then mask, as C-order little-endian
                         float32 bytes. The two hashes above only see the
                         matrix's shape and labels; a refreshed cache or
                         input JSON changes values under the same rows and
                         columns, and only this one moves.
      family_coverage    {family: mean of mask over that family's columns},
                         in family-name order.

    families is the manifest's {feature: family} mapping, or a sequence of
    family names aligned with columns. A column with no family raises
    KeyError rather than being given one.

    Row order and column order are both part of the identity on purpose: the
    same features merged in a different order land at different indices, and
    an index-based consumer reads different data [features#11].
    """
    Z = np.asarray(Z)
    mask = np.asarray(mask)
    cols = [str(c) for c in columns]
    pids = np.asarray(player_id).tolist()
    seasons = np.asarray(season).tolist()
    if Z.ndim != 2 or Z.shape != mask.shape:
        raise ValueError(f"Z {Z.shape} and mask {mask.shape} must be the same 2-d shape")
    if Z.shape != (len(pids), len(cols)) or len(seasons) != len(pids):
        raise ValueError(
            f"Z is {Z.shape} but there are {len(pids)} player_ids, {len(seasons)} seasons and {len(cols)} columns"
        )

    if isinstance(families, Mapping):
        missing = [c for c in cols if c not in families]
        if missing:
            raise KeyError(f"{len(missing)} column(s) have no family, e.g. {missing[:5]}")
        fam_of = [str(families[c]) for c in cols]
    else:
        fam_of = [str(f) for f in families]
        if len(fam_of) != len(cols):
            raise ValueError(f"{len(fam_of)} families for {len(cols)} columns")

    idx_by_family: dict[str, list[int]] = defaultdict(list)
    for j, fam in enumerate(fam_of):
        idx_by_family[fam].append(j)

    values = hashlib.sha256()
    values.update(np.ascontiguousarray(Z, dtype="<f4").tobytes())
    values.update(np.ascontiguousarray(mask, dtype="<f4").tobytes())

    return {
        "rows": int(Z.shape[0]),
        "cols": int(Z.shape[1]),
        "keys_sha256": _sha256_lines([f"{p}|{s}" for p, s in zip(pids, seasons, strict=True)]),
        "columns_sha256": _sha256_lines(cols),
        "values_sha256": values.hexdigest(),
        "family_coverage": {
            fam: round(float(mask[:, idx].mean()), 6) if Z.shape[0] else None
            for fam, idx in sorted(idx_by_family.items())
        },
    }
