# Archetype Era Research — Distinctness, Drift, and Model Separability

> **Status:** numbers regenerated from artifacts 2026-08-03 · **Data:** 12,966 player-seasons, 1996-97 → 2025-26  
> **Gated:** `python scripts/check_doc_numbers.py --check` verifies every figure below against `assets/`. It found 22 drifted figures on 2026-08-03, including all eight archetype NAMES — the doc was describing a different model.  
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

| ID | Name | 2021-26 share | first-5-season share | Δ pp |
|----|------|---------------|----------------------|------|
| 7 | Perimeter Shooting + Free-Throw Shooting + Ball Pressure | **25.2%** | 0.0% | **+25.2** |
| 4 | Perimeter Shooting + Ball Pressure | 18.1% | 10.6% | +7.5 |
| 1 | Offensive Glass + Rim Protection + Scoring Efficiency | 17.0% | 0.8% | +16.2 |
| 3 | Scoring Volume + Free-Throw Shooting | 15.7% | 5.6% | +10.1 |
| 5 | Perimeter Shooting + Free-Throw Shooting | 10.3% | 12.4% | −2.1 |
| 2 | Playmaking + Ball Pressure | 10.1% | 20.8% | −10.6 |
| 6 | Defensive Glass + Rim Protection | 3.6% | 21.9% | **−18.4** |
| 0 | Offensive Glass + Rim Protection | 0.0% | 27.9% | **−27.9** |

Shares are the mean over the first five and last five seasons. Cluster 0 going to 0.0%
and cluster 7 from 0.0% to 25.2% is a real re-partition of the space, not a rename: the
K=8 fit is global over era-z vectors, so a centroid can empty out as the league moves.

**Biggest prevalence shift:** `Perimeter Shooting + FT + Ball Pressure` **+25.2 pp**,
`Offensive Glass + Rim Protection` **−27.9 pp** — spacing era in, glass-eating bigs out.


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
| stable | 58.9% | 7.1 | −0.089 |
| reinvention | 21.6% | 10.5 | +0.111 |
| migrator | 8.3% | 11.8 | +0.180 |
| drifter | 6.6% | 8.4 | −0.003 |
| late-bloom | 4.7% | 9.3 | +0.073 |

1,308 careers with ≥4 charted seasons.

**Era transition rate** (archetype changes per season-pair, by career-midpoint decade):
1990s **0.141** · 2000s **0.147** · 2010s **0.178** · 2020s **0.162**

**It peaks in the 2010s and falls back in the 2020s.** The earlier version of this file
read "1990s 0.369 → 2020s 0.397, careers migrate slightly more now", which was wrong in
magnitude AND in shape — it asserted a monotone rise that the artifact does not show.
Note also that no null model has been fitted to these rates: transition rate rises
mechanically when a season's prevalence is more evenly spread, so the 2010s peak is not
yet established as career behaviour rather than assignment volatility.

**Top reinvention motifs:**

1. `Perimeter Shooting + Ball Pressure` → `Perimeter Shooting + Free-Throw Shooting` (103 careers)
2. `Defensive Glass + Rim Protection` → `Offensive Glass + Rim Protection + Scoring Efficiency` (52)
3. `Offensive Glass + Rim Protection` → `Perimeter Shooting + Free-Throw Shooting` (26)

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
