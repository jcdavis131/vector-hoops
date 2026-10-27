# Lane 8 — Integration Addendum to Lane 6's Map

**Status:** DESIGN ONLY. No training, no prod writes, no merge. This
doc is an ADDENDUM to Lane 6's `INTEGRATION_MAP.md`. It does not edit
that file, and Lane 6's original deliverables stand unchanged. Where
this addendum and Lane 6's map appear to disagree, the disagreement
is a second-model addition, not a correction: Lane 6 mapped a single
promoted similarity model; this addendum adds the second (dynamics)
column.
**Authority:** Contract §7 (user decision 2026-10-26). Companion docs:
`DIVISION_OF_LABOR.md`, `JEPA_DESIGN.md`.
**Baseline fact (Lane 6 §0.2, unchanged):** two spaces serve the site
today — `assets/mtnn_embeddings.f32` (64-d v5 embedding, similarity)
and `assets/vectors.json` (14-d raw per-100 stats, stat display and
Atlas positions). This addendum adds a third, future column (JEPA
dynamics); it does not collapse the existing two.

## 1. Second model column, surface by surface

"Similarity" below means the v6 line under Lane 6's map (64-d for map
surfaces and ranked twin lists, 16-d prefix for lightweight live
similarity, 8-d for thumbnails/tooltips — all only after the §2d
promotion gate plus the user's word, and only after Lane 6's
recalibration checklist passes). "Dynamics" means Hoops-JEPA (design
only; no surface gains it until it exists, is evaluated under its own
eval sketch, and a production decision is separately made). Until
then, every "dynamics" cell below reads as FUTURE, and the surface
keeps its current behavior.

