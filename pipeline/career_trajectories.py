"""CAREER TRAJECTORIES — how an individual's archetype evolves across
his career. Method (stated in the artifact):

- Careers with >=4 charted seasons; each season carries its global
  archetype label (per-season k-means, NOT career-static — the whole
  point).
- TAXONOMY (rule-based, stated):
    stable      — modal archetype covers >=75% of seasons
    reinvention — exactly one sustained switch (>=2 consecutive
                  seasons in the new modal archetype, before+after
                  blocks each >=2 seasons)
    late-bloom  — reinvention whose switch happens at season index
                  >= 60% through the career
    migrator    — 3+ distinct archetypes, none reaching 60% share
    drifter     — everything else (2 archetypes, unsustained switches)
- ERA COMPARISON: transition rate (changes per season-pair) for
  careers whose midpoint falls in each decade — do careers migrate
  more now?
- CORRELATES (observed, selection effects stated): career mean
  PLUS_MINUS z and career length by trajectory class.

Output: assets/trajectories.json
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
MIN_SEASONS = 4


def classify(seq: list[int]) -> str:
    n = len(seq)
    modal, modal_n = Counter(seq).most_common(1)[0]
    if modal_n / n >= 0.75:
        return "stable"
    distinct = len(set(seq))
    # sustained single switch?
    for i in range(2, n - 1):
        pre, post = seq[:i], seq[i:]
        pm, pmn = Counter(pre).most_common(1)[0]
        qm, qmn = Counter(post).most_common(1)[0]
        if pm != qm and pmn / len(pre) >= 0.75 and qmn / len(post) >= 0.75:
            return "late-bloom" if i / n >= 0.6 else "reinvention"
    if distinct >= 3 and modal_n / n < 0.6:
        return "migrator"
    return "drifter"


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    clusters = data["clusters"]
    pm_idx = data["features"].index("PLUS_MINUS")

    careers = defaultdict(list)
    for p in data["players"]:
        careers[p["name"]].append(p)

    rows = []
    for name, seasons in careers.items():
        if len(seasons) < MIN_SEASONS:
            continue
        seasons.sort(key=lambda r: r["season"])
        seq = [r["c"] for r in seasons]
        changes = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
        klass = classify(seq)
        mid_year = int(seasons[len(seasons) // 2]["season"][:4])
        rows.append({
            "name": name, "n": len(seasons),
            "path": [{"season": r["season"], "archetype": clusters[r["c"]]}
                     for r in seasons],
            "changes": changes,
            "transitionRate": round(changes / (len(seasons) - 1), 3),
            "class": klass,
            "decade": f"{mid_year // 10 * 10}s",
            "meanPMz": round(float(np.mean([r["v"][pm_idx]
                                            for r in seasons])), 3),
        })

    # class stats
    by_class = defaultdict(list)
    for r in rows:
        by_class[r["class"]].append(r)
    class_stats = [{
        "class": c,
        "count": len(v),
        "share": round(len(v) / len(rows), 4),
        "meanCareerLength": round(float(np.mean([r["n"] for r in v])), 2),
        "meanPMz": round(float(np.mean([r["meanPMz"] for r in v])), 3),
    } for c, v in sorted(by_class.items(), key=lambda kv: -len(kv[1]))]

    # era comparison: transition rate by career-midpoint decade
    by_dec = defaultdict(list)
    for r in rows:
        by_dec[r["decade"]].append(r["transitionRate"])
    era_rates = [{"decade": d, "careers": len(v),
                  "meanTransitionRate": round(float(np.mean(v)), 3)}
                 for d, v in sorted(by_dec.items())]

    # most common reinvention motifs (from-archetype -> to-archetype)
    motifs = Counter()
    for r in rows:
        if r["class"] in ("reinvention", "late-bloom"):
            seq = [p["archetype"] for p in r["path"]]
            pre_modal = Counter(seq[:len(seq) // 2]).most_common(1)[0][0]
            post_modal = Counter(seq[len(seq) // 2:]).most_common(1)[0][0]
            if pre_modal != post_modal:
                motifs[(pre_modal, post_modal)] += 1
    top_motifs = [{"from": a, "to": b, "count": n}
                  for (a, b), n in motifs.most_common(8)]

    # per-player compact index for the wiki/dossiers
    index = {r["name"]: {"class": r["class"], "changes": r["changes"]}
             for r in rows}

    (ASSETS / "trajectories.json").write_text(json.dumps({
        "method": ("careers >=4 charted seasons; per-season global "
                   "archetype labels (never career-static); taxonomy "
                   "rule-based as documented (stable >=75% modal; "
                   "reinvention = one sustained >=75%/>=75% switch; "
                   "late-bloom = switch at >=60% career index; migrator "
                   "= 3+ archetypes none >=60%); era comparison by "
                   "career-midpoint decade; correlates are observed "
                   "with selection effects — trajectory class is an "
                   "outcome, not an assignment"),
        "totalCareers": len(rows),
        "classStats": class_stats,
        "eraTransitionRates": era_rates,
        "topReinventionMotifs": top_motifs,
        "playerIndex": index,
    }, separators=(",", ":")), encoding="utf-8")

    print(f"{len(rows)} careers classified")
    for c in class_stats:
        print(f"  {c['class']}: {c['share']:.1%} (len {c['meanCareerLength']}, "
              f"PMz {c['meanPMz']:+.2f})")
    print("era transition rates:", {e['decade']: e['meanTransitionRate']
                                    for e in era_rates})
    print("top motifs:")
    for m in top_motifs[:3]:
        print(f"  {m['from']} -> {m['to']} ({m['count']})")


if __name__ == "__main__":
    main()
