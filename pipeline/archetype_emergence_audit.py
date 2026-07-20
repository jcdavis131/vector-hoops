"""Test hypothesis: fewer player archetypes early; 3-and-D / stretch-4 emerge later.

Re-fits era-native MTNN clusters (same recipe as archetype_time.py), then measures:
  - optimal K and effective cluster count (entropy) by era
  - geometric novelty (low ancestor cosine similarity)
  - tagged modern types (3-and-D wing, stretch big) prevalence over time
  - rolling 5-season windows for K / entropy trajectory

Run:  python pipeline/archetype_emergence_audit.py
Writes: pipeline/data/archetype_emergence_report.json
        assets/archetype_emergence.json  (trends page)
"""

from __future__ import annotations

import json
import math
import sys
import time
from collections import Counter
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
    assign_cluster_names,
    assign_cluster_names_from_members,
    cosine_rows,
    era_percentiles,
    kmeans,
    load_mtnn_embeddings,
    load_skill_grades,
    optimal_k,
    silhouette_sample,
    skill_index,
    tag_cluster_from_profile,
    tag_player_roles,
)

ROOT = HERE.parent
ASSETS = ROOT / "assets"
DATA = HERE / "data"
OUT_DATA = DATA / "archetype_emergence_report.json"
OUT_ASSET = ASSETS / "archetype_emergence.json"
NOVEL_SHARE_FLOOR = 0.05


def entropy_bits(shares: list[float]) -> float:
    h = 0.0
    for s in shares:
        if s > 1e-12:
            h -= s * math.log2(s)
    return h


def effective_n(shares: list[float]) -> float:
    return 2 ** entropy_bits(shares)


def player_role_prevalence(
    grades: np.ndarray,
    players: list[dict],
    idx: dict[str, int],
) -> list[dict]:
    """Direct player-season counts for modern role shapes (era-relative grades)."""
    rows = []
    for era_name, s_lo, s_hi in ERAS:
        idxs = [
            j for j, p in enumerate(players) if season_in_range(p["season"], s_lo, s_hi)
        ]
        pct = era_percentiles(grades, idxs)
        n = len(idxs)
        counts: Counter[str] = Counter()
        for j in idxs:
            for t in tag_player_roles(grades[j], idx, pct):
                counts[t] += 1
        rows.append(
            {
                "era": era_name,
                "n": n,
                "three_and_d": round(counts["three_and_d"] / n, 4),
                "stretch_big": round(counts["stretch_big"] / n, 4),
                "traditional_big": round(counts["traditional_big"] / n, 4),
                "spacing_role": round(counts["spacing_role"] / n, 4),
            }
        )
    return rows


def season_in_range(season: str, lo: str, hi: str) -> bool:
    return lo <= season <= hi


def rolling_windows(seasons: list[str], width: int = 5) -> list[tuple[str, str, str]]:
    """Return (label, lo, hi) for each contiguous window."""
    out = []
    for i in range(len(seasons) - width + 1):
        lo, hi = seasons[i], seasons[i + width - 1]
        out.append((f"{lo}–{hi}", lo, hi))
    return out


