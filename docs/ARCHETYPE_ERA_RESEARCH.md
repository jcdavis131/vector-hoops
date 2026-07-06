# Archetype Era Research — Distinctness, Drift, and Model Separability

> **Status:** 2026-07-06 audit · **Data:** 12,392 player-seasons, 1996-97 → 2025-26  
> **Artifacts:** `assets/archetypes_time.json`, `assets/trajectories.json`, `pipeline/data/archetype_era_audit.json`

---

## Executive summary

The game uses **one frozen global vocabulary** (K=8 k-means on era-z 14-d vectors, seeded, named from centroid sigmas). That choice is **correct for UX consistency** — Chimera, wiki dossiers, and the leaderboard all share the same eight labels.

The league **does** change how players are utilized. We already measure this in three layers:

| Layer | What it captures | Artifact |
|-------|------------------|----------|
| **Geometry drift** | How the *axes* of basketball rotate season-to-season | `assets/drift.json` (Procrustes) |
| **Population shift** | How many players land in each global archetype per season | `archetypes_time.json` prevalence |
| **Era-native types** | What clusters emerge if you re-fit K=8 *within* each era window | `archetypes_time.json` eras + lineage |

**Finding:** Global archetypes remain **population-meaningful** (large prevalence swings, MTNN top-1 ~80% every era) but are **not geometrically pure** within any single era (era-native purity mean ~0.62–0.74; min ~0.32). The model must treat archetype as **era-relative playstyle**, not an absolute physical type.

---

## 1. What the eight global archetypes are

Built in `pipeline/build_vectors.py`: k-means K=8 on all era-z game vectors, Lloyd 40 iters, seed 7.

| ID | Name | Role in modern NBA (2021-26 share) |
|----|------|-------------------------------------|
| 0 | Three-Point Accuracy (Low Turnovers) | **21.3%** ↑ — floor-spacing, low-usage snipers |
| 1 | Scoring Volume + Shot Volume | 12.1% ↑ — high-usage scorers |
| 2 | Defensive Glass + Rim Pressure (Fts) | 9.2% ↓ — traditional bigs |
| 3 | Three-Point Volume + Three-Point Accuracy | 18.0% — pull-up / volume shooters |
| 4 | Offensive Glass (Low On-Court Impact) | 12.6% ↑ — energy bigs, limited minutes impact |
| 5 | Rim Protection + Offensive Glass | 9.0% — switchable/rim bigs |
| 6 | Offensive Glass + Defensive Glass | **6.3%** ↓ — classic rebounding big |
| 7 | Playmaking + Steals | 11.7% ↓ — primary ballhandlers |

**Biggest prevalence shift (first 5 vs last 5 seasons):**  
`Three-Point Accuracy (Low Turnovers)` **+9.5 pp** · `Offensive Glass + Defensive Glass` **−7.9 pp**

This matches known league narrative: spacing era, fewer traditional glass eaters, more low-turnover role players.

---

## 2. Era-native clusters — do new types emerge?

`pipeline/archetype_time.py` re-fits K=8 inside five era windows and maps centroids through **Procrustes root frame** to trace lineage.

### 2021-2026 era-native types (top shares)

| Era-native name | Share | Ancestor similarity |
|-----------------|-------|---------------------|
| Three-Point Volume + Free-Throw Touch | 20.5% | 0.926 (continuity) |
| Three-Point Volume + Shot Volume | 14.8% | 0.988 |
| Offensive Glass + Defensive Glass | 12.7% | 0.961 |
| Playmaking + Turnovers | 12.3% | 0.941 |
| **Three-Point Volume + Offensive Glass** | 11.8% | **0.729** (novel) |
| **Steals + On-Court Impact** | 10.2% | **0.843** (shifted) |

**Interpretation:** Most types **evolve continuously** (ancestor sim >0.92). Two 2021+ clusters show **geometric novelty** after Procrustes alignment:

- **Spacing big / stretch five** — high 3PA with offensive glass (pick-and-pop, vertical spacing)
- **Switchable wing** — steals + plus-minus without classic playmaking volume

These are candidates for **League Review blog posts** and future **named era tags** (not new global K=8 labels).

### 2009-2015 anomaly

One era-native cluster (`Three-Point Accuracy + Steals`) maps to ancestor similarity **0.369** — the 3-and-D wing **did not exist as a stable global bucket** in the prior era's geometry. The global label eventually absorbed this population as `Three-Point Accuracy (Low Turnovers)` rose.

---

## 3. Separability metrics (per era)

From `pipeline/archetype_era_audit.py`:

| Era | N | Global silhouette (K=8) | Between/within | Era-native mean purity |
|-----|---|-------------------------|----------------|------------------------|
| 1996-2003 | 2,635 | 0.107 | 0.91 | 0.65 |
| 2003-2009 | 2,402 | 0.114 | 0.96 | 0.61 |
| 2009-2015 | 2,490 | 0.116 | 1.02 | 0.74 |
| 2015-2021 | 2,582 | 0.119 | 0.97 | 0.63 |
| 2021-2026 | 2,283 | 0.111 | 0.95 | 0.62 |

