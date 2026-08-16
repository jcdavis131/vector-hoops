"""CAREER TRAJECTORIES — how an individual's MTNN archetype and skill
profile evolve across his career. Method (stated in the artifact):

- Careers with >=4 charted seasons; each season carries its GLOBAL
  MTNN k-means archetype label (same K=8 fit as archetypes_time.py layer 1).
- Skill arc: mean first-half vs second-half grade delta on each of the 12
  skill composites (skills.json), surfaced as the two largest swings.
- TAXONOMY (rule-based, stated):
    stable      — modal archetype covers >=75% of seasons
    reinvention — one sustained switch (>=75% modal before & after, >=2 seasons each side)
    late-bloom  — reinvention with switch at >=60% career index
    migrator    — 3+ distinct archetypes, none reaching 60% share
    drifter     — everything else
- ERA COMPARISON: transition rate by career-midpoint decade.
- EXAMPLES: 2–3 named careers per class with full paths for the UI.

Output: assets/trajectories.json
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import itertools  # noqa: E402

from trend_mtnn import (  # noqa: E402
    assign_cluster_names,
    kmeans,
    load_mtnn_embeddings,
    load_skill_grades,
)

ASSETS = HERE.parent / "assets"
MIN_SEASONS = 4
GLOBAL_K = 8
EXAMPLES_PER_CLASS = 3

NOTABLE = {
    "LeBron James",
    "Stephen Curry",
    "Kevin Durant",
    "Chris Paul",
    "Nikola Jokic",
    "Giannis Antetokounmpo",
    "Kawhi Leonard",
    "Damian Lillard",
    "Jimmy Butler",
    "Kyle Lowry",
    "Pau Gasol",
    "Dirk Nowitzki",
    "Tim Duncan",
    "Kobe Bryant",
    "Vince Carter",
    "Shaquille O'Neal",
    "Tracy McGrady",
    "Grant Hill",
    "Karl Malone",
    "John Stockton",
    "Jason Kidd",
    "Ray Allen",
    "Reggie Miller",
    "Al Horford",
    "Brook Lopez",
    "Blake Griffin",
    "DeMar DeRozan",
    "Russell Westbrook",
    "James Harden",
    "Anthony Davis",
}


def classify(seq: list[int]) -> str:
    n = len(seq)
    _modal, modal_n = Counter(seq).most_common(1)[0]
    if modal_n / n >= 0.75:
        return "stable"
    distinct = len(set(seq))
    for i in range(2, n - 1):
        pre, post = seq[:i], seq[i:]
        pm, pmn = Counter(pre).most_common(1)[0]
        qm, qmn = Counter(post).most_common(1)[0]
        if pm != qm and pmn / len(pre) >= 0.75 and qmn / len(post) >= 0.75:
            return "late-bloom" if i / n >= 0.6 else "reinvention"
    if distinct >= 3 and modal_n / n < 0.6:
        return "migrator"
    return "drifter"


def skill_arc_summary(grade_rows: list[np.ndarray], skill_meta: list[dict]) -> dict:
    """First-half vs second-half mean grade deltas."""
    if len(grade_rows) < 4:
        return {"highlights": [], "narrative": ""}
    mid = len(grade_rows) // 2
    early = np.mean(grade_rows[:mid], axis=0)
    late = np.mean(grade_rows[mid:], axis=0)
    delta = late - early
    order = np.argsort(-np.abs(delta))
    highlights = []
    for i in order[:3]:
        d = float(delta[i])
        if abs(d) < 3:
            continue
        direction = "rose" if d > 0 else "fell"
        highlights.append(
            {
                "skill": skill_meta[i]["label"],
                "key": skill_meta[i]["key"],
                "delta": round(d, 1),
                "direction": direction,
            }
        )
    if not highlights:
        narrative = "Skill profile flat across halves."
    else:
        top = highlights[0]
        narrative = f"{top['skill']} {top['direction']} {abs(top['delta']):.0f} grade pts, half to half."
    return {"highlights": highlights[:2], "narrative": narrative}


def pick_examples(rows: list[dict], klass: str) -> list[dict]:
    pool = [r for r in rows if r["class"] == klass]
    if not pool:
        return []

    def score(r: dict) -> tuple:
        notable = 1 if r["name"] in NOTABLE else 0
        return (notable, r["n"], abs(r.get("meanPMz", 0)))

    pool.sort(key=score, reverse=True)
    chosen = []
    seen_sigs = set()
    for r in pool:
        sig = tuple(p["archetype"] for p in r["path"])
        if sig in seen_sigs and r["name"] not in NOTABLE:
            continue
        seen_sigs.add(sig)
        chosen.append(
            {
                "name": r["name"],
                "n": r["n"],
                "class": r["class"],
                "path": r["path"],
                "skillArc": r.get("skillArc", {}),
                "meanPMz": r.get("meanPMz"),
            }
        )
        if len(chosen) >= EXAMPLES_PER_CLASS:
            break
    return chosen


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    players = data["players"]
    E, _ = load_mtnn_embeddings()
    grades, skill_meta = load_skill_grades()
    pm_idx = data["features"].index("PLUS_MINUS")
    ids = [p["id"] for p in players]

    global_lab, _ = kmeans(E, GLOBAL_K, seed=42)
    cluster_names = assign_cluster_names(global_lab, GLOBAL_K, ids, grades, skill_meta)

    careers = defaultdict(list)
    for j, p in enumerate(players):
        careers[p["name"]].append((p, j))

    rows = []
    for name, seasons in careers.items():
        if len(seasons) < MIN_SEASONS:
            continue
        seasons.sort(key=lambda t: t[0]["season"])
        seq = [int(global_lab[j]) for _, j in seasons]
        arch_path = [
            {"season": p["season"], "archetype": cluster_names[c]} for (p, _), c in zip(seasons, seq, strict=False)
        ]
        grade_rows = [grades[j] for _, j in seasons]
        skill_arc = skill_arc_summary(grade_rows, skill_meta)
        changes = sum(1 for a, b in itertools.pairwise(seq) if a != b)
        klass = classify(seq)
        mid_year = int(seasons[len(seasons) // 2][0]["season"][:4])
        rows.append(
            {
                "name": name,
                "n": len(seasons),
                "path": arch_path,
                "changes": changes,
                "transitionRate": round(changes / (len(seasons) - 1), 3),
                "class": klass,
                "decade": f"{mid_year // 10 * 10}s",
                "meanPMz": round(float(np.mean([p["v"][pm_idx] for p, _ in seasons])), 3),
                "skillArc": skill_arc,
            }
        )

    by_class = defaultdict(list)
    for r in rows:
        by_class[r["class"]].append(r)
    class_stats = [
        {
            "class": c,
            "count": len(v),
            "share": round(len(v) / len(rows), 4),
            "meanCareerLength": round(float(np.mean([r["n"] for r in v])), 2),
            "meanPMz": round(float(np.mean([r["meanPMz"] for r in v])), 3),
        }
        for c, v in sorted(by_class.items(), key=lambda kv: -len(kv[1]))
    ]

    by_dec = defaultdict(list)
    for r in rows:
        by_dec[r["decade"]].append(r["transitionRate"])
    era_rates = [
        {
            "decade": d,
            "careers": len(v),
            "meanTransitionRate": round(float(np.mean(v)), 3),
        }
        for d, v in sorted(by_dec.items())
    ]

    motifs = Counter()
    for r in rows:
        if r["class"] in ("reinvention", "late-bloom"):
            seq = [p["archetype"] for p in r["path"]]
            pre_modal = Counter(seq[: len(seq) // 2]).most_common(1)[0][0]
            post_modal = Counter(seq[len(seq) // 2 :]).most_common(1)[0][0]
            if pre_modal != post_modal:
                motifs[(pre_modal, post_modal)] += 1
    top_motifs = [{"from": a, "to": b, "count": n} for (a, b), n in motifs.most_common(8)]

    class_examples = {}
    for klass in ("stable", "reinvention", "late-bloom", "migrator", "drifter"):
        class_examples[klass] = pick_examples(rows, klass)

    index = {r["name"]: {"class": r["class"], "changes": r["changes"]} for r in rows}

    (ASSETS / "trajectories.json").write_text(
        json.dumps(
            {
                "n_charted": len(data["players"]),
                "embeddingSpace": "mtnn",
                "globalArchetypes": cluster_names,
                "method": (
                    "careers >=4 charted seasons; per-season global MTNN K=8 archetype "
                    "labels (same fit as archetypes_time layer 1); skill-arc deltas from "
                    "first-half vs second-half mean skill grades; taxonomy rule-based as "
                    "documented; era comparison by career-midpoint decade; correlates "
                    "observed with selection effects; examples are illustrative careers "
                    "per class, not a ranking"
                ),
                "totalCareers": len(rows),
                "classStats": class_stats,
                "classExamples": class_examples,
                "eraTransitionRates": era_rates,
                "topReinventionMotifs": top_motifs,
                "playerIndex": index,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print(f"{len(rows)} careers classified (MTNN archetypes)")
    for c in class_stats:
        print(f"  {c['class']}: {c['share']:.1%} (len {c['meanCareerLength']}, PMz {c['meanPMz']:+.2f})")
    print("examples per class:")
    for klass, ex in class_examples.items():
        names = ", ".join(e["name"] for e in ex)
        print(f"  {klass}: {names}")


if __name__ == "__main__":
    main()
