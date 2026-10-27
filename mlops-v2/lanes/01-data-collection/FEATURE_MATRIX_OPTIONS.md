# Lane 1 — Open Question #1: Feature-Matrix Options

**Lane:** 1 Data collection · **Status:** DRAFT ONLY · **Date:** 2026-10-26

**Question (spec §2, verbatim problem):** the 120-feature input matrix is
not committed as a file; `assets/mtnn_inputs.f32` is an 11-feature proxy;
the prior v6 script expanded it via random projection (banned — see below).
The three options below are in the spec's order. Per contract §2b, each
states source, row count, feature count, sha256 procedure, and what breaks
if it is wrong. Lane 1 recommends **one** option (§4); the user decides.

**First, the banned path, so no lane re-invents it:** the prior attempt
(`vector-hoops/pipeline/train_mtnn_v6_scaling.py`) loads
`data/embedding_v3_with_text.npz` (v5's own 64-d embeddings) plus
`assets/mtnn_inputs.f32` (11 columns) and, in its own comment, "expand[s]
via random projection for 120 dims consistent with v5." Random projection
creates 109 synthetic columns that look like features but carry no
basketball information; a tower trained on them learns the projection's
geometry, not the game. Contract §2b bans it outright: Lane 4's script
must fail loud if the real matrix is absent and must never do this. Any
draft that "fills" missing features with random, zero-filled, or
model-generated values without labeling them as such is the same red flag
in a different coat.

**Width warning (applies to all options):** the spec's "120" is the v4
manim explainer's count. The champion's own export
(`assets/mtnn_arch.json`) says **130 feats in 17 families**; the current
HEAD rebuild chain produces **143 columns**; the base chain alone
produces **73**. No option below delivers "120" without redefining the
word. Option 1's honest width is 143 (HEAD chain) or 73 (base chain) —
the coordinator must amend contract §0/§2b to pin one before Lane 4
writes its loader (see SOURCES.md §8, conflict C1).

## Option 1 — Re-derive from source stats via the original feature pipeline

**Source.** The tracked caches in the `vector-hoops-mlops-v2` checkout
(master `1e5bfecc`) + the in-repo prepare chain:
`pipeline/build_vectors.py --offline` → `pipeline/enrich_vectors.py` →
`pipeline/rebuild_all.py --refresh-context --stage matrix` (side builders
listed in SOURCES.md §6) → `pipeline/integrate_context.py`, ending in the
`stage_contract.py` check against
`pipeline/contracts/train_matrix.contract.json` (exit 2 on drift).
Full per-family source table: SOURCES.md §3. Raw caches are git-tracked
(788 files), so any clone starts from the same raw stats.

**Row count:** 12,966 player-seasons, 1996-97…2025-26 (verified against
`assets/vectors.json`; recent seasons 464/484/500/491 match the contract).

**Feature count:** 143 columns in the HEAD contract file (families:
volume, playmaking, rebounding, defense, efficiency, shotmix, bio,
tracking, form, market, roster, career, competition, team, system,
pedigree, playoffs, honors, injury-readout) — **not** 120 and **not** the
champion's 130. Base chain alone: 73 columns. The 143-column manifest
(`feature_manifest.json`) names every column and family; Lane 2 validates
against it, Lane 4 loads by column name, never by position alone.

**sha256 procedure (contract §2b + repo practice):**

1. After the rebuild, record `sha256sum pipeline/data/train_matrix.npz`
   and `sha256sum pipeline/data/feature_manifest.json` in the run report.
2. Record the matrix fingerprint via `pipeline/artifact_io.py`'s
   `matrix_fingerprint` (the same identity `promote.py` lineage checks
   use) — fingerprint, not just file hash, so a re-save with identical
   values still matches.
3. Verify row identity by `(player_id, season)` key against the mlops-v2
   checkout's `assets/vectors.json` (the `export_mtnn_viz.py` row-equality
   rule), never by row position alone.
4. Reference point: the contract file's FA2 matrix is sha256
   `60dba1cbeabd6e03` (manifest `f1c90cdca75df174`); a rebuild that does
   not match it must be explained by a recorded builder change, not
   waved through.

**Evidence for it.** The chain exists, is documented in-repo
(`docs/PIPELINE.md`, `rebuild_all.py` header, `integrate_context.py`
header), is contract-gated, and demonstrably ran as recently as
2026-10-18 (reproduction protocol: 12,966 × 73 base rebuild from the
tracked caches, salary coverage 11,504/12,966, Z NaN-free). The core
caches cover all 30 seasons; 2025-26 caches are populated and the
2025-26 honors file is marked complete.

