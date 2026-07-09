# MTNN v5 — Promote / hold gate (fill-the-wait shell)

> **Status:** Ready for results drop-in · **Lane:** product/docs gatekeeper (not Fable 5 training)
> **Parents:** [`MTNN_V5_DEEP_ARCHITECTURE.md`](./MTNN_V5_DEEP_ARCHITECTURE.md) §7–§10 · `pipeline/ablate_v5.py`
> **Hard rule:** **no overwrite of promoted v4** (`mtnn_best.pt`, `embedding_v3.npz`, `mtnn_centroids.npz`, live `assets/mtnn_*`, game NN) until the operator explicitly says promote.

This file is the **second brain** while Fable 5 (Claude CLI / terminal 51) runs GPU ablations and B-family sweeps. Fill numbers when the ranked table lands; do not invent metrics.

---

## 0. Live wait (update from monologue)

| Field | Value |
|-------|-------|
| Session | Fable 5 · Claude CLI · terminal `51.txt` |
| Monologue | `tasks/session-monologue.jsonl` · `python scripts/read_session_monologue.py --format context` |
| Last known focus | B-family arch sweep (depth/width/dim) on GPU → confirm winner × 3 seeds |
| Isolated outputs only | `pipeline/data/ablation/` (and any sweep subdirs under it) |
| Operator sign-off required before | any write to promoted checkpoints / `assets/` NN promote |
| Conflict radar (2026-07-08 fill) | `pipeline/train_mtnn.py` is **dirty in git** (Fable 5 lane) — this Agent must **not** edit it. `pipeline/ablate_v5.py` / `pipeline/sweep_v5.py` are Fable 5. Product lane stays on docs / NUX / next-profile UI / tasks. |
| Product fills during wait | NUX tour replay (`data-vh-nux-tour`); next-profile predicted vs actual on `/players`; `docs/MTNN_V5_PROMOTE_GATE.md` |
| **Product review GO (2026-07-09)** | Current v4 assets **PASS** gates + live `/trends` + `/model` smoke — see `tasks/post-retrain-review-notes.md`. Phase 1–2 **blocked** until Fable 5 sweep + operator promote. |

---

## 1. Decision rule (canonical — do not soften)

From `docs/MTNN_V5_DEEP_ARCHITECTURE.md` §7 and `pipeline/ablate_v5.py`:

1. **Ship C (full v5 / transformer)** only if:
   - `purity@20(C) ≥ purity@20(A) + 0.02`
   - **and** next-profile test RMSE **improves** vs A
   - **and** `recall@10(C) ≥ 0.99`
2. **Else if C ≈ B** (transformer not earning cost) → **fall back to B** (deep concat).
3. **Else if neither beats A** → **keep v4** (config A / deployed).

“Beats A” for B means clear held-out purity and/or next-profile gain without recall regression below 0.99. If ambiguous, **default hold v4** and ask the operator.

---

## 2. Comparison table — PARTIAL (sweep in flight)

> **Protocol change — read first.** Every number below is measured under a
> protocol that did not exist when §1 was written:
> * `--protocol leakfree` — the legacy loop trained on **1,551 held-out pair
>   positives** and **1,551 held-out next-season targets**, and fit k-means over
>   val/test rows. Old "recall@10 = 1.0" was memorization.
> * `--split player` — the temporal split had a mean family-coverage gap of
>   **0.167** (tracking 0.372 train vs 1.000 test), discarded 771 straddling
>   pairs, and never trained 4 seasons' `season_emb` rows.
> * Matrix rebuilt: dead `game_ratings` tower removed (129→120 features,
>   18→17 towers), salary backfilled (val/test coverage 0.000 → 0.935/0.888),
>   `career_arc` un-staled (`DRAFT_SLOT_Z` 0% → 100%).
>
> Numbers are therefore **not comparable** to any figure in §1 or in
> `MTNN_V5_DEEP_ARCHITECTURE.md` §7. See that file's §0 correction block.

### 2a. A / B / C ablation (held-out, leak-free + player-split, 60 ep, seed 7)

| Config | Fusion | purity@20 (test) | Δ vs A | next-profile RMSE | Δ vs A | recall@10 | Verdict cell |
|--------|--------|-----------|--------|-------------------|--------|-----------|--------------|
| A_v4_control | concat / shallow | 0.6748 | 0 | 0.6337 | 0 | 0.9660 | control |
| B_deep_concat | concat / deep | 0.6804 | **+0.0056** | **0.6097** | **−0.0240 (−3.8%)** | 0.9680 | depth-only |
| C_transformer | transformer / deep | **NOT RUN** | — | — | — | — | **in flight** |

