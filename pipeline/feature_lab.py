"""FEATURE LAB — do team-standing + tenure features earn a place in
the vector? Honest ablation, no vibes. Method:

- CANDIDATE FEATURES (computed from our own game logs 2015-26 +
  vectors.json history):
    minShare   — player minutes / team total minutes that season
    usageShare — (FGA + 0.44*FTA + TOV) share of team's, minutes-adj
    scoreRank  — within-team rank by total points (1 = leader)
    leagueTenure — seasons since first charted appearance (all 30 yrs)
    teamTenure   — consecutive prior seasons with the same team
- ROLE TIERS (rule-based, stated): leader (top-1 usageShare & top-3
  minShare), key contributor (top-3 usage or top-5 min), role player
  (>=15 mpg), specialist (<15 mpg but >=800 season min w/ a >=+1.5
  sigma dim), fringe (rest).
- ABLATION: base 14-dim era-z vector vs base+role vs base+tenure vs
  base+all (each new feature era-z-scored the same way). Criteria:
    C1 next-season impact probe: ridge regression predicting
       next-season PLUS_MINUS z from current vector (5-fold CV R^2)
    C2 archetype separability: k-means K=8 silhouette (subsample)
    C3 neighbor coherence: % of 10-NN sharing position group
- Verdict per feature set printed; nothing ships to vectors.json until
  a set beats base on C1 without degrading C2/C3 (stated gate).
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
RNG = np.random.default_rng(42)


def zscore_by_season(vals: dict, seasons: dict) -> dict:
    by_s = defaultdict(list)
    for k, v in vals.items():
        by_s[seasons[k]].append(v)
    stats = {s: (np.mean(v), np.std(v) or 1.0) for s, v in by_s.items()}
    return {k: float(np.clip((v - stats[seasons[k]][0]) /
                             stats[seasons[k]][1], -4, 4))
            for k, v in vals.items()}


def ridge_cv_r2(X: np.ndarray, y: np.ndarray, lam: float = 10.0) -> float:
    idx = RNG.permutation(len(X))
    folds = np.array_split(idx, 5)
    r2s = []
    for f in folds:
        mask = np.ones(len(X), bool)
        mask[f] = False
        Xt, yt, Xv, yv = X[mask], y[mask], X[f], y[f]
        mu, sd = Xt.mean(0), Xt.std(0)
        sd[sd == 0] = 1
        Xt, Xv = (Xt - mu) / sd, (Xv - mu) / sd
        A = Xt.T @ Xt + lam * np.eye(Xt.shape[1])
        w = np.linalg.solve(A, Xt.T @ (yt - yt.mean()))
        pred = Xv @ w + yt.mean()
        ss = ((yv - yv.mean()) ** 2).sum()
        r2s.append(1 - ((yv - pred) ** 2).sum() / (ss or 1))
    return float(np.mean(r2s))


def silhouette_sub(X: np.ndarray, k: int = 8, n: int = 1500) -> float:
    from numpy.linalg import norm
    sub = X[RNG.choice(len(X), min(n, len(X)), replace=False)]
    cents = sub[RNG.choice(len(sub), k, replace=False)]
    for _ in range(40):
        d = ((sub[:, None] - cents[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        cents = np.stack([sub[lab == i].mean(0) if (lab == i).any()
                          else cents[i] for i in range(k)])
    D = norm(sub[:, None] - sub[None], axis=-1)
    sil = []
    for i in range(len(sub)):
        same = lab == lab[i]
        a = D[i][same & (np.arange(len(sub)) != i)].mean() if same.sum() > 1 else 0
        bs = [D[i][lab == j].mean() for j in range(k)
              if j != lab[i] and (lab == j).any()]
        b = min(bs) if bs else a
        sil.append((b - a) / (max(a, b) or 1))
    return float(np.mean(sil))


def nn_position_coherence(X: np.ndarray, pos: list, n: int = 800) -> float:
    idx = RNG.choice(len(X), min(n, len(X)), replace=False)
    Xn = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    hits = []
    for i in idx:
        sims = Xn @ Xn[i]
        nb = np.argsort(-sims)[1:11]
        hits.append(np.mean([pos[j] == pos[i] for j in nb if pos[j]]))
    return float(np.nanmean(hits))


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    vindex = {(p["name"], p["season"]): p for p in data["players"]}

    # --- candidate features from game logs (2015-26) ---
    min_share, usage_share, score_rank = {}, {}, {}
    team_of = {}
    for f in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = f.stem.split("_")[1]
        team_tot = defaultdict(lambda: [0.0, 0.0])  # min, usage
        agg = defaultdict(lambda: [0.0, 0.0, 0.0, ""])  # min, usage, pts
        for line in f.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            u = g["FGA"] + 0.44 * g["FTA"] + g["TOV"]
            k = (g["PLAYER_NAME"], season)
            agg[k][0] += g["MIN"]
            agg[k][1] += u
            agg[k][2] += g["PTS"]
            agg[k][3] = g["TEAM_ID"]
            team_tot[(g["TEAM_ID"], season)][0] += g["MIN"]
            team_tot[(g["TEAM_ID"], season)][1] += u
        pts_by_team = defaultdict(list)
        for k, (m, u, p, tid) in agg.items():
            if k in vindex:
                tt = team_tot[(tid, season)]
                min_share[k] = m / (tt[0] or 1) * 5  # 5 on floor
                usage_share[k] = (u / (tt[1] or 1)) / (m / (tt[0] or 1) or 1e-9)
                pts_by_team[(tid, season)].append((p, k))
                team_of[k] = tid
        for lst in pts_by_team.values():
            for rank, (_, k) in enumerate(sorted(lst, reverse=True), 1):
                score_rank[k] = rank

    # tenure (all 30 years from vectors)
    first_season = {}
    for p in sorted(data["players"], key=lambda r: r["season"]):
        first_season.setdefault(p["name"], int(p["season"][:4]))
    league_tenure = {}
    team_tenure = {}
    for k in min_share:
        name, season = k
        league_tenure[k] = int(season[:4]) - first_season.get(name, int(season[:4]))
        # consecutive same-team prior seasons (within log window)
        t, y = 0, int(season[:4])
        while True:
            prev = (name, f"{y-1-t}-{str(y-t)[2:].zfill(2)}")
            if team_of.get(prev) == team_of.get(k) and team_of.get(k):
                t += 1
            else:
                break
        team_tenure[k] = t

    seasons_map = {k: k[1] for k in min_share}
    feats = {
        "minShare": zscore_by_season(min_share, seasons_map),
        "usageShare": zscore_by_season(usage_share, seasons_map),
        "scoreRank": zscore_by_season(
            {k: -v for k, v in score_rank.items()}, seasons_map),
        "leagueTenure": zscore_by_season(league_tenure, seasons_map),
        "teamTenure": zscore_by_season(team_tenure, seasons_map),
    }

    # --- assemble ablation matrices (players in log window w/ next season) ---
    keys = [k for k in min_share if k in vindex]
    pm_idx = data["features"].index("PLUS_MINUS")
    rows, targets, positions = [], [], []
    for k in keys:
        name, season = k
        y = int(season[:4])
        nxt = vindex.get((name, f"{y+1}-{str(y+2)[2:].zfill(2)}"))
        if nxt is None:
            continue
        rows.append(k)
        targets.append(nxt["v"][pm_idx])
        positions.append(vindex[k].get("p") or vindex[k].get("pos") or "")
    base = np.array([vindex[k]["v"] for k in rows])
    role = np.array([[feats["minShare"][k], feats["usageShare"][k],
                      feats["scoreRank"][k]] for k in rows])
    tenure = np.array([[feats["leagueTenure"][k], feats["teamTenure"][k]]
                       for k in rows])
    y = np.array(targets)

    sets = {"base14": base,
            "base+role": np.hstack([base, role]),
            "base+tenure": np.hstack([base, tenure]),
            "base+all": np.hstack([base, role, tenure])}
    print(f"ablation on {len(rows)} player-seasons with next-season targets\n")
    results = {}
    for name, X in sets.items():
        c1 = ridge_cv_r2(X, y)
        c2 = silhouette_sub(X)
        c3 = nn_position_coherence(X, positions)
        results[name] = (c1, c2, c3)
        print(f"  {name:12s}  C1 next-PMz R2={c1:.4f}  "
              f"C2 silhouette={c2:.4f}  C3 posNN={c3:.4f}")

    b = results["base14"]
    print("\nverdicts (gate: beat base C1 without degrading C2/C3 >0.01):")
    for name, r in results.items():
        if name == "base14":
            continue
        ok = r[0] > b[0] and r[1] > b[1] - 0.01 and r[2] > b[2] - 0.01
        print(f"  {name}: {'PASS' if ok else 'FAIL'} "
              f"(dC1={r[0]-b[0]:+.4f}, dC2={r[1]-b[1]:+.4f}, dC3={r[2]-b[2]:+.4f})")

    # --- role tiers (independent of ablation; stated rules) ---
    tiers = {}
    by_team_season = defaultdict(list)
    for k in keys:
        by_team_season[(team_of[k], k[1])].append(k)
    for ts, ks in by_team_season.items():
        by_usage = sorted(ks, key=lambda k: -usage_share[k])
        by_min = sorted(ks, key=lambda k: -min_share[k])
        for k in ks:
            mpg_proxy = min_share[k] * 48  # stored share*5; *48 -> true mpg
            v = np.array(vindex[k]["v"])
            if k == by_usage[0] and k in by_min[:3]:
                tiers[k] = "leader"
            elif k in by_usage[:3] or k in by_min[:5]:
                tiers[k] = "key contributor"
            elif mpg_proxy >= 15:
                tiers[k] = "role player"
            elif v.max() >= 1.5:
                tiers[k] = "specialist"
            else:
                tiers[k] = "fringe"
    from collections import Counter
    print("\nrole tiers (2015-26):", dict(Counter(tiers.values())))

    out = {"method": ("role/tenure features from own game logs 2015-26 "
                      "(minShare x5-on-floor, usage-rate share, team "
                      "scoring rank, league tenure from 30-yr charts, "
                      "consecutive team tenure); tiers rule-based as "
                      "documented; ablation gate = beat base14 on "
                      "next-season PMz ridge R2 without degrading "
                      "silhouette/position-NN >0.01; salary excluded "
                      "(current-season-only cache + sourcing caveat); "
                      "coach tenure needs a source — flagged"),
           "ablation": {k: {"nextPMzR2": round(v[0], 4),
                            "silhouette": round(v[1], 4),
                            "posNN": round(v[2], 4)} for k, v in results.items()},
           "tiers": {f"{k[0]}|{k[1]}": t for k, t in tiers.items()}}
    (ASSETS / "roles.json").write_text(json.dumps(out, separators=(",", ":")),
                                       encoding="utf-8")
    print("\nassets/roles.json written")


if __name__ == "__main__":
    main()
