# Lane 6 — Integration Map: How a Promoted Matryoshka v6 Powers Vector Hoops

Status: DRAFT ONLY. No training. No production switch. No code change.
Champion stays pinned until a held-out win plus the user's separate word.

## 0. Read this first

### 0.1 A model promotion is NOT a product promotion

A model can beat the champion on held-out metrics and still break the
product. The game surfaces do not read raw metric scores. They read
thresholds, bands, ranked lists, and precomputed pairs. All of those values
come from the champion space. A new space moves all of them.

Rule: no surface switches to a promoted model until
RECALIBRATION_CHECKLIST.md passes in full. The checklist is the gate.
This map is not the gate.

### 0.2 Two spaces serve the site today — do not conflate them

| Asset | Width | Content | Used for |
|---|---|---|---|
| `assets/mtnn_embeddings.f32` | 64-d, L2 | MTNN v5 embedding | Similarity: neighbours, twins, Daily Court answers, Embed3D projections |
| `assets/vectors.json` | 14-d | Raw per-100 stats, z-scored within season | Style traits, Atlas 2-D map positions, live game similarity, explainer chips |

`vectors.json` is NOT a projection of the embedding. The Atlas 2-D xyz is
PCA(3) of those 14 stats. The Embed3D projections (PCA / t-SNE / UMAP) are
projections of the 64-d embedding. Those are two different maps.

### 0.3 The serving-unification claim needs one correction

The v6 spec (§3b) says the 16-d prefix "replaces the current 14-d serving
projection (`assets/vectors.json`)". That description is imprecise.
`vectors.json` is raw stats, not a projection. A 16-d prefix can replace
the *similarity* uses of `vectors.json`. It cannot replace the *stat*
uses. This map splits every surface on that line:

- Similarity use: migrate to the v6 prefix at the stated width.
- Stat-display use: stay on real stats. Do not migrate.
- Mixed use: migrate the similarity part only. Keep the stat part.

### 0.4 Width rules under a promoted v6 (contract §2e)

- 64-d: map surfaces and all ranked twin lists.
- 16-d prefix (slice, then L2-normalize): lightweight live similarity.
- 8-d prefix (slice, then L2-normalize): thumbnails and tooltips only.
- 32-d: reported in eval. No surface uses 32-d unless a later decision
  names it. Keep the option open. Do not wire it now.
- 16-d earns the unification story only if it keeps at least 90% of the
  64-d top-1 retrieval (contract §2d). If it fails that test, the
  separate stat-based lightweight path stays. Say so plainly at that point.

### 0.5 Identity rule (applies to every row below)

Exclude the whole person, keyed by `person_id`. Never exclude only the
exact row. Never key on name alone. Two Dee Browns and two Reggie
Williams exist as distinct players. Fall back to name only where a row
carries no `person_id`. This rule comes from PR #194. It survives any
model switch. Every re-derived list must pass the no-self-twin test:
zero pairs where both rows share one `person_id`.

### 0.6 Row-count and index contract

All derived files stay index-aligned with the master row order
(12,966 rows through 2025-26). Row `i` in one file is row `i` in every
file. A switch that breaks index alignment breaks every surface at once.
Verify alignment before any switch. See the checklist.

---

## 1. Surface-by-surface map

### 1.1 Daily Court (Past → Modern, `play.html` / `assets/past-modern-game.js`)

Current state (verified in the repo):

- Answer: past All-Star target → closest modern (2025-26) season by
  64-d cosine. Source: `assets/scoring_lite.f32`, a subset of
  `assets/mtnn_embeddings.f32` (past All-Stars plus 2024+ seasons),
  with `assets/scoring_lite_index.json` as its row map.
- Win rule: a guess names the target's modern twin within 6 guesses.
- Warmer / colder: the guess's 64-d similarity, banded by the twin bands.
- Guess eligibility: a qualifying 2025-26 season — 12+ games and 450+
  total minutes.
