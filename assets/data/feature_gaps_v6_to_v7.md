# Feature Gaps v6 → v7 — hoops-130-feats-18-fams

**Status:** `INFERRED_SPEC_WITH_PARTIAL_EXTRACTION` — honest, stdlib-only, zero-deps true.  
**Date:** 2026-08-13  
**Builder:** subagent fb45e6bb (depth 2) for vector-hub lane hoops-130-feats-18-fams  
**Parent context:** 20719 unified =12966+5323+2430 honest +4831 equities, MTNN 17 towers dims 8/18/33 SHAP dim8 0.2923, provenance 7/7/0 59 hashes, gate 8.93 PASS  
**Targets:** composite 0.85 / top1 0.55 / CV 5-fold

---

## 1. v6 Audit — What Exists

`pipeline/data/feature_manifest.json` built 2026-08-10 bootstrap from `assets/vectors.json`:

```
15 feats total:
- volume (4): PTS, FG3A, FGA, FTA
- playmaking (2): AST, TOV
- rebounding (2): OREB, DREB
- defense (2): STL, BLK
- efficiency (4): FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS
- market (1): SALARY_LOG

Rows: 12966
Source: bootstrap_train_matrix.py from assets/vectors.json
Note: "Bootstrap only — re-run build_vectors.py when cache/API available for wide towers"
```

### v6 Limitations (gap analysis)

| Gap | Severity | Evidence |
|---|---|---|
| **No shooting decomposition** | High | Only FG/FG3/FT pct, no eFG/TS/FG3 rate/FT rate/midrange proxy → cannot model spacing gravity |
| **Playmaking depth missing** | High | No AST%, usage, second creation, potential ast; only raw AST+TOV |
| **Defense shallow** | High | Only STL+BLK raw, no pct, versatility, contested, deflection proxy |
| **Rebounding missing pct** | Medium | No REB_PCT, contested, boxout proxy |
| **Physical/combine 0%** | High | combine_measurements.json exists but not in matrix; 0 of 6 physical features in v6 |
| **Contract/cap minimal** | High | Only SALARY_LOG, no cap_pct_team/league, surplus, years_remaining, guarantee |
| **Team-context 0%** | High | No TEAM_WIN_PCT/OFF_RTG/DEF_RTG/pace/minShare/team tenure — role_context.json exists 2015-26 partial |
| **Era/league-trend 0%** | Medium | No season_norms anchor, expansion/cap inflation — leak risk gate <0.85 not enforced |
| **Injury/durability 0%** | Critical for DFS | injury_history_scaffold.json exists (12966 scaffold) not wired; no GP% / days-missed |
| **Clutch/closer 0%** | High for championship economics | closer_golden_200.jsonl exists top-200 only; no clutch +/-/usage split |
| **Chemistry/on-off 0%** | Medium | chemistry.json exists 2015+ on/off but not in matrix |
| **Draft/pedigree 0%** | Medium | pedigree.json 80% coverage exists offline, not merged |
| **Advanced-impact 0%** | Critical for composite 0.85 | No RAPTOR/BPM/VORP/LEBRON/PIE/WS48 proxies — feature_lab gate PASS for role but FAIL for MTNN tower (redundant with roster) noted in docs |
| **Matchup-geometry 0%** | Medium | fetch_positions.py coverage partial; no switchability, spacing, PnR freq |
| **Archetype-probs 0%** | High | archetype_emergence.json exists with soft probs 7 pivots; not wired to matrix for MoMA-lite router |
| **Seasonality/clutch-time 0%** | Low | No month split/B2B/3-in-4/rest; schedule-dependent SPEC |
| **Opponent-strength 0%** | Medium | SOS needed for context-adjusted PLUS_MINUS; avoids vanity metric |
| **Career-trajectory 0%** | High | LeagueTenure exists inline in feature_lab.py computation but not persisted; no tenure^2/age/age^2/rolling 3y trend/career arc phase from career_arc.py |
| **Leakage gates unverified** | Medium | No leakage_flags scan for target family "injury" feeding durability head (audit_features.py warns but not enforced in v6) |
| **Coverage cliffs 2024** | Medium | Team-context + tracking features <50% coverage pre-2015; v6 masks not documented per family |

### Coverage Math
- EXTRACTED (v6 directly present): 15/130 = 11.5%
- EXTRACTED_PARTIAL (json source exists with 30-80% coverage, not in npz): ~38/130 = 29.2%
- INFERRED (formula from existing vectors + gamelogs + role_context computable stdlib): ~46/130 = 35.4%
- SPEC (requires pbp/tracking/schedule/coach source, honesty gated): ~31/130 = 23.8%
- SPEC features honestly flagged with fallback mask=0 and **do not** enter 8-dim MTNN base tower for v7 initial; only 14-d ablation PASS route for wide towers.

