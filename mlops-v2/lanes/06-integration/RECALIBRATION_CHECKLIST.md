# Lane 6 — Recalibration Checklist: Gate Before Any Production Switch

Status: DRAFT ONLY. This checklist is a gate, not a switch.
Rule: every item passes, or nothing ships. A partial pass is a fail.
Promotion itself needs the user's separate word after this checklist
passes. This document never authorizes a switch on its own.

## 0. How to use this checklist

- Run the items in order. Record the result of each item in the switch
  report: item, new value, rollback value, evidence path (file + sha).
- "Rollback value" means the champion-space value that the site serves
  today. The rollback bundle holds those files. See DRIFT_MONITOR.md §5.
- "Pass condition" means the exact test. Vague passes do not count.
  If a pass condition cannot be tested, mark the item BLOCKED and say
  what is missing. Do not substitute a nearby test.
- One person signs the checklist. The signer is not the builder of the
  re-derived files. Separation matters here: the builder cannot grade
  his own output.

## 1. Preconditions (all must hold before any item below counts)

| # | Precondition | Pass condition | Rollback value |
|---|---|---|---|
| P1 | Lane 5 eval report exists and passes the promotion gate | 64-d beats the champion on ALL primary metrics on BOTH val and frozen test (contract §2d). Report file + both asset sha256 recorded. | Champion asset stays live. No switch. |
| P2 | 16-d retention test recorded | 16-d top-1 ≥ 90% of 64-d top-1, or the test is recorded as FAILED and all 16-d migrations in this checklist revert to "no change". | Separate stat-based lightweight path stays. |
| P3 | User's separate word for the switch exists | Written approval naming the v6 asset tag and the switch date. A model-promotion approval is not a switch approval. | No switch. |
| P4 | Champion rollback bundle frozen | Bundle holds: champion `mtnn_embeddings.f32` + sha256, `served-constants.js`, `twin_bands.json`, `twin_explainer.json`, `eratwins.json`, `peers_top8.json`, `scoring_lite.f32` + index, `embed3d.json`, star-twin library, archetype assignments, and this checklist's rollback column. Bundle sha recorded. | — (this IS the rollback) |
| P5 | Row alignment verified | New asset has 12,966 rows in the same row order as the champion. Spot-check 50 rows: same `name`, `season`, `person_id` at the same index in both spaces. Zero mismatches. | Champion row order. |

## 2. Twin bands and percentile table (served constants)

Source of truth: `assets/served-constants.js`, built by
`pipeline/build_served_constants.py`. Every surface reads bands from
there. `assets/twin_bands.json` and the literals in
`assets/daily-ledger.js` must match it. Three copies of one number is
already a drift risk. The switch must update all three, or unify them
first — but unification itself is a separate change. Do not bundle it
silently into the switch.

Current champion-space rollback values (verified in the repo):

- Strong twin: sim ≥ 0.727.
- Lean twin: sim ≥ 0.663.
- Distant twin: sim < 0.663 (floor 0.0).
- Definition: "top third of all 1,175 twin similarities on record".
- Twin pair count: 1,175 (served constants). Note: the standalone
  `twin_bands.json` records n = 1,181 at freeze and n = 1,175 on the
  2026-10-19 regen. Record which count the new build uses. Do not
  mix the two counts in one report.
- Percentile table: 101 values, p0 = 0.398 through p100 = 0.900
  (full table in `served-constants.js`). The table is data, not prose.
  Rebuild it. Do not summarise it.
