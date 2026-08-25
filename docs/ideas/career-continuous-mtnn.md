# Career-Continuous MTNN + Trade Utility

## Problem Statement
How might we treat each player as one continuous career entity (not a bag of
disconnected seasons) so Vector Hoops can forecast **next-season production**
and surface **buy-low / sell-high** residuals — without breaking the shipped
season Chimera fingerprint?

## Recommended Direction
**Dual grain.** Keep the 48-d season embedding as the public Chimera/neighbor
contract. Add a **career-state layer** keyed by stable NBA `PLAYER_ID`:
ordered season sequences, gap/team-change tokens, multi-year slopes, and
forecast heads for minutes/GP/rates + surplus-value residual over salary.

## Why continuous careers
Season rows alone confound identity, aging, role change, and injury absence.
Adjacent-season InfoNCE helps, but pairs were name-keyed and lag features are
shallow (`DELTA_NORM` proxies a 3-year slope). Trade utility needs
`E[future contribution] − contract cost`, which is a career-state question.

## Key Assumptions to Validate
- [ ] Player-ID sequences beat name-keyed pairs on next-profile R²
- [ ] Enriched career family lifts season CQS without recall collapse
- [ ] Next-box heads (MPG/GP/rates) beat persistence baselines on held-out players
- [ ] Surplus residual correlates with known deadline winners (descriptive, not causal)

## MVP Scope
1. `build_career_context.py` — career family enrichment + `career_sequences.npz`
2. Fix `train_mtnn` adjacent pairs to use `player_id` (not display name)
3. Wire `CAREER_SLOPE_3Y` as real career_slope target; add next-box + surplus via career trainer
4. Lightweight `train_career_mtnn.py` (GRU over season embs → next box)
5. Retrain leak-free; promote only if CQS clears 81.82

## Dataset Gap Review (priority)
| Need | Status | Action |
|---|---|---|
| Stable career ID | **Have** — `train_matrix.player_id` (2297 careers) | Use everywhere |
| Season embeddings | Have | Keep Chimera |
| Multi-year slopes / gaps | Thin (`YEAR_IN_LEAGUE`, `DELTA_NORM`) | Enrich |
| Next style profile | Have (`next_profile`) | Keep + improve |
| Next minutes / GP / rates | Missing as heads | Add next-box |
| Salary / cap % | Have (`salary_market`) | Surplus residual |
| Contract years / options | **Missing** | Document; stub from salary only |
| BBRef WS48/BPM | Stub (`fetch_bbref_advanced` NotImplemented) | Defer |
| Injuries | **Proxy built** — `availability.json` (GP_PCT, miss streaks/spells) | Diagnosis-level data still absent |
| Transactions | Partial (`deadline_analysis`) | Use team-change flag |
| Lineup / on-off | Missing | Out of v1 |
| Game ratings | Fixture only | Gated |

## Not Doing (v1)
- Replacing season Chimera with a career-only embed
- Shipping categorical buy/sell advice without calibrated residual
- BBRef scrape (blocked) or paid tracking APIs
- Full contract-cap modeling without source data

## Artifacts
| Path | Role |
|---|---|
| `pipeline/build_career_context.py` | Enriched career family JSON + sequences NPZ |
| `pipeline/train_career_mtnn.py` | Temporal career trainer (next-box + surplus) |
| `pipeline/data/career_arc.json` | Integrate source (career family) |
| `pipeline/data/career_sequences.npz` | Sequence bundle + next MPG/GP labels |
| `docs/ideas/career-continuous-mtnn.md` | This spec |

## Success
- Next-box test R² > persistence on MPG and primary rates
- Season CQS ≥ 81.32 with career enrichment (promote if ≥ 81.82)
- Surplus residual ranked list export for active roster (research asset)

## Measured (2026-07-16)
| Gate | Result |
|---|---|
| PLAYER_ID adjacent pairs | **9652** (was name-keyed) |
| Career family cols | **12** (was 5); `CAREER_SLOPE_3Y` head R² test **0.924** |
| Season select 150ep seed21 exclude-opp | **CQS 80.50** — recall 0.871 / purity 0.799 — **no promote** (bar 81.82; champion stays 81.32) |
| Prior no-opp 150ep (no enrich) | CQS **80.94** — enrich slightly worse on composite |
| Honest MPG/GP | `build_min_gp.py` → `min_gp.json` (14,569 rows; gamelogs 2015-16+ regular-season GAME_ID 002 only, PerGame API earlier). Root cause: `vectors.json` mpg is **minutes/100 poss** (Base dash fetched Per100Possessions) |
| CareerGRU next MPG (honest labels) | test R² **0.6464** vs persistence **0.5974**; MAE 3.80 vs 4.03 — **beats persistence** |
| CareerGRU next GP | test R² −0.096 vs persistence −0.236 — beats persistence but GP stays noisy (injuries unmodeled) |
| Availability layer (`build_availability.py`) | GP_PCT vs primary-team schedule (all 30 seasons), longest miss-streak + ≥3-game spells (gamelogs era, 4,865 rows). Career family → **15 cols** (`CAREER_GP_PCT` / `CAREER_MISS_STREAK` / `CAREER_AVAIL_3Y`; matrix 138 feats) |
| CareerGRU + availability aux (d_in 52) | test MPG R² **0.6728**; **GP R² +0.1001** (was −0.096; persistence −0.236) — first positive GP head, injury proxy works |
| Surplus board | `assets/career_surplus.json` from GRU next-box value − salary z (`train_career_mtnn.py`); transparent fallback `export_career_surplus.py` |

**Ship doctrine unchanged:** keep `mtnn_best.champion_v5.pt` / CQS 81.32. Career continuity is research infrastructure (sequences, pairs, slopes, surplus) until a select clears 81.82.