**Evidence against it (honest).** (a) The champion's exact matrix is
unrecoverable: the Oct 18 pre-registered reproduction trained on the
rebuilt matrix and failed — CKA 0.7741 vs the served embeddings, top-1
neighbor identical on only 32.8% of probes, mean recall 0.7787 vs the
0.846 ± 0.062 band. A rebuilt matrix trains a *different geometry* than
v5's. (b) The full 143-column rebuild is currently blocked offline: the
gamelog-dependent side builders need `pipeline/data/gamelogs_*.jsonl`,
which is gitignored and absent from every checkout (SOURCES.md §6).
(c) The honors semantics decision is recorded as open (SOURCES.md §6).
(d) A possible Nugatron/training-box matrix (2026-08-04, sha256
`231b07f1df283205`) is **UNCONFIRMED** — see SOURCES.md §6; it must not
be assumed to be the champion matrix.

**What breaks if it is wrong.** If the rebuild silently differs from the
recorded matrix (stale side files, missing gamelogs filled with zeros,
honors semantics changed), the challenger trains on a different feature
space than the report claims; held-out metrics then compare a new model
on new features against v5 on old features, and the promotion gate
becomes meaningless. The contract check (exit 2 on drift) is the guard —
Lane 4 must run it and refuse to train on a failing matrix, and Lane 2
must own the honors + gamelog decisions in writing first. If the gamelogs
cannot be re-fetched, this option degrades to the 73-column base matrix,
and that scope cut must be declared before training, not discovered
after.

## Option 2 — Train on the 11-feature proxy

**Source.** `assets/mtnn_inputs.f32`, shipped in both checkouts
(570,504 bytes = 12,966 × 11, verified by byte count).

**Row count:** 12,966. **Feature count:** 11 — but see below.

**sha256 procedure:** `sha256sum assets/mtnn_inputs.f32`, recorded in the
run report, plus a column-identity note. The procedure is easy; the
meaning is the problem.

**What the proxy actually is (evidence).** Its only in-repo writer,
`pipeline/export_mtnn_viz.py`, writes per-family means of masked
z-scores, rescaled 0–1 — a visualization artifact for the network
diagram, not a training matrix (SOURCES.md §5). The shipped file is 11
columns wide while the champion's arch lists 17 families, so it does not
match the champion export's writer output, and it carries no header, so
its 11 column identities are **UNCONFIRMED** (the
`train_with_text_fusion.py` comment calling it "11 base feats"
contradicts the viz writer and is not evidence).

**What is lost, honestly.** Everything below family level: all
within-family variation (e.g. scoring volume vs three-point volume
collapse into one "volume" mean), all per-feature masking (the means
already include a median fallback for fully-masked rows), and all
feature-level era structure. The 17-tower architecture cannot be built
from 11 unlabeled means — only the spec's fallback plain MLP
(120 → 256 → 256 → 64, re-cut to 11 inputs) is even loadable, and the
tower-dropout / tower-ablation program (contract §2c/§2d, Lane 5) has
nothing to ablate. The "better features → better metric" story is gone;
what remains is "can a contrastive MLP on family summaries beat v5's
retrieval," a much weaker claim.

**What breaks if it is wrong.** If the 11 columns are not family means
in arch order (unconfirmed), any family-level interpretation of the
result is garbage — while the model itself still "trains" and reports
numbers, a silent degradation. Worse, because the proxy is derived from
v5's own training matrix, a win on it would be hard to attribute: is the
contrastive objective better, or did the family means just leak v5's
geometry in a convenient form? The promotion gate would still apply, but
the scientific claim would be thin. This option is a floor/baseline, not
a challenger.

## Option 3 — Train on v5's 64-d embeddings as inputs

**Source.** `assets/mtnn_embeddings.f32` (3,319,296 bytes = 12,966 × 64,
verified; L2-normalized per `mtnn_meta.json`, built 2026-07-25), with the
keyed companion `vector-hoops-mlops-v2/data/embedding_v3_with_text.npz`
(`z` 12,966 × 64 + `player_id` + `season` + `name`).

**Row count:** 12,966. **Feature count:** 64 (the embedding dims, not
features — the distinction matters for every downstream claim).

**sha256 procedure:** `sha256sum assets/mtnn_embeddings.f32` recorded in
the run report and pinned in the training config; the loader verifies
row identity by `(player_id, season)` against `vectors.json` before any
epoch runs, and refuses to train if the champion file's hash differs
from the pinned value (a re-pointed champion file would otherwise
silently change the inputs). The champion file itself is never an output
path (contract §2c).

**Evidence for it.** It is the only option whose input is byte-verified
today, with zero rebuild risk and zero missing data: the file exists, its
shape is exact, and the spec's own pair construction already uses v5's
twin structure. As a distillation experiment it is clean and fast.

