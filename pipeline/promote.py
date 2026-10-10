#!/usr/bin/env python3
"""promote.py -- the one way a trained run becomes the model the site ships.

Why (2026-10-09). The exporters read whatever sat at four fixed paths in
pipeline/data, and every training run rewrites two of them. On this box the
four came from three runs:

  mtnn_best.pt        2026-08-14 06:48  select-phase v6 transformer, args
                                        write_artifacts=False, epoch 30
  mtnn_report.json    2026-08-14 06:54  same run; promote ok=False,
                                        "recall 0.742 < floor 0.773"
  embedding_v3.npz    2026-08-07 07:31  E (12966, 64), a different model
  mtnn_centroids.npz  2026-08-06 19:38  (8, 48): the wrong width for that E

Both export gates (export_mtnn_embeddings.promotion_eligible and
export_assets.mtnn_promotion_eligible) still returned True on that report,
because they check three floors and never read the trainer's own verdict. So
the next export would have shipped the 08-07 bytes under the 08-14 model's
name and metrics, with Jacobian and arch files computed from the 08-14
checkpoint [orchestration#0, artifacts#1, artifacts#2, eval#6, health#0,
training#2].

Legacy paths = promoted model (2026-10-10). pipeline/data/embedding_v3.npz,
mtnn_centroids.npz and mtnn_best.pt are what readers outside this repo load:
vector-unified's load_encoders.py reads embedding_v3.npz, and its
load_live_encoders, _hoops_args and check_artifact_freshness read
mtnn_best.pt. promote() refreshes all three from the bundle, each an atomic
byte copy, after CURRENT.json flips, so they are one model: the promoted one.
Until 2026-10-10 the checkpoint was left out, and vector-unified paired the
promoted embedding with whichever run had last saved a best checkpoint. One
caveat: train_mtnn still saves its best-checkpoint candidates to
pipeline/data/mtnn_best.pt (a select run with --val-every > 0 and no
--no-best-checkpoint), so such a run replaces the legacy checkpoint until the
next promote. The measure and ship recipes and the herdmux climb pass
--no-best-checkpoint and never write it.

LAST-RUN file. pipeline/data/mtnn_report.json is the report of whichever
training run finished last. The herdmux climb (gpu/metrics.py) and
hill_climb / sweep_stability / tower_ablation read it there after each run,
so it stays there. It is not the promoted model's report, and no exporter
reads it, or any of the legacy paths: they read the bundle.

What a promotion checks (`--run <run_dir>`, a directory train_mtnn.py
--run-dir wrote). Each of these refuses, and none can be overridden:
  - the run directory has its mtnn_report.json, with a lineage block;
  - every artifact the lineage lists is in the directory, and its sha256 is
    the one recorded when the run wrote it. A checkpoint is required: a
    promoted model has to keep its weights, or nothing can regenerate or
    attribute it later [artifacts#9];
  - the embedding's (player_id, season) rows hash to the matrix fingerprint's
    keys, its width is the report's dim, and the centroids are that width;
  - the matrix fingerprint the run recorded equals the fingerprint of the
    current pipeline/data/train_matrix.npz + feature_manifest.json. The viz
    and Jacobian exporters read the current matrix next to the model;
  - its metrics are held out, or come from a select run that held them out
    (the policy below). --phase auto no longer exists, and a run directory
    that recorded it is refused.
Then composite_score.should_promote on the report whose metrics the bundle
will carry, re-run here rather than read from report["promote"], so the bar
is the one in composite_score now. A run that fails it is refused unless
--force "<reason>" is given, and the reason goes into the manifest and
CURRENT.json. With one seed the CQS bar is the baseline + 2 x seed sd
(77.74 + 1.2), so a single run often needs --force; that is the operator's
call, and it is recorded rather than silent [orchestration#0 verifier note].

Which runs ship: ship what you measure (2026-10-09).
  - A select run (lineage fit_rows 'train': the loss saw train-split rows
    only, start year <= 2021) ships on its own held-out numbers.
    pipeline/recipes/ship.json is such a run with the climb's measured flags,
    so the model that ships is a model of the recipe the climb measured.
    With --run-dir its final weights are its checkpoint when it kept no best
    one (train_mtnn, 7d5ad1f8).
  - A run whose loss saw every row (fit_rows 'all': --phase final-refit) has
    no held-out numbers: 948 val and 991 test rows were training rows, its
    report says metrics_source 'in_sample_refit', and should_promote refuses
    it [training#0]. It ships only with --selection-run DIR, the select run
    of the same recipe whose held-out metrics justify it. That run must have
    fit train-split rows only, recorded the same matrix fingerprint, and been
    trained with the same arguments except SELECTION_FREE_ARGS (seed and
    epochs included: the refit repeats the measured run on every row).
    should_promote runs on its report. The manifest's metrics are copied
    from it, metrics_source names it (run id, report sha256), the refit's
    own in-sample numbers are kept apart under refit_in_sample_metrics, and
    its report is copied into the bundle as selection/mtnn_report.json so
    the evidence stays with the model.
  - Until 2026-10-09 it was the other way round: only final-refit (or auto)
    runs shipped, a select run was refused as "a measurement", and the
    refit's in-sample numbers were copied into the manifest as the model's.

What it writes:
  pipeline/data/promoted/<run_id>/   the four files + manifest.json (shas,
                                     matrix fingerprint, metrics and where
                                     they come from, verdicts, force reason,
                                     git), + selection/mtnn_report.json for
                                     a refit
  pipeline/data/promoted/CURRENT.json  which bundle is promoted; replaced
                                     atomically, after the bundle is complete
  pipeline/data/embedding_v3.npz, mtnn_centroids.npz, mtnn_best.pt
                                     refreshed from the bundle for readers
                                     outside this repo (the legacy paths
                                     above)
The newest KEEP bundles are kept, and the current one always. Re-promoting
a bundle that is already in promoted/ (a rollback: --run
pipeline/data/promoted/<run_id>, plus --selection-run
pipeline/data/promoted/<run_id>/selection for a refit) copies nothing into
promoted/: it flips CURRENT.json and refreshes the legacy paths.

Readers. Every exporter loads the model through load_promoted(), which
re-hashes every file in the current bundle and refuses a missing, edited or
mixed one. Nothing exports from the legacy or last-run paths.

Usage:
  python pipeline/promote.py --run pipeline/data/runs/<run_id>
  python pipeline/promote.py --run pipeline/data/runs/<run_id> --dry-run
  python pipeline/promote.py --run pipeline/data/runs/<run_id> --force "why"
  python pipeline/promote.py --run pipeline/data/runs/<refit> --selection-run pipeline/data/runs/<select>
  python pipeline/promote.py --status
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import composite_score as cqs  # noqa: E402
from artifact_io import (  # noqa: E402
    BUNDLE_FILES,
    atomic_copy,
    atomic_write_json,
    display_path,
    fingerprint_differences,
    git_state,
    keys_sha256,
    load_matrix_fingerprint,
    sha256_file,
)
from served_model import METRIC_KEYS  # noqa: E402

DATA_DIR = ROOT / "pipeline" / "data"
SCHEMA = 1
KEEP = 5
REQUIRED = ("checkpoint", "embedding", "centroids")
# A refit's bundle keeps the report of the select run that vouched for it.
SELECTION_ROLE = "selection_report"
SELECTION_DIR = "selection"
# train_mtnn arguments a --selection-run may differ in from the refit it
# vouches for. phase and fit_rows are the point of the refit. run_dir,
# write_artifacts and recipe say where files went and where the defaults
# came from (the values themselves are compared). device changes reduction
# order, not the recipe. val_every, no_best_checkpoint and checkpoint_metric
# decide whether and how an epoch is restored, and a fit_rows 'all' run
# never restores one (mtnn_loop.checkpoint_selection); under protocol v1,
# val_every also shifts the global RNG, so the trajectory, not the recipe.
# That last freedom holds only when the select run did not restore one
# either: its held-out numbers then describe its final weights, as the
# refit ships its final weights. A select run that restored a best epoch is
# refused (_check_selection, 2026-10-10). Everything else, seed and epochs
# included, has to match.
SELECTION_FREE_ARGS = frozenset(
    {
        "phase",
        "fit_rows",
        "run_dir",
        "write_artifacts",
        "recipe",
        "device",
        "val_every",
        "no_best_checkpoint",
        "checkpoint_metric",
    }
)
# Refreshed in pipeline/data from the promoted bundle, for readers outside
# this repo (the module docstring's legacy paths). Not the report: that is
# the last run's.
LEGACY = ("embedding", "centroids", "checkpoint")
MANIFEST = "manifest.json"
CURRENT = "CURRENT.json"
EXIT_REFUSED = 2

# The manifest's metrics are served_model.METRIC_KEYS, copied from the report
# (metrics_from_report). Exporters copy them from the manifest and never
# compute or type one.

_RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class BundleError(Exception):
    """The promoted bundle is missing, incomplete, or not what its manifest says."""


class NoPromotedBundleError(BundleError):
    """CURRENT.json does not exist: nothing has been promoted yet."""


class PromotionRefusedError(Exception):
    def __init__(self, problems: Sequence[str]):
        self.problems = list(problems)
        super().__init__("; ".join(self.problems))


def _data(data_dir: Path | None) -> Path:
    return Path(data_dir) if data_dir is not None else DATA_DIR


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def metrics_from_report(report: dict[str, Any]) -> dict[str, Any]:
    """The manifest's metrics: values the trainer measured, copied, never recomputed."""
    comp = report.get("composite") or {}
    test = (report.get("held_out_recall") or {}).get("test") or {}
    values = {
        "cqs": comp.get("cqs"),
        "test_recall_at_10": comp.get("test_recall_at_10"),
        "purity_at_20": comp.get("purity_at_20"),
        "archetype_top1_acc": report.get("archetype_top1_acc"),
        "position_top1_acc": report.get("position_top1_acc"),
        "transparent_14d_test_recall_at_10": test.get("recall_at_10_transparent_14d"),
        "continuity_spread": report.get("continuity_spread"),
    }
    return {k: values[k] for k in METRIC_KEYS}


