# Post-retrain review — detailed todo

> Work top-to-bottom. Mark `in_progress` on exactly one item.  
> **Status (2026-07-09 GO run):** Phase 0 ✅ · Phase 1–2 ⏸ Fable 5 in flight · Phase 3–5 ✅ on **current v4** · Phase 6–7 pending new assets  
> **Notes:** `tasks/post-retrain-review-notes.md`

---

## Phase 0 — Orient (can start now)

- [ ] **0.1** Read monologue: `python scripts/read_session_monologue.py --format context`
- [ ] **0.2** Snapshot current promoted metrics from `pipeline/data/mtnn_report.json` (if present)
- [ ] **0.3** Snapshot `assets/manifest.json` built timestamps + row counts
- [ ] **0.4** Confirm git conflict radar: no local edits to `pipeline/train_mtnn.py` on product lane
- [ ] **0.5** Paste HP sweep ranking into `docs/MTNN_V5_PROMOTE_GATE.md` §2 when Fable 5 reports

---

## Phase 1 — Promote gate (operator decision)

- [ ] **1.1** Fill §2a A/B/C table with leak-free held-out metrics
- [ ] **1.2** Run auto-check rows → circle outcome: `SHIP_C` / `FALLBACK_B` / `KEEP_V4`
- [ ] **1.3** If B/C: confirm 3-seed stability table (seeds 7, 13, 21)
- [ ] **1.4** Get explicit operator "promote yes" before overwriting `assets/mtnn_*`
- [ ] **1.5** Record winner recipe (flags, fusion type, d_emb) in promote gate doc

---

## Phase 2 — Pipeline refresh (after promote yes)

- [ ] **2.1** Run `python pipeline/retrain_universe.py` OR `--skip-build` if vectors fresh
- [ ] **2.2** Confirm `rebuild_drift_suite.py` completes; local `verify_drift_assets` prints ok
- [ ] **2.3** Run `python pipeline/export_assets.py`
- [ ] **2.4** Run `python pipeline/export_mtnn_viz.py` (if not pulled in by export_assets)
      — **required**, it re-stamps `mtnn_arch.json` with the checkpoint the client guard compares against
- [ ] **2.4b** Run `python pipeline/export_mtnn_jacobian.py --granularity both`
      — refreshes tower Jacobian *and* feature attribution; `verify_accuracy.py` fails closed if skipped
- [ ] **2.5** Run `python pipeline/test_mtnn_export.py` — all PASS
- [ ] **2.6** Run `python pipeline/verify_accuracy.py` — no FAIL lines
- [ ] **2.7** Diff check: `archetypes_time.json` `n_players` == `vectors.json` row count
- [ ] **2.8** Diff check: `mtnn_map.json` row count matches `vectors.json`

---

## Phase 3 — Trends page (`/trends`)

### 3A — Data load & integrity

- [ ] **3.1** Page loads 200; no console errors on `drift.json`, `archetypes_time.json`, `archetype_emergence.json`, `trajectories.json`
- [ ] **3.2** Method quote (`#drift-method-quote`) populated from new `drift.json`
- [ ] **3.3** Season slider spans full pair range; label matches selected `pair.to`
- [ ] **3.4** Biggest-shifts table rows match `drift.json` `biggestShifts` (5 rows)

### 3B — Story viz (`trends-viz.js`)

- [ ] **3.5** Rotation gauge verdict word matches rotation magnitude
- [ ] **3.6** Compass: grey background dots for non-selected seasons; orange active dot only
- [ ] **3.7** Shift bars: top stats align with `pair.mostRotated` / `statInsights`
- [ ] **3.8** Stat narrative cards render; no empty wall when insights exist
- [ ] **3.9** Story chips jump to annotated seasons (lockout, hand-check, COVID, etc.)

### 3C — Drift timeline (`drift.js`)

- [ ] **3.10** Era bands align with five `ARCHETYPE_ERAS` windows
- [ ] **3.11** Orange rank rings on top-5 rotation pairs
- [ ] **3.12** Clicking chart dots updates story viz (if wired via `VHTrendsViz.setPair`)

### 3D — Archetypes section

- [ ] **3.13** Stream chart legend matches `globalArchetypes` names (8 types)
- [ ] **3.14** Long-run shift bars: sensible early vs late deltas
- [ ] **3.15** Era compact panels: top 4 types per era with plausible shares

### 3E — Court zone map (high priority)

- [ ] **3.16** Default mode: **By era** active on load
- [ ] **3.17** Era tabs visible; switching era redraws canvas
- [ ] **3.18** Baseline rule: era 2–5 vs prior; era 1 vs today (2021–2026)
- [ ] **3.19** Caption reads human (no silhouette/K jargon)
- [ ] **3.20** Zone list σ values change per era; not all zeros
- [ ] **3.21** Mode buttons: 30-year change / early / recent years still work
- [ ] **3.22** Role tags + baseline line in side panel

