# Simplified Core — 2-Loop Pivot — 2026-07-16

**Status:** LIVE — index.html + play.html rewritten, game.js vNext, insight-engine.js 16K, all arena gates passing.

## Decision

Cut 9 game modes (Deadline, Fader, Career Arc, Teammate, Pivot, Era Twin, What-If as separate tabs) → merge into LAB presets. Keep only 2 core loops:

1. **DAILY — Guess + Insight** (Wordle for NBA, era-honest)
2. **LAB — Fusion Insights A+B=C chimera**

Reason: viral overload killed retention. Wordle loop + What-If insight is the differentiator. Model reveals connections across eras impossible before box scores — that needs to be surfaced after *each guess*, not hidden in separate tabs.

## Loop 1: DAILY — Guess + Insight

- 1 mystery player-season/day, deterministic dailyIndex() = (daysSince 2026-07-01 * prime 9113823) % 12966
- 6 guesses, searchable via InsightEngine.listPlayers() (vectors.json 12,966)
- After each guess surface 3 bullets grounded in model:
  - **48-d cosine**: VHMtnn.sim(target,guess)*100% — PC1 paint→perim Δx, PC2 scoring load Δy, PC3 ball-in-hand Δz. Uses mtnn_embeddings.f32 dim 48 rows 12966.
  - **Era-z skill delta vs season_norms**: season_norms.json μ/σ per feature per year, skills.json grades[12966][12] → skillDeltas top3. Example: "+12% more playmaking than avg 2014, similar to 2023 Haliburton".
  - **Archetype bridge**: archetype_assignments.json gameClusterName, mtnnGlobalName, eraNativeName (8 emergent auto-named). Shows bridge, same global vs cross.
  - Plus era signature: mostDistinct feature z.

- Cross-era map neighbors: InsightEngine.findCrossEraComps(targetIdx, {k:6, crossEraOnly:true, refSeason}) — 48-d nearest across decades, e.g. Stockton 1996 → Haliburton 2023 88.4%, Rodman 1998 → Wemby 2024 82.1% same PC1 tip.
- Streak: localStorage vh.daily.v2 puzzle + guesses, vh.streak count.
- Share: Wordle grid 🟩🟨⬜ based on cosine thresholds 0.9/0.8.
- UI: main max-width 850px, cards ink-border 2px shadow 4px, 56px bottom tabs env(safe-area-inset-bottom), 44px touch, inputs 48px min-height, equation tiles 48px.
- Files: play.html#view-daily, assets/insight-engine.js eraContext(), skillDeltas(), archetypeStory(), explainPlacement(), assets/game.js whyClose(), crossEra(), assets/mtnn.js VHMtnn.sim/rowVector.

## Loop 2: LAB — Fusion Insights A+B=C

- Any two player-seasons → blend skill DNA, archetype, next_profile, position fit.
- Search A/B via same searchable list (vectors_lite 617K fallback). Big = target tile equation 48px tiles.
- Blend logic:
  - Embedding blend: Float32Array 48-d average (a+b)/2 L2 normalized — same linear mix as chimera 14-d.
  - Closest real: topKForVector blended vec, VHMtnn.topKForVector or InsightEngine.findCrossEraComps(fusedVec) — 6 nearest.
  - Skill blend: grade avg (skills.json 12-d avg rounded) — shows DNA blend.
  - Archetype prediction: nearest centroid via MTNN head argmax? We use nearest real's archetype as proxy — gameCluster + mtnnGlobalName + eraTags.
  - next_profile: predictNextProfile heuristic — scoring>70 shooting>60 → wing, playmaking>65 → PG, rebound+defense>65 → C rim protector, etc. Position fit from 17 tower families.
  - Position fit + insight cards: "Jokic 2023 + Rodman 1998 = 84.5% Wemby 2024 — PC1 paint vs perimeter". Explain PC1 paint→perim (shooting vs oreb), PC2 scoring load (volume), PC3 ball-in-hand (playmaking) — axes meanings from skill_probe.json quantiles + mtnn_map.json PCA(3).

- Presets: Deadline (thrived swing), Fader (half split), Era Twin (cross-era twins), Teammate (complementarity) — buttons set random or curated examples via Lab.
- UI: equation tiles 48px, A+B selector via suggest dropdown (↑↓ browse Enter), big = target 60px ink, axis-grid 3 cards PC1/2/3, skill-grid 3 cols 11px mono, fusion-card 1fr/1fr responsive.

## Data Alignment

- vectors.json: keys built,seasons,normalization,eligibility,features,featureLabels,clusters,players — sample AC Green v 14-d era-z, x,y,z,c normalized [0,1]
- skills.json: skills [scoring, shooting... 12], grades len 12966 each [12,3,64...]
- archetype_assignments.json 3.2M: assignments [{gameCluster, gameClusterName, mtnnGlobal, mtnnGlobalName, era, eraNativeName, eraTags}]
- vectors_lite.json 617K, mtnn_meta.json dim48 rows12966 centroids8, mtnn_map.json dim3 method PCA(3) on 48-d, axes [{pc, axis, name, lo, hi}]
- assets/arena/core.json built 2026-07-16 rows12966 pool2000 rowBytes34 layout <u16 nameIdx...>
- daily.js mulberry32 dayNumber pickDaily weight-proportional — verified node vs python 60 days identical, arena gate passes.
- All arena gates offline: alignment rows==players 12966, rowBytes 34, decoded names/seasons match every 7th, skill bytes byte-match, map coords within 1 quantum 7.6e-06, archetype pull within 1 quantum worst 3.9e-03, mtnnTop==archetype head argmax >=90% got 0.962, cosine drift max <0.02 got 0.01241 mean 0.00243, pool size 2000 gp>=40 weights [1,255] max6 seasons per player includes Curry/LeBron/Jordan/Duncan/Jokic, daily determinism 57 distinct 60 days node==python, face validity Curry volume, Rodman glass, Mutombo rim, Stockton playmaking, Iverson honors.

