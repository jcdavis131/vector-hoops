# MTNN v4 integration plan

Vector Hoops multi-tower net v4: widen `train_matrix.npz` with team,
roster, market, form, career, competition, and Basketball-Reference
context towers, then extend `train_mtnn.py` with new auxiliary heads and
stricter promotion gates vs v3.

**Prerequisite chain:** `build_vectors.py` (or `bootstrap_train_matrix.py`)
→ `integrate_context.py` → `train_mtnn.py --version v4`

---

## 1. Tower families (v4)

v3 (bootstrap today) uses five game-stat families. v2 wide build adds
shotmix, tracking, bio, market, form. v4 **adds or expands** the
following tower groups in `feature_manifest.json` → `family_slices()`:

| Family | Source | Example features (era z-scored + mask) |
|---|---|---|
| **team** | `pipeline/data/context/team_season.jsonl` | `TM_PACE`, `TM_OFF_RTG`, `TM_DEF_RTG`, `TM_NET_RTG`, `TM_SOS`, `TM_W_PCT`, `TM_AST_SHARE` |
| **roster** | `pipeline/data/context/roster_context.jsonl` | `ROSTER_TOP2_VORP`, `ROSTER_DEPTH_MIN`, `ROSTER_POS_BALANCE`, `ROSTER_AGE_MEDIAN`, `ROSTER_USAGE_HHI`, `ROSTER_NEW_PCT` |
| **market** (expanded) | salaries drop-in + bbref contracts | `SALARY_LOG`, `SALARY_CAP_PCT`, `SALARY_RANK_POS`, `CONTRACT_YEARS_REM`, `GUARANTEED_PCT` |
| **form** | `gamelogs_*.jsonl` (existing) | `FORM_VOL`, `FORM_CEIL`, `FORM_DD_RATE`, `FORM_TD_RATE`, `FORM_GP`, `FORM_MIN_AVG` |
| **career** | derived from `train_matrix.npz` history | `CAREER_SEASON_N`, `CAREER_MIN_CUM`, `CAREER_PEAK_DIST`, `CAREER_SLOPE_3Y`, `AGE`, `DRAFT_SLOT` |
| **competition** | schedule + standings join | `COMP_SOS`, `COMP_OPP_NET`, `COMP_PLAYOFF_RACE`, `COMP_B2B_RATE`, `COMP_HOME_PCT` |
| **deep_bbref** | `pipeline/cache/bbref_advanced_*.json` | `WS`, `WS48`, `BPM`, `OBPM`, `DBPM`, `VORP`, `PER`, `USG` (bbref definitions; masked pre-coverage) |

**Retained v2/v3 families** (unchanged tower wiring): volume, playmaking,
rebounding, defense, efficiency, shotmix, tracking, bio.

**Merge rule:** `integrate_context.py` appends new columns to `Z` /
`mask`, updates `manifest["features"]` and `manifest["families"]`, never
mutates the frozen 14-d `game_features` contract.

---

## 2. Multi-task heads and loss weights

v3 composite loss (reference):

```
L = InfoNCE
  + 0.35 * CE(archetype)
  + 0.20 * CE(position)          # masked where position unknown
  + 0.15 * MSE(profile_14d)
  + 0.20 * masked_MSE(salary_log)
```

v4 adds heads tied to the new context towers; weights sum to ~1.0 on
supervised terms (InfoNCE remains unweighted anchor):

