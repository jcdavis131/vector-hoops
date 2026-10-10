"""Orthogonal Procrustes drift analysis: how the GEOMETRY of the league
changed, season over season. Method (stated in the artifact):

- Correspondence points: players appearing in BOTH seasons of a pair
  (their two era-z vectors are natural paired samples).
- For each consecutive pair, solve min ||X Q - Y||_F over orthogonal Q
  (SVD closed form; centering applied; no scaling — z-spaces are
  already variance-normalized, so rotation IS the drift signal).
- Report per pair: rotation magnitude (mean principal angle of Q from
  identity, degrees), alignment residual (normalized Frobenius), the
  two feature directions most rotated, and shared-player count.
- Also: cumulative chained rotations 1996-97 -> each season, enabling
  any-era-to-any-era mapping (exported for the era-twin upgrade).

Output: assets/drift.json
"""

from __future__ import annotations

import itertools
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
CACHE = HERE / "cache"

# +1 = league generally better when higher; -1 = better when lower; 0 = neutral / frame-only
FEATURE_VALENCE: dict[str, int] = {
    "PTS": 0,
    "AST": 1,
    "OREB": 0,
    "DREB": 0,
    "STL": 1,
    "BLK": 0,
    "TOV": -1,
    "FG3A": 1,
    "FGA": 0,
    "FTA": 0,
    "FG3_PCT": 1,
    "FG_PCT": 1,
    "FT_PCT": 1,
    "PLUS_MINUS": 0,
}

PCT_FEATURES = frozenset({"FG3_PCT", "FG_PCT", "FT_PCT"})
MEANINGFUL_DRIFT = 0.025


def procrustes(X: np.ndarray, Y: np.ndarray) -> tuple[np.ndarray, float]:
    """Orthogonal Procrustes: Q minimizing ||XQ - Y||_F. Returns (Q,
    normalized residual)."""
    Xc = X - X.mean(0)
    Yc = Y - Y.mean(0)
    U, _, Vt = np.linalg.svd(Xc.T @ Yc)
    Q = U @ Vt
    resid = np.linalg.norm(Xc @ Q - Yc) / (np.linalg.norm(Yc) or 1.0)
    return Q, float(resid)


def rotation_degrees(Q: np.ndarray) -> float:
    """Mean principal angle of Q vs identity, in degrees."""
    eig = np.linalg.eigvals(Q)
    ang = np.abs(np.angle(eig))
    return float(np.degrees(ang.mean()))


def most_rotated_features(Q: np.ndarray, features: list[str], k: int = 2):
    """Features whose axis direction moved most under Q (1 - |Q[i,i]|
    as a simple, honest proxy for how much that axis left itself)."""
    drift = 1 - np.abs(np.diag(Q))
    idx = np.argsort(-drift)[:k]
    return [{"feature": features[i], "axisDrift": round(float(drift[i]), 3)} for i in idx]


def all_axis_drifts(Q: np.ndarray, features: list[str]) -> list[dict]:
    drift = 1 - np.abs(np.diag(Q))
    rows = [{"feature": features[i], "axisDrift": round(float(drift[i]), 3)} for i in range(len(features))]
    rows.sort(key=lambda r: -r["axisDrift"])
    return rows


def load_league_rates(seasons: list[str], features: list[str]) -> dict[str, dict[str, float]]:
    """Minutes-weighted league per-100 (or rate) averages from dash cache."""
    rates: dict[str, dict[str, float]] = {}
    for season in seasons:
        rows = None
        for tag in ("dashbase", "base"):
            path = CACHE / f"{tag}_{season}.json"
            if path.exists():
                rows = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(rows, dict):
                    rows = list(rows.values())
                break
        if not rows:
            continue
        weights = []
        sums = dict.fromkeys(features, 0.0)
        wtot = 0.0
        for r in rows:
            gp = float(r.get("GP") or 0)
            mpg = float(r.get("MIN") or 0)
            w = gp * mpg
            if w <= 0:
                continue
            ok = True
            vals = {}
            for f in features:
                v = r.get(f)
                if v is None or (isinstance(v, float) and math.isnan(v)):
                    ok = False
                    break
                vals[f] = float(v)
            if not ok:
                continue
            weights.append(w)
            wtot += w
            for f in features:
                sums[f] += vals[f] * w
        if wtot <= 0:
            continue
        rates[season] = {f: round(sums[f] / wtot, 4) for f in features}
    return rates