# ---------------------------------------------------------------------------
# checking a run directory
# ---------------------------------------------------------------------------


@dataclass
class SelectionRun:
    """The select run whose held-out metrics a fit_rows 'all' run ships on."""

    dir: Path
    report_path: Path
    report: dict[str, Any]
    report_sha256: str
    # The bytes report and report_sha256 were read from; promote() copies these.
    # Required: an empty default would let a caller build one whose bundle copy
    # is zero bytes under a sha that names the real report.
    report_bytes: bytes

    @property
    def run_id(self) -> str | None:
        return (self.report.get("lineage") or {}).get("run_id")


@dataclass
class RunCheck:
    run_dir: Path
    report: dict[str, Any] | None = None
    # Integrity problems. Any one refuses the run; --force does not apply.
    problems: list[str] = field(default_factory=list)
    # composite_score.should_promote at promotion time, on metrics_report.
    verdict: tuple[bool, str] | None = None
    rows: int | None = None
    dim: int | None = None
    fit_rows: str | None = None
    # Set for a fit_rows 'all' run promoted with --selection-run.
    selection: SelectionRun | None = None
    # role -> the bytes that were read once, hashed and checked. promote() writes
    # these into the bundle; it never reopens the run directory.
    blobs: dict[str, bytes] = field(default_factory=dict)
    shas: dict[str, str] = field(default_factory=dict)

    @property
    def lineage(self) -> dict[str, Any]:
        return (self.report or {}).get("lineage") or {}

    @property
    def metrics_report(self) -> dict[str, Any] | None:
        """The report whose numbers the bundle carries: the selection run's for a refit."""
        return self.selection.report if self.selection is not None else self.report


