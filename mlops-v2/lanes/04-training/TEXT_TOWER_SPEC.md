# Text Tower Spec — Contract for the Training Script (DESIGN ONLY)

Status: DRAFT SPEC. No training script is edited by this file. This spec
states what the training script MUST expose and accept before any
text-tower run. The training lane implements it. This specialist does
not edit `train_mtnn_v7.py` or `TRAINING_NOTES.md`.

Companion design: `lanes/01-data-collection/TEXT_EMBEDDING_DESIGN.md`.
That document governs evaluation (forecast lift, per the 2026-10-26
22:32 correction). This spec governs only the mechanical contract:
inputs, shapes, masks, dropout, width accounting, and flags.

## 1. Input artifact

### 1.1 Artifact identity (PROPOSED)

- Proposed filename: `data/text_rollups.npz` (versioned by build date
  and content hash in the run report; the exact path is set by the
  training lane, but the content schema below is binding).
- The artifact is built by the data-collection path, not by the
  training script. The training script reads it. It never rebuilds
  rollups from raw PBP at train time.

### 1.2 Required arrays and fields

| Field | Type / shape | Meaning |
|---|---|---|
| `person_id` | string array, length N | Identity key. Never name alone. |
| `season` | string array, length N, `YYYY-YY` | Season the rollup describes. Part of the join key. |
| `rollup_768` | float32, N × 768 | Count-weighted mean of EmbeddingGemma template embeddings, L2-normalized per row (see §2). Zeros for masked rows. |
| `mask` | bool (or 0/1), length N | 1 only when the player-season meets the floor and coverage rules (§3). 0 otherwise. |
| `n_events` | int, length N | Primary-actor PBP event count for the player-season. The audit trail for the floor. |
| `template_dict_sha256` | string | Hash of the template dictionary used to build the rollups. |
| `source_pbp_sha256` | string (or list) | Hash(es) of the source PBP files. |
| `build_season_key_check` | string | Builder attestation that every event's game season equals the rollup season. The training script verifies the season key on join (see §5). |

Rows: one row per (`person_id`, season) that appears in the stat
matrix. Player-seasons with no PBP coverage still appear, with
`mask = 0`, `rollup_768 = zeros`, and `n_events = 0`. Absence from the
artifact is NOT the same as masking. If a stat-matrix row has no
artifact row at all, the script fails loud (see §5). Silent
zero-filling for missing artifact rows is banned.

### 1.3 Provenance the run report must record

Every run with the text tower on records, in its run report JSON:
`text_rollup_sha256`, `template_dict_sha256`, `source_pbp_sha256`,
`text_mask_rate_overall`, `text_mask_rate_per_era` (or per season
group), `text_floor` (the event floor used), and `text_width` (the
projected width used). A run report without these fields is incomplete
for a text-on run.

## 2. Dimensionality and normalization

- Input dimensionality: 768 (Stage 1 rollup). Fixed by the embedder
  choice. A switch to the 128-d Matryoshka prefix is a different
  artifact and a different run configuration, not a silent substitution.
- Projection (PROPOSED): linear map 768 → 32, followed by LayerNorm,
  inside the model. Tuning set {16, 32, 64}, default 32, tuned on
  validation folds only, never on the frozen test.
- Rollup normalization: per-row L2 normalization, applied at build
  time (see §1.2). The training script must NOT re-normalize by
  within-season z-scoring: text embedding geometry is cosine geometry,
  and within-season z-scoring would distort it. If the training lane
  wants a within-season centering variant, it is a separate, named
  experiment with its own run-report flag, not a default.
- Projection output normalization: LayerNorm after the linear map
  (PROPOSED). The projection output then joins the concatenation as
  specified in §4.

## 3. Mask rule

Mask `m` for a player-season is 1 if and only if ALL of these hold:

- `n_events >= 100` (PROPOSED floor; sensitivity values 50 and 200
  are reported as separate runs, not as silent alternatives);
- the season has PBP coverage in the delivered collection;
- the player-season appears in the PBP index.

Otherwise `m = 0`, the rollup vector is zeros, and the model receives
the mask bit. No imputation. No borrowing from adjacent seasons.
No mean-fill. The mask bit itself is input: the model is allowed to
learn that masked rows differ, exactly as it does for masked stat
families (for example, tracking pre-2013, form pre-2015).

The script must log the mask rate overall and per era/season group on
every text-on run. A run that does not log mask rates is incomplete.

## 4. How the tower joins the concatenation

- Existing convention (contract §0): each family joins as
  `cat([x·m, m])`, where `m ∈ {0, 1}`.
- Text tower join: `cat([proj·m, m])`, where `proj` is the 32-d
  projected text vector (PROPOSED width) and `m` is the text mask.
  The text tower is appended AFTER the existing stat towers, so that
  removing it restores the exact stats-only input.
- Columns added by the text tower: projected width + 1 mask bit.
  At the default width: 32 + 1 = 33 columns.
- Total input width accounting (binding): total = pinned stat width
  + text columns (when on) + 0 (when off). The script must compute
  total width from the pinned-width manifest and the text flag. It
  must never hardcode a total width.

## 5. Fail-loud rules

The training script MUST fail with a non-zero exit and an explicit
message in each of these cases. It must never silently degrade:

1. `--text-tower on` and the rollup artifact file is absent.
2. `--text-tower on` and any stat-matrix row has no artifact row.
3. `--text-tower on` and any joined rollup season does not equal the
   forecast input season for that sample (season-boundary violation).
   The join key is (`person_id`, season). A `person_id`-only join is
   a bug.