| Surface (Lane 6 §) | Similarity model | Dynamics model (JEPA) | How they compose |
|---|---|---|---|
| Daily Court (§1.1) | YES — 64-d, rebuilt scoring-lite subset + index, re-derived answers, difficulty bands, warmer/colder cutoffs (Lane 6 as written) | FUTURE VARIANT ONLY, not a swap | Daily Court stays similarity. A dynamics variant (e.g. "predict the modern twin's next season" or a coach-mode round) is a NEW game mode, designed and gated separately. It never replaces the similarity answer key, and the two modes never share an answer file |
| Twin Reveal lifeline (§1.2) | YES — 16-d prefix if it passes the 90% retention test, else stays on the 14-d stat path (Lane 6 as written, including the whole-`person_id` exclusion, PR #194) | NO | A reveal answers "who plays like this player" — a retrieval question. JEPA adds nothing to it. Do not wire JEPA into a lifeline |
| Twenty Questions / Daily Guess (§1.3) | YES — 64-d Embed3D re-projection; tree and career join unchanged (Lane 6 as written) | NO | The game logic does not compute similarity at run time, and its map is a similarity geometry. A dynamics model does not belong on this map |
| Twin Explainer (§1.4) | YES — 64-d pair keys and sims rebuilt; trait chips stay on the 14 stats (Lane 6 as written) | NO | Explanations explain twinship. Twinship is similarity. JEPA predictions are not twin explanations and must not be rendered as such |
| Career Trails (§1.5) | NO CHANGE under the default (trails follow the stats-PCA Atlas map; Lane 6 as written) | NO (future note only) | Trails show how a player's STYLE moved. A future "predicted trail" (where JEPA rolls a career forward) would be a separate, labeled overlay — predicted, not observed — and is not designed in this pass |
| Atlas map (§1.6) | YES — 2-D positions stay stats-PCA; neighbour lookup + Embed3D move to 64-d v6; trust badge re-measured (Lane 6 as written) | NO | The Atlas is a map of similarity/style geometry. Plotting JEPA latent states on it would mix two geometries on one map. Do not do it |
| Insights pages (§1.7) | YES — 64-d for every model-derived number/pair; stats stay for stat displays; method lines updated to name the model version (Lane 6 as written) | FUTURE, as a separate series type | A dynamics-derived Insights series (e.g. "what the world model expects from this lineup") ships only with its own method line naming JEPA, its own held-out basis, and a "predicted, not observed" label. It never silently replaces a similarity-derived series |
| Era twins (§1.8) | YES — 64-d rebuilt set, other-decade rule, ≥ 4-season pool, top-5 shipped, whole-file no-self-twin audit rerun (Lane 6 as written) | NO | Era twins are cross-era retrieval by definition. JEPA is era-sensitive by definition. The two are opposites here; JEPA must not generate era twins |
| Live / Pixel Replay (§1.9) | YES for the similarity parts — star-twin chips rebuilt from 64-d v6; archetypes re-clustered IF embedding-derived (Lane 6 as written). Pixel Replay itself: NO CHANGE under Lane 6 | YES — the dynamics home surface | This is where the two models compose, and the composition is clean because the jobs split: similarity supplies the "who is this player like" chips and archetype labels; JEPA supplies next-play prediction and ghost opponents (§2). Replay rendering code does not change to accommodate similarity; it gains a new prediction consumer (see §2) |

**Summary rule:** Atlas, Twenty Questions, Twin Reveal, Twin
Explainer, Era Twins, and Daily Court stay similarity. Pixel Replay
/ Live gain the world model for next-play and ghosts. Nothing else
gains JEPA in this pass, and no surface swaps its similarity model
for JEPA.

## 2. The pixel-game loop (binding — stated verbatim in spirit)

**Real data → world model predicts next latent states → sprites
render those states.**

- **Real data in:** game logs, play-by-play events, shot locations
  when collected (contract §6 shot-position work). These are the
  ONLY training inputs. See `JEPA_DESIGN.md` §1.2 for what exists
  today (5 PBP games, 1 date of shot snapshots — a prototype, not a
  corpus) and §6 for what must land first.
- **World model predicts:** given a game state and an action (play
  call / lineup / matchup), JEPA predicts the next latent state(s).
  Prediction happens in latent space; a decoder/readout translates
  predicted states into renderable terms (next event type, shot
  zone, expected points) for display and eval only.
- **Sprites render:** Pixel Replay / Live sprite figures draw the
  predicted states — positions on the court graphic, figures,
  animation — as presentation of a prediction.
- **NEVER sprite animation positions as training input.** Sprite
  positions are rendering output, not measurement. They are drawing
  choices (where a figure is drawn on a court graphic), not records
  of where a player or a shot actually was. Using them as training
  inputs would train the model on its own output: the model would
  learn to reproduce the renderer, and every "improvement" would be
  self-confirmation. Any pipeline stage that reads sprite positions
  as data fails review. This rule also covers the replay-model
  weights (`assets/replay-model.json`, animation weights, not the
  world model) and any future animation artifact: if it was produced
  by rendering, it is not data.

**Labeling rule (follows from the loop):** anything rendered from a
JEPA prediction must be labeled as predicted, not real, on the
surface itself. A ghost opponent that is not labeled as a ghost is
not a feature; it is a fabrication. The eval sketch
(`JEPA_DESIGN.md` §5.3) checks the label, not just the behavior.

## 3. Rollout order

1. **Similarity first, on the existing v5.** The v5 champion keeps
   serving the twin space today. No surface changes until the v6
   line (or any other candidate to replace v5) passes the contract
   §2d promotion gate on val and frozen test AND the user gives his
   separate word AND Lane 6's recalibration checklist passes in
   full. The switch order in Lane 6 §3 (freeze champion → build all
   re-derived files in one pass → checklist → mirror root →
   `public/` byte-for-byte → cache-busted live verification →
   announce as a model change) is unchanged.
2. **Contrastive later, under its own gate.** The v6 line is a
   candidate to replace the v5 twin space, and only that space. Its
   promotion is judged by §2d and nothing else. A v6 promotion does
   not authorize, accelerate, or imply anything about JEPA, and a
   JEPA result does not authorize, accelerate, or imply anything
   about v6.
3. **JEPA second, as a NEW capability, never as a replacement for
   the twin space.** JEPA's first production appearance, when it
   comes, is additive: next-play prediction and ghosts on Pixel
   Replay / Live, and only after (a) the data dependencies in
   `JEPA_DESIGN.md` §6 land, (b) a training run is separately
   authorized by the user (this design authorizes none), (c) JEPA
   is evaluated under its own eval sketch on held-out games, and
   (d) a production decision names the surface and the labeling.
   JEPA never "promotes" into the twin space, because it never
   competes for it. If anyone proposes a JEPA-powered twin list,
   that proposal has left this architecture and must be re-decided
   from scratch.
4. **Unified-loss variant (if pursued) sits after, not instead of,
   the separate baselines.** Per `DIVISION_OF_LABOR.md` §4.1, the
   2026-10-26 unified design (shared stem, SupCon head + JEPA head
   planning in twin space, "future twins" joint metric) is a
   candidate evaluated against the separate similarity and JEPA
   baselines, and it must not regress either head. It does not
   reorder steps 1–3 and does not merge their gates.

## 4. What the coordinator merges at synthesis time

- Add the dynamics column of §1 to Lane 6's surface map (one new
  column, no edits to Lane 6's existing rows).
- Carry the pixel-game loop of §2 as a binding rule into any
  Pixel Replay / Live design that touches JEPA.
- Carry the rollout order of §3 as the sequencing constraint: no
  JEPA surface work is scheduled ahead of the similarity gate, and
  no JEPA work is ever framed as a twin-space replacement.
- Note the contract conflict reported in `DIVISION_OF_LABOR.md` §8
  (DOWNSTREAM.md §D3 dual-use gate vs. contract §7): D3's wording
  should be marked superseded for this pair at synthesis time, so a
  later reader does not re-fuse the two jobs.