def _check_contents(chk: RunCheck, report: dict[str, Any], fp: dict[str, Any]) -> None:
    """The embedding and centroids agree with the report and the trained matrix.

    The on-box case this catches: 8 x 48 centroids beside a 64-d embedding.
    """
    try:
        with np.load(io.BytesIO(chk.blobs["embedding"]), allow_pickle=False) as z:
            e_shape = tuple(z["E"].shape)
            emb_keys = keys_sha256(z["player_id"], z["season"])
        with np.load(io.BytesIO(chk.blobs["centroids"]), allow_pickle=False) as z:
            c_shape = tuple(z["centroids"].shape)
    except (OSError, ValueError, KeyError) as e:
        chk.problems.append(f"embedding or centroids npz unreadable ({type(e).__name__}: {e})")
        return
    if len(e_shape) != 2:
        chk.problems.append(f"embedding E has shape {e_shape}, not rows x dim")
        return
    chk.rows, chk.dim = int(e_shape[0]), int(e_shape[1])
    if report.get("dim") != chk.dim:
        chk.problems.append(f"embedding is {chk.dim}-d but the report says dim {report.get('dim')}")
    if fp.get("rows") != chk.rows:
        chk.problems.append(f"embedding has {chk.rows} rows, the matrix fingerprint {fp.get('rows')}")
    if emb_keys != fp.get("keys_sha256"):
        chk.problems.append(
            "the embedding's (player_id, season) rows are not the trained matrix's "
            f"(keys sha256 {emb_keys[:12]} vs {str(fp.get('keys_sha256'))[:12]})"
        )
    if len(c_shape) != 2 or c_shape[1] != chk.dim:
        chk.problems.append(f"centroids have shape {c_shape}, not (k, {chk.dim})")