**Evidence against it (decisive for the spec's story).** It abandons the
spec's hypothesis. The spec §1 hypothesis is that a metric-learning
objective on *features* produces a better twin space than v5's
prediction bottleneck; option 3 feeds the model v5's *output* instead.
No new basketball information can enter — the model can only re-weight
geometry v5 already computed (and the spec §6 distillation ceiling says
the same about twin agreement: v6 cannot beat v5 there, only match).
A win on held-out adjacent-season retrieval would then prove "SupCon
re-ranking sharpens v5's space," not "contrastive features beat v5" —
and the Matryoshka serving-unification story (16-d prefix replacing the
14-d projection) would rest on a re-slicing of v5, not a new model. It
also couples the challenger to the champion file forever: any future
champion replacement invalidates the input.

**What breaks if it is wrong.** If the embeddings file is ever replaced
or re-pointed (the Oct 18 protocol documents two claimant champion runs
and a served-file replacement in July 2026), an unpinned loader trains
on a different space than the report claims. The sha256 pin prevents
this; without it, the failure is silent. A subtler break: positives
built from v5's train-split twins plus adjacent seasons are, under this
option, positives *in the input space itself* — the model can memorize
neighborhoods rather than learn a metric, inflating val retrieval while
generalizing no better than v5. Lane 5's frozen-test gate is the only
defense, and it must stay frozen.

## Comparison (one table, no hedging on the trade)

| | Option 1: re-derive | Option 2: 11-col proxy | Option 3: v5 embeddings |
|---|---|---|---|
| Real basketball signal beyond v5? | Yes — raw stats, full columns | No — family means only | No — v5's output only |
| Preserves the spec's hypothesis? | Yes | Barely (MLP on summaries) | No |
| Input exists on disk today? | No — must be rebuilt | Yes, but identities unconfirmed | Yes, byte-verified |
| Rebuild risk | Gamelogs missing; honors open; width 143 not 120 | None (but meaning unknown) | None |
| Architecture it supports | 17 towers or plain MLP | Plain MLP only | Plain MLP only |
| Promotion claim if it wins | "Contrastive features beat v5" | "Contrastive MLP on summaries beat v5" (thin) | "SupCon re-ranking sharpens v5" (not the spec's claim) |
| Silent-failure mode | Stale side files / zero-filled gaps | Wrong column identities | Unpinned champion file swap |

## Recommendation — Option 1, re-scoped honestly

**Lane 1 recommends option 1: re-derive from source stats via the
current HEAD prepare chain — with three conditions attached, each owned
outside this lane:**

1. **Re-pin the width.** The coordinator amends contract §0/§2b from
   "120 features" to the HEAD chain's **143 columns** (or, if the
   gamelog block below fails, the base chain's **73 columns** declared
   as a scope cut). Lane 4 must fail loud if the matrix file is absent
   and must never random-projection expand anything.
2. **Close the gamelog gap or declare the cut.** Either re-fetch
   `pipeline/data/gamelogs_*.jsonl` via `fetch_gamelogs.py` (network
   fetch, stats.nba.com throttling — a scheduled job, not a silent
   local rebuild) so the side builders run, or record in writing that
   the challenger trains on the 73-column base matrix. Zero-filling the
   gamelog families is not an option.
3. **Decide honors semantics (Lane 2) and run the contract check
   (Lane 4, via `integrate_context.py` / `stage_contract.py`) before
   any training.** A matrix that fails the contract check trains
   nothing.

**Why option 1 wins despite its blockers.** It is the only option that
keeps the spec's experiment intact: real features, real masks, real
held-out evaluation. Its blockers are logistical (a fetch, a decision,
a contract amendment), not structural — and the Oct 18 reproduction
failure, read correctly, supports rather than kills it: it proves the
chain runs end-to-end on real caches and produces a real, *different*
matrix. The challenger is judged on held-out metrics, not on
reproducing v5's geometry, so "different matrix" is acceptable while
"no matrix" (options 2/3's information loss) is not. The Nugatron box
remains a worthwhile check (SOURCES.md §6) but must not gate the draft:
even a found training-box matrix would still need the contract check
and the honors decision, and it would still not be "v5's 120."

**Why not the others.** Option 2's input is an unlabeled visualization
artifact whose columns cannot be verified — training a challenger on it
would put an unconfirmed input at the base of a promotion claim.
Option 3 is the cleanest experiment and the right *baseline* (Lane 4/5
may run it as a distillation control if the coordinator wants one), but
as the challenger it cannot test the spec's hypothesis and cannot
support the serving-unification story as a new model. If option 1's
gamelog fetch proves impossible and the coordinator rejects the
73-column scope cut, the fallback is option 3 as a distillation
baseline — explicitly labeled as such, never as the feature challenger.

**What Lane 1 did not do (scope honesty).** No rebuild was run, no
matrix was written, no remote box was contacted, no training was
attempted, no packages were installed. Every file claim above is from
reading the checkouts; every gap is labeled, with the exact check that
would close it.