def prior_league_average(
    league_rates: dict[str, dict[str, float]],
    feature: str,
    to_season: str,
) -> float | None:
    prior = [
        league_rates[s][feature] for s in sorted(league_rates) if s < to_season and feature in league_rates.get(s, {})
    ]
    if not prior:
        return None
    return sum(prior) / len(prior)


def format_rate(feature: str, value: float) -> str:
    if feature in PCT_FEATURES:
        return f"{value * 100:.1f}%"
    if feature == "PLUS_MINUS":
        return f"{value:+.2f}"
    return f"{value:.1f}"


def evaluate_level(
    feature: str,
    current: float,
    prior: float,
) -> tuple[str, str, float]:
    """Return (direction, quality, deltaPct)."""
    if prior == 0:
        delta = 0.0
    elif feature in PCT_FEATURES:
        delta = (current - prior) / (abs(prior) or 1e-9)
    elif feature == "PLUS_MINUS":
        delta = current - prior
    else:
        delta = (current - prior) / (abs(prior) or 1e-9)

    above = current > prior
    valence = FEATURE_VALENCE.get(feature, 0)
    if valence > 0:
        quality = "favorable" if above else "unfavorable"
    elif valence < 0:
        quality = "favorable" if not above else "unfavorable"
    else:
        quality = "neutral"

    direction = "above" if above else "below" if current < prior else "inline"
    if feature == "PLUS_MINUS":
        return direction, "unreliable", round(delta, 3)
    return direction, quality, round(delta, 4)


def craft_stat_narrative(
    feature: str,
    axis_drift: float,
    to_season: str,
    current: float,
    prior: float,
    direction: str,
    quality: str,
    delta_pct: float,
) -> str:
    label = FEATURE_LABELS.get(feature, feature)
    cur_s = format_rate(feature, current)
    prior_s = format_rate(feature, prior)
    drift_word = "sharply" if axis_drift >= 0.06 else "noticeably" if axis_drift >= 0.035 else "somewhat"
    level_note = abs(delta_pct) >= 0.04

    if feature == "PLUS_MINUS":
        return (
            f"{label.title()} ranks {drift_word} rotated (frame drift {axis_drift:.2f}) "
            f"while the league averaged {cur_s} vs {prior_s} before this era — "
            "raw plus-minus is an especially poor year-over-year ruler here."
        )

    qual_phrase = {
        "favorable": "a plus for how the league played",
        "unfavorable": "a headwind for efficiency",
        "neutral": "a stylistic shift more than a quality swing",
    }[quality]

    if not level_note:
        return (
            f"{label.title()} {drift_word} changed how players sort ({axis_drift:.2f} axis drift) "
            f"even though league volume ({cur_s}) sat near the pre-{to_season} norm ({prior_s}) — "
            "mostly a ranking-frame move, not a league-wide level jump."
        )

    dir_word = "above" if direction == "above" else "below"
    pct = abs(delta_pct) * 100
    return (
        f"{label.title()} {drift_word} rotated ({axis_drift:.2f}) while the league ran "
        f"{dir_word} its pre-{to_season} average ({cur_s} vs {prior_s}, "
        f"{'+' if direction == 'above' else '-'}{pct:.0f}% vs prior seasons) — "
        f"{qual_phrase}."
    )


def build_stat_insights(
    pair: dict,
    axis_drifts: list[dict],
    league_rates: dict[str, dict[str, float]],
) -> list[dict]:
    to_season = pair["to"]
    insights: list[dict] = []
    for row in axis_drifts:
        feat = row["feature"]
        drift = row["axisDrift"]
        if drift < MEANINGFUL_DRIFT:
            continue
        if to_season not in league_rates or feat not in league_rates[to_season]:
            continue
        prior = prior_league_average(league_rates, feat, to_season)
        if prior is None:
            continue
        current = league_rates[to_season][feat]
        direction, quality, delta_pct = evaluate_level(feat, current, prior)
        insights.append(
            {
                "feature": feat,
                "label": FEATURE_LABELS.get(feat, feat),
                "axisDrift": drift,
                "leagueRate": current,
                "priorAvg": round(prior, 4),
                "deltaPct": delta_pct,
                "direction": direction,
                "quality": quality,
                "narrative": craft_stat_narrative(
                    feat,
                    drift,
                    to_season,
                    current,
                    prior,
                    direction,
                    quality,
                    delta_pct,
                ),
            }
        )
        if len(insights) >= 4:
            break
    return insights


