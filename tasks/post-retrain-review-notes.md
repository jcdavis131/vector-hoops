# Post-retrain review notes — 2026-07-09

**Reviewer:** Auto mode (product lane)  
**Trigger:** User `GO` on `tasks/todo.md`  
**Fable 5 status:** Still running (train_matrix rebuild + HP sweep per terminal 51 monologue)

---

## Executive summary

Reviewed **current promoted v4 assets** on production. All automated gates pass; `/trends` and `/model` load and function. **Full post-retrain pass is blocked** until Fable 5 finishes and operator approves promote — no new `mtnn_report.json` / ablation table yet.

---

## Phase 0 — Orient ✅

| Item | Result |
|------|--------|
| Monologue | HP sweep in flight; salary backfill done |
| `mtnn_report.json` | recall@10 **1.0**, purity@20 **0.796**, arch_top1 **0.957** (current promoted) |
| `assets/manifest.json` | built 2026-07-08 16:18 UTC |
| Row alignment | vectors 12966 = archetypes_time n_players = mtnn_map rows |
| `train_mtnn.py` | No product-lane edits |

---

## Phase 1 — Promote gate ⏸ BLOCKED

- HP sweep ranking not yet in `docs/MTNN_V5_PROMOTE_GATE.md` §2
- §7 outcome: **PENDING** (await Fable 5)
- Operator promote: **not requested** for new checkpoint
- **Action when unblocked:** paste §2 table → circle SHIP_B/C or KEEP_V4 → explicit promote yes

---

## Phase 2 — Pipeline ⏸ PARTIAL

| Gate | Status |
|------|--------|
| `verify_accuracy.py` | **PASS** (all V1–V12) |
| `test_mtnn_export.py` | **PASS** (12966×48, purity 0.796) |
| Row alignment | **PASS** |
| `retrain_universe.py` | **NOT RUN** — wait for Fable 5 |
| `export_assets.py` refresh | **NOT RUN** — wait for promote |

---

## Phase 3 — Trends `/trends` ✅ (current assets)

Browser + data checks on https://hoops.jcamd.com/trends:

- [x] Page 200; all four JSON assets 200
- [x] Story viz loaded: 5 biggest shifts, chips, slider at 2025-26
- [x] Stat narrative cards populated
- [x] Drift timeline + era legend (5 eras)
- [x] Archetype stream legend (8 types)
- [x] Court map: **By era** default; era tabs 1996–2026 visible
- [x] Caption: `2021-2026 vs prior era (2015-2021). Green = more than before.`
- [x] Baseline line: `Compared with 2015-2021 (prior era)`
- [x] Emergence verdict + claims rendered
- [x] Human-readable copy (30-year change, How we built this)

**Not re-tested after retrain:** zone σ values per era (visual canvas only); chart dot → story sync click.

---

## Phase 4 — Network `/model` ✅ (current assets)

Browser checks on https://hoops.jcamd.com/model:

- [x] Page 200; mtnn_heads.f32 200
- [x] Default player loads; nearby players list with match %
- [x] Career time scrubber present (slider value 15)
- [x] **Tim Duncan search: 19 seasons** (1997-98 → 2015-16) in dropdown
- [x] Step caption human-readable
- [x] Output panel labels: Archetype guess, Skill grades, Next-season forecast
- [x] Compare mode toggle present

**Minor:** Trace status copy on live site says “Hover a node to preview…” (deployed JS may differ from latest local `model.html`).

**Not re-tested:** Play flow animation end-to-end; node inspector click paths; skill grade cap < 100.

---

## Phase 5 — Cross-page ✅

- [x] Nav links Trends + Network work
- [x] Era windows consistent (five eras across drift + court tabs)
- [x] Archetype names align across trends legend and network (8 global types)

---

## Phase 6 — Deploy

- [x] hoops.jcamd.com/trends → 200
- [x] hoops.jcamd.com/model → 200
- [ ] **No new deploy** this session (no asset changes)

---

## Risks / follow-ups when retrain lands

1. **Leak-free metrics** may drop recall@10 below 1.0 — update `model.html` foot copy; do not restore old headline numbers.
2. If **v5/B promotes:** re-run `export_mtnn_viz.py`, verify `mtnn_arch.json` tower/fusion fields match `STEPS` captions.
3. If **embedding dim ≠ 48:** grep consumers before export.
4. Re-run **full** `tasks/todo.md` Phase 2–7 after promote.
5. **The stale-attribution guard was dead (found + fixed 2026-07-09).** V13
   compared `mtnn_jacobian.json`'s checkpoint stamp against `mtnn_arch.json`'s
   — but the shipped `mtnn_arch.json` has no such key, so the check was skipped
   silently and the harness stayed green. **This was aimed squarely at the
   promote about to happen:** any winner keeping `d_emb = 48` (`hb64_d48`,
   `hb128_d48`, `fh384_d48`, `a_v4_ctrl`) changes no shape V13 was watching, so
   a forgotten `export_mtnn_jacobian.py` would have shipped the *old* net's
   causal edges under the *new* net's predictions. V13/V13b now anchor on
   `pipeline/data/mtnn_best.pt`. **At promote: re-run `export_mtnn_viz.py` too**,
   so the client-side arch stamp exists and the guard is live in the browser.
6. **Attribution assets must be re-exported at promote** alongside the Jacobian:
   `python pipeline/export_mtnn_jacobian.py --granularity both`. `verify_accuracy.py`
   now fails closed if you forget.

---

## Verify commands (current baseline)

```powershell
cd c:\Users\jcdav\vector-hoops
python pipeline/verify_accuracy.py
python pipeline/test_mtnn_export.py
python scripts/read_session_monologue.py --format context
```
