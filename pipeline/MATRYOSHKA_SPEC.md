# SPEC — Matryoshka Representation Learning for the Vector Hoops MTNN

**Status:** draft for Cameron's review · 2026-10-12
**Branch:** `scout/matryoshka-mrl` (worktree `~/workspace/vector-hoops-matryoshka/`)
**Motivation (measured 2026-10-12):** the Atlas map's xyz is PCA(3) on 14 raw
stat features. Neighbor-overlap@20 between the map and the 64-d MTNN embedding
(the twin finder) is **0.017** — the map preserves almost none of the model's
learned similarity. The model's own first-3 dims score 0.014 (v5 was never
trained to make its prefix meaningful). Map and model are two different
representations telling different stories.

**Goal:** train the embedding so nested prefixes (2, 4, 8, 16, 32 dims) are
independently good representations (Matryoshka / MRL, Kusupati et al. 2022).
Then the map plots dims 0–2 of the *production bytes* — map = model, by
construction. The PCA step and its drift risk disappear.

## Changes to `pipeline/train_mtnn.py` (all in this spec)

1. **CLI — `--mrl-dims`** (str, default `""`): comma-separated nested dims,
   e.g. `"2,4,8,16,32"`. Empty = off; the non-MRL code path is byte-identical
   to today. Full dim (64) is always the final level. Validation: ints,
   strictly increasing, each `1 < m < args.dim`.

2. **Loss — nested contrastive + VICReg.** In the batch loop, when MRL is on,
   for each level `m` in `nested_dims + [dim]`:
   - `za_m = F.normalize(za[:, :m], dim=-1)`, same for `zb`
     (the prefix of a unit vector is not unit — re-normalize, per the MRL paper).
   - `contrastive_loss(za_m, zb_m, <same mode/temp/boost/weights>)`
   - `vicreg_loss(za_m)` / `vicreg_loss(zb_m)` when `w_vicreg > 0`
     (keeps each prefix's dims decorrelated — matters for the 2–3 dim map slice).
   - Batch loss uses the **mean** over levels.
   - Supervised heads (archetype, position, profile, …) stay **full-dim only**,
     preserving v5 recipe comparability. MRL applies the representation loss at
     nested levels; heads are the interpretability bridge, not the geometry.

3. **Eval logging — nested recall.** At each val check, alongside full-dim
   `test_recall@10`, compute `test_recall@10` on re-normalized prefixes
   [2, 3, 8, 16, 32] from the same `embed_all` output. Logged as
   `test_recall_at_10_d{m}` in the log line, `val_trace`, and
   `mtnn_report.json`. This is the number that tells us whether the map slice
   is faithful. Cost: one extra k-NN per prefix per val check — negligible.

4. **Model tag.** `model_tag()` appends `mrl` + dims, e.g.
   `…_fus256_mrl2-4-8-16-32`. ("A label is a claim; derive it from the knobs.")

5. **Report.** `mtnn_report.json` records `mrl_dims` and the nested recalls.

6. **Promotion gate — unchanged.** Promotion is decided on **full-64-d**
   held-out numbers vs the v5 champion, per the standing rule. Nested recalls
   are diagnostic, never promotion criteria.

## Experiment plan

- `-0002` (queued): plain v5 recipe — the **control**.
- `-0003` (this spec): v5 recipe + `--mrl-dims 2,4,8,16,32` — the **treatment**.
- Promote neither unless full-dim held-out beats v5. If the MRL run wins,
  the map switches from PCA xyz to embedding dims 0–2 (display rotation TBD
  once we see the spread).

## Viz follow-through (after a winning MRL run)

- `vectors_search_lite.json` xyz ← `mtnn_embeddings.f32` dims [0:3] directly.
- No PCA pipeline, no projection/embedding drift — impossible by construction.
- Honest caveat: MRL prefixes are faithful, not pretty (optimized for
  retrieval, not visual spread like PCA). Judge the map on truth first,
  then tune display rotation.

## Out of scope

- Changing the served v5 bundle or the current PCA map before a held-out win.
- Touching `check_served_model.py` lineage rules (separate thread, needs his word).
- Merging to master — branch only until results are in.
