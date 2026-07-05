# Vector Hoops research roadmap — questions → datasets → models → games

Discipline (house rules): statistical models first, neural nets only
where sequence/graph structure earns them; every finding ships with its
method and caveats stated; no claim without the split that supports it.

## The questions and what honestly answers them

| Question | Data needed | Free source | Modeling ladder | Game it becomes |
|---|---|---|---|---|
| Early vs late season (rebounding, anything) | per-game logs w/ dates | nba_api PlayerGameLogs ✔ | monthly splits + mixed-effects for aging/pace | "Fader or Finisher" daily quiz |
| Worst/best midseason move ("trades") | team changes within a season | DERIVABLE from game logs (TEAM_ID switch mid-season) ✔ — true trade metadata is not freely clean; we say "midseason moves" honestly | before/after deltas w/ team-context adjustment | "The Deadline" — guess who cratered/thrived after moving |
| Best/worst teammate | who shared the floor + on-court impact | lineup/on-off via nba_api (heavy) or teammate-season overlap from logs (approx, labeled as such) | fixed-effects teammate lift → graph NN over the share-graph (v3, the MTNN tie-in) | "Chemistry" — pick the teammate who lifted them most |
| Big expectations that failed (non-injury) | draft slot, age, prior z, games played | draft via nba_api ✔; GP≥65 as the honest non-injury PROXY (real injury reasons aren't freely clean — stated caveat) | expectation = f(draft, age, prior-season vector); residuals ranked | "The Fall" — spot the collapse that wasn't injury |
| Player trajectories | season-vector sequences | already built (vectors.json) ✔ | sequence model over 14-dim era-z paths (PyTorch, local, small) | "Career Arc" — order the seasons |

## Build order

1. **VH-101** — game-log dataset: PlayerGameLogs 2015-16→2025-26 first
   (bounded ~250k rows), then backfill to 1996. One parquet/JSONL per
   season in pipeline/data/ (gitignored raw; derived aggregates commit).
2. **VH-102** — midseason-move detector + before/after deltas → "The
   Deadline" mode + a published findings page (method stated).
3. **VH-103** — early/late splits → "Fader or Finisher" daily quiz.
4. **VH-104** — teammate share-graph + lift estimates (approx tier
   first) → "Chemistry" mode; graph-NN embedding = the omni-model's
   sports tower when volume justifies it.
5. **VH-105** — expectation residuals → "The Fall" (caveats on the card).

All local, all free, all PyTorch/numpy — the same laptop-class doctrine
as everything else.
