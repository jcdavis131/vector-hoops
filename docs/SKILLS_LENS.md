# Skills Lens — player→skill tagging + MTNN skill towers

> **Status:** v1 shipped (2026-07-06) · **Owner:** AI/ML research lane
> **Doctrine:** era-honest, mask-honest, transparent-first. Skill grades are
> deterministic functions of already-shipped era-z data; the MTNN skill
> towers are the research lane that must beat the transparent baseline
> before any promotion (same contract as `train_mtnn.py` v3).

The Skills Lens answers one question the archetype map cannot: **what is
this player-season actually good at, stated in basketball words?** Eight
auto-named archetypes describe *shape*; twelve graded skills describe
*craft*. Every one of the 12,392 charted player-seasons gets a 0–99 grade
per skill, era-normalized, plus named badges for elite grades.

---

## 1. Taxonomy (v1 — 12 skills over the 14-dim contract)

All inputs are the shipped era-z per-100 features in `assets/vectors.json`
(z-scored within season → cross-era comparable by construction). Each
skill is a fixed linear composite of those z's, then converted to a
percentile grade **within its season pool** so every era has the same
grade distribution (a 90 in 1997 means the same thing as a 90 in 2026).

| Key | Skill | Badge (grade ≥ 90) | Composite (era-z weights) |
|-----|-------|--------------------|---------------------------|
| `scoring` | Scoring Volume | Bucket Getter | 0.70·PTS + 0.30·FGA |
| `shooting` | Perimeter Shooting | Sniper | 0.55·FG3A + 0.45·FG3_PCT |
| `finishing` | Interior Finishing | Paint Presence | 0.45·FG_PCT + 0.40·FTA − 0.15·FG3A |
| `ft` | Free-Throw Shooting | Marksman | 1.00·FT_PCT |
| `playmaking` | Playmaking | Floor General | 0.90·AST − 0.10·TOV |
| `security` | Ball Security | Safe Hands | 0.65·load − 0.35·TOV, load = (FGA+AST+FTA)/3 |
| `oreb` | Offensive Glass | Glass Crasher | 1.00·OREB |
| `dreb` | Defensive Glass | Board Vacuum | 1.00·DREB |
| `hands` | Ball Pressure | Pickpocket | 1.00·STL |
| `rim` | Rim Protection | Rim Protector | 0.85·BLK + 0.15·DREB |
| `efficiency` | Scoring Efficiency | Efficient Engine | 0.45·FG_PCT + 0.30·FG3_PCT + 0.25·FT_PCT |
| `impact` | Two-Way Impact | Tide Turner | 0.80·PLUS_MINUS + 0.20·PTS |

Design notes:

- **Volume-qualified shooting.** `shooting` weights attempts slightly over
  percentage so a 1-of-2 season can't grade as a Sniper; empirical-Bayes
  shrinkage of the percentages already happened upstream in
  `build_vectors.py`.
- **Ties broken by volume.** When two seasons share the same composite,
  the percentile rank (and every leaderboard) breaks the tie by a
  usage/volume proxy (era-z FGA + FTA + AST), so the player who carried
  more load always outranks a same-score bystander. Wide skills tie-break
  by their own tracked volume (play frequency / total hustle events).
- **Ball security is load-relative.** Raw low-TOV rewards bystanders;
  `security` credits players who carry usage without bleeding turnovers.
- **No plus-minus laundering.** `impact` is NBA.com on-court PLUS_MINUS
  (with a small stated PTS stabilizer against garbage-time per-100
  spikes), never conflated with BPM/RAPM (see `methods.html`).
- **Badges** fire at grade ≥ 90 ("gold" at ≥ 97). Derived client-side
  from grades — not stored.

Deliberately out of v1 (need wide-matrix or new sources — see §4):
post-play, off-ball movement, screening, switchability, transition,
foul drawing as its own axis (PFD lives only in the wide cache).

## 2. Artifacts & contracts

```
pipeline/build_skills.py           deterministic builder (numpy only)
  → assets/skills.json             grades[12] per player, ORDER-ALIGNED with
                                   assets/vectors.json players[] (game contract
                                   untouched); + skill keys/labels/badges
  → assets/skill_probe.json        12×14 weight matrix + per-skill pooled
                                   all-era quantile knots (101 pts) → client
                                   tags ANY 14-dim era-z vector (e.g. the
                                   fused daily chimera) vs history
  → pipeline/data/skill_labels.npz training targets (grades/100, keyed by
                                   name+season) for the MTNN skill towers
pipeline/test_skills.py            invariant gates (below)
```

`assets/vectors.json` stays frozen — the Skills Lens is additive.

## 3. MTNN v4 — players→skills towers

`train_mtnn.py` grows a **skill-tower bank**: one mini-tower per skill
(shared fused embedding → Linear→GELU→Linear→scalar), trained jointly
with the v3 tasks (InfoNCE, archetype, position, profile, salary) under a
masked-MSE skills loss. This makes the embedding *skill-aware*: two
player-seasons close in embedding space should also be close in craft.

Reported in `mtnn_report.json` per skill: held-out R² and MAE (season
splits: train ≤2021-22, val 2022-24, test 2024+), plus
`skill_neighbor_consistency` — mean |grade(self) − grade(top-10 NN)|
across skills, MTNN vs transparent-14d baseline.

