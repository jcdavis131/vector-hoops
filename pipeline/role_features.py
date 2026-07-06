"""Team-standing role features from VH-101 game logs (2015-26).

Computes minShare, usageShare, scoreRank per charted player-season.
Used by feature_lab.py (ablation gate) and integrate_context.py (MTNN
role tower). Tenure features stay out of the cosine space — see
feature_lab verdict.

Run:  python pipeline/role_features.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
OUT = DATA / "role_context.json"


def compute_role_raw(
    vindex: dict[tuple[str, str], dict] | None = None,
) -> tuple[dict[tuple[str, str], dict], dict[tuple[str, str], str]]:
    """Return raw role metrics + teamId map for keys in vectors + logs."""
    if vindex is None:
        data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
        vindex = {(p["name"], p["season"]): p for p in data["players"]}

    min_share: dict[tuple[str, str], float] = {}
    usage_share: dict[tuple[str, str], float] = {}
    score_rank: dict[tuple[str, str], float] = {}
    team_of: dict[tuple[str, str], int] = {}

    for f in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = f.stem.split("_", 1)[1]
        team_tot: dict[tuple[int, str], list[float]] = defaultdict(
            lambda: [0.0, 0.0])
        agg: dict[tuple[str, str], list] = defaultdict(
            lambda: [0.0, 0.0, 0.0, 0])
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            g = json.loads(line)
            if not g.get("MIN"):
                continue
            u = g["FGA"] + 0.44 * g["FTA"] + g["TOV"]
            k = (g["PLAYER_NAME"], season)
            rec = agg[k]
            rec[0] += g["MIN"]
            rec[1] += u
            rec[2] += g["PTS"]
            rec[3] = g["TEAM_ID"]
            tt = team_tot[(g["TEAM_ID"], season)]
            tt[0] += g["MIN"]
            tt[1] += u

        pts_by_team: dict[tuple[int, str], list[tuple[float, tuple[str, str]]]] = (
            defaultdict(list))
        for k, (m, u, p, tid) in agg.items():
            if k not in vindex:
                continue
            tt = team_tot[(tid, season)]
            min_share[k] = m / (tt[0] or 1) * 5
            usage_share[k] = (u / (tt[1] or 1)) / (m / (tt[0] or 1) or 1e-9)
            pts_by_team[(tid, season)].append((p, k))
            team_of[k] = tid

        for lst in pts_by_team.values():
            for rank, (_, k) in enumerate(sorted(lst, reverse=True), 1):
                score_rank[k] = float(rank)

    rows: dict[tuple[str, str], dict] = {}
    for k in min_share:
        rows[k] = {
            "name": k[0],
            "season": k[1],
            "teamId": team_of.get(k),
            "ROLE_MIN_SHARE": min_share[k],
            "ROLE_USAGE_SHARE": usage_share[k],
            # invert rank so higher = team scoring leader (era-z friendly)
            "ROLE_SCORE_RANK": -score_rank[k],
        }
    return rows, team_of


def main() -> None:
    rows, _ = compute_role_raw()
    payload = {
        "method": (
            "Team-standing role features from game logs 2015-26: minShare "
            "(minutes / team total x5-on-floor), usageShare (usage rate "
            "share of team), scoreRank inverted (higher = team scoring "
            "leader). Ablation PASS in feature_lab.py — MTNN aux tower "
            "only; tenure excluded (geometry gate FAIL)."
        ),
        "entries": list(rows.values()),
    }
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} player-seasons)")


if __name__ == "__main__":
    main()