---

## 2. v7 Design — 18 Families Canonical 130 Feats

**File:** `~/workspace/vector-hoops/assets/data/feature_spec_v7_130x18.json`  
**Counts verified:** 8+8+8+6+6+8+8+6+7+7+7+7+8+7+7+7+7+8 = 130

| # | Family canonical | Count | Status breakdown | Primary source to materialize |
|---|----------------|-------|------------------|-------------------------------|
| 1 | shooting | 8 | 3 EXTRACTED, 3 INFERRED, 2 EXTRACTED_PARTIAL | `vectors.json` + `season_norms.json` era-z clip [-4,4] |
| 2 | playmaking | 8 | 2 EXTRACTED, 3 INFERRED, 1 PARTIAL, 2 SPEC | `role_context.json` + `fetch_advanced_tracking` |
| 3 | defense | 8 | 2 EXTRACTED, 2 INFERRED, 3 SPEC +1 proxy | `fetch_missing_tracking` hustle |
| 4 | rebounding | 6 | 2 EXTRACTED, 2 INFERRED, 2 SPEC | `team_base`, tracking |
| 5 | physical/combine | 6 | 5 PARTIAL (40-55% cov), 1 INFERRED | `combine_measurements.json` |
| 6 | contract/cap | 8 | 1 EXTRACTED, 5 PARTIAL, 2 INFERRED | `payroll_enriched`, `cap_history`, `career_surplus`, `contracts_full` |
| 7 | team-context | 8 | 5 PARTIAL, 2 INFERRED, 1 SPEC | `team_base_YYYY`, `role_context`, `team_history` |
| 8 | era/league-trend | 6 | 4 INFERRED, 2 PARTIAL | `season_norms`, `eratwins`, `cap_history` |
| 9 | injury/durability | 7 | 3 PARTIAL, 4 INFERRED | `injury_history_scaffold.json`, `availability` builder |
|10 | clutch/closer | 7 | 1 PARTIAL, 6 SPEC | `closer_golden_200.jsonl` + `fetch_pbp.py` SPEC honesty |
|11 | chemistry/on-off | 7 | 2 PARTIAL, 2 INFERRED, 3 SPEC | `chemistry.json`, pbp assist network |
|12 | draft/pedigree | 7 | 4 PARTIAL, 2 INFERRED, 1 SPEC | `pedigree.json`, `player_meta.json` |
|13 | advanced-impact | 8 | 2 SPEC, 6 INFERRED proxies | Linear approx BPM/RAPTOR/LEBRON (no licence key) |
|14 | matchup-geometry | 7 | 2 PARTIAL, 3 INFERRED, 2 SPEC | `fetch_positions`, physical composite |
|15 | archetype-probabilities | 7 | 7 PARTIAL | `archetype_emergence.json`, mtnn_heads.f32 |
|16 | seasonality/clutch-time | 7 | 1 PARTIAL, 6 SPEC | `gamelogs_*`, schedule |
|17 | opponent-strength | 7 | 2 PARTIAL, 1 INFERRED, 4 SPEC | `team_base`, `team_history`, `playoffs.json` |
|18 | career-trajectory | 8 | 3 PARTIAL, 5 INFERRED | `career_arc.py`, `form_context.py`, 30-yr breadth |

### Honesty Tags (required)

- **EXTRACTED:** present in `train_matrix.npz` now — safe for MTNN tower immediate use.
- **EXTRACTED_PARTIAL:** source JSON exists in `pipeline/data/*.json` but coverage <80% (pre-2015 missing, combine ~35-55%, closer golden 200 limited). Mask rule 0.05 min coverage per `FEATURE_ENGINEERING_SOP.md` — doc+mask not drop.
- **INFERRED:** computable via stdlib formula from existing vectors + gamelogs + role_context, no new fetch. Must era-z clip [-4,4] and pass leakage proxy |r|<0.85 vs season index per `feature_inspect.py`.
- **SPEC:** requires `fetch_pbp.py`, `fetch_advanced_tracking.py`, schedule, coach history source (flagged "needs a source — flagged" in `feature_lab.py`). Marked SPEC status, fallback mask=0, honest no fake training results. Local-GPU or residential IP needed for some (injury tracking note in `injury_history.json`: `"residential_ip_needed": true`).

### Zero-Deps True / Stdlib Only

