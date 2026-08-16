"""Archetypes over time — MTNN embedding space (promoted 48-d model).

Two layers (method stated in artifact):

1. PREVALENCE: per-season share of GLOBAL archetypes — k-means K=8 on the
   full MTNN embedding (seeded), named from the mean skill grades of each
   cluster's members (skills.json composites, not guessed labels).
2. ERA-NATIVE: silhouette-optimal K (range 6–12) re-fit WITHIN each of five
   era windows on MTNN embeddings. Names from the same skill-grade rule.
   LINEAGE: nearest predecessor-era centroid by cosine in MTNN space.

Also emits:
  - gameGlobalArchetypes + gamePrevalence (14-d K=8 from vectors.json — game contract)
  - assets/archetype_assignments.json (per player-season: MTNN global, era-native, era tags)

Output: assets/archetypes_time.json, assets/archetype_assignments.json
"""

from __future__ import annotations

import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import itertools  # noqa: E402

from trend_mtnn import (  # noqa: E402
    ERA_K_RANGE,
    ERAS,
    GLOBAL_K,
    NOVELTY_THRESH,
    ZONE_KEYS,
    assign_cluster_names,
    assign_cluster_names_from_members,
    cosine_rows,
    era_for_season,
    era_percentiles,
    kmeans,
    load_mtnn_embeddings,
    load_skill_grades,
    mean_zone_profile,
    mix_zone_profiles,
    optimal_k,
    skill_index,
    tag_player_roles,
    zone_delta,
)

ASSETS = HERE.parent / "assets"
GAME_K = 8