FEATURE_LABELS = {
    "PTS": "scoring volume",
    "AST": "playmaking",
    "OREB": "offensive rebounding",
    "DREB": "defensive rebounding",
    "STL": "steals",
    "BLK": "rim protection",
    "TOV": "turnovers",
    "FG3A": "three-point volume",
    "FGA": "shot volume",
    "FTA": "free-throw pressure",
    "FG3_PCT": "three-point accuracy",
    "FG_PCT": "finishing efficiency",
    "FT_PCT": "free-throw shooting",
    "PLUS_MINUS": "on-court impact",
}

SEASON_CONTEXT = {
    "1998-99": "Lockout year.",
    "2004-05": "Hand-check crackdown.",
    "2011-12": "Lockout year.",
    "2019-20": "COVID bubble.",
    "2020-21": "Short COVID season.",
    "2021-22": "Post-bubble spacing reset.",
    "2023-24": "High-pace scoring environment.",
}


def interpret_shift(pair: dict) -> str:
    """One-line read of the biggest rotated axes."""
    m0, m1 = pair["mostRotated"][0], pair["mostRotated"][1]
    n0 = FEATURE_LABELS.get(m0["feature"], m0["feature"])
    n1 = FEATURE_LABELS.get(m1["feature"], m1["feature"])
    tag = SEASON_CONTEXT.get(pair["to"], "")
    if m0["feature"] in ("FG3_PCT", "FG3A") or m1["feature"] in ("FG3_PCT", "FG3A"):
        gist = "Spacing/shooting frame moved."
    elif m0["feature"] == "PLUS_MINUS" or m1["feature"] == "PLUS_MINUS":
        gist = "Impact harder to compare YoY."
    elif m0["feature"] in ("OREB", "DREB", "BLK") or m1["feature"] in (
        "OREB",
        "DREB",
        "BLK",
    ):
        gist = "Interior role frame moved."
    else:
        gist = "Stat comparison frame shifted."
    line = f"{n0} + {n1} rotated most. {gist}"
    return f"{line} {tag}" if tag else line


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    features = data["features"]
    by_season = defaultdict(dict)
    for p in data["players"]:
        by_season[p["season"]][p["name"]] = np.array(p["v"], float)
    seasons = sorted(by_season)
    league_rates = load_league_rates(seasons, features)

    pairs = []
    chained = np.eye(len(features))
    chain_out = {seasons[0]: np.eye(len(features)).tolist()}
    for s1, s2 in itertools.pairwise(seasons):
        shared = sorted(set(by_season[s1]) & set(by_season[s2]))
        if len(shared) < 30:
            continue
        X = np.stack([by_season[s2][n] for n in shared])  # newer
        Y = np.stack([by_season[s1][n] for n in shared])  # older frame
        Q, resid = procrustes(X, Y)
        deg = rotation_degrees(Q)
        axis_drifts = all_axis_drifts(Q, features)
        pair = {
            "from": s1,
            "to": s2,
            "sharedPlayers": len(shared),
            "rotationDeg": round(deg, 2),
            "residual": round(resid, 4),
            "mostRotated": axis_drifts[:2],
            "axisDrifts": axis_drifts,
        }
        pair["statInsights"] = build_stat_insights(pair, axis_drifts, league_rates)
        pair["interpretation"] = interpret_shift(pair)
        pairs.append(pair)
        chained = chained @ Q.T  # map s2 frame back toward the root frame
        chain_out[s2] = np.round(chained, 5).tolist()

    top = sorted(pairs, key=lambda p: -p["rotationDeg"])[:5]
    (ASSETS / "drift.json").write_text(
        json.dumps(
            {
                "method": (
                    "orthogonal Procrustes on consecutive-season shared "
                    "players (>=30); rotation = mean principal angle of Q "
                    "vs identity; residual = normalized Frobenius after "
                    "alignment; no scaling (z-spaces pre-normalized); "
                    "chained transforms map any season into the 1996-97 "
                    "root frame; axisDrift = 1-|Q_ii|; statInsights compare "
                    "league per-100 rates in the arrival season vs mean of "
                    "all prior charted seasons (minutes-weighted from cache)"
                ),
                "pairs": pairs,
                "biggestShifts": top,
                "chainedToRoot": chain_out,
                "leagueRates": league_rates,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"{len(pairs)} season-pairs aligned")
    print("biggest geometric shifts:")
    for p in top:
        feats = ", ".join(f"{m['feature']}({m['axisDrift']})" for m in p["mostRotated"])
        print(
            f"  {p['from']}->{p['to']}: {p['rotationDeg']}° resid={p['residual']} shared={p['sharedPlayers']} [{feats}]"
        )


if __name__ == "__main__":
    main()