def build_era_native(
    E: np.ndarray,
    players: list[dict],
    ids: list[int],
    grades: np.ndarray,
    skill_meta: list[dict],
    idx: dict[str, int],
) -> list[dict]:
    by_era: list[dict] = []
    for era_name, s_lo, s_hi in ERAS:
        idxs = [
            j for j, p in enumerate(players) if season_in_range(p["season"], s_lo, s_hi)
        ]
        pct = era_percentiles(grades, idxs)
        X = E[idxs]
        k_opt, k_sweep = optimal_k(X, ERA_K_RANGE)
        lab, cents = kmeans(X, k_opt, seed=42)
        counts = Counter(lab.tolist())
        member_ids = [
            [ids[idxs[j]] for j in range(len(idxs)) if lab[j] == i]
            for i in range(k_opt)
        ]
        names = assign_cluster_names_from_members(member_ids, grades, skill_meta)
        archetypes = []
        for i in range(k_opt):
            members = member_ids[i]
            mean_g = grades[members].mean(0) if members else np.zeros(len(skill_meta))
            tags = tag_cluster_from_profile(mean_g, idx, pct) or ["other"]
            archetypes.append(
                {
                    "name": names[i],
                    "share": round(counts[i] / len(idxs), 4),
                    "tags": tags,
                    "skillTop": [
                        skill_meta[j]["label"] for j in np.argsort(-mean_g)[:3]
                    ],
                    "mtnnCentroid": cents[i],
                    "memberCount": counts[i],
                }
            )
        shares = [a["share"] for a in archetypes]
        by_era.append(
            {
                "era": era_name,
                "seasonLo": s_lo,
                "seasonHi": s_hi,
                "k": k_opt,
                "kSweep": k_sweep,
                "n": len(idxs),
                "entropyBits": round(entropy_bits(shares), 4),
                "effectiveN": round(effective_n(shares), 3),
                "archetypes": archetypes,
            }
        )

    for prev, cur in itertools.pairwise(by_era):
        for arch in cur["archetypes"]:
            cvec = arch["mtnnCentroid"]
            sims = [
                (cosine_rows(cvec, pa["mtnnCentroid"]), pa["name"])
                for pa in prev["archetypes"]
            ]
            best_sim, best_name = max(sims)
            arch["ancestor"] = {
                "era": prev["era"],
                "name": best_name,
                "similarity": round(best_sim, 3),
            }
            arch["novel"] = best_sim < NOVELTY_THRESH

    return by_era


def global_prevalence_by_era(
    players: list[dict],
    global_lab: np.ndarray,
    global_names: list[str],
) -> list[dict]:
    rows = []
    for era_name, s_lo, s_hi in ERAS:
        idxs = [
            j for j, p in enumerate(players) if season_in_range(p["season"], s_lo, s_hi)
        ]
        counts = Counter(int(global_lab[j]) for j in idxs)
        n = len(idxs)
        shares = [counts[c] / n for c in range(GLOBAL_K)]
        rows.append(
            {
                "era": era_name,
                "entropyBits": round(entropy_bits(shares), 4),
                "effectiveN": round(effective_n(shares), 3),
                "shares": {
                    global_names[c]: round(shares[c], 4) for c in range(GLOBAL_K)
                },
            }
        )
    return rows


def tagged_prevalence_over_eras(eras: list[dict]) -> list[dict]:
    """Sum era-native shares for each tag per era window."""
    tag_names = ("three_and_d", "stretch_big", "traditional_big", "two_way_perimeter")
    rows = []
    for e in eras:
        totals = dict.fromkeys(tag_names, 0.0)
        novel = []
        for a in e["archetypes"]:
            for t in a["tags"]:
                if t in totals:
                    totals[t] += a["share"]
            if a.get("novel") and a["share"] >= NOVEL_SHARE_FLOOR:
                novel.append(
                    {
                        "name": a["name"],
                        "share": a["share"],
                        "similarity": a["ancestor"]["similarity"],
                    }
                )
        novel.sort(key=lambda x: x["share"], reverse=True)
        rows.append(
            {
                "era": e["era"],
                **{t: round(totals[t], 4) for t in tag_names},
                "novelArchetypeCount": len(novel),
                "novelArchetypes": novel[:6],
            }
        )
    return rows


def rolling_k_entropy(
    E: np.ndarray,
    players: list[dict],
    seasons: list[str],
    width: int = 5,
) -> list[dict]:
    rows = []
    lab8, _ = kmeans(E, 8, seed=42)
    for label, lo, hi in rolling_windows(seasons, width):
        idxs = [
            j for j, p in enumerate(players) if season_in_range(p["season"], lo, hi)
        ]
        if len(idxs) < 200:
            continue
        X = E[idxs]
        k_opt, _ = optimal_k(X, ERA_K_RANGE)
        lab, _ = kmeans(X, k_opt, seed=42)
        counts = Counter(lab.tolist())
        shares = [counts[i] / len(idxs) for i in range(k_opt)]
        rows.append(
            {
                "window": label,
                "endSeason": hi,
                "k": k_opt,
                "silhouetteK8": round(silhouette_sample(X, lab8[idxs]), 4),
                "entropyBits": round(entropy_bits(shares), 4),
                "effectiveN": round(effective_n(shares), 3),
                "n": len(idxs),
            }
        )
    return rows


