"""Torch-free pieces of train_mtnn.py's training loop, kept here so they can be tested.

Non-finite guard (2026-10-09). Nothing in train_mtnn.py checked a loss or an
output for NaN or inf: `grep -n "isfinite\\|isnan" pipeline/train_mtnn.py`
matched nothing [training#12]. A run whose loss went non-finite kept
training, wrote NaN embeddings, and exited 0. composite_score._num reads NaN
as missing and component_scores scores a missing component 0.0, so the
herdmux climb (gpu/climb.py classify_exit: exit 0 is "ok") would have counted
a diverged seed as a real, very low CQS inside a seed panel. Now the run
stops with exit code EXIT_NON_FINITE (3), which no other path in
train_mtnn.py uses, and a message saying where.

The loss check reads the float the loop already takes from the loss each
step (`total += float(loss)`), so a finite run does no extra work and gets
the same numbers. Only when that float is not finite does it look at the
individual loss terms, to name the one that went bad.

Exit code 3 is not yet a "crash" in herdmux: classify_exit calls a nonzero
exit without "Traceback" in the output "infra". Mapping 3 to its own verdict
is a herdmux change.
"""

from __future__ import annotations

import math
import sys
from collections.abc import Mapping
from typing import Any

import numpy as np

EXIT_NON_FINITE = 3


class NonFiniteError(SystemExit):
    """A non-finite loss or output. Exits the process with EXIT_NON_FINITE.

    SystemExit with an int code prints nothing when it ends the process, so
    raise_non_finite() writes the message to stderr first; the message is also
    kept here for callers and tests.
    """

    def __init__(self, message: str):
        super().__init__(EXIT_NON_FINITE)
        self.message = message

    def __str__(self) -> str:
        return self.message


def raise_non_finite(message: str) -> None:
    print(f"NON-FINITE: {message}", file=sys.stderr, flush=True)
    raise NonFiniteError(message)


def check_loss(loss_value: float, terms: Mapping[str, Any], *, epoch: int, step: int) -> None:
    """Stop the run when a step's loss is not finite, naming the terms that are not.

    loss_value is the step's total loss as a float. terms maps each loss
    term's name to its unweighted value (a 0-d tensor or a number); it is read
    only when the total is not finite. step is the batch's index within the
    epoch.
    """
    if math.isfinite(loss_value):
        return
    bad = [name for name, value in terms.items() if not math.isfinite(float(value))]
    which = (
        f"non-finite term(s): {', '.join(bad)}"
        if bad
        else "every recorded term is finite on its own, so their weighted sum overflowed"
    )
    raise_non_finite(f"loss {loss_value} at epoch {epoch} step {step}; {which}")


# train_mtnn's loop skips a slice of the epoch's permutation with fewer rows.
MIN_BATCH_ROWS = 8


def trained_batches(n_rows: int, batch: int, min_rows: int = MIN_BATCH_ROWS) -> int:
    """How many slices of an n_rows permutation the loop trains on: those with at least min_rows rows."""
    return sum(1 for start in range(0, n_rows, batch) if min(batch, n_rows - start) >= min_rows)


def scheduler_steps_per_epoch(n_fit_rows: int, batch: int, grad_accum: int) -> int:
    """Optimizer steps, so step-mode scheduler steps, one --protocol-v2 epoch takes over n_fit_rows.

    The loop steps after every grad_accum trained batches and once more at
    the end of the epoch for a partial accumulation, so ceil(batches /
    grad_accum). v1's train_mtnn.optimizer_steps_per_epoch counts every
    row, not the fit rows, includes slices too small to train on, and
    floors the division; for a select run it says 26 where the loop takes
    22 [training#7].
    """
    return -(-trained_batches(n_fit_rows, batch) // grad_accum)


# --checkpoint-metric 'cqs' and 'composite' have always meant
# train_mtnn.promotion_composite, i.e. composite_score.partial_cqs: smoothed val
# recall and val purity, never the full CQS, whose other eight components are
# scored only after training [eval#11]. 'recall-purity' says what it is. The
# two old names still parse and mean the same proxy, so the recipes and sweep
# configs that pass them (legacy-v5-refit, legacy-v6-refit, apply_hp_sweep's
# 'composite') keep working.
CHECKPOINT_METRIC_ALIASES = {"cqs": "recall-purity", "composite": "recall-purity"}


def checkpoint_selection(*, no_best_checkpoint: bool, fit_rows: str, metric: str) -> tuple[bool, str]:
    """(keep a best checkpoint?, the metric that picks it), for train_mtnn's validation checks.

    Best-checkpoint selection scores each check on the val split. When the
    loss sees every row (fit_rows 'all'), val rows are training rows: the
    legacy refit recipes (--val-every 10 --checkpoint-metric cqs --phase
    final-refit) restored the epoch that fit them best [eval#11]. Then no
    best checkpoint is kept and the run keeps its final weights. Otherwise
    it is what --no-best-checkpoint says, as it always was.
    """
    return (not no_best_checkpoint and fit_rows != "all", CHECKPOINT_METRIC_ALIASES.get(metric, metric))


def require_finite(arrays: Mapping[str, Any], *, before: str) -> None:
    """Stop the run before writing `before` when any of the named arrays holds a NaN or inf."""
    bad = []
    for name, value in arrays.items():
        a = np.asarray(value)
        finite = np.isfinite(a)
        if not finite.all():
            bad.append(f"{name} ({int(a.size - finite.sum())} of {a.size} values)")
    if bad:
        raise_non_finite(f"non-finite values before {before}: {'; '.join(bad)}")
