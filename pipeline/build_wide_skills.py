"""Track J deriver — three masked wide-matrix skills (post/transition/motor).

Reads the synergy+hustle caches (fetch_wide_skills.py) or the committed
fixture, and grades three skills the box-score 14-dim contract can't
express. Each is an era-z composite within the covered-season pool, then
a percentile grade 0-99 — identical grading to the core Skills Lens, but
emitted ONLY for player-seasons with tracking coverage (2015-16+).

  post        Post Hub   0.6*postup-freq-z + 0.4*postup-PPP-z
  transition  Sprinter   0.6*transition-freq-z + 0.4*transition-PPP-z
  motor       Motor      mean z of screen assists, deflections, loose
                         balls, charges drawn, box-outs

Outputs:
  assets/skills_wide.json         grades keyed "name|season" (game surface)
  pipeline/data/wide_skill_labels.npz  masked MTNN skill-tower targets

Run:  python pipeline/build_wide_skills.py [--fixture]
Everything pre-2015-16 (or any uncovered row) is masked — the Skills Lens
shows "not tracked this era", never a fabricated grade.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "wide_skills.example.json"
ASSET_OUT = ROOT / "assets" / "skills_wide.json"
LABELS_OUT = ROOT / "pipeline" / "data" / "wide_skill_labels.npz"

WIDE_SKILLS = [
    {"key": "post", "label": "Post Play", "badge": "Post Hub"},
    {"key": "transition", "label": "Transition", "badge": "Sprinter"},
    {"key": "motor", "label": "Motor", "badge": "Motor"},
]
BADGE_GRADE = 90
GOLD_GRADE = 97
MOTOR_COLS = ["screen_ast", "deflections", "loose_balls", "charges", "box_outs"]


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def load_caches(use_fixture: bool) -> tuple[dict, bool]:
    """(season, norm_name) -> raw dict, plus a `complete` flag."""
    out: dict[tuple[str, str], dict] = {}
    per_season = sorted(CACHE_DIR.glob("wide_skills_*.json"))
    if per_season and not use_fixture:
        complete = True
        for path in per_season:
            doc = json.loads(path.read_text(encoding="utf-8"))
            complete = complete and bool(doc.get("complete"))
            for nn, rec in doc.get("players", {}).items():
                out[(doc["season"], nn)] = rec
        return out, complete
    if not FIXTURE.exists():
        raise SystemExit(f"no wide-skill caches and no fixture at {FIXTURE}")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for season, recs in doc.get("players", {}).items():
        for nn, rec in recs.items():
            out[(season, nn)] = rec
    return out, bool(doc.get("complete"))


def zscore(col: np.ndarray) -> np.ndarray:
    mu, sd = float(np.nanmean(col)), float(np.nanstd(col)) or 1.0
    return np.clip((col - mu) / sd, -4, 4)


def percentile_grade(scores: np.ndarray) -> np.ndarray:
    order = scores.argsort().argsort()
    return np.clip(((order + 0.5) / len(scores) * 100).astype(int), 0, 99)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    args = ap.parse_args()

    cache, complete = load_caches(args.fixture)
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    # Gather covered rows aligned to vectors.json order.
    covered_idx, raw = [], []
    for i, p in enumerate(vec["players"]):
        rec = cache.get((p["season"], norm_name(p["name"])))
        if rec is None:
            continue
        covered_idx.append(i)
        raw.append(rec)
    if not covered_idx:
        raise SystemExit("no covered rows — check cache/fixture seasons")

    seasons = np.array([vec["players"][i]["season"] for i in covered_idx])
    names = np.array([vec["players"][i]["name"] for i in covered_idx])

    def col(key):
        return np.array([float(r.get(key) or 0.0) for r in raw])

    # Composites (era-z within the covered pool, per season).
    grades = {sk["key"]: np.zeros(len(covered_idx), int) for sk in WIDE_SKILLS}
    for s in sorted(set(seasons.tolist())):
        m = seasons == s
        if m.sum() < 3:  # too few tracked players to rank meaningfully
            continue
        post = 0.6 * zscore(col("post_freq")[m]) + 0.4 * zscore(col("post_ppp")[m])
        trans = 0.6 * zscore(col("trans_freq")[m]) + 0.4 * zscore(col("trans_ppp")[m])
        motor = np.mean([zscore(col(c)[m]) for c in MOTOR_COLS], axis=0)
        grades["post"][m] = percentile_grade(post)
        grades["transition"][m] = percentile_grade(trans)
        grades["motor"][m] = percentile_grade(motor)

    built = time.strftime("%Y-%m-%d")
    splits = {}
    for k, i in enumerate(covered_idx):
        splits[f"{names[k]}|{seasons[k]}"] = {
            sk["key"]: int(grades[sk["key"]][k]) for sk in WIDE_SKILLS}

    # assets/skills_wide.json ships only from a complete cache.
    if complete:
        ASSET_OUT.write_text(json.dumps({
            "built": built,
            "note": ("masked wide-matrix skills — synergy play-types + hustle, "
                     "2015-16+. Same era-z percentile grading as the core lens."),
            "skills": [{"key": s["key"], "label": s["label"], "badge": s["badge"]}
                       for s in WIDE_SKILLS],
            "badgeGrade": BADGE_GRADE, "goldGrade": GOLD_GRADE,
            "grades": splits,
        }, separators=(",", ":")), encoding="utf-8")
        asset_msg = f"wrote {ASSET_OUT.relative_to(ROOT)} ({len(splits)} rows)"
    else:
        asset_msg = ("assets/skills_wide.json NOT written (partial cache — "
                     "wide skills stay dormant in the game)")

    LABELS_OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        LABELS_OUT,
        name=names, season=seasons,
        keys=np.array([s["key"] for s in WIDE_SKILLS]),
        grades=np.stack([grades[s["key"]] for s in WIDE_SKILLS], axis=1).astype(np.float32) / 100.0,
    )

    print(f"wide skills: {len(covered_idx)} covered rows across "
          f"{len(set(seasons.tolist()))} seasons (cache complete={complete})")
    for sk in WIDE_SKILLS:
        top = names[np.argsort(-grades[sk["key"]])[:3]]
        print(f"  {sk['key']:<11} top: {', '.join(top)}")
    print(f"wrote {LABELS_OUT.relative_to(ROOT)}; {asset_msg}")


if __name__ == "__main__":
    main()