| Head | Target | Weight | Notes |
|---|---|---:|---|
| InfoNCE | adjacent-season pairs + dropout views | 1.0 (anchor) | unchanged |
| archetype | k-means cluster id | 0.25 | ↓ from 0.35; more heads share budget |
| position | PG/SG/SF/PF/C | 0.15 | ↓ from 0.20 |
| profile | 14-d game vector | 0.12 | ↓ from 0.15 |
| salary | `SALARY_LOG` z | 0.12 | masked |
| **team_fit** | `TM_NET_RTG` z (player's team that season) | 0.08 | regression; masked if no team join |
| **roster_lift** | `ROSTER_TOP2_VORP` z | 0.08 | regression; Chemistry-mode bridge |
| **form_recon** | 6-d form vector | 0.10 | MSE; only rows with `FORM_GP` mask |
| **career_slope** | `CAREER_SLOPE_3Y` | 0.05 | regression; Career Arc game bridge |
| **competition** | `COMP_SOS` z | 0.05 | regression |
| **bbref_bridge** | `WS48` + `BPM` (2-d) | 0.10 | MSE; masked pre-bbref coverage |

**Optional (phase B):** contrastive teammate pairs from roster graph
(same team, same season) as secondary InfoNCE positives — only after
`chemistry_analysis.py` exports validated pairs.

---

## 3. Promotion gates vs v3

v3 baseline (`mtnn_report.json`, bootstrap 2026-07-05):

| Metric | v3 observed | v3 gate |
|---|---|---|
| `recall_at_10_same_player_next_season` | 0.64 | beat transparent 14-d baseline |
| `archetype_top1_acc` | 0.825 | ≥ 0.55 |
| `position_top1_acc` | 0.638 | (report only) |
| `cross_era_archetype_neighbor_purity_at_20` | 0.649 | (report only) |

**v4 must beat v3 on primary retrieval, not regress on interpretability:**

| Gate | v4 threshold |
|---|---|
| `recall_at_10_same_player_next_season` | ≥ v3 + 0.03 (≥ 0.67 on current bootstrap) |
| `archetype_top1_acc` | ≥ max(0.55, v3 − 0.02) |
| `position_top1_acc` | ≥ v3 − 0.03 |
| `cross_era_archetype_neighbor_purity_at_20` | ≥ v3 − 0.02 |
| `salary_mae_z` (masked) | ≤ v3 + 0.05 (no market regression) |
| `form_recon_mae` | ≤ 0.35 (new; rows with form mask) |
| `bbref_bridge_mae` | ≤ 0.40 (new; rows with bbref mask) |
| Tower ablation | drop each new family; recall drop ≤ 0.01 each |

**Ship rule:** write `embedding_v4.npz` + `mtnn_report.json` with
`"model": "mtnn_v4"`; promote to `assets/` only after all gates pass on
the same `train_matrix.npz` revision. Game contract (`vectors.json` 14-d)
unchanged until operator sign-off.

---

## 4. `train_mtnn.py` changes (bullet list)

- Add `--version {v3,v4}` flag; default `v3` until v4 gates pass.
- Import or duplicate loss-weight table; branch heads/losses on version.
- Extend `MTNN.__init__`: optional extra `nn.Linear` heads for
  `team_fit`, `roster_lift`, `form_recon`, `career_slope`, `competition`,
  `bbref_bridge`.
- `load_bundle()`: tolerate wider `Z`; no change to row keys
  (`player_id`, `season`, `name`, `cluster`).
- `family_slices()`: already dynamic — verify new families sort
  deterministically (`sorted(fam_dims)`).
- Training loop: pull target columns by manifest feature name; apply
  per-head masks from `M` (same pattern as `SALARY_LOG`).
- Evaluation block: compute v4 metrics (`salary_mae_z`, `form_recon_mae`,
  `bbref_bridge_mae`, per-family ablation recall).
- Export `embedding_v4.npz` (parallel to v3 artifact); report
  `"towers"` dict includes all families present in manifest.
- Docstring: point to `integrate_context.py` as v4 matrix prerequisite.
- **Do not** auto-promote; keep `promotion_gate` string in report JSON.

---

## 5. File map

| Path | Role |
|---|---|
| `pipeline/integrate_context.py` | merge context into `train_matrix.npz` |
| `pipeline/data/context/team_season.jsonl` | team-season rows (fetch TBD) |
| `pipeline/data/context/roster_context.jsonl` | player-season roster features |
| `pipeline/data/context/salaries_expanded.csv` | cap %, years remaining |
| `pipeline/mtnn_v4_plan.md` | this document |
| `pipeline/train_mtnn.py` | v4 heads + gates (code change) |