- Trust badge: overlap@20 = 0.115, shown as 12%.

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| B1 | New band cutoffs computed | Cutoffs are terciles of the NEW twin-similarity distribution, computed from the rebuilt twin pair set in the v6 64-d space. Method, n, and cutoffs recorded. No cutoff carried from the champion space. | Strong ≥ 0.727; lean ≥ 0.663 |
| B2 | New percentile table built | 101 values (p0–p100) from the NEW distribution. Table monotonic non-decreasing. Headline percentiles on probe pairs recomputed from the new table and spot-checked on 20 pairs. | p0 = 0.398 … p100 = 0.900 |
| B3 | All three band copies agree | `served-constants.js`, `twin_bands.json`, and `daily-ledger.js` BANDS hold identical cutoffs. Grep proves it. One differing literal fails the item. | 0.727 / 0.663 everywhere |
| B4 | Band-label spot check | 30 probe pairs (10 per band in the new space) display the correct label and percentile. A pair at the old strong cutoff must not automatically display "strong" in the new space — it displays whatever the new table says. | Old labels on old sims |
| B5 | Trust badge re-measured | Overlap@20 recomputed in the v6 space by the same method (20 nearest 64-d neighbours vs flat atlas map neighbours, same sampling). New value + rounded percent recorded. Old value retired from copy. | 0.115 / 12% |
| B6 | Bootstrap intervals rebuilt | `sim_se` values recomputed in the new space by the recorded method (bootstrap over embedding dims, same reps and seed convention as the current build, or a newly recorded method). No old `sim_se` carried forward. | Old `sim_se` values |

## 3. Daily Court thresholds and difficulty bands

Game rules that do NOT change (record them as unchanged, do not
re-derive them): 6-guess budget; win = guess names the target's
modern twin within 6 guesses; star fractions (3 stars ≤ 40% of
budget, 2 stars ≤ 60%); guess eligibility (2025-26, 12+ games, 450+
total minutes); target pool criteria (All-Star / All-NBA / Finals
MVP, mpg ≥ 24.0, gp ≥ 40); modern pool criteria (season starting
2022 or later, mpg ≥ 28.0, gp ≥ 45).

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| D1 | Closest-modern answers rebuilt | Every target's closest modern (2025-26) recomputed in the v6 64-d space, whole person excluded. Full modern pool, exhaustive ranking, pessimistic ties. Old answers kept only in the rollback bundle. | Champion-space answers |
| D2 | Answer-change report | Report lists: targets whose closest modern changed, share changed, and the sim distribution of changed vs unchanged answers. A change share above 50% triggers a product review note (not an automatic fail, but a required read). The note must exist before sign-off. | — |
| D3 | Target → closest-modern sim distribution recorded | Distribution (mean, median, terciles, p10, p90) of target → closest-modern sims in the v6 space, over the full target pool. This distribution defines D4. | Champion-space distribution (record it at freeze time; it is not in game code today) |
| D4 | Difficulty bands defined and recorded | Bands are defined FROM the D3 distribution and written down with their rule, e.g. tercile bands on target → closest-modern sim (hard = bottom third: distant closest twin; medium = middle third; easy = top third: near-identical closest twin). Exact cutoffs recorded. Rationale: no numeric difficulty bands exist in current game code, so this item DEFINES them honestly instead of porting invented numbers. | No numeric bands (implicit difficulty via pool + distribution + 6-guess budget) |
| D5 | Difficulty mix check | Share of targets per D4 band reported. If any band holds under 15% or over 50% of targets, the band rule is re-examined before sign-off. A degenerate band (e.g. "easy" = 3 targets) fails the item. | Implicit mix (record at freeze time) |
| D6 | Scoring-lite rebuilt and stale-checked | `scoring_lite.f32` + `scoring_lite_index.json` rebuilt from the v6 asset. The stale check in `past-modern-game.js` (subset build vs embedding build) passes. Row count and dim match the index file exactly. | Champion scoring-lite pair |
| D7 | Warmer / colder verified live | On 10 probe games, a guess's warmer / colder arrow and band label match the v6 sim and the new bands. One mismatch fails the item. | Champion sims + old bands |

