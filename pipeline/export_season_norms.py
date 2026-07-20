"""Per-season league mean/SD so the site can show REAL numbers, not z-scores.

Why
---
build_vectors z-scores every feature within its own season and then discards the
mu/sd it used, so nothing downstream can invert them. The /model next-season
panel therefore printed things like "0.42z", which is not a prediction any
visitor can read. A z-score is only meaningful next to the league it was scored
against; ship that league.

  real = clip(z, -4, 4) * sd[season][feature] + mu[season][feature]

Units are **Per100Possessions** (build_vectors fetches Base with
per_mode_detailed="Per100Possessions"). Not per game. Saying "18 points" when
the model means "18 points per 100 possessions" is its own lie.

What is and is not invertible
-----------------------------
The 11 counting/rate features pass through to the z-scorer untouched, so
mu/sd recomputed over the charted pool reproduce the shipped z EXACTLY (max
|error| 5e-4, i.e. the rounding in vectors.json) once the same +/-4 clip is
applied.

FG3_PCT / FG_PCT / FT_PCT are empirical-Bayes shrunk toward the league mean by
attempts BEFORE z-scoring, so the raw cache value is not the number that was
normalized. Inverting them would print a figure that never existed in the
model. They are excluded, and the UI must show a percentile for them instead.

Every (feature, season) pair is round-trip verified here and again by
verify_accuracy V15. A pair that fails is dropped, never shipped.

Run: python pipeline/export_season_norms.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from name_utils import canonical_name

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
VECTORS = ROOT / "assets" / "vectors.json"
OUT = ROOT / "assets" / "season_norms.json"

# Shrunk before z-scoring -> the raw value is not what was normalized.
NOT_INVERTIBLE = {"FG3_PCT", "FG_PCT", "FT_PCT"}
CLIP = 4.0
TOL = 0.02  # z units; the stored 'v' is rounded, so exact means <~5e-4


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    feats: list[str] = vec["features"]
    by_season: dict[str, list[dict]] = {}
    for p in vec["players"]:
        by_season.setdefault(p["season"], []).append(p)

    seasons: dict[str, dict] = {}
    dropped: list[str] = []

    for season in sorted(by_season):
        cache = CACHE / f"dashbase_{season}.json"
        if not cache.exists():
            dropped.append(f"{season}: no dashbase cache")
            continue
        raw = json.loads(cache.read_text(encoding="utf-8"))
        rawmap = {canonical_name(r["PLAYER_NAME"]): r for r in raw}

        rows = by_season[season]
        names = [canonical_name(p["name"]) for p in rows]
        keep = [i for i, n in enumerate(names) if n in rawmap]
        if len(keep) < 0.9 * len(rows):
            dropped.append(f"{season}: only {len(keep)}/{len(rows)} matched raw cache")
            continue

        X = np.array(
            [[rawmap[names[i]].get(f, np.nan) for f in feats] for i in keep],
            dtype=float,
        )
        Z = np.array([rows[i]["v"] for i in keep], dtype=float)

        mu = np.nanmean(X, axis=0)
        sd = np.nanstd(X, axis=0)
        sd[(sd == 0) | np.isnan(sd)] = 1.0
        mu = np.where(np.isnan(mu), 0.0, mu)

        # Reproduce build_vectors exactly: z-score, then clip.
        Zhat = np.clip((X - mu) / sd, -CLIP, CLIP)

        ok: dict[str, dict] = {}
        for j, f in enumerate(feats):
            if f in NOT_INVERTIBLE:
                continue
            err = float(np.nanmax(np.abs(Zhat[:, j] - Z[:, j])))
            if err <= TOL:
                ok[f] = {"mu": round(float(mu[j]), 4), "sd": round(float(sd[j]), 4)}
            else:
                dropped.append(f"{season}/{f}: round-trip err {err:.4f} > {TOL}")
        if ok:
            seasons[season] = {"n": len(keep), "features": ok}

    doc = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "perMode": "Per100Possessions",
        "clip": CLIP,
        "inverse": "real = clip(z, -4, 4) * sd + mu   (per season, per feature)",
        "notInvertible": sorted(NOT_INVERTIBLE),
        "notInvertibleReason": (
            "empirical-Bayes shrunk toward the league mean by attempts before "
            "z-scoring, so the raw value is not the number that was normalized; "
            "show a percentile instead of a fabricated rate"
        ),
        "verified": f"round-trip |z_hat - z| <= {TOL} for every shipped pair",
        "seasons": seasons,
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")

    n_pairs = sum(len(s["features"]) for s in seasons.values())
    print(
        f"season norms: {len(seasons)} seasons, {n_pairs} verified (season,feature) pairs"
    )
    print(f"  excluded (shrunk): {sorted(NOT_INVERTIBLE)}")
    if dropped:
        print(f"  dropped {len(dropped)}:")
        for d in dropped[:6]:
            print(f"    {d}")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name} ({kb:.0f} KB)")


if __name__ == "__main__":
    main()