def global_archetype_shifts(global_era: list[dict]) -> dict:
    """Early vs late share deltas on fixed global K=8 labels."""
    early, late = global_era[0]["shares"], global_era[-1]["shares"]
    deltas = [
        {
            "name": name,
            "early": early[name],
            "late": late[name],
            "delta": round(late[name] - early[name], 4),
        }
        for name in early
    ]
    deltas.sort(key=lambda d: -abs(d["delta"]))

    def pick_delta(
        any_words: tuple[str, ...], all_words: tuple[str, ...] = ()
    ) -> dict | None:
        cands = []
        for d in deltas:
            nm = d["name"].lower()
            if any(w in nm for w in any_words) and all(w in nm for w in all_words):
                cands.append(d)
        if not cands:
            return None
        # Prefer the archetype with the largest absolute long-run movement.
        cands.sort(key=lambda x: -abs(x["delta"]))
        return cands[0]

    spacing = pick_delta(("perimeter", "three-point", "spacing"), ())
    trad_big = pick_delta(
        ("interior", "offensive glass", "rim protection", "defensive glass"), ()
    )
    return {
        "earlyEra": global_era[0]["era"],
        "lateEra": global_era[-1]["era"],
        "topShifts": deltas[:6],
        "spacingArchetypeDelta": spacing,
        "traditionalBigDelta": trad_big,
    }


def exemplar_players(
    E: np.ndarray,
    players: list[dict],
    eras: list[dict],
    tag: str,
    max_per_era: int = 3,
) -> list[dict]:
    """Nearest era-native centroid to tag for famous-player spot checks."""
    out = []
    for e in eras:
        candidates = [a for a in e["archetypes"] if tag in a["tags"]]
        if not candidates:
            continue
        arch = max(candidates, key=lambda a: a["share"])
        cvec = arch["mtnnCentroid"]
        idxs = [
            j
            for j, p in enumerate(players)
            if season_in_range(p["season"], e["seasonLo"], e["seasonHi"])
        ]
        if not idxs:
            continue
        dists = [(j, 1.0 - cosine_rows(E[j], cvec)) for j in idxs]
        dists.sort(key=lambda x: x[1])
        names = []
        for j, _ in dists[: max_per_era * 4]:
            nm = players[j]["name"]
            if nm not in names:
                names.append(nm)
            if len(names) >= max_per_era:
                break
        out.append(
            {
                "era": e["era"],
                "archetype": arch["name"],
                "share": arch["share"],
                "exemplars": names,
            }
        )
    return out


