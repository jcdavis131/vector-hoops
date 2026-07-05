# Vector Hoops — Deep data sources (Phase 3)

> **Status:** Implementation plan (2026-07-05)  
> **Parent:** [`DATA_EXPANSION_WORKFLOW.md`](./DATA_EXPANSION_WORKFLOW.md) Phase 3  
> **Doctrine:** Era-z-scored, mask-honest, source-cited. Deep towers never mix incompatible definitions in UI copy (e.g. BBRef BPM ≠ NBA.com plus/minus).

Phase 3 tracks run **in parallel** until `integrate_context.py` merges them into `train_matrix_v4.npz`. Each track owns its fetcher, cache layout, join key, and Methods limitations text.

---

## Global join conventions

| Key | Format | Used by |
|-----|--------|---------|
| Player name | `norm_name(name)` — accent-strip, lowercase, drop non-alnum, trim suffixes (`jr`, `ii`, …) | BBRef, combine, trades |
| Season | `YYYY-YY` (e.g. `2023-24`) | all tracks |
| Composite key | `(norm_name, season)` or `"norm_name\|season"` | salary merge, bbref advanced |
| Team | `TEAM_ID` (int) from nba_api / game logs | roster, Tier B/C, coach tags |

**Mask rule:** missing or pre-coverage rows get `mask=0` on that feature family; never impute with league averages for training targets.

---

## Rate-limit policy (Basketball-Reference)

BBRef documents a **20 requests/minute** ceiling. Vector Hoops policy:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `DELAY_S` | **3.5** s between requests | ~17 req/min — headroom for retries |
| User-Agent | Desktop browser string | same as `fetch_positions.py` |
| Storage | **Parse-and-discard HTML** | only JSON aggregates in `pipeline/cache/` |
| Resume | Skip seasons already in cache with ≥50 rows | same pattern as positions fetch |
| Retries | Exponential backoff, max 5 attempts, cap 120 s | match `fetch_team_season.py` |
| Operator | Approve scrape before production batch runs | see workflow § Operator actions |