## 4. Era-twin pairs

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| E1 | Era twins rebuilt | Full set rebuilt in the v6 64-d space: nearest OTHER-DECADE career per signature season, quiz pool = careers with ≥ 4 charted seasons, top-5 candidates shipped per player. Same rules as the current file's stated method. | Champion-space era twins |
| E2 | No-self-twin audit (whole file) | Zero pairs in the rebuilt file share one `person_id`. Audit runs over the whole file, not a sample. Result recorded with pair count. One self-pair fails the item and blocks the switch. | Zero self-pairs (PR #194 audit result) |
| E3 | Twin-change report | Report lists: pairs changed, pairs dropped, pairs added, and the sim distribution of the new set. Same-person-name collisions checked explicitly (Dee Brown, Reggie Williams, Mike James, Chris Johnson cases resolve to distinct `person_id`s). | Champion-space pairs |
| E4 | Twin-set migration decided | Every target present in the old file but absent in the new one is listed. The migration for already-collected set keys is decided and written down (grandfather collected keys, or reset with notice). No silent shrinkage of a player's displayed progress. | Old file's targets |
| E5 | Twin-set display verified | On probe accounts (fresh + pre-collected progress), set counts display correctly against the new file. Collected keys that no longer exist in the file behave per the E4 decision, not by accident. | Old file + old counts |

## 5. Twin Explainer pair keys, Atlas neighbours, Embed3D, archetypes

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| X1 | Explainer static pairs rebuilt | `twin_explainer.json` rebuilt from the v6 64-d space with the same schema (pair key, `a_pid` / `b_pid`, shared chips, biggest difference, `sim`, `sim_se`, percentile, absence-only flag). Pair count recorded. | 1,176 pairs, champion sims |
| X2 | Explainer key coverage | Every pair key in the rebuilt file resolves to two rows that exist at the stated indices with matching `person_id`s. Every Daily Court live pair that the dynamic fallback must explain has a pool row. Zero dangling keys. | Champion-space keys |
| X3 | Explainer chips re-checked | Shared chips and biggest difference recomputed from the 14 stats for the NEW pairs. Chips are stat-derived, so a new pair can carry different chips even if the pair text looks familiar. Spot-check 30 pairs by hand: chips match the stat comparison. | Champion-space chips |
| X4 | Absence-only flags re-checked | Every rebuilt pair's absence-only flag recomputed. Pairs flagged in the old file but not the new (and vice versa) listed. The "mostly in what they don't do" qualifier displays only where the new flag says so. | Champion-space flags |
| X5 | Dynamic pool rebuilt | `twin_explainer_vectors.json` rebuilt from the same row set as X1. Pool row count = master row count. Pool indices match master indices. One index slip fails the item. | Champion-space pool |
| X6 | Atlas neighbour lists rebuilt | The 3-nearest-season lists the Atlas selection path reads are regenerated from the v6 64-d asset. Probe: 20 selections return the v6 neighbours, not the champion neighbours. | Champion neighbours |
| X7 | Embed3D re-projected | `projections/embed3d.json` re-projected from the v6 64-d vectors (PCA / t-SNE / UMAP, same seeds and parameters, new `meta` block with new variance-explained, KL, silhouette). Format version unchanged. Point id = row index verified over all rows. | Champion projections |
| X8 | Archetypes re-clustered (if embedding-derived) | IF the archetype builder reads the embedding: k = 8 re-clustering from the v6 asset, same method, new assignments recorded. IF it reads stats: item marked N/A with the builder input cited as evidence. Guessing the input fails the item. | Champion assignments |
| X9 | Peers rebuilt | `peers_top8.json` rebuilt from the v6 64-d space (top 8 per row, same-name excluded per its format note, whole-person exclusion verified). Peer lists power downstream surfaces; stale peers are stale answers. | Champion peers (run july-v5-a4918f09) |
| X10 | Live libraries rebuilt | Star-twin library (≥ 4-season pool, same schema) and live archetype mapping rebuilt from the v6 asset. Rookie fallback ("no twin-library comps yet") verified on a player below the season threshold. | Champion libraries |
| X11 | Insights model numbers rebuilt | Every model-derived number, pair, and series on Insights pages regenerated from the v6 asset. Article copy grepped for similarity values; every hit updated or explicitly confirmed unchanged. Method lines naming the model version updated. | Champion-space numbers |

## 6. Twenty held-out twin-quality spot checks (defined by Lane 5)

Lane 5 defines the check set (contract §2d: "Downstream sanity: 20
held-out Daily Court twin-quality spot checks"). Lane 6 does not invent
the set. This section gates on it.

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| S1 | Check set received | The 20 pairs are named (target + twin, with seasons and `person_id`s) in Lane 5's eval report, drawn from held-out rows only. No train-split pair counts. If the set has not arrived, this whole section is BLOCKED. | — |
| S2 | Smell test | A human reviewer records pass / fail per pair with one line of reasoning each: do these two play the game the same way? Pass bar: at least 18 of 20 pass. Below 18 fails the item. A pair that fails on basketball grounds fails even if its cosine is high. | Champion-space spot checks |
| S3 | No self-twins in the set | Zero of the 20 pairs share a `person_id`. This is checked mechanically, not by eye. | Zero |
| S4 | Cross-era presence | At least half the 20 pairs are cross-era (different decades). A metric space that only matches within-era has not earned the Daily Court answer, which is a past → modern match. Below half fails the item. | Champion-space mix (record at freeze) |
| S5 | Band plausibility | The band each spot-check pair displays under the NEW bands matches its smell-test verdict: pairs the reviewer calls strong must not display "distant", and vice versa. Systematic mismatch fails the item even if S2 passes — it means the bands, not the pairs, are wrong. | Old bands on old sims |
| S6 | Failures dispositioned | Every failed pair gets a disposition: accepted as a known miss with a reason, or fixed by a documented rule change. Unexplained failures block the switch. "The model said so" is not a disposition. | — |

## 7. Live-behaviour probes (browser, after staging, before production)

| # | Item | Pass condition | Rollback value |
|---|---|---|---|
| L1 | Twin Reveal probe | Fixed probe set (20 targets, including a same-name player and a many-season player) run in staging. Top 3 recorded per target in both spaces. Curry 2016-17 probe: zero Curry seasons in the reveal. | Champion-space reveal |
| L2 | Twin Reveal width decision honoured | If P2 failed (16-d retention below 90%), Twin Reveal still serves the stat path in staging. If P2 passed, it serves the 16-d prefix. The served width is verified, not assumed from the plan. | Stat path (14-d) |
| L3 | Daily Court probe game | 5 full probe games played end-to-end in staging (target, guesses, warmer / colder, win, stars, twin set collection). No error, no stale answer, no old band label. | Champion-space games |
| L4 | Twenty Questions probe | 5 probe careers resolve within 20 questions on the new Embed3D map. Map dots, dimming, and tapped-dot reports all agree with the tree state. | Champion-space map |
| L5 | Trails probe | 3 trails (long career, short career, same-name player) render correctly on the Atlas map in staging. | Unchanged trails |
| L6 | Replay untouched | A replay loads and plays with identical output before and after the switch (same game id, same events). Any diff fails the item and means the switch touched something it must not touch. | Same output |
| L7 | Public mirror + cache-busted live check | `public/` mirrors root byte-for-byte. A cache-busted fetch of the live site returns the new asset sha, the new band values, and the new probe answers. Until that fetch passes, the switch is not live, whatever the deploy log says. | Champion asset live |

## 8. Sign-off

- Switch report holds: v6 asset tag + sha256, Lane 5 eval report path,
  this checklist with every item marked PASS / FAIL / BLOCKED, the
  rollback bundle sha, and the D2 / E3 answer-change reports.
- One FAIL or one BLOCKED blocks the switch. No partial switches: a
  surface cannot go live on v6 while another stays on v5, except the
  two explicitly allowed holds: (a) Twin Reveal on the stat path if
  P2 failed; (b) the Atlas 2-D positions and all raw stat displays,
  which never migrate.
- The user's separate switch approval is filed with the report. The
  approval names the asset tag. An approval for a different tag does
  not cover this switch.