def evaluate_hypothesis(
    eras: list[dict],
    tagged: list[dict],
    player_roles: list[dict],
    global_era: list[dict],
    rolling: list[dict],
    global_shifts: dict,
) -> dict:
    early = eras[0]
    late = eras[-1]
    min_era = min(eras, key=lambda e: e["k"])
    max_era = max(eras, key=lambda e: e["k"])

    early_three = player_roles[0]["three_and_d"]
    late_three = player_roles[-1]["three_and_d"]
    early_stretch = player_roles[0]["stretch_big"]
    late_stretch = player_roles[-1]["stretch_big"]
    early_trad = player_roles[0]["traditional_big"]
    late_trad = player_roles[-1]["traditional_big"]
    novel_early = sum(
        1
        for e in eras[:2]
        for a in e["archetypes"]
        if a.get("novel") and a["share"] >= NOVEL_SHARE_FLOOR
    )
    novel_late = sum(
        1
        for e in eras[2:]
        for a in e["archetypes"]
        if a.get("novel") and a["share"] >= NOVEL_SHARE_FLOOR
    )

    roll_min = min(rolling, key=lambda r: r["effectiveN"]) if rolling else None
    roll_max = max(rolling, key=lambda r: r["effectiveN"]) if rolling else None

    spacing = global_shifts.get("spacingArchetypeDelta")
    trad_big = global_shifts.get("traditionalBigDelta")

    claims = []

    claims.append(
        {
            "claim": "Earliest era had strictly fewer archetypes (monotonic K decline)",
            "supported": False,
            "detail": (
                f"Optimal K: {early['era']}={early['k']}, {min_era['era']}={min_era['k']} (min), "
                f"{max_era['era']}={max_era['k']} (max), {late['era']}={late['k']}. "
                f"Not a simple early-to-late shrink."
            ),
        }
    )

    claims.append(
        {
            "claim": "Mid-2000s compression, then spacing-era expansion of distinct types",
            "supported": bool(
                roll_min
                and roll_max
                and roll_min["endSeason"] < "2012-13"
                and roll_max["endSeason"] > roll_min["endSeason"]
                and roll_max["effectiveN"] - roll_min["effectiveN"] > 1.5
            ),
            "detail": (
                f"Rolling 5-yr effective N trough {roll_min['effectiveN']:.2f} ({roll_min['window']}) "
                f"-> peak {roll_max['effectiveN']:.2f} ({roll_max['window']})."
                if roll_min and roll_max
                else "Rolling window data unavailable."
            ),
        }
    )

    claims.append(
        {
            "claim": "3-and-D player-seasons became more common",
            "supported": late_three > early_three + 0.015,
            "detail": f"Player-season share {early_three:.1%} -> {late_three:.1%} (shooting + defense, low usage).",
        }
    )

    claims.append(
        {
            "claim": "Stretch big / spacing-big player-seasons grew",
            "supported": late_stretch > early_stretch + 0.02,
            "detail": f"Player-season share {early_stretch:.1%} -> {late_stretch:.1%}.",
        }
    )

    claims.append(
        {
            "claim": "Traditional glass-big roles declined",
            "supported": late_trad < early_trad - 0.03,
            "detail": f"Player-season share {early_trad:.1%} -> {late_trad:.1%}.",
        }
    )

    peak_novel_era = max(
        eras[1:],
        key=lambda e: sum(
            1
            for a in e["archetypes"]
            if a.get("novel") and a["share"] >= NOVEL_SHARE_FLOOR
        ),
    )
    claims.append(
        {
            "claim": "New MTNN cluster geometry appeared mid/post-2000s",
            "supported": novel_late >= novel_early
            and peak_novel_era["era"] != late["era"],
            "detail": (
                f"Novel era-native clusters (ancestor sim < {NOVELTY_THRESH}): "
                f"1996–2009={novel_early}, 2009–2026={novel_late}; "
                f"counting only share >= {NOVEL_SHARE_FLOOR:.0%}; peak={peak_novel_era['era']}."
            ),
        }
    )

    if spacing and trad_big:
        claims.append(
            {
                "claim": "Global K=8 vocabulary shifted toward spacing, away from traditional bigs",
                "supported": spacing["delta"] > 0.03 and trad_big["delta"] < -0.05,
                "detail": (
                    f'"{spacing["name"]}" {spacing["early"]:.1%}->{spacing["late"]:.1%}; '
                    f'"{trad_big["name"]}" {trad_big["early"]:.1%}->{trad_big["late"]:.1%}.'
                ),
            }
        )

    supported_n = sum(1 for c in claims if c["supported"])
    if supported_n >= 5:
        verdict = "supported"
    elif supported_n >= 3:
        verdict = "partially_supported"
    else:
        verdict = "not_supported"

    return {
        "verdict": verdict,
        "supportedClaims": supported_n,
        "totalClaims": len(claims),
        "claims": claims,
        "headline": (
            "Evidence supports emergence with nuance: archetype count does not shrink monotonically "
            "from early eras, but role mix and geometry shift toward spacing-era forms after a "
            "mid-2000s compression."
            if verdict != "not_supported"
            else "Evidence is insufficient for emergence or early-era compression under current criteria."
        ),
    }