**Promotion gate (unchanged doctrine):** the game keeps transparent
grades from `build_skills.py`. Embedding-derived skills replace nothing
until v4 beats the S2–S5 gates in `FEATURE_ENGINEERING_SOP.md` *and*
mean held-out skill R² ≥ 0.85.

**v1 training result (2026-07-06, bootstrap matrix, 40 ep CPU):**
held-out recall@10 val/test **0.590 / 0.614** vs transparent baseline
0.322 / 0.290 (S5 pass); archetype top-1 **0.823** (gate ≥ 0.55);
cross-era purity@20 **0.651** (S4 floor 0.63); skill towers mean
held-out R² **0.847 val / 0.842 test** — just under the 0.85 promotion
bar, so the game ships transparent grades (as designed). Neighbor
consistency: transparent 7.41 pts vs MTNN 10.07 pts (transparent wins —
grades are native to that space; reported, not spun). Weakest towers:
`security` (R² 0.65 test) and `efficiency` (0.67) — percentile-tail
nonlinearity; candidates for wide-matrix inputs.

## 4. Continuously growing dataset

The dataset grows on three cadences, all resume-from-cache:

1. **In-season refresh (weekly during Oct–Jun):**
   `python pipeline/update_dataset.py` — refreshes the current season's
   stats.nba.com caches when the network allows, rebuilds
   `assets/vectors.json` (via `build_vectors.py --offline` fallback),
   rebuilds skills, and appends a row to
   `pipeline/data/dataset_ledger.json` (row count, season coverage,
   grade checksum) so growth is auditable run-over-run.
2. **New season rollover (annual):** new `base_YYYY-YY.json` cache season
   → builder picks it up with zero code changes.
3. **New sources widen the taxonomy (see `DATA_SOURCES_DEEP.md`):**
   - hustle stats (2015-16+, `leaguehustlestatsplayer`) → screening,
     charges, deflections → `motor` skill
   - tracking (2013-14+, already a tower family in the wide matrix) →
     drives, pull-ups, paint touches → off-dribble vs off-ball split
   - synergy play-types (2015-16+) → post-ups, cuts, transition
   - BBRef advanced (Track A) → foul-drawing (PFD), usage-true security

   Each lands as a **masked skill** (graded only where coverage exists),
   same mask doctrine as the wide matrix.

stats.nba.com blocks most datacenter IPs, so scheduled cloud runs treat
fetch failure as expected: they rebuild/validate from cache and only
commit when artifacts actually changed. Fresh pulls happen on an
operator machine per the rate-limit policy in `DATA_SOURCES_DEEP.md`.

## 5. Test gates (`pipeline/test_skills.py`)

| Gate | Pass criterion |
|------|----------------|
| Alignment | `len(skills.grades) == len(vectors.players)`, same order |
| Bounds | every grade ∈ [0, 99] integer |
| Era honesty | per-season mean grade in [42, 58] for every skill × season |
| Spread | per-season grade std ≥ 20 (grades discriminate everywhere) |
| Probe round-trip | interp within 1 pt of exact pooled percentile; probe-vs-season-grade corr ≥ 0.98 per skill |
| Face validity | curated spot checks (e.g. Curry 2015-16 shooting ≥ 95; Rodman-class OREB seasons ≥ 95; Stockton-class playmaking ≥ 95) |

## 6. Game & site surfaces (v1)

- **`skills.html` — the Skills Lens.** Search any player, see the
  12-skill profile per season with badges; per-skill era-honest
  leaderboards; deep-links (`/skills?p=slug`).
- **Chimera reveal card** shows each donor season's badges, and the
  *fused* chimera vector is tagged live through `skill_probe.json` —
  the blend you guessed had a skill profile all along.
- **`methods.html`** documents composites, percentile grading, and the
  PLUS_MINUS caveat.
- Wiki AUTO-block badges: deferred until next `build_wiki.py` regen
  (2,293-file diff) — generator hook noted in §7.

## 7. Follow-ups

- [x] Pedigree tower (Track H, 2026-07-06): draft slot / entry
      expectations / team-fit prior + `pedigree_expectation` aux head —
      see `DATA_SOURCES_DEEP.md` Track H; dormant until one operator run
      of `fetch_draft_history.py`
- [x] Playoffs tower (Track I, 2026-07-06): postseason as a distinct
      regime — playoff-vs-regular-season deltas (minutes, usage, scoring,
      efficiency) + team wins/rounds + `playoff_riser` aux head, plus a
      transparent Playoff Lens on `skills.html`; dormant until one
      operator run of `fetch_playoffs.py`
- [x] Wide-matrix skills (Track J + K, 2026-07-06): post / transition /
      motor, plus tracking proxies gravity + navigation (Track K), as
      masked skills (2015-16+) — `build_wide_skills.py` →
      `assets/skills_wide.json`, MTNN skill towers with a per-skill mask
      matrix (17 = 12 core + 5 wide), Skills Lens bars + badges; dormant
      until `fetch_wide_skills.py`
- [x] Steals of the Draft (2026-07-06): draft expectation vs actual peak
      skill grade, steals/busts boards on `skills.html`; dormant until
      `assets/pedigree.json` (from the Track H operator fetch)
- [ ] `build_wiki.py`: emit badge line in AUTO block on next regen
- [ ] Skill-based daily mode ("Badge Hunt": name the player from badges)
- [ ] MTNN skill towers vs transparent probe ablation in `feature_stress.py`
