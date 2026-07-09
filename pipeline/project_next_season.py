"""Export assets/projections.json — MTNN-implied skills + archetypes for active players.

v1 uses the current-season MTNN embedding auxiliary heads (skill + archetype
logits) as a *style-implied* forward view. This is not a pace/minutes
extrapolation; eval against held-out next seasons belongs in test_projections.py.

Requires: pipeline/data/embedding_v3.npz (after train_mtnn.py),
          assets/current_rosters.json, assets/skills.json,
          assets/archetype_assignments.json, assets/vectors.json

Run: python pipeline/project_next_season.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
EMB = DATA / "embedding_v3.npz"
ROSTERS = ASSETS / "current_rosters.json"
SKILLS = ASSETS / "skills.json"
ASSIGN = ASSETS / "archetype_assignments.json"
VECTORS = ASSETS / "vectors.json"
OUT = ASSETS / "projections.json"


def next_season_label(season: str) -> str:
    start = int(season.split("-")[0])
    return f"{start + 1}-{str(start + 2)[-2:]}"


def adaptive_round(v: float) -> float:
    one = round(v, 1)
    if abs(v - one) < 0.005:
        return one
    return round(v, 2)


def main() -> None:
    if not EMB.exists():
        raise SystemExit(f"missing {EMB} — run pipeline/train_mtnn.py first")
    if not ROSTERS.exists():
        raise SystemExit(f"missing {ROSTERS} — run pipeline/build_current_rosters.py")

    emb = np.load(EMB, allow_pickle=True)
    names = [str(x) for x in emb["name"]]
    seasons = [str(x) for x in emb["season"]]
    skill_pred = emb["skill_pred"].astype(np.float32)
    arch_logits = emb["archetype_logits"].astype(np.float32)
    skill_keys = [str(k) for k in emb.get("skill_keys", [])]
    next_profile_pred = emb.get("next_profile_pred")
    game_feature_keys = [str(k) for k in emb.get("game_feature_keys", [])]
    game_clusters = emb["cluster"].astype(np.int32)

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    cluster_names = vec.get("clusters") or []
    season_set = sorted({p["season"] for p in vec["players"]})
    from_season = season_set[-1]
    to_season = next_season_label(from_season)

    skills_doc = json.loads(SKILLS.read_text(encoding="utf-8"))
    skill_names = [sk["key"] for sk in skills_doc.get("skills", [])]
    grade_rows = skills_doc.get("grades") or []

    assign_doc = json.loads(ASSIGN.read_text(encoding="utf-8")) if ASSIGN.exists() else {}
    assign_rows = assign_doc.get("assignments") or []
    id_by_key: dict[str, int] = {}
    for p in vec["players"]:
        id_by_key[f"{p['name']}|{p['season']}"] = int(p["id"])

    rosters = json.loads(ROSTERS.read_text(encoding="utf-8"))
    team_by_name = {a["name"]: a.get("team", "") for a in rosters.get("activePlayers", [])}

    index: dict[tuple[str, str], int] = {}
    for i, (n, s) in enumerate(zip(names, seasons)):
        index[(n, s)] = i

    players = []
    for roster_row in rosters.get("activePlayers", []):
        name = roster_row["name"]
        if not roster_row.get("charted"):
            continue
        i = index.get((name, from_season))
        if i is None:
            continue

        arch_idx = int(np.argmax(arch_logits[i]))
        game_arch = cluster_names[arch_idx] if arch_idx < len(cluster_names) else str(arch_idx)
        obs_key = f"{name}|{from_season}"
        assign = assign_rows[id_by_key[obs_key]] if obs_key in id_by_key else {}
        mtnn_arch = assign.get("mtnnGlobalName") or assign.get("eraNativeName") or game_arch

        obs = {}
        if obs_key in id_by_key:
            grade_row = grade_rows[id_by_key[obs_key]]
            obs = {
                skill_names[j]: grade_row[j]
                for j in range(min(len(skill_names), len(grade_row)))
            }
        proj_skills = {}
        for k, sk in zip(skill_keys, skill_pred[i]):
            if not np.isfinite(sk):
                continue
            pct = float(np.clip(sk, 0, 1) * 100.0)
            # Keep projected grades strictly below 100 to avoid implying certainty.
            proj_skills[k] = adaptive_round(min(pct, 99.99))
        proj_stats_z = {}
        if next_profile_pred is not None and len(game_feature_keys):
            for k, z in zip(game_feature_keys, next_profile_pred[i]):
                if not np.isfinite(z):
                    continue
                proj_stats_z[k] = round(float(np.clip(z, -4, 4)), 3)

        conf = float((lambda lg: (np.exp(lg - lg.max()) / np.exp(lg - lg.max()).sum())[arch_idx])(arch_logits[i]))
        players.append({
            "name": name,
            "team": team_by_name.get(name, ""),
            "fromSeason": from_season,
            "toSeason": to_season,
            "observed": {
                "skills": obs,
                "gameArchetype": assign.get("gameClusterName") or game_arch,
                "mtnnArchetype": mtnn_arch,
            },
            "projected": {
                "skills": proj_skills,
                "gameStatsZ": proj_stats_z,
                "gameArchetype": game_arch,
                "gameArchetypeIdx": arch_idx,
                "mtnnArchetype": mtnn_arch,
                "archetypeConfidence": round(min(conf, 0.9999), 4),
            },
        })

    payload = {
        "built": time.strftime("%Y-%m-%d"),
        "fromSeason": from_season,
        "toSeason": to_season,
        "method": (
            "MTNN v4 embedding auxiliary heads on the current charted season: "
            "skill towers predict grade/100 from style embedding; archetype head "
            "argmax maps to game K=8 clusters; next_profile predicts next-season "
            "z-scored game features from current embedding. Not a minutes or pace forecast — "
            "treat as geometry-implied next-year profile pending held-out eval."
        ),
        "skillKeys": skill_keys,
        "gameFeatureKeys": game_feature_keys,
        "gameArchetypes": cluster_names,
        "players": players,
        "summary": {
            "projected": len(players),
            "withSkills": sum(1 for p in players if p["projected"]["skills"]),
        },
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} — {len(players)} charted players projected {from_season} -> {to_season}")

    # Predicted-vs-actual eval for all seasons (pending on latest). Independent
    # of this roster slice — safe to run even if rosters are incomplete.
    try:
        from export_next_profile_eval import main as export_eval
        export_eval()
    except Exception as exc:  # noqa: BLE001 — projection still succeeded
        print(f"warn: next_profile_eval export skipped ({exc})")


if __name__ == "__main__":
    main()