def _check_selection(chk: RunCheck, selection_run: str | os.PathLike[str]) -> None:
    """The --selection-run for a fit_rows 'all' run: a held-out run of the same recipe on the same matrix."""
    sel_dir = Path(selection_run).resolve()
    path = sel_dir / BUNDLE_FILES["report"]
    where = f"--selection-run {sel_dir}"
    if not path.exists():
        chk.problems.append(f"{where}: no {BUNDLE_FILES['report']} there")
        return
    try:
        raw = path.read_bytes()
        sel = json.loads(raw.decode("utf-8"))
    except (OSError, ValueError) as e:
        chk.problems.append(f"{where}: {path.name} unreadable ({e})")
        return
    sel_lin = sel.get("lineage")
    if not isinstance(sel_lin, dict) or sel_lin.get("schema") != SCHEMA:
        chk.problems.append(f"{where}: its report has no lineage block (schema {SCHEMA})")
        return
    bad = len(chk.problems)
    if sel_lin.get("fit_rows") != "train" or cqs.in_sample_reason(sel) is not None:
        chk.problems.append(
            f"{where}: fit_rows {sel_lin.get('fit_rows')!r}, metrics_source {sel.get('metrics_source')!r}. "
            "Its metrics have to be held out: a select run, loss on train-split rows only"
        )
    diffs = fingerprint_differences(
        sel_lin.get("matrix_fingerprint") or {}, chk.lineage.get("matrix_fingerprint") or {}
    )
    if diffs:
        chk.problems.append(f"{where} trained on another matrix than this run ({'; '.join(diffs)})")
    a, b = sel_lin.get("args") or {}, chk.lineage.get("args") or {}
    differ = sorted(k for k in set(a) | set(b) if k not in SELECTION_FREE_ARGS and a.get(k) != b.get(k))
    if differ:
        shown = ", ".join(f"{k} {a.get(k)!r} vs {b.get(k)!r}" for k in differ[:8])
        chk.problems.append(
            f"{where} trained another recipe than this run ({shown}{', ...' if len(differ) > 8 else ''}); "
            "its held-out numbers do not describe this model"
        )
    # SELECTION_FREE_ARGS lets the two differ in val_every / no_best_checkpoint
    # / checkpoint_metric because a fit_rows 'all' run never restores a best
    # epoch and ships its final weights. A select run that restored one (say
    # epoch 30 of 40, picked on val) scored those weights, not the final epoch
    # the refit repeats, so it cannot vouch for it. report["best_epoch"] is
    # the restored epoch or None; selection.best_epoch (-1 for none) covers
    # reports that predate the top-level key.
    restored = sel.get("best_epoch") if "best_epoch" in sel else (sel.get("selection") or {}).get("best_epoch")
    if isinstance(restored, int) and not isinstance(restored, bool) and restored >= 0:
        chk.problems.append(
            f"{where} restored its best epoch ({restored}, chosen by {sel.get('checkpoint_selection')!r}), so its "
            "held-out numbers describe those weights. A refit fits every row, restores no epoch and ships its final "
            "weights: vouch for it with a select run that scored its final weights (--no-best-checkpoint or "
            "--val-every 0, as the measure and ship recipes do)"
        )
    if len(chk.problems) == bad:
        chk.selection = SelectionRun(sel_dir, path, sel, _sha256(raw), raw)