- Target pool: past seasons that meet the game-vectors criteria
  (All-Star / All-NBA / Finals MVP, mpg ≥ 24.0, gp ≥ 40). Modern pool:
  season starting 2022 or later, mpg ≥ 28.0, gp ≥ 45.
- Scoring stars: 3 stars at ≤ 40% of budget, 2 stars at ≤ 60%, else 1.

Proposed state under a promoted v6:

- Width: 64-d. Asset: the versioned v6 asset
  (`data/mtnn_v6_contrastive_<tag>_12966rows.f32`).
- The scoring-lite subset is rebuilt from the v6 asset, not patched.
  Its index file is rebuilt with it. The stale check in
  `past-modern-game.js` (scoring-lite build date vs embedding build
  date) must pass on the new pair before release.

Code changes:

- None to game logic. The game reads similarity from the subset file.
  Swap the subset file and its index. Keep the file names.
- No change to the 6-guess budget, the win rule, or the eligibility
  gate. Those are game rules, not model outputs. Change them only on a
  separate product decision.

Re-derive before any switch:

- Every target → closest-modern answer (full modern pool, 64-d, whole
  person excluded).
- The target → closest-modern similarity distribution, and from it the
  difficulty bands (see checklist §3).
- Warmer / colder band cutoffs (see checklist §2).
- The 20 held-out twin-quality spot checks (Lane 5 defines the set;
  checklist §6 gates on them).

Risk if skipped: yesterday's answers stay live in a new space. Players
win or lose against answers the new model would not give. That is a
silent rule change, not a model upgrade.

### 1.2 Twin Reveal lifeline (`assets/game-mechanics.js`, `twinReveal`)

Current state (verified in the repo):

- Live computation, not a precomputed list. It fetches `vectors.json`
  and ranks all rows by cosine on the 14-d stat vector `v`.