**Auto-check:**

| Check | Pass? |
|-------|-------|
| `purity@20(C) ≥ purity@20(A) + 0.02` | **N/A — C not run** |
| next-profile RMSE(C) < RMSE(A) | **N/A — C not run** |
| `recall@10(C) ≥ 0.99` | **UNSATISFIABLE — see below** |
| C clearly better than B (not ≈) | **N/A — C not run** |

> **The `recall@10 ≥ 0.99` floor is mis-calibrated.** It was set when recall was
> a *leaked* metric pinned at 1.000. Under leak-free eval **no config reaches
> 0.99** — A is 0.9660, the best observed is 0.978. Applied as written, the rule
> mechanically returns `KEEP_V4` for every candidate, including ones that clearly
> improve. The floor must be re-derived against leak-free numbers (suggest
> "no regression vs A", i.e. `recall(X) ≥ recall(A) − 0.005`) **before** §1 can
> decide anything. This is an operator decision, not an agent one.

**§7 outcome:** **`NEEDS_OPERATOR`** — C unrun; recall floor invalid; single seed.

### 2b. B-family GPU sweep (depth / width / dim) — 5 of 11 configs complete

Ranked by held-out next-RMSE (lower better); purity is **test-only**.

| Rank | Config id | Key knobs | params | purity@20 (test) | next RMSE | recall@10 | Notes |
|------|-----------|-----------|--------|-----------|-----------|-----------|-------|
| 1 | `b1_h96_t24_d48` | v4 depth/width **+ MLP heads** | 224,899 | 0.6605 | **0.6072** | **0.978** | cheapest; best RMSE + recall |
| 2 | `b2_h160_t32_d64` (=B) | 2 blk / 160 / 32 / 64 | 526,091 | 0.6804 | 0.6097 | 0.968 | 2.3× params, no RMSE gain over #1 |
| 3 | `b2_h224_t32_d64` | wider hidden | 652,427 | 0.6847 | 0.6107 | 0.974 | |
| 4 | `b2_h160_t32_d48` | zero-migration emb | 513,147 | 0.6858 | 0.6140 | 0.978 | |
| 5 | `b3_h160_t32_d64` | 3 blocks (deepest) | 709,963 | **0.6934** | 0.6165 | 0.962 | best purity, worst RMSE of group |
| — | `b2_h160_t48_d64`, `b2_h160_t32_d96`, `b3_h224_t48_d64`, `b3_h160_t32_d96`, `tx_*` ×2 | | | | | | **pending** |

**Leading interpretation (single seed — not locked):** the regression gain is
attributable to the **2-layer MLP decode heads**, not tower depth.
`b1_h96_t24_d48` differs from `A_v4_control` by *only* the head type
(+13,200 params, +6%) and moves RMSE **0.6337 → 0.6072 (−4.2%)** — a larger gain
than B's −3.8% at 2.5× the params. Tower depth buys **purity** (`b3` leads) at the
cost of RMSE and recall. There is a **purity ↔ regression tradeoff**; no config
dominates. `b1` vs `B` on RMSE (0.0025) is **within seed noise**; `b1` vs `A`
(0.0265) is well outside it.

**3-seed confirm of winner** (required by §3a before lock): **NOT RUN.**

| Seed | purity@20 | next RMSE | recall@10 | Stable? |
|------|-----------|-----------|-----------|---------|
| 7 | | | | |
| 13 | | | | |
| 21 | | | | |
| mean ± spread | | | | |

---

## 3. Promote checklist — if B (or C) wins

Do **not** start this list until §2 outcome is `SHIP_C` or `FALLBACK_B` **and** operator says go.

### 3a. Pre-promote (still isolated)

- [ ] Ranked table + 3-seed confirm pasted above
- [ ] Winner config frozen in writing (exact flags / JSON)
- [ ] Confirm writes stayed under `pipeline/data/ablation/` (or documented sweep dir)
- [ ] Diff promoted paths: `git status` shows **no** accidental edits to `mtnn_best.pt`, `embedding_v3.npz`, `mtnn_centroids.npz`, `assets/mtnn_*`
- [ ] Embedding dim decision recorded (48 hold vs 64 migrate) — see architecture §9 / §11
- [ ] Grep consumers of hardcoded `48` / `d_emb` if dim changes

### 3b. Promote (operator-gated)