def check_run(
    run_dir: str | os.PathLike[str],
    *,
    selection_run: str | os.PathLike[str] | None = None,
    data_dir: Path | None = None,
) -> RunCheck:
    """Everything promote() refuses on, without writing anything."""
    data = _data(data_dir)
    run_dir = Path(run_dir).resolve()
    chk = RunCheck(run_dir)
    report_path = run_dir / BUNDLE_FILES["report"]
    if not run_dir.is_dir():
        chk.problems.append(f"{run_dir}: not a directory")
        return chk
    if not report_path.exists():
        chk.problems.append(
            f"{report_path}: missing. train_mtnn --run-dir writes the report last, so a run that "
            "stopped early, or found pipeline/data/mtnn_best.pt replaced under it, has none"
        )
        return chk
    # Read once: the report checked here, the sha the manifest records and the
    # bytes the bundle gets are the same bytes.
    try:
        report_bytes = report_path.read_bytes()
        report = json.loads(report_bytes.decode("utf-8"))
    except (OSError, ValueError) as e:
        chk.problems.append(f"{report_path}: unreadable ({e})")
        return chk
    chk.report = report
    chk.blobs["report"], chk.shas["report"] = report_bytes, _sha256(report_bytes)
    lin = report.get("lineage")
    if not isinstance(lin, dict) or lin.get("schema") != SCHEMA:
        chk.problems.append(
            f"{report_path} has no lineage block (schema {SCHEMA}): it was written before train_mtnn "
            "recorded one, so nothing ties its files to it"
        )
        return chk

    run_id = lin.get("run_id")
    if not isinstance(run_id, str) or not _RUN_ID.match(run_id):
        chk.problems.append(f"lineage.run_id {run_id!r} is not a usable directory name")

    # Ship what you measure (module docstring): a select run on its own
    # held-out numbers, a fit_rows 'all' run only on a select run's.
    chk.fit_rows = lin.get("fit_rows")
    if lin.get("phase") == "auto":
        chk.problems.append(
            "phase 'auto' was removed from train_mtnn.py (2026-10-09): its refit could not finish and "
            "trained 7 of 18 loss terms [training#10]"
        )
    elif chk.fit_rows == "train":
        if selection_run is not None:
            chk.problems.append(
                "--selection-run is for a run that fit every row; this run fit train-split rows only, "
                "so its own held-out numbers are the evidence"
            )
    elif chk.fit_rows == "all":
        if selection_run is None:
            chk.problems.append(
                "this run fit every row (fit_rows 'all', --phase final-refit), val and test included, so every "
                "metric in its report is in-sample [training#0]. Promote it with --selection-run <the select run "
                "of the same recipe whose held-out metrics justify it>, or promote that select run itself"
            )
        else:
            _check_selection(chk, selection_run)
    else:
        chk.problems.append(f"lineage.fit_rows {chk.fit_rows!r}: cannot tell whether the run's metrics are held out")

    artifacts = lin.get("artifacts") or {}
    for role in REQUIRED:
        if role not in artifacts:
            why = (
                " (trained with --no-best-checkpoint or --val-every 0, or no validation check improved); "
                "a promoted model has to keep its weights"
                if role == "checkpoint"
                else ""
            )
            chk.problems.append(f"the run wrote no {role}{why}")
    verified: set[str] = set()
    for role, rec in artifacts.items():
        name = BUNDLE_FILES.get(role)
        if name is None or role == "report":
            chk.problems.append(f"lineage.artifacts names {role!r}, which is not a bundle file")
            continue
        path = run_dir / name
        if not path.exists():
            chk.problems.append(f"{name}: missing from {run_dir}")
            continue
        want = str((rec or {}).get("sha256"))
        blob = path.read_bytes()
        got = _sha256(blob)
        if got != want:
            chk.problems.append(
                f"{name}: sha256 {got[:12]} but the lineage recorded {want[:12]} "
                "(a file from another run, or changed after this run wrote it)"
            )
            continue
        verified.add(role)
        chk.blobs[role], chk.shas[role] = blob, got

    fp = lin.get("matrix_fingerprint") or {}
    if {"embedding", "centroids"} <= verified:
        _check_contents(chk, report, fp)

    matrix, manifest = data / "train_matrix.npz", data / "feature_manifest.json"
    if not (matrix.exists() and manifest.exists()):
        chk.problems.append(f"{matrix} or {manifest} is missing, so the run's matrix cannot be compared")
    else:
        diffs = fingerprint_differences(fp, load_matrix_fingerprint(matrix, manifest))
        if diffs:
            chk.problems.append(
                f"{display_path(matrix, ROOT)} is not the matrix this run trained on ({'; '.join(diffs)}). "
                "export_mtnn_viz and export_mtnn_jacobian read the current matrix, so they would describe "
                "inputs the model never saw: train on this matrix, or rebuild the one the run used"
            )

    # On the report whose numbers the bundle will carry: for a refit, the
    # selection run's. The refit's own report is in-sample and always fails.
    try:
        chk.verdict = cqs.should_promote(chk.metrics_report or report)
    except (KeyError, TypeError, ValueError) as e:
        chk.verdict = (False, f"should_promote could not read the report ({type(e).__name__}: {e})")
    return chk


# ---------------------------------------------------------------------------
# promoting
# ---------------------------------------------------------------------------


def _manifest_files(manifest: dict[str, Any]) -> dict[str, str]:
    return {role: rec.get("sha256") for role, rec in (manifest.get("files") or {}).items()}


def _bundles(promoted: Path) -> list[tuple[str, str, Path]]:
    """(promoted_at, name, dir) for every complete bundle under promoted/."""
    out = []
    for d in promoted.iterdir():
        if not d.is_dir() or d.name.startswith(".") or not (d / MANIFEST).exists():
            continue
        try:
            at = str(_read_json(d / MANIFEST).get("promoted_at") or "")
        except (OSError, ValueError):
            continue
        out.append((at, d.name, d))
    return sorted(out, reverse=True)


def prune(promoted: Path, *, keep: int, protect: set[str]) -> list[str]:
    """Delete all but the newest `keep` bundles, never one named in protect."""
    removed = []
    for i, (_, name, d) in enumerate(_bundles(promoted)):
        if i < keep or name in protect:
            continue
        shutil.rmtree(d)
        removed.append(name)
    return removed


