# TimesFM for Hoops — multivariate forecast of embedding trajectories

Hoops has 12,966 player-seasons, each is a 64-d L2-normalized embedding (MTNN v9.2, 150ep). 
Per-player trajectory = time series in embedding space.

TimesFM-3 is 330M param foundation model:
- Native multivariate: forecast 64 dims jointly, capturing coevolution
- Past covariates: age, team, usage history (only known historically)
- Past-future covariates: known future season number, era, rest, schedule
- Quantiles 0.1-0.9 for uncertainty bands
- Single-pass decode (Contiguous Patch Masking) — no compounding error

License: 3.0 weights = non-commercial only. For prod we use 2.5 (Apache-2.0) or fine-tune our own.
We do both: 3.0 zero-shot spike today, 2.5 LoRA fine-tune for ship.

Game mapping:
- Target: per-player embedding dims over time (z 64-d) OR clustered archetype trajectory
- Past-only cov: previous team performance, injury gap, minutes
- Past-future cov: future season index, era, age (known), league avg pace (forecast known)
- Output: next 1-3 season embeddings, with quantiles -> "Where you stood, how you grew" LeBron interface

Install minimal deps (allowed per user 2026-09-01):
  pip install "timesfm[torch]" torch numpy pandas --quiet

Or for offline zero-deps fallback: use stdlib patcher + honest 503.