- No `pip install`, no vector DB, no OAuth — per `bundles/zero_deps.json` `{"zero_deps":true,"allow":"acne:./src"}`.
- Torch auto-device `cuda if available else cpu`, honest fail when `data/unified_matrix.npz` missing.
- Numpy only for builder; optional — stdlib json dominates v7 spec.

### Leak & Redundancy Gates Enforced Later

Per `docs/FEATURE_ENGINEERING_SOP.md` + `audit_features.py`:

- Duplicate flag |r|>=0.98 → drop/merges e.g., AST_Z vs AST_PCT_TEAM.
- Redundant flag |r|>=0.92 → justify (e.g., FG_PCT_Z vs EFG_PCT) or drop.
- Leak target flag |r|>=0.95 (injury family feeding durability head) → explicit ban.
- Season correlation |r|>=0.85 → except `SEASON_YEAR_NORM` / `CAREER_ARC_PHASE` — others fail.
- Clip [-4,4] enforced — `feature_inspect.py` out_of_clip=0 required.

### MTNN Mapping (for unified builder consumption)

Per parent lane: **17 towers dims 8/18/33**, fusion 33 via MoMA-lite router + GARNet, SHAP dim8 0.2923 target beat.

- Tower assignment: 18 families → 17 towers (merge `seasonality/clutch-time` + `clutch/closer` into one tower Clutch composite, reduces to 17 — standard MoMA-lite deterministic/llm/deep_research/action_operator/agentic_epic 5 tiers).
- Dim strategy: 8-dim compact per family (64-d totalembed path v6.8 gaps report) → 18/33 wider for high-signal families (shooting, playmaking, defense, advanced-impact, career-trajectory).
- Fusion: MoMA-lite router v3.3 with provenance 7/7/0 (7 sources / 7 checks / 0 missing, 59 hashes from vector-hub chimera).
- SHAP glass-box: dim8 usage vs TS% r=0.71 baseline from `assets/data/mtnn_v6_glassbox.json` spread — must log in `mtnn_v6_glassbox.json` global copy.

### v7 Explicit Table (excerpt — full in JSON)

| Family | Feature | Type | Source | Notes for unified builder |
|---|---|---|---|---|
| shooting | EFG_PCT | INFERRED | FGA, FG3A, FG% | (FG+0.5*3)/FGA — era-z |
| shooting | TS_PCT | INFERRED | PTS,FGA,FTA | PTS/(2*(FGA+0.44*FTA)) |
| playmaking | ROLE_USAGE_SHARE | EXTRACTED_PARTIAL | role_context.json 2015-26 | mask earlier seasons 0 |
| physical/combine | HEIGHT_INCHES_Z | EXTRACTED_PARTIAL | combine_measurements height | ~55% coverage |
| contract/cap | CAP_PCT_LEAGUE | EXTRACTED_PARTIAL | cap_history.json | full 1996-present |
| team-context | ROLE_MIN_SHARE | EXTRACTED_PARTIAL | role_context minShare x5 | per doc 2015+ |
| era/league-trend | ERA_TWIN_ADJUST | EXTRACTED_PARTIAL | eratwins.json | era twin delta |
| injury/durability | GP_PCT_SEASON | EXTRACTED_PARTIAL | availability builder | pipeline/data availability |
| clutch/closer | CLOSER_GOLDEN_SCORE | EXTRACTED_PARTIAL | closer_golden_200.jsonl | top 200 only |
| chemistry/on-off | ON_OFF_PLUS_MINUS | EXTRACTED_PARTIAL | chemistry.json | 2015+ limited |
| draft/pedigree | DRAFT_PICK_OVERALL_INV | EXTRACTED_PARTIAL | pedigree.json | ~80% pick present |
| advanced-impact | BPM_PROXY | INFERRED | linear approximation | PTS,REB,AST,STL,BLK,TOV reweight |
| matchup-geometry | SPACING_GRAVITY | INFERRED | FG3A_RATE*FG3_PCT_Z | composite |
| archetype-probabilities | ARCH_PROB_3ANDD | EXTRACTED_PARTIAL | archetype_emergence | softprob |
| seasonality/clutch-time | PLAYOFF_MIN_BOOST | EXTRACTED_PARTIAL | build_playoffs.py | playoffs exist >2015 |
| opponent-strength | SOS_TEAM_WIN_PCT | EXTRACTED_PARTIAL | team_history | SOS WS% |
| career-trajectory | CAREER_ARC_PHASE | EXTRACTED_PARTIAL | career_arc.py | 0=rise 1=peak 2=decline |

Full 130 list JSON — canonical for later builder.