def metrics_source(chk: RunCheck, report_sha256: str) -> dict[str, Any]:
    """Where the manifest's metrics come from, written next to them."""
    sel = chk.selection
    if sel is None:
        return {
            "kind": "this_run",
            "run_id": chk.lineage.get("run_id"),
            "report_sha256": report_sha256,
            "fit_rows": chk.fit_rows,
            "metrics_source": (chk.report or {}).get("metrics_source"),
            "note": "held out: this run's loss saw train-split rows only, and its test recall is scored on "
            "test-split pairs. See the report's composite.component_rows for the components scored on all rows.",
        }
    return {
        "kind": "selection_run",
        "run_id": sel.run_id,
        "report_sha256": sel.report_sha256,
        "report": f"{SELECTION_DIR}/{BUNDLE_FILES['report']}",
        "source_run_dir": display_path(sel.dir, ROOT),
        "fit_rows": (sel.report.get("lineage") or {}).get("fit_rows"),
        "metrics_source": sel.report.get("metrics_source"),
        "note": "held out, by the select run this model repeats on every row. The shipped weights also trained "
        "on the val and test rows and were never scored on held-out rows; their in-sample numbers are "
        "refit_in_sample_metrics.",
    }


def promote(
    run_dir: str | os.PathLike[str],
    *,
    selection_run: str | os.PathLike[str] | None = None,
    force: str | None = None,
    keep: int = KEEP,
    data_dir: Path | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    """Check run_dir, copy it into promoted/<run_id>/, flip CURRENT.json. Returns CURRENT.json's content."""
    data = _data(data_dir)
    if force is not None and not force.strip():
        raise PromotionRefusedError(["--force needs a reason; it is recorded in the manifest"])
    if keep < 1:
        raise PromotionRefusedError([f"--keep {keep}: at least the promoted bundle has to stay"])
    chk = check_run(run_dir, selection_run=selection_run, data_dir=data)
    problems = list(chk.problems)
    ok, why = chk.verdict if chk.verdict is not None else (False, "not evaluated")
    if chk.verdict is not None and not ok and force is None:
        problems.append(
            f"composite_score.should_promote: {why}. "
            'Pass --force "<reason>" to promote it anyway; the reason is recorded'
        )
    if problems:
        raise PromotionRefusedError(problems)

    report = chk.report or {}
    lin = chk.lineage
    run_id = str(lin["run_id"])
    run_path = chk.run_dir
    stamp = now or _now()
    promoted = data / "promoted"
    promoted.mkdir(parents=True, exist_ok=True)
    dest = promoted / run_id
    # The bundle is the bytes check_run read, hashed and verified, not a second
    # read of the run directory. This used to hash and copy the source files
    # again after check_run had verified them, so a file replaced in between
    # (another run writing the same --run-dir, an editor, a sync client) was
    # shipped under a manifest that recorded the new file's sha as if it had
    # been checked.
    names = {role: BUNDLE_FILES[role] for role in (*REQUIRED, "report")}
    blobs = {role: chk.blobs[role] for role in names}
    shas = {role: chk.shas[role] for role in names}
    if chk.selection is not None:
        names[SELECTION_ROLE] = f"{SELECTION_DIR}/{BUNDLE_FILES['report']}"
        blobs[SELECTION_ROLE] = chk.selection.report_bytes
        shas[SELECTION_ROLE] = chk.selection.report_sha256

    if dest.exists():
        try:
            existing = _read_json(dest / MANIFEST)
        except (OSError, ValueError):
            existing = None
        if existing is None or _manifest_files(existing) != shas:
            raise PromotionRefusedError(
                [f"{dest} already exists and is not this run's bundle; remove it or pick another run directory"]
            )
    else:
        manifest = {
            "schema": SCHEMA,
            "run_id": run_id,
            "promoted_at": stamp,
            "source_run_dir": display_path(run_path, ROOT),
            "files": {
                role: {"name": names[role], "sha256": shas[role], "bytes": len(blob)} for role, blob in blobs.items()
            },
            "matrix_fingerprint": lin.get("matrix_fingerprint"),
            # Held-out numbers only: this run's, or for a refit its selection
            # run's (metrics_source says which).
            "metrics": metrics_from_report(chk.metrics_report or report),
            "metrics_source": metrics_source(chk, shas["report"]),
            **({"refit_in_sample_metrics": metrics_from_report(report)} if chk.selection is not None else {}),
            "model": report.get("model"),
            "trained": report.get("trained"),
            "rows": chk.rows,
            "dim": chk.dim,
            "phase": lin.get("phase"),
            "fit_rows": chk.fit_rows,
            "deploy_mode": (report.get("deploy") or {}).get("mode"),
            "verdict": {
                "at_training": report.get("promote"),
                "at_promotion": {
                    "ok": ok,
                    "reason": why,
                    "on_run": (chk.selection.run_id if chk.selection is not None else run_id),
                },
            },
            "forced": force is not None,
            "force_reason": force,
            "train_git": lin.get("git"),
            "promote_git": git_state(ROOT),
            "env_versions": lin.get("env_versions"),
        }
        tmp = promoted / f".{run_id}.tmp-{os.getpid()}"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir()
        try:
            for role, blob in blobs.items():
                dst = tmp / names[role]
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_bytes(blob)
                if sha256_file(dst) != shas[role]:
                    raise PromotionRefusedError([f"{dst} does not read back as the bytes written"])
            atomic_write_json(tmp / MANIFEST, manifest, indent=2)
            # A directory rename: the bundle appears whole or not at all.
            tmp.rename(dest)
        except BaseException:
            shutil.rmtree(tmp, ignore_errors=True)
            raise

    previous = None
    if (promoted / CURRENT).exists():
        try:
            previous = _read_json(promoted / CURRENT).get("run_id")
        except (OSError, ValueError):
            previous = None
    current = {
        "schema": SCHEMA,
        "run_id": run_id,
        "dir": f"promoted/{run_id}",
        "manifest_sha256": sha256_file(dest / MANIFEST),
        "promoted_at": stamp,
        "verdict": {"ok": ok, "reason": why},
        "forced": force is not None,
        "force_reason": force,
        "previous": previous,
    }
    # The flip. Readers see the old CURRENT.json or the new one.
    atomic_write_json(promoted / CURRENT, current, indent=2)

    for role in LEGACY:
        atomic_copy(dest / BUNDLE_FILES[role], data / BUNDLE_FILES[role])
    prune(promoted, keep=keep, protect={run_id})
    return current


# ---------------------------------------------------------------------------
# reading the promoted bundle (every exporter goes through this)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PromotedBundle:
    run_id: str
    dir: Path
    manifest: dict[str, Any]
    report: dict[str, Any]
    current: dict[str, Any]

    def path(self, role: str) -> Path:
        return self.dir / BUNDLE_FILES[role]

    @property
    def checkpoint(self) -> Path:
        return self.path("checkpoint")

    @property
    def embedding(self) -> Path:
        return self.path("embedding")

    @property
    def centroids(self) -> Path:
        return self.path("centroids")

    @property
    def metrics(self) -> dict[str, Any]:
        return dict(self.manifest.get("metrics") or {})

    @property
    def metrics_source(self) -> dict[str, Any]:
        """Where metrics came from (promote.metrics_source); empty for a bundle promoted before it was recorded."""
        return dict(self.manifest.get("metrics_source") or {})

    @property
    def metrics_report(self) -> dict[str, Any]:
        """The report the metrics were copied from: the selection run's for a refit, else the bundle's own.

        Its sha256 was checked against the manifest by load_promoted.
        """
        rec = (self.manifest.get("files") or {}).get(SELECTION_ROLE)
        return _read_json(self.dir / str(rec["name"])) if rec else self.report

    def stamp(self) -> dict[str, Any]:
        """What an exported file records about the bundle it came from."""
        files = self.manifest.get("files") or {}
        return {
            "run_id": self.run_id,
            "embedding_npz_sha256": (files.get("embedding") or {}).get("sha256"),
            "checkpoint_sha256": (files.get("checkpoint") or {}).get("sha256"),
        }


def load_promoted(data_dir: Path | None = None, *, check_matrix: bool = False) -> PromotedBundle:
    """The current promoted bundle, every file re-hashed against its manifest.

    Raises NoPromotedBundleError when nothing is promoted, and BundleError when the
    bundle is incomplete, edited, or mixed. With check_matrix, also when the
    current train_matrix.npz is not the one the model trained on: an exporter
    that reads the matrix next to the model (viz, Jacobian) needs that.
    """
    data = _data(data_dir)
    promoted = data / "promoted"
    cur_path = promoted / CURRENT
    if not cur_path.exists():
        raise NoPromotedBundleError(
            f"nothing is promoted: {cur_path} does not exist. Train with --run-dir, then "
            "`python pipeline/promote.py --run <run_dir>`"
        )
    try:
        current = _read_json(cur_path)
    except (OSError, ValueError) as e:
        raise BundleError(f"{cur_path}: unreadable ({e})") from e
    run_id = current.get("run_id")
    if not isinstance(run_id, str) or not _RUN_ID.match(run_id):
        raise BundleError(f"{cur_path}: run_id {run_id!r} is not a bundle name")
    bundle_dir = promoted / run_id
    man_path = bundle_dir / MANIFEST
    if not man_path.exists():
        raise BundleError(f"{cur_path} points at {run_id}, but {man_path} does not exist")
    got = sha256_file(man_path)
    if got != current.get("manifest_sha256"):
        raise BundleError(
            f"{man_path} is not the manifest that was promoted (sha256 {got[:12]}, "
            f"CURRENT.json recorded {str(current.get('manifest_sha256'))[:12]})"
        )
    manifest = _read_json(man_path)
    if manifest.get("run_id") != run_id:
        raise BundleError(f"{man_path} is for run {manifest.get('run_id')!r}, not {run_id!r}")
    files = manifest.get("files") or {}
    bad = [f"{role}: not in the manifest" for role in (*REQUIRED, "report") if role not in files]
    for role, rec in files.items():
        p = bundle_dir / str(rec.get("name"))
        if not p.exists():
            bad.append(f"{p.name}: missing")
        elif sha256_file(p) != rec.get("sha256"):
            bad.append(f"{p.name}: sha256 differs from the manifest")
    if bad:
        raise BundleError(f"promoted bundle {run_id} does not verify: {'; '.join(bad)}")
    report = _read_json(bundle_dir / BUNDLE_FILES["report"])
    if (report.get("lineage") or {}).get("run_id") != run_id:
        raise BundleError(f"{bundle_dir / BUNDLE_FILES['report']} is not run {run_id}'s report")
    if check_matrix:
        matrix, man = data / "train_matrix.npz", data / "feature_manifest.json"
        if not (matrix.exists() and man.exists()):
            raise BundleError(f"{matrix} or {man} is missing")
        diffs = fingerprint_differences(manifest.get("matrix_fingerprint") or {}, load_matrix_fingerprint(matrix, man))
        if diffs:
            raise BundleError(
                f"the current {matrix.name} is not the matrix promoted run {run_id} trained on "
                f"({'; '.join(diffs)}); re-promote a run trained on it, or rebuild the matrix"
            )
    return PromotedBundle(run_id, bundle_dir, manifest, report, current)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _print_problems(problems: Sequence[str]) -> None:
    print(f"REFUSED: {len(problems)} problem(s)")
    for p in problems:
        print(f"  - {p}")


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Check a train_mtnn --run-dir and promote it to the shipped model.")
    what = ap.add_mutually_exclusive_group(required=True)
    what.add_argument("--run", metavar="RUN_DIR", help="a directory train_mtnn.py --run-dir wrote")
    what.add_argument("--status", action="store_true", help="verify and describe the current promoted bundle")
    ap.add_argument(
        "--selection-run",
        metavar="DIR",
        help="for a run that fit every row (--phase final-refit): the select run of the same recipe whose "
        "held-out metrics justify it; its report is checked, copied into the bundle and its metrics used",
    )
    ap.add_argument("--force", metavar="REASON", help="promote although should_promote says no; REASON is recorded")
    ap.add_argument("--keep", type=int, default=KEEP, help=f"promoted bundles to keep (default {KEEP})")
    ap.add_argument("--dry-run", action="store_true", help="run every check, write nothing")
    args = ap.parse_args(argv)

    if args.status:
        try:
            b = load_promoted(check_matrix=True)
        except BundleError as e:
            print(f"promoted model: {e}")
            return 1
        print(f"promoted {b.run_id} ({b.manifest.get('model')}), {b.manifest.get('rows')} x {b.manifest.get('dim')}")
        print(f"  promoted_at {b.current.get('promoted_at')}, forced {b.current.get('forced')}")
        print(
            f"  metrics {json.dumps(b.metrics)} from {b.metrics_source.get('kind', 'this_run')} "
            f"{b.metrics_source.get('run_id', b.run_id)}"
        )
        print("  every file matches its manifest; the current train_matrix.npz is the one it trained on")
        return 0

    if args.dry_run:
        chk = check_run(args.run, selection_run=args.selection_run)
        ok, why = chk.verdict if chk.verdict is not None else (False, "not evaluated")
        problems = list(chk.problems)
        if chk.verdict is not None and not ok and args.force is None:
            problems.append(f"composite_score.should_promote: {why}")
        if problems:
            _print_problems(problems)
            return EXIT_REFUSED
        print(f"dry run: {chk.lineage.get('run_id')} would be promoted (should_promote: {why})")
        return 0

    try:
        current = promote(args.run, selection_run=args.selection_run, force=args.force, keep=args.keep)
    except PromotionRefusedError as e:
        _print_problems(e.problems)
        return EXIT_REFUSED
    print(f"promoted {current['run_id']} -> {DATA_DIR / 'promoted' / current['run_id']}")
    print(f"  {DATA_DIR / 'promoted' / CURRENT} flipped (previous: {current['previous']})")
    if current["forced"]:
        print(f"  FORCED: {current['force_reason']}")
    print(f"  refreshed {', '.join(BUNDLE_FILES[r] for r in LEGACY)} in {DATA_DIR} from the bundle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