- [ ] Full retrain of winner recipe (not just ablation budget) if required by SOP
- [ ] Export embeddings / meta / viz via existing export path
- [ ] Extend / re-run `verify_accuracy.py` gates (purity floor, recall floor ≥ 0.99, arch top-1, etc.)
- [ ] Update `mtnn_report.json` + promotion eligibility keys
- [ ] Refresh `/model` diagram against the net that actually ships
- [ ] Smoke game NN / cosine contract on a known puzzle day
- [ ] Commit message cites §7 outcome + metric deltas
- [ ] **Only then** replace promoted artifacts

### 3c. Post-promote smoke

- [ ] `verify_accuracy.py` green
- [ ] Site assets load; play mode still era-honest
- [ ] Monologue / handoff note: “v4 superseded by \<recipe\> on \<date\>”

---

## 4. Hold checklist — if A wins (keep v4)

- [ ] Record §7 outcome `KEEP_V4` with the comparison table filled
- [ ] **Do not** overwrite promoted v4 assets
- [ ] Leave ablation artifacts under `pipeline/data/ablation/` for audit
- [ ] Optional: enrich **v4** truthful diagram only (`export_mtnn_viz` / network viz) — architecture §10.3
- [ ] Close research lane note: “v5 rejected; neural net not justified under house rule”
- [ ] Product lane continues (NUX, UI, docs) without waiting on promote

---

## 5. Gatekeeper — no-overwrite + conflict watch

### 5a. Promoted paths (read-only until operator promote)

Treat as **sacred** during Fable 5 runs:

- `pipeline/data/mtnn_best.pt` (or current best checkpoint name in repo)
- `pipeline/data/embedding_v3.npz` / centroids / `mtnn_report.json` **when used as live promote source**
- `assets/mtnn_embeddings.f32`, `assets/mtnn_meta.json`, `assets/mtnn_arch.json`, `assets/mtnn_map.json`
- Any export that `export_assets.py` / game NN consumes for production

Allowed: writes under `pipeline/data/ablation/`, scratch reports, docs in this file.

### 5b. File conflict radar (this Agent vs Fable 5)

| Hot file | Fable 5 lane? | This Agent lane? |
|----------|---------------|------------------|
| `pipeline/train_mtnn.py` | YES — do not edit here | READ only |
| `pipeline/ablate_v5.py` | YES | READ only |
| `pipeline/mtnn_hp_sweep.py` / apply / export train paths | likely YES | READ only |
| `docs/MTNN_V5_*.md`, `tasks/*`, `assets/nux.*`, HTML chrome | NO | YES |
| Promoted `assets/mtnn_*` | promote-only | **never** during wait |

If monologue shows Fable 5 editing a file this Agent needs: **stop product edit**, note conflict in §0, wait or switch file.

### 5c. Second-brain prompts (when table lands)

1. Paste metrics into §2.
2. Run the auto-check rows → circle §7 outcome.
3. If `SHIP_C` or `FALLBACK_B` → present §3 to operator; **do not promote**.
4. If `KEEP_V4` → execute §4 (docs only).
5. If `NEEDS_OPERATOR` → stop and ask (ambiguous Δ, missing seed, recall dip).

---

## 6. Readiness report shell (operator-facing)

Copy when the wait ends:

```markdown
## Readiness — MTNN v5 gate (DATE)

**§7 outcome:** SHIP_C | FALLBACK_B | KEEP_V4
**Winner recipe:** …
**Key deltas vs A:** purity@20 … · next RMSE … · recall@10 …

### Evidence
- Ablation dir: pipeline/data/ablation/…
- Sweep table: (link or paste §2b)
- 3-seed confirm: (paste)

### Decisions needed from operator
1. Promote now? (yes/no) — default NO
2. Embedding dim 48 vs 64?
3. Full retrain budget before asset export?

### Verify commands (after explicit promote only)
- python pipeline/verify_accuracy.py
- (export / asset smoke as applicable)

### Non-actions (deliberate)
- Did not overwrite promoted v4 during Fable 5 wait
- Did not edit train_mtnn.py from product lane
```

---

## 7. Product fill (independent of sweep)

Already / still safe while GPU runs:

- Site NUX (`assets/nux.js` / `nux.css`) — first-visit modal; skips `/play`
- UI polish / docs that do not touch training or promoted embeddings
- This gate file + monologue reader (`scripts/read_session_monologue.py`)

---

## 8. Changelog

| When | What |
|------|------|
| 2026-07-08 | Shell created during Fable 5 B-family GPU wait (fill-the-wait) |