### 3F — Emergence & careers

- [ ] **3.23** Verdict badge + headline match `hypothesis` object
- [ ] **3.24** Claims pills: supported count matches `supportedClaims/totalClaims`
- [ ] **3.25** Novel badges only for eras with `novelArchetypes` above floor
- [ ] **3.26** Career path gallery: one example per class with colored blocks
- [ ] **3.27** Transition-rate chart decades match `eraTransitionRates`

### 3G — Copy pass (post-retrain)

- [ ] **3.28** Re-read footers; update metrics if archetype method string changed in JSON `method` field
- [ ] **3.29** Confirm no regression to jargon in `drift.js` captions after asset refresh

---

## Phase 4 — Network page (`/model`)

### 4A — Load & architecture truth

- [ ] **4.1** Page loads 200; fetches `mtnn_arch.json`, `mtnn_map.json`, `mtnn_heads.f32`, `mtnn_inputs.f32`, `vectors.json`
- [ ] **4.2** `mtnn_arch.json` tower family count matches diagram input nodes
- [ ] **4.3** If v5 promotes: update `STEPS` captions + `model.html` hero if fusion/tower depth changed
- [ ] **4.4** Footer checkpoint line matches `mtnn_report.json` (or simplify if metrics volatile)

### 4B — Player search & career

- [ ] **4.5** Search returns 40 hits max; exact name match ranks first
- [ ] **4.6** Tim Duncan: all 19 seasons appear in suggest list
- [ ] **4.7** Time scrubber appears for multi-season players; scrubs update map + flow
- [ ] **4.8** Player tag shows `name · season`

### 4C — Embedding map

- [ ] **4.9** PCA axes have readable labels (not generic PC1/2/3)
- [ ] **4.10** Active player orange pulse; orbit/zoom work
- [ ] **4.11** Neighbor lines draw to closest embedding matches
- [ ] **4.12** Nearby players panel: plausible names + similarity %
- [ ] **4.13** Compare mode: second player line + compare summary deltas

### 4D — Data flow diagram

- [ ] **4.14** Play flow animates without layout break at Embed & Heads
- [ ] **4.15** Step nav (Input → Towers → Fusion → Embed → Heads) syncs caption
- [ ] **4.16** Story lane: what went in / lit up / came out matches selected player
- [ ] **4.17** Signal check meters populate (not stuck on loading)
- [ ] **4.18** Click input node → tower highlight path
- [ ] **4.19** Click tower → fusion path
- [ ] **4.20** Click head / output row → embed→head highlight
- [ ] **4.21** Node inspector shows values; regression outputs show intervals where applicable

### 4E — Output panels

- [ ] **4.22** Archetype guess: all 8 classes listed, ranked; top highlighted
- [ ] **4.23** Skill grades: 0–99.99 range, decimals, never 100
- [ ] **4.24** Next-season forecast panel populated (`network-next-out`)
- [ ] **4.25** Clicking output row selects node in inspector + flow highlight

### 4F — Optional Jacobian layer

- [ ] **4.26** If `mtnn_jacobian.json` exported: trace status mentions causal attribution
- [ ] **4.27** If absent: no console 404 spam; graceful fallback

---

## Phase 5 — Cross-page consistency

- [ ] **5.1** Archetype color palette index `i` names same type on trends stream + network arch panel
- [ ] **5.2** Era windows in drift chart match court era tabs (1996–2003 … 2021–2026)
- [ ] **5.3** Site nav links `/trends` and `/model` resolve (vercel rewrites)
- [ ] **5.4** NUX tour does not break on research pages

---

## Phase 6 — Deploy & verify

- [ ] **6.1** `vercel --prod --yes` completes Ready (not stuck Initializing)
- [ ] **6.2** `https://hoops.jcamd.com/trends` → 200
- [ ] **6.3** `https://hoops.jcamd.com/model` → 200
- [ ] **6.4** Live HTML contains latest copy (spot-check court mode buttons, model footer)
- [ ] **6.5** Browser smoke: one season on trends, one player on model, one compare pair
- [ ] **6.6** Write readiness report in chat or `tasks/post-retrain-review-notes.md`

---

## Phase 7 — Close out

- [ ] **7.1** Update `docs/MTNN_V5_PROMOTE_GATE.md` §3c post-promote smoke checkboxes
- [ ] **7.2** `docs/HANDOFF.md` one-liner: retrain outcome + deploy URL
- [ ] **7.3** Mark this todo file complete; note any deferred items with reason

---

## Quick commands (copy block)

```powershell
cd c:\Users\jcdav\vector-hoops
python scripts/read_session_monologue.py --format context
python pipeline/verify_accuracy.py
python pipeline/test_mtnn_export.py
vercel --prod --yes
```