**Compliance:** Use BBRef for research / personal ML only. Do not redistribute raw HTML. Cite [Basketball-Reference](https://www.basketball-reference.com) in `methods.html` when deep_bbref features ship.

**On 429 / block:** stop the batch, log last season, wait ≥15 min, resume from cache.

---

## Per-source implementation specs

Each track below includes: source URL/API, coverage, fetch difficulty, legal/terms, recommended features, mask strategy, MTNN tower family, estimated LOC, and blocked-by dependencies.

### Track A — BBRef advanced stats

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/fetch_bbref_advanced.py` |
| **Source URL** | `https://www.basketball-reference.com/leagues/NBA_{end_year}_advanced.html` (season `2023-24` → `NBA_2024_advanced.html`) |
| **API** | None — HTML table scrape (`data-stat` columns) |
| **Coverage** | NBA 1973–74 → present for PER/WS; BPM/VORP reliable ~1979–80+; ~450–550 player-season rows/year |
| **Fetch difficulty** | **Medium** — one GET/season, stable table schema; same rate-limit discipline as positions |
| **Legal / terms** | BBRef ToS: personal/research use; no bulk redistribution; cite source; respect 20 req/min |
| **Recommended features** | `BBREF_PER`, `BBREF_WS`, `BBREF_WS48`, `BBREF_BPM`, `BBREF_OBPM`, `BBREF_DBPM`, `BBREF_VORP`, `BBREF_USG` |
| **Mask strategy** | Family mask=0 if row missing; **mask entire family pre-1979**; era-z within season after join |
| **MTNN tower family** | `deep_bbref` — auxiliary head `bbref_bridge` targets `WS48` + `BPM` (see `mtnn_v4_plan.md`) |
| **Estimated LOC** | ~180 (stub + parse + main loop + tests) |
| **Blocked-by** | Operator BBRef scrape approval; `build_vectors.norm_name` parity; optional: P0 vectors.json season list |

**Cache layout:**

```
pipeline/cache/bbref_advanced_{season}.json   # {norm_name: {per, ws, ...}, ...}
pipeline/data/bbref_advanced.json             # merged manifest (integrate_context)
```

**UI / Methods honesty:** Label **"Basketball-Reference advanced box metrics"**. Never equate `BBREF_BPM` with NBA.com `PLUS_MINUS` or tracking RAPM.

---

### Track B — Draft combine

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/fetch_combine.py` |
| **Source URL** | `https://www.nba.com/stats/draft/combine-anthro` (web); `nba_api.stats.endpoints.draftcombinestats` / `draftcombineplayeranthro` |
| **API** | `nba_api` (preferred); fallback manual CSV drop-in `pipeline/cache/combine_manual.csv` |
| **Coverage** | ~60–120 invitees/year since ~2000; sparse pre-2000; international players often missing |
| **Fetch difficulty** | **Low–Medium** — API stable for recent years; historical gaps need manual backfill |
| **Legal / terms** | NBA.com stats ToS; no commercial redistribution; attribute NBA.com in Methods |
| **Recommended features** | `COMBINE_WINGSPAN_Z`, `COMBINE_STANDING_REACH_Z`, `COMBINE_LANE_AGILITY_Z`, `COMBINE_VERT_MAX_Z`, `COMBINE_WEIGHT_Z` |
| **Mask strategy** | Full `combine` family mask for undrafted / no combine row; optional forward-fill from draft year with decay mask (0.5) for years 2–4 |
| **MTNN tower family** | `combine` |
| **Estimated LOC** | ~220 (API wrapper + CSV ingest + join + manifest) |
| **Blocked-by** | `norm_name` + draft-year join table from `build_vectors` bio; VH-101 not required |

---

### Track C — Coach / system tags

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/derive_system_tags.py` |
| **Source URL** | N/A — **derived** from `team_advanced_*`, player shotmix in wide matrix, or `team_season.json` |
| **API** | Internal only (`pipeline/cache/team_advanced_{season}.json`, `train_matrix.npz` shotmix columns) |
| **Coverage** | 100% of team-seasons present in team fetch; player inherits tag via TEAM_ID join |
| **Fetch difficulty** | **Low** — no external HTTP; k-means + label map |
| **Legal / terms** | No third-party scrape; derived metrics only |
| **Recommended features** | `SYSTEM_PACE_SPACE`, `SYSTEM_MOREYBALL`, `SYSTEM_GRIND`, `SYSTEM_POST_HEAVY`, `SYSTEM_TRANSITION`, `SYSTEM_BALANCED` (one-hot or 8-d embedding) |
| **Mask strategy** | Mask if player TEAM_ID missing or team cluster undefined; no imputation |
| **MTNN tower family** | `system` |
| **Estimated LOC** | ~250 (cluster fit + export + integrate hooks) |
| **Blocked-by** | `fetch_team_season.py` (0.4) + wide shotmix from `build_vectors` Phase 0.2 |

**Method:** K-means (k≈6–8) on era-z team vectors per season → human labels on centroids. Tags describe **team offensive environment**, not coaching quality.

---

### Track D — Injury proxy

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/fetch_injury_proxy.py` |
| **Source URL (Tier 1)** | VH-101 `pipeline/cache/gamelogs_*.jsonl` (derived) |
| **Source URL (Tier 2)** | `https://official.nba.com/nba-injury-report-20XX-XX-XX/` (daily HTML/PDF) |
| **API** | None Tier 1; Tier 2 unstructured HTML/PDF parse |
| **Coverage** | Tier 1: all seasons with game logs; Tier 2: 2017–18+ official reports only |
| **Fetch difficulty** | **Low (Tier 1)** / **High (Tier 2)** — PDF layout changes; not required for v4 ship |
| **Legal / terms** | Tier 1: internal derivation; Tier 2: NBA official content — research use; no diagnosis claims in UI |
| **Recommended features** | `INJURY_GP_MISS_EST`, `INJURY_MIN_TREND`, `INJURY_GP_CLIFF`; Tier 2: `INJURY_REPORT_DAYS`, `INJURY_IL_FLAG` (gated) |
| **Mask strategy** | Tier 1 always on when GP known; Tier 2 family mask unless Operator enables; never label specific injuries in game copy |
| **MTNN tower family** | `injury` |
| **Estimated LOC** | ~120 Tier 1 / +350 Tier 2 |
| **Blocked-by** | Tier 1: VH-101 game logs; Tier 2: Operator sign-off (workflow § Operator actions) |

---

### Track E — Acquisition metadata (trades / FA)

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/fetch_acquisition_meta.py` |
| **Source URL** | (1) VH-101 mid-season TEAM_ID changes; (2) `https://www.basketball-reference.com/players/{l}/{id}.html` transaction log; (3) RealGM manual export |
| **API** | None stable; RealGM has no public API |
| **Coverage** | Tier 1 derived: ~100% for players with logs; BBRef transactions: ~1980s+ with gaps; deadline tag needs calendar rules |
| **Fetch difficulty** | **Low (Tier 1)** / **Medium (BBRef per-player)** — player pages are N× rate limit |
| **Legal / terms** | BBRef same as Track A; RealGM manual CSV only with attribution |
| **Recommended features** | `ACQ_DRAFTED`, `ACQ_TRADED`, `ACQ_FA`, `ACQ_MIDSEASON_MOVE`, `ACQ_DEADLINE` (binary flags + confidence tier) |
| **Mask strategy** | Unknown acquisition → mask categorical head; Tier 1 flags always computable from logs |
| **MTNN tower family** | `acquisition` |
| **Estimated LOC** | ~200 Tier 1 / +400 with BBRef backfill |
| **Blocked-by** | VH-101 for Tier 1; draft-year from bio; Deadline game narrative upgrade optional |

---

### Track F — Tier B (shared-game stints)

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/tier_b_stint_parser.py` |
| **Source URL** | VH-101 `gamelogs_*.jsonl` — same `GAME_ID` + `TEAM_ID` |
| **API** | Internal aggregation |
| **Coverage** | All player pairs on same team with ≥1 shared game; scales with log backfill |
| **Fetch difficulty** | **Medium** — O(team roster² × games) per season; streaming JSONL preferred |
| **Legal / terms** | Derived from licensed/internal log pipeline only |
| **Recommended features** | Edge `SHARED_GAMES`, `weight = SHARED_GAMES / min(gp_a, gp_b)`; node summary `REL_TOP_MATE_SHARED`, `REL_MATE_COUNT` |
| **Mask strategy** | Relational features masked if `<5` shared games; graph edges still exported with low weight |
| **MTNN tower family** | `relational` (+ Chemistry graph export) |
| **Estimated LOC** | ~280 |
| **Blocked-by** | VH-101 game logs (≥1 full season); `norm_name` / player_id map |

**Methods (required):** *"Teammate edges count shared games, not lineup minutes or on/off impact."*

---

### Track G — Tier C (lineup on/off)

| Field | Detail |
|-------|--------|
| **Fetcher** | `pipeline/tier_c_lineup_onoff.py` |
| **Source URL** | stats.nba.com PBP (`playbyplayv2`); or `pbpstats` cache; Second Spectrum not in scope |
| **API** | `nba_api` PBP endpoints; `pbpstats` Python package (evaluate) |
| **Coverage** | 1996–97+ PBP reliably; stint-level co-minutes sparse for partial seasons |
| **Fetch difficulty** | **Very high** — ~1.2k games × heavy payloads; offline batch only |
| **Legal / terms** | NBA.com ToS; large cache gitignored; no live game surfaces |
| **Recommended features** | `LINEUP_NET_RTG_2MAN` (top-50 pairs/team-season), `LINEUP_MIN_2MAN`, `LINEUP_LEVERAGE` |
| **Mask strategy** | Mask if `<200` co-minutes or `<20` possessions; **gated** — no `assets/` until Operator sign-off |
| **MTNN tower family** | `relational` (Tier C override weights when present) |
| **Estimated LOC** | ~600+ (spike + batch + pair index) |
| **Blocked-by** | VH-114 gate; disk for PBP cache; Methods limitations text; `verify_accuracy.py` V5 coverage |

**Gate checklist:** see [Cross-cutting integration checklist](#cross-cutting-integration-checklist) § Tier C.

---

## ROI-sorted build order

Sorted by **impact ÷ effort** for MTNN v4 retrieval + game honesty. Ship top rows before Tier C.

| Rank | Track | ROI rationale | Effort | Depends on | Target week |
|------|-------|---------------|--------|------------|-------------|
| 1 | **F — Tier B stints** | Unblocks Chemistry graph + relational tower; logs-only | M | VH-101 | W3 |
| 2 | **D — Injury Tier 1** | Cheap context; improves Fall/injury narratives | S | VH-101 | W3 |
| 3 | **A — BBRef advanced** | Strong `deep_bbref` + `bbref_bridge` head; 1 req/season | M | Operator OK | W3–4 |
| 4 | **C — System tags** | Team environment without scrape | S | team_season + shotmix | W4 |
| 5 | **E — Acquisition Tier 1** | Deadline game upgrade from logs | S | VH-101 | W4 |
| 6 | **B — Combine** | High signal but sparse; masked tower | M | bio/draft join | W4–5 |
| 7 | **E — BBRef transactions** | Fills acquisition gaps | M | Track A policy | W5 |
| 8 | **D — Injury Tier 2** | Optional precision; legal/UI gate | L | Operator | W6+ |
| 9 | **G — Tier C on/off** | Highest fidelity; gated, heavy | XL | VH-114 + disk | W6+ |

**S** = small (~≤150 LOC), **M** = medium (~150–300), **L** = large (~300–500), **XL** = 500+.

---

## Cross-cutting integration checklist

Use before merging any Phase 3 cache into `train_matrix_v4.npz` or promoting embeddings.

### Join & schema

- [ ] All fetchers use shared `norm_name()` (match `fetch_bbref_advanced.py` / `build_vectors.py`)
- [ ] Season string format `YYYY-YY` consistent across caches
- [ ] Left-join on `(norm_name, season)` or `(player_id, season)` documented per track
- [ ] No duplicate `(name, season)` rows after merge (`integrate_context.py` assert)
- [ ] `feature_manifest_v4.json` lists every new column with `family` and `source`

### Masking & stats

- [ ] Era-z within season; clip ±4σ before NPZ write
- [ ] Per-family mask column in `M` matches manifest feature indices
- [ ] Pre-coverage eras masked (BBRef pre-1979, combine pre-2000, etc.)
- [ ] Sparse families (combine, Tier C) report coverage % in manifest metadata

### MTNN v4

- [ ] New families appear in `family_slices()` deterministically (`sorted`)
- [ ] Auxiliary heads wired only for families with ≥5% masked train rows (or documented exception)
- [ ] Ablation: drop each new family; recall@10 drop ≤ 0.01 each
- [ ] `bbref_bridge_mae` ≤ 0.40 on masked rows (when Track A shipped)

### Methods & compliance

- [ ] `methods.html` lists each external source with limitation sentence
- [ ] BBRef BPM ≠ NBA PM disclaimer present before `deep_bbref` in UI
- [ ] Tier B "shared games" disclaimer on Chemistry surfaces
- [ ] Tier C **not** in `assets/` until Operator sign-off + gate checklist complete
- [ ] Raw HTML / PBP stays gitignored; only aggregates committed

### Ops

- [ ] `DELAY_S=3.5` on all BBRef batch jobs
- [ ] Resume-from-cache verified on interrupted run
- [ ] `verify_accuracy.py` V5 reports per-track join coverage %
- [ ] Fleet queue IDs updated: VH-112 (A), VH-113 (F), VH-114 (G)

### Tier C gate (VH-114 only)

- [ ] Limitations paragraph drafted in `methods.html`
- [ ] Coverage report on holdout seasons
- [ ] A/B Tier B vs Tier C neighbor purity on Chemistry holdout
- [ ] Operator approval recorded

---

## Integration map

```
fetch_bbref_advanced.py  →  pipeline/cache/bbref_advanced_*.json
fetch_combine.py         →  pipeline/cache/combine_*.json
derive_system_tags.py    →  pipeline/data/context/system_tags.jsonl
fetch_injury_proxy.py    →  pipeline/data/context/injury_proxy.jsonl
fetch_acquisition_meta.py→  pipeline/data/context/acquisition.jsonl
tier_b_stint_parser.py   →  pipeline/data/chemistry_graph.jsonl
tier_c_lineup_onoff.py   →  pipeline/data/lineup_pairs.jsonl  (gated)

integrate_context.py     →  train_matrix_v4.npz + feature_manifest_v4.json
```

See [`mtnn_v4_plan.md`](../pipeline/mtnn_v4_plan.md) for tower families and `bbref_bridge` head.

---

## Fleet queue IDs

| ID | Track |
|----|-------|
| VH-112 | BBRef advanced (`deep_bbref`) |
| VH-113 | Tier B shared-game stints |
| VH-114 | Tier C lineup on/off (gated) |

---

## Next implementation steps

1. **A.2** — Implement `fetch_bbref_advanced.parse_season_html()` + `fetch_season()` (stub shipped)  
2. **F.1** — Tier B edge builder on one season of `gamelogs_*.jsonl`  
3. **D.1** — Injury Tier 1 from existing logs  
4. **B.1** — Spike `nba_api` combine for one draft year  
5. **G.1** — Tier C source evaluation PR before first PBP pull  
6. Wire optional paths in `integrate_context.py` once caches exist
