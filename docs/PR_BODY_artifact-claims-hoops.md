# weekend/artifact-claims-hoops

**What and why.** Three artifact-claim honesty fixes on hoops's LOCAL master (`90ef66a4`):
strip an unlabeled PROJECTED number from `model_registry.json`, wire `--write-artifacts`
into the shipping rebuild path so a rebuild can actually produce a shippable artifact
instead of silently exporting stale data, and correct a hand-written training-hyperparameter
block that contradicted the commit that actually produced the served embedding bytes.

**Measured evidence.**
- `model_registry.json`'s hoops block presented `eval_scoreboard_v6.json`'s PROJECTED
  `composite` (0.85) and `top1_790` (0.55) with the "projected" label stripped, even though
  that source file's own status field is `"candidate_not_fully_trained_150ep"` with an
  explicit `honesty_note` that these numbers are "expected, not measured." Renamed the two
  keys to `composite_score_projected` / `top1_790_projected`, added `"projected": true` and a
  `projection_note` citing the real measured v6 report — `pipeline/data/mtnn_report.json`:
  CQS 66.23, well below the projection. No number removed or invented.
- `pipeline/rebuild_all.py` and `train.sh`'s final-refit (shipping) `train_mtnn.py` calls did
  not pass `--write-artifacts`. Since `bf194108` (08-11) a plain `train_mtnn.py` call writes
  to `pipeline/data/_scratch` while `export_mtnn_embeddings.py` reads `pipeline/data`
  directly — so a rebuild silently exported stale artifacts under a fresh report's metrics.
  Added the flag to both scripts' shipping invocations only; selection/ablation calls stay
  scratch-only, unchanged; the flag's own default in `train_mtnn.py:1403-1409` is untouched.
- `assets/mtnn_arch.json`'s hand-written `training` block (added `6a2d9e6a`, 08-06; no
  pipeline script ever writes this key) claimed 150 epochs plus other hyperparameters that
  contradicted the `53d35adb` promote commit that actually produced the served
  `assets/mtnn_embeddings.f32` bytes. Corrected epochs/lr/weight_decay/nce
  weights/hard_neg_boost/drop_p/robust_scaling/phase/era_align against `53d35adb`'s own
  record (commit message + `git show 53d35adb:pipeline/train_mtnn.py`), in both
  `assets/mtnn_arch.json` and its `public/` mirror, with a `_source` field. Bumped the `?v=`
  cache token on the 5 pages that fetch this file (`scripts/stamp_assets.py --check`
  confirmed these were the only pages staled by this edit; 25 pre-existing stale pages
  unrelated to this change were left untouched, listed in `docs/` for the operator).
- `herdmux/gpu/weekend/SHIPPED_MODELS.md:17` and `shipped_models.json` carry the same wrong
  150-epoch claim, inherited from the same block — herdmux is out of this lane's write
  scope, so the correction is written to
  `docs/ARTIFACT_CLAIM_CORRECTIONS_2026-09-06.md` on this branch for the operator to apply.

**Verified, and how.**
- `pytest pipeline tests -q --ignore=pipeline/test_provenance_gate.py` → 31 passed, 3
  skipped.
- `python pipeline/test_provenance_gate.py` → 15 passed, 0 failed.
- Guard 11: `git -C vector-hoops status --porcelain` empty before and after (0 lines both
  times); `qctl.py status` showed vector-realty (j0006) running during the test window,
  vector-hoops (j0012) only started after tests completed.

**Explicitly NOT done.**
- `herdmux/SHIPPED_MODELS.md:17` / `shipped_models.json` are NOT edited by this branch
  (out of scope, herdmux is a different repo) — the correction text is staged in
  `docs/ARTIFACT_CLAIM_CORRECTIONS_2026-09-06.md` for the operator to apply by hand.
- 25 other stale-token pages found by `stamp_assets.py --check`
  (cap-tetris*/doppelganger*/everyday*/oracle*/report-card*/trade-machine* +
  `assets/network-viz.js`) are unrelated to this change and untouched.

**Merge target and blocker — BLOCKED, cannot be PR'd as-is.** This branch is built on
`vector-hoops`'s **local** master (`90ef66a4`), not `origin/master`. Verified directly:
`git merge-base weekend/artifact-claims-hoops origin/master` exits 1 (no common ancestor) —
local master and `origin/master` are two disjoint histories. The branch has been pushed to
origin and sits there beside `backup/local-master-2026-09-05` (also pushed, also rooted in
the local history line), but neither GitHub nor a local PR flow can diff/merge it against
`origin/master` until the operator reconciles the two histories (see `SHIP_BRIDGE_HOOPS.md`
for the reconciliation plan). Until then this branch is **not mergeable to origin/master by
any git operation**, PR or otherwise — it can only be examined by browsing the branch
directly or diffing it against `90ef66a4`/`backup/local-master-2026-09-05` on origin.