def game_prevalence(players: list[dict], game_clusters: list[str]) -> list[dict]:
    seasons = sorted({p["season"] for p in players})
    per_season = defaultdict(Counter)
    totals = Counter()
    for p in players:
        c = int(p["c"])
        per_season[p["season"]][c] += 1
        totals[p["season"]] += 1
    return [
        {
            "season": s,
            "shares": [round(per_season[s][c] / totals[s], 4) for c in range(GAME_K)],
            "n": totals[s],
        }
        for s in seasons
    ]


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    players = data["players"]
    game_clusters = data["clusters"]
    E, mtnn_meta = load_mtnn_embeddings()
    grades, skill_meta = load_skill_grades()
    idx = skill_index(skill_meta)
    if len(players) != E.shape[0]:
        raise SystemExit("vectors.json row count != MTNN rows")

    ids = [p["id"] for p in players]
    V = np.array([p["v"] for p in players], dtype=np.float64)
    global_lab, _global_cents = kmeans(E, GLOBAL_K, seed=42)
    global_names = assign_cluster_names(global_lab, GLOBAL_K, ids, grades, skill_meta)
    global_zone_profiles = [
        mean_zone_profile(V, [j for j in range(len(players)) if int(global_lab[j]) == c]) for c in range(GLOBAL_K)
    ]

    seasons = sorted({p["season"] for p in players})
    per_season = defaultdict(Counter)
    totals = Counter()
    for j, p in enumerate(players):
        c = int(global_lab[j])
        per_season[p["season"]][c] += 1
        totals[p["season"]] += 1
    prevalence = [
        {
            "season": s,
            "shares": [round(per_season[s][c] / totals[s], 4) for c in range(GLOBAL_K)],
            "n": totals[s],
        }
        for s in seasons
    ]

    def mean_share(rows, c):
        return sum(r["shares"][c] for r in rows) / len(rows)

    early, late = prevalence[:5], prevalence[-5:]
    early_shares = [mean_share(early, c) for c in range(GLOBAL_K)]
    late_shares = [mean_share(late, c) for c in range(GLOBAL_K)]
    deltas = [
        {
            "archetype": global_names[c],
            "cluster": c,
            "early": round(early_shares[c], 4),
            "late": round(late_shares[c], 4),
            "delta": round(late_shares[c] - early_shares[c], 4),
            "zoneProfile": global_zone_profiles[c],
        }
        for c in range(GLOBAL_K)
    ]
    deltas.sort(key=lambda d: -abs(d["delta"]))

    early_zone = mix_zone_profiles(global_zone_profiles, early_shares)
    late_zone = mix_zone_profiles(global_zone_profiles, late_shares)
    court_heatmap = {
        "method": (
            "Chimera half-court zones from mean era-z 14-d vectors per MTNN "
            "global archetype; early/late mixes weight zone profiles by "
            "first-5 / last-5 season prevalence shares"
        ),
        "zoneKeys": list(ZONE_KEYS),
        "early": early_zone,
        "late": late_zone,
        "delta": zone_delta(late_zone, early_zone),
        "byArchetype": [
            {
                "cluster": c,
                "name": global_names[c],
                "zoneProfile": global_zone_profiles[c],
                "earlyShare": round(early_shares[c], 4),
                "lateShare": round(late_shares[c], 4),
                "deltaShare": round(late_shares[c] - early_shares[c], 4),
            }
            for c in range(GLOBAL_K)
        ],
    }

    game_prev = game_prevalence(players, game_clusters)
    game_early, game_late = game_prev[:5], game_prev[-5:]
    game_deltas = [
        {
            "archetype": game_clusters[c],
            "early": round(sum(r["shares"][c] for r in game_early) / len(game_early), 4),
            "late": round(sum(r["shares"][c] for r in game_late) / len(game_late), 4),
        }
        for c in range(GAME_K)
    ]
    for d in game_deltas:
        d["delta"] = round(d["late"] - d["early"], 4)
    game_deltas.sort(key=lambda d: -abs(d["delta"]))

    by_era: list[dict] = []
    era_models: dict[str, dict] = {}
    for era_name, s_lo, s_hi in ERAS:
        era_idxs = [j for j, p in enumerate(players) if s_lo <= p["season"] <= s_hi]
        pct = era_percentiles(grades, era_idxs)
        X = E[era_idxs]
        k_opt, k_sweep = optimal_k(X, ERA_K_RANGE)
        lab, cents = kmeans(X, k_opt, seed=42)
        counts = Counter(lab.tolist())
        member_ids_by_cluster = [[ids[era_idxs[j]] for j in range(len(era_idxs)) if lab[j] == i] for i in range(k_opt)]
        member_rows_by_cluster = [[era_idxs[j] for j in range(len(era_idxs)) if lab[j] == i] for i in range(k_opt)]
        era_names = assign_cluster_names_from_members(
            member_ids_by_cluster,
            grades,
            skill_meta,
        )
        archetypes = []
        for i in range(k_opt):
            members = member_ids_by_cluster[i]
            mean_g = grades[members].mean(0) if members else np.zeros(len(skill_meta))
            tags = tag_player_roles(mean_g, idx, pct)
            archetypes.append(
                {
                    "name": era_names[i],
                    "share": round(counts[i] / len(era_idxs), 4),
                    "mtnnCentroid": cents[i],
                    "tags": tags,
                    "zoneProfile": mean_zone_profile(V, member_rows_by_cluster[i]),
                }
            )
        era_zone = mix_zone_profiles(
            [a["zoneProfile"] for a in archetypes],
            [a["share"] for a in archetypes],
        )
        era_models[era_name] = {
            "s_lo": s_lo,
            "s_hi": s_hi,
            "k": k_opt,
            "cents": cents,
            "names": era_names,
            "pct": pct,
        }
        by_era.append(
            {
                "era": era_name,
                "k": k_opt,
                "kSweep": k_sweep,
                "archetypes": archetypes,
                "n": len(era_idxs),
                "zoneMix": era_zone,
                "tagCounts": dict(Counter(t for a in archetypes for t in a["tags"])),
            }
        )

    for prev, cur in itertools.pairwise(by_era):
        for arch in cur["archetypes"]:
            cvec = arch["mtnnCentroid"]
            sims = [(cosine_rows(cvec, pa["mtnnCentroid"]), pa["name"]) for pa in prev["archetypes"]]
            best_sim, best_name = max(sims)
            arch["ancestor"] = {
                "era": prev["era"],
                "name": best_name,
                "similarity": round(best_sim, 3),
            }
            arch["novel"] = best_sim < NOVELTY_THRESH

    assignments = []
    for j, p in enumerate(players):
        era_info = era_for_season(p["season"])
        era_name = era_info[0] if era_info else None
        era_native_name = None
        era_tags: list[str] = []
        if era_name and era_name in era_models:
            model = era_models[era_name]
            dists = [1.0 - cosine_rows(E[j], c) for c in model["cents"]]
            best_i = int(np.argmin(dists))
            era_native_name = model["names"][best_i]
            era_tags = tag_player_roles(grades[j], idx, model["pct"])
        assignments.append(
            {
                "id": p["id"],
                "gameCluster": int(p["c"]),
                "gameClusterName": game_clusters[int(p["c"])],
                "mtnnGlobal": int(global_lab[j]),
                "mtnnGlobalName": global_names[int(global_lab[j])],
                "era": era_name,
                "eraNativeName": era_native_name,
                "eraTags": era_tags,
            }
        )

    export_eras = []
    for e in by_era:
        export_eras.append(
            {
                "era": e["era"],
                "k": e["k"],
                "kSweep": e["kSweep"],
                "n": e["n"],
                "zoneMix": e["zoneMix"],
                "tagCounts": e.get("tagCounts") or {},
                "archetypes": [{k: v for k, v in a.items() if k != "mtnnCentroid"} for a in e["archetypes"]],
            }
        )

    built = time.strftime("%Y-%m-%d")
    (ASSETS / "archetypes_time.json").write_text(
        json.dumps(
            {
                "built": built,
                "n_players": len(players),
                "embeddingSpace": mtnn_meta.get("model", "mtnn"),
                "globalK": GLOBAL_K,
                "method": (
                    "layer 1: per-season share of global K=8 k-means on promoted MTNN "
                    "embeddings (48-d, L2-normalized), cluster names from distinctive "
                    "skill z-scores vs pool (cross-family pairs); layer 2: silhouette-"
                    "optimal K (6-12) re-fit within five era windows on the same MTNN "
                    "space, same naming rule; lineage = nearest predecessor-era "
                    "centroid by MTNN cosine; courtHeatmap = Chimera zone intensity "
                    "from mean era-z 14-d vectors weighted by early/late prevalence; "
                    "gameGlobalArchetypes/gamePrevalence = frozen 14-d K=8 game contract "
                    "from vectors.json; shares are charted player-seasons only"
                ),
                "globalArchetypes": global_names,
                "prevalence": prevalence,
                "biggestShifts": deltas,
                "courtHeatmap": court_heatmap,
                "gameGlobalArchetypes": game_clusters,
                "gamePrevalence": game_prev,
                "gameBiggestShifts": game_deltas,
                "eras": export_eras,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    (ASSETS / "archetype_assignments.json").write_text(
        json.dumps(
            {
                "built": built,
                "n_players": len(players),
                "method": (
                    "Per player-season: gameCluster (14-d K=8, Chimera contract), "
                    "mtnnGlobal (MTNN K=8 trends/careers), eraNativeName (nearest "
                    "era-native MTNN centroid), eraTags (era-relative skill heuristics: "
                    "three_and_d, stretch_big, traditional_big, spacing_role, etc.)"
                ),
                "tagLabels": {
                    "three_and_d": "3-and-D wing",
                    "stretch_big": "Stretch big",
                    "traditional_big": "Traditional big",
                    "spacing_role": "Spacing role",
                    "two_way_perimeter": "Two-way perimeter",
                    "primary_creator": "Primary creator",
                    "volume_scorer": "Volume scorer",
                },
                "assignments": assignments,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"global MTNN archetypes (K={GLOBAL_K}):")
    for i, nm in enumerate(global_names):
        print(f"  [{i}] {nm}")
    print("\nMTNN prevalence shifts (early-5 vs late-5):")
    for d in deltas[:4]:
        print(f"  {d['archetype']}: {d['early']:.1%} -> {d['late']:.1%} ({d['delta']:+.1%})")
    print("\ngame prevalence shifts (early-5 vs late-5):")
    for d in game_deltas[:4]:
        print(f"  {d['archetype']}: {d['early']:.1%} -> {d['late']:.1%} ({d['delta']:+.1%})")
    print("\nera-native (K, top types, ancestor):")
    for e in by_era:
        print(f"  {e['era']} K={e['k']}")
        for a in sorted(e["archetypes"], key=lambda x: -x["share"])[:3]:
            anc = a.get("ancestor", {})
            nov = " [novel]" if a.get("novel") else ""
            print(f"    {a['name']} ({a['share']:.1%}) <- {anc.get('name', '-')} ({anc.get('similarity', '')}){nov}")
    tag_counts = Counter(t for a in assignments for t in a["eraTags"])
    print(f"\nwrote archetype_assignments.json ({len(assignments)} rows)")
    print("era tag counts:", dict(tag_counts.most_common(6)))
    print("courtHeatmap delta (top |zone|):")
    delta_items = sorted(
        court_heatmap["delta"].items(),
        key=lambda kv: -abs(kv[1]),
    )
    for k, v in delta_items[:4]:
        print(f"  {k}: {v:+.3f}")


if __name__ == "__main__":
    main()