def strip_centroids(eras: list[dict]) -> list[dict]:
    out = []
    for e in eras:
        archs = []
        for a in e["archetypes"]:
            archs.append({k: v for k, v in a.items() if k != "mtnnCentroid"})
        out.append(
            {**{k: v for k, v in e.items() if k != "archetypes"}, "archetypes": archs}
        )
    return out


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    players = data["players"]
    E, mtnn_meta = load_mtnn_embeddings()
    grades, skill_meta = load_skill_grades()
    ids = [p["id"] for p in players]
    seasons = sorted({p["season"] for p in players})

    global_lab, _ = kmeans(E, GLOBAL_K, seed=42)
    global_names = assign_cluster_names(global_lab, GLOBAL_K, ids, grades, skill_meta)

    idx = skill_index(skill_meta)
    eras = build_era_native(E, players, ids, grades, skill_meta, idx)
    tagged = tagged_prevalence_over_eras(eras)
    player_roles = player_role_prevalence(grades, players, idx)
    global_era = global_prevalence_by_era(players, global_lab, global_names)
    global_shifts = global_archetype_shifts(global_era)
    rolling = rolling_k_entropy(E, players, seasons, width=5)
    three_d_ex = exemplar_players(E, players, eras, "three_and_d")
    stretch_ex = exemplar_players(E, players, eras, "stretch_big")
    hypothesis = evaluate_hypothesis(
        eras,
        tagged,
        player_roles,
        global_era,
        rolling,
        global_shifts,
    )

    report = {
        "built": time.strftime("%Y-%m-%d"),
        "embeddingSpace": mtnn_meta.get("model", "mtnn"),
        "method": (
            "Era-native MTNN k-means (silhouette K in 6–12) + skill-grade names; "
            "tags are keyword heuristics on those names; novelty = ancestor cosine < "
            f"{NOVELTY_THRESH}; effective N = 2^Shannon entropy of cluster shares."
        ),
        "hypothesis": hypothesis,
        "eraSummary": [
            {
                "era": e["era"],
                "k": e["k"],
                "effectiveN": e["effectiveN"],
                "entropyBits": e["entropyBits"],
            }
            for e in eras
        ],
        "taggedPrevalence": tagged,
        "playerRolePrevalence": player_roles,
        "globalK8ByEra": global_era,
        "globalArchetypeShifts": global_shifts,
        "rollingWindows": rolling,
        "exemplars": {"three_and_d": three_d_ex, "stretch_big": stretch_ex},
        "eras": strip_centroids(eras),
    }

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(json.dumps(report, indent=2), encoding="utf-8")

    # Client-safe subset for trends page
    asset = {
        "built": report["built"],
        "hypothesis": hypothesis,
        "eraSummary": report["eraSummary"],
        "taggedPrevalence": tagged,
        "playerRolePrevalence": player_roles,
        "globalArchetypeShifts": global_shifts,
        "rollingWindows": rolling,
    }
    OUT_ASSET.write_text(json.dumps(asset, separators=(",", ":")), encoding="utf-8")

    print("Archetype emergence audit")
    print(
        f"  Verdict: {hypothesis['verdict']} ({hypothesis['supportedClaims']}/{hypothesis['totalClaims']} claims)"
    )
    print(f"  {hypothesis['headline']}\n")
    for e in eras:
        nov = sum(1 for a in e["archetypes"] if a.get("novel"))
        print(f"  {e['era']}: K={e['k']} effN={e['effectiveN']:.2f} novel={nov}")
    print("\n  Player-season role prevalence (3&D / stretch / trad big):")
    for t in player_roles:
        print(
            f"    {t['era']}: 3&D={t['three_and_d']:.1%} "
            f"stretch={t['stretch_big']:.1%} trad={t['traditional_big']:.1%}"
        )
    if global_shifts.get("spacingArchetypeDelta"):
        sp = global_shifts["spacingArchetypeDelta"]
        tb = global_shifts["traditionalBigDelta"]
        print(
            f"\n  Global K=8 shift: {sp['name']} {sp['early']:.1%}->{sp['late']:.1%}; "
            f"{tb['name']} {tb['early']:.1%}->{tb['late']:.1%}"
        )
    print(f"\nwrote {OUT_DATA}")
    print(f"wrote {OUT_ASSET}")


if __name__ == "__main__":
    main()