4. `--text-tower on` and the artifact's `rollup_768` width is not 768
   (or the width does not match the projection's declared input width).
5. Any total-width mismatch: the computed input width does not equal
   the model's declared input width.

Failing loud on case 3 is the mechanical enforcement of the design's
season-boundary masking rule. A script that silently drops mismatched
rows instead of failing would hide leakage.

## 6. Tower dropout

- The text tower is treated as ONE family for tower dropout. It is
  dropped as a unit (whole 32-d projection plus mask handling per the
  training lane's existing dropout convention for families). It is
  never dropped dimension by dimension.
- Default dropout rate: the same tunable family-dropout rate used for
  stat families (tuned on validation only). A separate override flag
  `--text-dropout-rate` is PROPOSED, so that the panel or the training
  lane can test whether the text tower needs a different dropout rate
  from the stat families. If the override is implemented, its value
  (or "same-as-families") is recorded in every run report.
- Dropout logging: the script logs per-family dropout on every run,
  including the text tower as its own line, so that the eval lane's
  ablations line up with training-time dropout. A run report that
  omits the text tower's dropout state is incomplete for a text-on run.
- Dropout vs ablation: tower dropout during training is NOT the same
  as the on/off ablation. The on/off ablation (§7) removes the tower
  from the model entirely. Dropout randomly masks it during training
  while keeping it in the architecture. Both are reported. Neither
  substitutes for the other.

## 7. Ablation flag (REQUIRED before any text-tower run)

The training script MUST expose:

```
--text-tower on/off
```

- Default: `off`. Baseline (stats-only) runs use the default. No
  text-tower run may rely on a default of on.
- `off`: the model input is exactly the stats-only input. The rollup
  artifact is not read. No text columns are added. Total width is the
  pinned stat width.
- `on`: the model input adds the text tower per §4. The artifact is
  required (see §5). Total width is the pinned stat width + 33 at
  the default projected width.
- The flag value is recorded in every run report, for both on and off
  runs, so that a stats-only baseline is distinguishable from a
  text-on run that happened to mask every row.

No text-tower run is valid before this flag exists. A run that
achieves a text effect through any other mechanism (for example, by
folding text features into a stat family) is not a text-tower run and
must not be reported as one.

## 8. Width interaction: the pinned-width decision must absorb the tower

The stat width is disputed: 73 (verified base chain) vs 143 (HEAD
contract, unverified, gamelog-blocked) vs 130 (champion export) vs
120 (spec/contract, now known wrong). This spec does NOT resolve that
dispute and does NOT re-pin anything. It states only the interaction:

- The text tower ADDS width. It does not change the pinned stat width.
- At the default projected width, text-on total = pinned width + 33.
  Illustrative only: pinned 73 → text-on 106; pinned 143 → text-on 176.
- The pinned-width decision from the overhaul lane must state, in its
  width accounting, both the stats-only width and the text-on width.
  A width decision that quotes one number without stating whether
  text is on or off is incomplete.
- The training script's loader must accept the pinned width from the
  feature manifest, not from a hardcoded constant. This is the same
  must-fix item recorded in contract §9 P4(a) for the existing
  120-column pin: the loader must not hardcode 73 either. The text
  tower's +33 is computed on top of the manifest width at runtime.
- The existing contract §9 P4 must-fix items (b)–(e) (continuity
  naming, family-count table re-derivation, train twin file gating,
  honors semantics) are unaffected by this spec and remain the
  training lane's responsibility. This spec adds no new must-fix item
  beyond the flag, the fail-loud rules, and the width accounting above.

## 9. Evaluation hooks (what the script must emit for the eval lane)

For every text-on run, the script must emit (or make available to the
eval lane) the inputs the design's comparison protocol needs:

- Per-fold, per-stat MAE and R² for the 14-d next-season forecast,
  for both the text-on run and the stats-only run with the same head
  and seed. (The head itself belongs to the training lane under the
  prediction-first rethink; this spec requires only that the two runs
  be comparable.)
- The new-player slice metrics separately from the headline metrics,
  using the fold manifest's slice definition. The script must not
  blend the slice into the headline.
- The mask rates from §3, the flag value from §7, and the provenance
  fields from §1.3, in the run report.

Twin agreement and future-twins numbers, if emitted, are DIAGNOSTICS
only under the 22:32 user direction. GOVERNANCE NOTE: that direction
is user-directed, pending 12-seat panel ratification (see the design
document §0.1 and §6.4, where both diagnostics are fully specified so
the design remains usable under either ruling). They must be labeled
as diagnostics in the run report and must never be presented as the
text tower's gate under the current user direction, nor as a ratified
program-wide decision.

## 10. Open questions for the training lane

- Q-T1. Where does the projection live: inside the forecast model
  (preferred, end-to-end training) or as a frozen pre-processing step?
  This spec assumes inside the model. A frozen variant is a separate,
  named experiment.
- Q-T2. Does the forecast head take the concatenated towers directly,
  or does it take a fused representation first? The text join in §4
  assumes concatenation. If the head fuses towers first, the spec's
  join description must be updated by the training lane, not silently
  reinterpreted.
- Q-T3. What is the exact forecast head and loss for next-season
  14-d prediction? That decision belongs to the prediction-first
  training design. This spec requires only comparability between
  text-on and stats-only runs (same head, same seed protocol, same
  budget).
- Q-T4. Is `--text-dropout-rate` implemented as a separate flag, or
  does the text tower share the family rate with no override? Either
  is acceptable if stated in the run report. Silence is not acceptable.

## 11. What this spec does NOT authorize

- No training run. No embedding run. No package install. No edit to
  `train_mtnn_v7.py` or `TRAINING_NOTES.md`. No production write. No
  merge. No commit.
- No claim that the text tower lifts forecasting. The flag, the
  fail-loud rules, and the width accounting exist so that a future
  run can test the claim cleanly. They are not evidence for the claim.