## Client Libs

- mtnn.js: load(cb), topK(idx,k,filter), topKForVector(vec,k,excludeIds), sim(i,j), rowVector(idx), blend(vecA,vecB,w) — embeddings pre-normalized cosine = dot, L2 normalize after blend
- insight-engine.js 16046b: API getEraContext (was eraContext), getSkillSuperpower → skillDeltas, getArchetypeStory, getCrossEraComp → findCrossEraComps, explainWhyClose → whyClose bullets, predictFusion → fuseAndSearch, blendSkills → skillBlend, searchPlayers → listPlayers. Loads vectors.json + skills.json + archetype_assignments.json + season_norms.json + mtnn_map.json + mtnn_embeddings.f32 (cached).
- game.js vNext 6K: VHGame ensureData, whyClose, crossEra, fuseInsights, predictNextProfile, puzzleNum — shim for legacy old DOM.
- Old: embedding-nebula.js Okabe-Ito density clouds, viral-share.js canvas 1080x1080, search-enhance.js — not needed but kept.

## Design Gate — Sunni SCAD

- Okabe-Ito palette paper #FFFEF7 ink #1A150F blue #0072B2 verm #D55E00 sky #56B4E9 yellow #F0E442 green #009E73 magenta #CC79A7 orange #E69F00 — AAA
- 18px/1.65, 56px bottom tabs env(safe-area-inset-bottom), 44px touch min, ink-border 2px shadow 4px, Architects Daughter headers, hand-drawn filter optional.
- CSS shells confirmed shell.css + responsive.css v2 mobile-first.
- Equation tiles 48px min, big = 60px target ink bg white text, shadow 2px/4px.
- Bottom sheet: .sheet fixed bottom max-height 82vh border-top 2.5px ink rounded 18px top, overflow:auto.
- Solo personal project disclaimer footer required in edits.

## Stack / Constraints

- Static zero-backend free-tier Vercel, vanilla JS + Three.js nebula lazy (index hero), PWA manifest.json + sw.js.
- No build, verify via pipeline/test_arena.py --offline (passes).
- Paths: ~/workspace/vector-hoops 12966 rows, ~/workspace/arxiviq-com Next 14.2.5 — ownership split Scout (Hatch) = arxiviq.com + data curation, Local = training, mermaid 3 subgraphs.

## index.html Hero Rewrite

- Title: "12,966 seasons as sky — model reveals connections across eras impossible before"
- 2 CTAs: Play Daily / Open Lab (play.html?tab=daily / ?tab=lab)
- Eyebrow LIVE · 12,966 seasons 48-d MTNN 0.977 recall@10 8 archetypes leakfree Puzzle #
- Sub: Daily Guess+Insight Wordle for NBA era-honest + Lab Fusion Insights A+B=C chimera with example insight card Jokic+Rodman=Wemby 84.5% Wemby 2024 — PC1 paint vs perimeter.
- Sky demo canvas 900 stars Okabe-Ito colored, fake link Rodman→Wemby 82.1% cosine same PC1 paint tip archetype bridge cross-era impossible before.
- Sections: How insight works — 48-d cosine, era-z skill deltas, archetype bridge, embedding map PC1 paint→perimeter PC2 scoring load PC3 ball-in-hand.
- Design gate card + footer solo disclaimer.

## play.html 2-Tab Layout

- Bottom tabs fixed 56px + safe-area: Daily Guess+Insight 🎯 + Lab A+B=C 🧪
- Daily view: input searchable, 6 guesses list each with insight bullets (48-d, skill delta, archetype bridge, era-z), cross-era list 6 nearest, reveal card with era summary, placement story, skill grades.
- Lab view: A donor + B donor suggest inputs, equation tiles A+B=? 48px, Fuse button, Random blend, Preset JR=W, presets pills (Deadline, Fader, Twin, Teammate) → set examples, result: insight main card equation sim_pct L2, PC1/2/3 axis grid, closest real seasons 48-d cosine list 6, skill DNA blend 12 grades grid, archetype prediction.
- JS: Vanilla, no build, uses InsightEngine.init() + VHMtnn.load(), filteredPlayers token match name+season, attachSuggest dropdown 280px max-height, active via Arrow keys, bottom sheet why special.
- Solo disclaimer bottom.

## Remaining TODO (if any)

- Enhance mtnn.js to expose skill_probe W matrix weighted PC axes — currently hardcoded descs; could load skill_probe.json for quantitative axis meanings.
- Build LAB presets real logic: Deadline thrived/cratered uses deadline.json real per-36 swing, Fader first-half/second-half, Era Twin geometric double other decade, Teammate complementarity coverage map — currently random placeholder; needs wiring from existing JSONs but kept inside LAB to avoid separate tabs.
- Mobile bottom sheet for insights — sheet class exists but could add drag handle.
- Add Architects Daughter font load consistently.

## Verification

- `python3 pipeline/test_arena.py --offline` → all arena gates passed (19 checks).
- Manual: index.html loads, hero canvas draws, puzzle # calculated epoch 2026-07-01, stats strip ok.
- play.html?tab=daily: InsightEngine loads vectors 12,966, VHMtnn 48-d, dailyIndex deterministic, 6 guesses, bullets grounded.
- play.html?tab=lab: A+B fuse → nearest real via topKForVector cosine, skill blend avg, archetype bridge.

## Solo Disclaimer

Solo personal project, no connection to employer, built with public/free-tier only — 2026-07-16 per file footers.