**Read:**

- **Silhouette ~0.11** — playstyles are **continuous**, not well-separated balls in ℝ¹⁴. Expected for basketball; do not chase silhouette >0.3.
- **K sweep (6–12):** silhouette peaks at **K=6** in every era; **K=8 is a deliberate compression** (+2 buckets for 3PT era and playmaking nuance). Document, don't "fix."
- **Era-native purity <0.75** — at least one global label always splits across multiple within-era clusters. **Vocabulary drift is structural**, not a bug.

---

## 4. Career dynamics

From `assets/trajectories.json` (≥4 charted seasons):

| Class | Share | Mean career length | Mean PM z |
|-------|-------|-------------------|-----------|
| stable | 44.4% | 8.0 | +0.03 |
| migrator | 24.1% | 9.0 | −0.09 |
| drifter | 17.3% | 7.8 | −0.08 |
| reinvention | 9.4% | 9.1 | +0.12 |
| late-bloom | 4.7% | 9.6 | +0.08 |

**Era transition rate** (archetype changes per season-pair):  
1990s **0.369** → 2020s **0.397** (careers migrate slightly more now).

**Top reinvention motifs:**

1. `3PT Volume+Accuracy` → `3PT Accuracy (Low TOV)` (22 careers)
2. `Rim Protection+OREB` → `OREB+DREB` (14)
3. `3PT Accuracy (Low TOV)` → `3PT Volume+Accuracy` (11)

---

## 5. Model behavior (MTNN v3)

From `pipeline/data/mtnn_report.json` + audit:

| Metric | Value |
|--------|-------|
| Global archetype top-1 | **80.2%** |
| Cross-era neighbor purity@20 | **61.4%** (gate: ≥63) |
| Per-era archetype top-1 | 78.8% – 81.9% (stable) |

**Gap:** The embedding **classifies** era-z archetypes well but **neighbors across eras** don't always share archetype — exactly what Procrustes drift predicts. Retrieval and archetype heads optimize partially conflicting objectives.

---

## 6. Methodology doctrine (ship / don't ship)

### Keep (game contract)

- **Frozen 14-d** transparent vector
- **Global K=8** labels in `vectors.json` for Chimera, wiki, leaderboard
- **Per-season era-z** normalization (non-negotiable)

### Add (research + models)

1. **Dual taxonomy in artifacts**
   - `c` = global archetype (game)
   - `eraArchetype` = within-era native label (dossier / League Review only)
   - Build: extend `archetype_time.py` to emit per-player era-native assignment

2. **MTNN archetype head v2**
   - Primary: 8-class global (current)
   - Auxiliary: 8-class era-native (masked when era window too small)
   - Input: concatenate **Procrustes-root-aligned** 14-d (`chain[season] @ v`) to archetype tower
   - Loss: `0.25 * CE(era_native) + 0.35 * CE(global)` (reduce global weight as era head matures)

3. **Eval gates** (add to `feature_stress.py` / promotion)

   | Gate | Threshold |
   |------|-----------|
   | `archetype_top1_acc` (global) | ≥ 0.78 all eras |
   | `archetype_era_native_top1` | ≥ 0.72 (new) |
   | `cross_era_archetype_purity@20` | ≥ 0.63 |
   | `min_era_native_purity` | document if <0.40 (vocabulary alert) |

4. **Rebuild SOP** — after every `build_vectors.py`:

   ```bash
   python pipeline/procrustes_drift.py
   python pipeline/archetype_time.py
   python pipeline/career_trajectories.py
   python pipeline/archetype_era_audit.py
   ```

---

## 7. League Review (product) — how this surfaces

The planned **League Review** page should show **both layers**:

```
[Drift timeline] → [Archetype prevalence stacked area] → [Era-native lineage sankey]
                              ↓
              [Player rank by proximity to archetype centroid]
                              ↓
              [Blog: "The spacing big arrives" — 2021+ novelty cluster]
```

Ranking formula (era-honest):

```text
proximity(player, archetype k) = cos(v_player, centroid_k^era)
```

where `centroid_k^era` is the era-native centroid if viewing an era slice, else global centroid.

---

## 8. Open questions

1. **Should Era Twin use era-native or global archetype for matching?** — Today: global + Procrustes chain. Consider era-native for 2015+ only.
2. **K=10 for 2015+ parallel taxonomy?** — Silhouette gain is marginal; prefer era-native layer over more global buckets.
3. **Coach/system tags** — roster_context + team_season could label "five-out" vs "drop" systems; not yet in archetype pipeline.

---

## 9. Commands

```bash
cd vector-hoops
python pipeline/archetype_time.py      # → assets/archetypes_time.json
python pipeline/career_trajectories.py # → assets/trajectories.json
python pipeline/archetype_era_audit.py # → pipeline/data/archetype_era_audit.json
```

See also: `docs/FEATURE_ENGINEERING_SOP.md`, `pipeline/procrustes_drift.py`, `pipeline/mtnn_hill_climb.md`.