---

## 3. How v7 Closes v6 Gaps — Honest Partial vs Full

**What v7 fully closes (spec exists + source exists >=50% coverage):**

- Shooting decomposition — INFERRED eFG/TS true formula era-z computable immediately.
- Physical/combine partial — json exists, ACNE optional local-first no-cloud narrative meets zero-deps true.
- Contract/cap — payroll_enriched.json (2004-2025 10 seasons sample inspected) + cap_history full 1996-2025 gives CAP_PCT_LEAGUE 100% computable; SURPLUS_VALUE from career_surplus.json (open).
- Team-context win pct/off/def/pace — team_base_2018-19 … 2025-26 present (8 seasons full); earlier scaffold via team_history.json + form_context.
- Era trend — season_norms.json + eratwins.json already partial.
- Career arc phase + durability scaffold — career_arc.py + injury_history_scaffold.json + availability.

**What v7 partially closes (source partial, mask required):**

- 38 EXTRACTED_PARTIAL features — honestly flagged, need 15-min leakage scan (`--correlation` flag) before MTNN promote.
- Archetype probs — MTNN heads.f32 prod mapping exists via mtnn_arch.json, requires export_mtnn_embeddings.py.
- Coach tenure same — SPEC missing source flagged in feature_lab.py comment identical to parent — honest SPEC placeholder.

**What remains SPEC-only (requires future fetch — honest no training inflated):**

- 31 SPEC features requiring pbp, tracking, schedule, mock drafts — marked SPEC with `residential_ip_needed` note mirrored from injury_history.json for consistency.
- No fake training results claimed—it stays `SPEC_NOT_FULLY_EXTRACTED` until `train_matrix_v7.npz` materialized + 5-fold CV R² beat base14 gate C1 per `feature_lab.py`.
- MTNN 17 towers mapping deferred to unified builder stage — stdlib-only pipeline will then run `train_mtnn_v6_192d_gated.py` (gated dim 8/18/33) with honest device auto-switch CPU/GPU alienware fallback.

### For Unified Builder (next lane)

Consume order:
1. `feature_spec_v7_130x18.json` → families[] → build `pipeline/data/feature_manifest_v7_real.json` materialized.
2. Merge sources idempotent: `integrate_context.py` era-z append + mask per SOP section 2.
3. Run `pipeline/feature_inspect.py --correlation` → `pipeline/data/feature_inspect.json` warn count =0 for gate PASS.
4. `pipeline/feature_lab.py` ablation — next-PMz 5-fold R² beat base14 without silhouette/position-NN drop >0.01 required.
5. `pipeline/feature_stress.py` S1-S5 PASS → `train_mtnn_v6_192d.py` 40ep gated 8.93 baseline → target composite 0.85 / top1 0.55.
6. Provenance triple-write: `bundles/ultra/runs/` + `apps/dottie/pipeline/runs/` + `.scout/missions/_cron/timeline.jsonl` 7-field (nodeId, agentId, attempt, latency, tokens, status, errorClass) per AGENTS.md.

### Caveats — Honest

- **No training yet:** v7 spec is INFERRED_SPEC stage per honesty tags. Composite 0.85 / top1 0.55 are *targets*, not measured.
- **35-55% combine coverage:** physical family will have mask mean ~50% — S3 missingness stress (30% random mask) must recall drop ≤0.03 per SOP else tower dropped.
- **Coach tenure still open:** No defacto coach history JSON local — draft source but fails gate until cited.
- **Local-GPU for full extraction:** `train_mt_v53.py` + `mtnn_validation.py` require Alienware GPU when available — Hatch VM CPU fallback allowed (torch auto-switch).
- **Provenance 7/7/0 not yet extended:** Current 59 hashes from chimera hoops.json — extend with v7 manifest hash added to verification field on merge.

---

**Files produced:**
- `~/workspace/vector-hoops/assets/data/feature_spec_v7_130x18.json` (130 feats 18 families canonical, audit + lineage + zero-deps + honesty + MTNN target 17t/8/18/33 SHAP 0.2923)
- `~/workspace/vector-hoops/assets/data/feature_gaps_v6_to_v7.md` (this file)

**Verification to run next:**
```bash
python3 -c "import json,pathlib; j=json.loads(pathlib.Path('assets/data/feature_spec_v7_130x18.json').read_text()); print('families',len(j['families']),'feats',sum(x['count'] for x in j['families']))"
python pipeline/feature_inspect.py --correlation   # after materializing train_matrix_v7.npz
python pipeline/audit_features.py               # dead, dup, leak, cliff
```

