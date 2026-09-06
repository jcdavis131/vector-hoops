# weekend/keep-token-dropout-0 (late arrival)

**What and why.** Folds a GPU-queue KEEP into the repo: herdmux weekend queue job j0018
found that `--token-dropout` (family-token dropout, default 0.1) was stacking on the token
encoder's own element dropout (0.12) — removing it (`--token-dropout 0`) measurably
improves the hoops embedding. This branch changes the trainer's default to 0.0 and records
the measurement in `docs/MTNN_V6_SOTA.md` next to the recommendation it contradicts.

**Measured evidence.**
- j0018 (this tree, `90ef66a4`, host protocol `1cdf63f8c825`): **77.5233 ± 0.6423** vs. the
  **76.6283 ± 0.8264** anchor measured the same day — **+0.8950 CQS, paired t=4.04, 6/6
  seeds improved** (+0.77, +1.72, +0.77, +0.05, +1.11, +0.95).
- `purity@20`: 0.7710 → 0.8067. `recall@10`: 0.8123 → 0.8080 (−0.53%, inside the 2% floor
  guard).
- `docs/MTNN_V6_SOTA.md` previously recommended 0.1 as SOTA, reasoning from a memorization
  risk; this branch adds the measurement that contradicts that reasoning **next to** the
  existing text, rather than silently overwriting it.

**Verified, and how.** This is a GPU-queue-measured result (herdmux's own runner, not a
script this lane re-ran) — the numbers above are quoted verbatim from the job's own commit
message and the queue's `results.tsv`/journal, not independently re-executed by this
PR-body pass. No test suite was run by this lane on this branch (guard 11: `vector-hoops`
had a running GPU job, j0018 itself, throughout the branch's own creation).

**Explicitly NOT done.** Not deployed, not merged. The result is a single flag-default
change plus a docs annotation — no artifact was rebuilt/shipped from this branch.

**Merge target and blocker — BLOCKED, cannot be PR'd as-is, same class of blocker as
`weekend/artifact-claims-hoops`.** This branch is built on `vector-hoops`'s **local**
master (`90ef66a4`), not `origin/master`. Verified directly: `git merge-base
weekend/keep-token-dropout-0 origin/master` exits 1 (no common ancestor). Per the branch's
own commit message: "this tree's history shares no ancestor with origin/master (see
`SHIP_BRIDGE_HOOPS.md` section 4), so shipping needs the operator's reconciliation first."
This is a **late-arrival branch** — it did not exist when this lane's branch enumeration
began and was discovered on a final re-check; it landed after (and independently of) both
hoops branches already documented in this repo's other PR bodies (`live-fix-hoops`,
`artifact-claims-hoops`), which are unaffected by it (no file overlap: this branch touches
`docs/MTNN_V6_SOTA.md` and `pipeline/train_mtnn.py`; `live-fix-hoops` touches only `public/`
and `docs/LIVE_FIX_FINDINGS_hoops_2026-09-06.md`; `artifact-claims-hoops` touches
`assets/mtnn_arch.json`, `model_registry.json`, `pipeline/rebuild_all.py`, `train.sh`, and
several `.html` files — no path in common with this branch's 2 files).