- It takes the top 3, excluding the exact row AND the whole person
  (`person_id` exclusion, PR #194).
- It lights those 3 rows on the map through `setHighlight` / `setDim`.

Proposed state under a promoted v6:

- Width: 16-d prefix of the v6 asset (slice, then L2-normalize).
- Asset: the same versioned v6 asset. No second file.
- Why 16-d and not 64-d: Twin Reveal runs live in the browser on every
  tap. It is a lightweight surface by the contract. The 16-d prefix is
  the lightweight width. If 16-d fails the 90% top-1 retention test,
  Twin Reveal stays on the stat-based path and this row reverts to
  "no change". Do not force it to 16-d on a failed test.

Code changes:

- `twinReveal` must read its vectors from the new lightweight source,
  not from `vectors.json`. The source must carry `person_id`, `name`,
  `season`, and row index for every row.
- Keep the `person_id` exclusion logic byte-for-byte in intent. Test
  it again on the new source. A new source file can drop a field that
  the old file carried.
- Keep the top-3 count and the map-highlight calls unchanged.

Re-derive before any switch:

- Nothing precomputed — but verify live: run the reveal on a fixed
  probe set of targets (including a player with same-name distinct
  players and a player with many seasons) and record the top 3 per
  target in both spaces. Compare. See checklist §7.
- Re-verify the Curry 2016-17 case: the reveal must not contain any
  Curry season. That case is the regression test for the exclusion.

Risk if skipped: the reveal silently changes character. A stat-space
reveal and an embedding-space reveal rank different players. Players
notice when a lifeline points somewhere new for no stated reason.

### 1.3 Twenty Questions / Daily Guess (`twenty-questions.html`, `assets/inline-twenty-questions.js`)

Current state (verified in the repo):

- The question tree and the row → career join ship as JSON
  (`assets/twenty-questions-tree.json`,
  `assets/twenty-questions-map.json`). The join is checked over all
  12,966 rows at build time.
- The map is the shared Embed3D engine (variant `game`). Ruled-out
  careers fade with `setDim`. A tapped dot reports its career and
  whether it is still possible.
- The game logic itself (questions, answers, 20-question budget) does
  not compute embedding similarity at run time. The map display does.

Proposed state under a promoted v6:

- Width: 64-d for the Embed3D projections. Asset: the versioned v6
  asset, re-projected.
- The tree and the career join do not change width. Careers are
  identity groupings, not embedding outputs. Rebuild them only if the
  row set or the career definition changes. Neither changes here.

Code changes:

- None to game logic. Replace the Embed3D projection file
  (`assets/projections/embed3d.json`) with a v6 re-projection at the
  same format version. Keep point id = row index.
- Re-run the build-time check: every row maps to exactly one career,
  and every Embed3D point id matches its row.

Re-derive before any switch:

- Embed3D PCA / t-SNE / UMAP projections from the v6 64-d vectors,
  with the same seeds and parameters recorded in the file's `meta`
  block (PCA SVD, t-SNE perplexity 30, UMAP n_neighbors 15, k-means
  k = 8 on the embedding).
- The k-means k = 8 cluster labels, if any surface reads them from
  Embed3D. Record the new silhouette and variance-explained values.
  Do not carry the old ones forward.
- A fixed probe: the same 20-question play path must still resolve
  within 20 questions on the probe careers. If resolution degrades,
  that is a product regression even if retrieval metrics improved.

Risk if skipped: the map shows v5 geometry while the game logic
assumes v6 neighbours. Dots move, but the tree does not. Players see
a map that contradicts the answers.

### 1.4 Twin Explainer (`assets/twin-explainer.js`, `twin_explainer.json`, `twin_explainer_vectors.json`)

Current state (verified in the repo):

- Static explanations: `twin_explainer.json`, keyed by canonical pair
  string (`Name|Season ~ Name|Season`), with `a_pid` / `b_pid`,
  shared trait chips, a biggest difference, `sim`, `sim_se`, and
  percentile. 1,176 pairs at last build.
- The match itself comes from the 64-d embedding. The explanation
  chips come from the 14 style traits (the stat space).
- Dynamic fallback: pairs not in the static file (Daily Court computes
  its twin live) are explained on the fly from
  `twin_explainer_vectors.json`, a row-index → 14-d stat vector pool.
- Display rule: band label and percentile in the headline. The raw
  number appears only on tap-through, with its bootstrap interval.

Proposed state under a promoted v6:

- Width: 64-d for the pair keys and the `sim` values. 16-d prefix for
  the dynamic fallback pool ONLY if the fallback computes similarity
  live; the trait chips stay on the 14 stats.
- Assets: rebuilt `twin_explainer.json` (new pair keys, new sims) plus
  a rebuilt dynamic pool. The pool's trait vectors stay 14-d stats
  unless a separate decision replaces the trait system itself.

Code changes:

- None to the renderer, if the rebuilt files keep the same schema
  (same keys, same chip vocabulary). The chip vocabulary mirrors
  `pipeline/build_twin_explainer.py`. Any vocabulary change is a
  separate product decision.
- The method line on the card ("Twins are matched by embedding
  similarity; this breakdown uses the 14 style traits from the map")
  stays true under this split. If the trait source ever changes,
  that line must change with it. Do not let copy drift from method.

Re-derive before any switch:

- The full static pair set from the v6 64-d space (same pair-selection
  rule as the current build, recorded in the build script).
- Every `sim`, `sim_se`, and percentile in the file. Percentiles come
  from the new sim distribution, not the old table.
- The absence-only qualifier: re-check which pairs are evidenced only
  by shared absences. That flag can flip in a new space.
- The dynamic pool: rebuild it from the same row set as the static
  file. A pool that covers different rows than the static file leaves
  live pairs unexplained.

Risk if skipped: stale pair keys. A card explains a pair the new model
no longer ranks as twins, with a similarity number from the old space.
That is the most visible form of model-product drift: the site argues
for a twinship its own model no longer holds.

### 1.5 Career Trails (`assets/career-trails.js`, `trails.json`, `trails_index.json`)

Current state (verified in the repo):

- Trails are keyed by `person_id`, never by display name.
- Each trail's points are Atlas 2-D/3-D coordinates (`x`, `y`, `z`
  from the stats-PCA space), plus per-season stat deltas
  (e.g. `FT_PCT`, `FGA`). The trail shows how a player's *style*
  moved, not whether he got better. The honest note on the trail bar
  says so.
- Trails render on an overlay of the Atlas map through
  `window.VHAtlas.project`.

Proposed state under a promoted v6:

- Width: NO CHANGE, if the Atlas 2-D map stays on stats-PCA (see §1.6).
  Trails follow the map they overlay. If the map does not move, the
  trails do not move.
- If a later decision moves the Atlas map to an embedding projection,
  trails must be re-derived from that projection in the same change.
  Never ship a trail overlay on a map it was not built for.

Code changes:

- None under the default (map stays on stats-PCA).

Re-derive before any switch:

- Nothing, under the default. Verify only: spot-check three trails
  (a long career, a short career, a same-name player) render on the
  unchanged map after the switch.
- Under the map-move variant: all trails (1,911 at last build), with
  the same `person_id` keys and the same delta vocabulary.

Risk if skipped (map-move variant): trails float off the map. Points
built in one coordinate system render in another. The animation still
plays. It just points at the wrong places.

### 1.6 Atlas map (2-D map + Embed3D)

Current state (verified in the repo):

- 2-D Atlas (`assets/atlas-map.js`): plots all 12,966 rows from
  `assets/vectors_search_lite.json`. Positions are PCA of the 14
  era-normalized per-100 stats. Selecting a season asks the 64-d MTNN
  embedding (via `assets/mtnn.js`) for its three nearest seasons.
- Embed3D (`assets/embed-3d.js`, `assets/projections/embed3d.json`):
  PCA / t-SNE / UMAP projections of the 64-d embedding, plus k-means
  k = 8 fit on the 64-d embedding. Point id = row index.
- Trust badge (served constants): fraction of each sampled player's
  20 nearest 64-d neighbours that stay neighbours on the flat atlas
  map. Current value: overlap@20 = 0.115 (12% rounded).

Proposed state under a promoted v6:

- 2-D Atlas positions: NO CHANGE (stats-PCA). The positions are not
  embedding outputs.
- 2-D Atlas neighbour lookup on selection: 64-d, from the v6 asset.
- Embed3D: 64-d, re-projected from the v6 asset (same format, same
  seeds, same parameters).
- Trust badge: re-measured in the v6 space. The badge number is a
  claim about the served model. It must be re-measured, never carried.

Code changes:

- `assets/mtnn.js` loads `assets/mtnn_embeddings.f32` by name. A
  switch means the file at that path (or the path the loader reads)
  holds the v6 asset. The loader code does not change. The asset
  pipeline must stamp the new sha and build date into
  `assets/mtnn_meta.json` so the stale checks elsewhere can see it.
- The `public/` mirror must match byte-for-byte. The site serves
  `public/` at the root. A root-only switch serves two models at once
  depending on cache path. Mirror, then verify with a cache-busted
  fetch. Never claim live until that fetch confirms the new asset.

Re-derive before any switch:

- Embed3D projections and k-means labels from the v6 64-d vectors.
- The neighbour lists the Atlas selection path reads (build-time
  constants in the map code path — verify they regenerate from the
  new asset; see checklist §5).
- The trust badge overlap@20 and its rounded percent.
- Atlas region labels, if regions derive from embedding clusters
  rather than stat clusters. Check the region builder's input before
  the switch. If regions read the embedding, re-derive them. If they
  read stats, leave them.

Risk if skipped: the map and its neighbour answers disagree. The
badge claims a fidelity number for a model that no longer serves.
Both erode the exact trust the badge exists to state.

### 1.7 Insights pages (`insights.html`, `assets/insights.js`, `insights/`)

Current state (verified in the repo):

- Insights pages are a mix: authored articles plus model-derived
  series. One series header states its method plainly: "Computed
  from the served 64-d MTNN vectors — nothing hand-written, nothing
  invented."
- Era-twin timelines and related visuals draw on era-twin pairs
  (see §1.8) and on archetype assignments.

Proposed state under a promoted v6:

- Width: 64-d for every model-derived number or pair on an Insights
  page. 14-d stats stay for stat displays (salaries, minutes, raw
  per-100 lines).
- No Insights page switches width on its own. The Insights rebuild
  runs as part of the same switch, from the same v6 asset.

Code changes:

- None to page templates, if rebuilt data keeps the same schema.
  Update any method line that names the model version. A page that
  says "MTNN v5" while serving v6 numbers is wrong even if the
  numbers are right.

Re-derive before any switch:

- Every model-derived series, era-twin pair, and archetype label used
  by an Insights page, from the v6 asset.
- The era-twin timeline visuals (same pair-selection rule as §1.8).
- Any similarity number quoted in article copy. Copy numbers are
  data too. Grep the articles for similarity values before release.

Risk if skipped: an article defends a claim with numbers from a
retired model. The claim may still be true. The evidence for it is
stale, and no reader can tell.

### 1.8 Era twins (`assets/eratwins.json`, twin-set collection)

Current state (verified in the repo):

- Method (stated in the file): signature seasons matched in the
  promoted 64-d MTNN embedding, L2-normalized, index-aligned with
  `vectors.json`. Twin = nearest OTHER-DECADE career by embedding
  cosine. Quiz pool = careers with ≥ 4 charted seasons. Top-5
  candidates ship for warmth feedback.
- Twin-set collection (`game-mechanics.js`) reads this file: a Daily
  Court win on a target in the file adds that target to its set
  (90s Pillars, 2000s Icons, 2010s Stars, Modern Era, Glass Cleaners,
  Sharpshooters). Sets are keyed by `name|season` in local storage.
- Prior audit (PR #194): the file contained zero same-person pairs.
  The live reveal was the only self-twin surface. That audit result
  is a property of this build, not a permanent guarantee.

Proposed state under a promoted v6:

- Width: 64-d. Asset: the versioned v6 asset.
- The other-decade rule, the ≥ 4-season pool rule, and the top-5
  shipment rule do not change. They are product rules, not model
  outputs.

Code changes:

- None to the collection logic, if the rebuilt file keeps the same
  schema. The `name|season` set keys must keep resolving: a rebuilt
  file that drops a target a player already collected breaks that
  player's set progress display (the set counts only collected keys
  present in the file).

Re-derive before any switch:

- The full era-twin set from the v6 64-d space: nearest other-decade
  career per signature season, top-5 candidates per player.
- The no-self-twin audit, rerun: zero pairs sharing a `person_id`,
  across the whole file. Not a sample. The whole file.
- The set-membership impact: list every target present in the old
  file but absent in the new one, and every target whose twin changed.
  Decide the migration for collected sets before release (grandfather
  collected keys, or reset with notice). Do not let the decision
  happen by accident at read time.

Risk if skipped: players collect twins the new model does not endorse,
and old collected sets point at targets that no longer exist in the
file. Progress silently shrinks.

### 1.9 Live / Pixel Replay (`live.html`, `assets/live.js`, `replay.html`, `assets/replay.js`)

Current state (verified in the repo):

- Pixel Replay renders real play-by-play (from
  `assets/replays/<gameId>.json`) with a coordinate model and sprite
  figures (`assets/sprites/players.json` / `players.png`). It does
  NOT read the embedding. The sprite file is a sprite atlas, not a
  model output. A model switch does not touch it.
- Live star-twin chips (`assets/live.js`) read a twin library from
  the live opening document (`star_twins`): young stars with ≥ 4
  charted seasons, each with a twin name, twin season, and similarity
  percent. That library derives from the twin space.
- Live archetypes read `assets/archetype_assignments.json`: k-means
  clusters of the player-season representation. The live opening
  document states the method (k = 8 clusters, latest season at or
  before 2025-26 per player, unmatched players excluded).

Proposed state under a promoted v6:

- Pixel Replay: NO CHANGE. Width: none. Asset: none.
- Live star-twin chips: 64-d, rebuilt twin library from the v6 asset.
- Live archetypes: 64-d, re-clustered (k = 8, same method) from the
  v6 asset — but ONLY if the archetype builder's input is the
  embedding. Verify the builder's input before the switch. If the
  builder reads stats, leave it.

Code changes:

- None to Replay code. None to Live code, if rebuilt libraries keep
  the same schema.
- The similarity percent on a star-twin chip comes from the new space.
  A chip that shows an old percent next to a new twin name is wrong
  in both directions.

Re-derive before any switch:

- The star-twin library (same ≥ 4-season pool rule, same schema).
- Archetype assignments, if embedding-derived (same k, same method,
  new labels only if the cluster contents justify new labels — do not
  rename clusters to hide movement).
- The "no twin-library comps yet" fallback still triggers for players
  below the season threshold. Test it on a rookie with fewer than 4
  charted seasons.

Risk if skipped: Live shows yesterday's comps for tonight's players.
Replay is safe by construction — which is exactly why this row must
say so explicitly, so no one "migrates" Replay by mistake.

---

## 2. What does NOT change

- Row order and row count (12,966). Index alignment everywhere.
- `person_id` identity. Name is never the key.
- Game rules: 6 guesses, win rule, star budget fractions, eligibility
  gate (12+ games, 450+ minutes, 2025-26), target/modern pool criteria.
- Twin Reveal top-3 count. Twenty Questions 20-question budget.
- Era-twin rules: other-decade, ≥ 4 seasons, top-5 shipped.
- Twin-set definitions and needs (5 / 5 / 5 / 5 / 4 / 4).
- Raw stat displays: per-100 lines, salaries, minutes, honors flags.
- Pixel Replay rendering, sprites, and coordinate model.
- The champion asset file itself. A switch never overwrites it. The
  champion stays versioned and pinned as the rollback target.

## 3. Switch order (when — and only when — the checklist passes)

1. Freeze the champion: record its sha256, its twin bands, its
   percentile table, and every derived file's sha. Store that snapshot
   as the rollback bundle. See DRIFT_MONITOR.md §5.
2. Build all re-derived files from the v6 asset in one pass. Do not
   build them across days from mixed inputs.
3. Run the full checklist. Every item passes, or nothing ships.
4. Mirror root → `public/` byte-for-byte.
5. Verify live with a cache-busted fetch: new asset sha, new band
   values, new neighbour answers on probe targets.
6. Announce the switch as a model change, with the new twin bands and
   the new badge number. Do not present it as a silent improvement.

## 4. Contract conflicts and open questions found

1. **Spec §3b vs repo reality (serving unification).** The spec calls
   `vectors.json` a "14-d serving projection". The repo shows it is
   raw per-100 stats, z-scored within season. The unification story
   holds for similarity uses only. Stat uses must stay on stats.
   This map implements that split. The coordinator should correct
   the spec wording, not the repo.
2. **Twin Reveal width.** The task brief and contract §2e assign
   lightweight surfaces to the 16-d prefix. Twin Reveal currently
   computes on 14-d stats, not on the embedding at all. Moving it to
   a 16-d embedding prefix is therefore a behaviour change, not a
   like-for-like width swap. It needs the probe comparison in
   checklist §7, and it reverts to the stat path if 16-d fails the
   90% retention test.
3. **Lane 5 spot-check set.** The 20 held-out twin-quality spot checks
   are defined by Lane 5 (contract §2d). This lane consumes that set;
   it does not invent it. If Lane 5 has not delivered the set, the
   checklist item is BLOCKED, not passed by substitution.
4. **No numeric difficulty bands exist in current game code.** Daily
   Court difficulty today is implicit (pool criteria + similarity
   distribution + 6-guess budget). The checklist therefore requires
   difficulty bands to be *defined from* the new distribution and
   recorded, rather than ported from old numbers that do not exist.
   Porting an invented band would be worse than defining one honestly.
