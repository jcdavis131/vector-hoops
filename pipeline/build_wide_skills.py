"""Track J deriver — three masked wide-matrix skills (post/transition/motor).

Reads the synergy+hustle caches (fetch_wide_skills.py) or the committed
fixture, and grades three skills the box-score 14-dim contract can't
express. Each is an era-z composite within the covered-season pool, then
a percentile grade 0-99 — identical grading to the core Skills Lens, but
emitted ONLY for player-seasons with tracking coverage (2015-16+).

  post        Post Hub      0.6*postup-freq-z + 0.4*postup-PPP-z
  transition  Sprinter      0.6*transition-freq-z + 0.4*transition-PPP-z
  motor       Motor         mean z of screen assists, deflections, loose
                            balls, charges drawn, box-outs
  shooting_gravity  Gravity Well  0.40*pull-up-3PA-z + 0.35*3PA-z
                                  + 0.25*3P%-z (Track K — spacing-pull
                                  PROXY; pull-up weighted so movement
                                  shooters like Curry top it, not spot-up
                                  specialists. NOT Second Spectrum gravity)
  rim_gravity       Rim Warden    0.50*BLK-z + 0.30*contested-z
                                  (Track K — interior deterrence PROXY;
                                  rim protectors like Wembanyama top it).
                                  The − 0.20*opp-FG%-z term is gone:
                                  d_fg_pct was 0.0 for every player of
                                  every season (never measured), so it
                                  z-scored to 0 and never moved a grade.
  disruption_gravity  Disruptor   0.45*STL-z + 0.35*deflections-z
                                  + 0.20*charges-z (perimeter warp —
                                  steals + hustle disruption; NOT
                                  Second Spectrum gravity)

Outputs:
  assets/skills_wide.json         grades keyed "name|season" (game surface)
  pipeline/data/wide_skill_labels.npz  masked MTNN skill-tower targets

Run:  python pipeline/build_wide_skills.py [--fixture]
Everything pre-2015-16 (or any uncovered row) is masked — the Skills Lens
shows "not tracked this era", never a fabricated grade.

A skill is graded only where its inputs were measured, and
wide_skill_labels.npz carries a per-skill `mask` (train_mtnn reads it when
present). The caches turned unmeasured hustle into 0.0 [ingest#2,
features#3]; hustle_coverage nulls it (every hustle field in 2015-16,
box-outs before 2017-18, rows absent from the hustle response), so motor,
rim_gravity and disruption_gravity are masked there instead of being graded
from zeros, and are ranked among the rows that were measured.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np

from _out_root import add_out_root, rerooted, shown
from hustle_coverage import honest_players

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
    # Track K — two kinds of gravity (see docs). Stated proxies from public
    # tracking + the box-score contract; NOT Second Spectrum gravity data.
    {"key": "shooting_gravity", "label": "Shooting Gravity", "badge": "Gravity Well"},
    {"key": "rim_gravity", "label": "Rim Gravity", "badge": "Rim Warden"},
    {"key": "disruption_gravity", "label": "Disruption Gravity", "badge": "Disruptor"},
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
    if not use_fixture:
        per_season = sorted(CACHE_DIR.glob("wide_skills_*.json"))
        # No real cache used to mean "read wide_skills.example.json" without
        # being asked: its 18 labelled rows (against 5,154 real, measured
        # 2026-10-09) became pipeline/data/wide_skill_labels.npz, the six
        # wide skill towers' targets [ingest#5]. The fixture is for tests and
        # runs only under --fixture.
        if not per_season:
            raise SystemExit(
                f"no {CACHE_DIR.name}/wide_skills_<season>.json: run pipeline/fetch_wide_skills.py on an operator "
                "machine (stats.nba.com blocks datacenter IPs); --fixture builds from the test fixture"
            )
        docs = [(path, json.loads(path.read_text(encoding="utf-8"))) for path in per_season]
        # A proxy doc is constants and formula stand-ins, not measurements.
        # fetch_missing_tracking.py wrote two (2013-14, 2014-15: post_ppp 0.9,
        # trans_ppp 1.15, d_fg_pct 0.45 for every player, contested_shots =
        # DIST_MILES*2), and this loop read them like any season, so the next
        # build would have labelled their 973 player records as skill-tower
        # targets [ingest#5]. Refused, never skipped: one in the canonical
        # namespace is an error to fix, not a season to build around.
        proxies = [
            path.name
            for path, doc in docs
            if doc.get("proxy") or any(isinstance(r, dict) and r.get("_proxy") for r in doc.get("players", {}).values())
        ]
        if proxies:
            raise SystemExit(
                f"refusing proxy wide-skill docs {proxies}: constants and formula stand-ins are not measurements; "
                "delete them (git history keeps them) or quarantine them outside pipeline/cache"
            )
        complete = True
        for _, doc in docs:
            complete = complete and bool(doc.get("complete"))
            for nn, rec in honest_players(doc).items():
                out[(doc["season"], nn)] = rec
        return out, complete
    if not FIXTURE.exists():
        raise SystemExit(f"--fixture: no fixture at {FIXTURE}")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for season, recs in doc.get("players", {}).items():
        for nn, rec in recs.items():
            out[(season, nn)] = rec
    return out, bool(doc.get("complete"))


def zscore(col: np.ndarray) -> np.ndarray:
    """Era-z over the measured (finite) values; unmeasured stays NaN."""
    ok = np.isfinite(col)
    if not ok.any():
        return np.full(col.shape, np.nan)
    mu, sd = float(np.mean(col[ok])), float(np.std(col[ok])) or 1.0
    return np.clip((col - mu) / sd, -4, 4)


def mean_measured(zs: np.ndarray) -> np.ndarray:
    """Row-wise mean of the finite entries of a [k, n] stack; NaN where none is finite."""
    n_ok = np.isfinite(zs).sum(axis=0)
    total = np.where(np.isfinite(zs), zs, 0.0).sum(axis=0)
    return np.where(n_ok > 0, total / np.maximum(n_ok, 1), np.nan)


def _configure_stdio() -> None:
    """Windows default cp1252 cannot print Jokić/Nurkić — force UTF-8 or ASCII fallback."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


def _safe_console(text: str) -> str:
    """Windows consoles often use cp1252 — avoid UnicodeEncodeError on accents."""
    return text.encode("ascii", "replace").decode("ascii")


def percentile_grade(scores: np.ndarray, tiebreak: np.ndarray | None = None) -> np.ndarray:
    """Percentile 0-99; exact score ties broken by `tiebreak` (a volume proxy,
    higher ranks above) so a busier player outranks a same-score bystander."""
    if tiebreak is None:
        tiebreak = np.zeros_like(scores)
    order = np.lexsort((tiebreak, scores))  # primary scores, secondary tiebreak
    ranks = np.empty(len(scores), dtype=int)
    ranks[order] = np.arange(len(scores))
    return np.clip(((ranks + 0.5) / len(scores) * 100).astype(int), 0, 99)


def grade_measured(scores: np.ndarray, tiebreak: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(grades, measured) — percentile among the rows with a finite score; the rest ungraded."""
    ok = np.isfinite(scores)
    g = np.zeros(len(scores), int)
    if ok.any():
        g[ok] = percentile_grade(scores[ok], np.nan_to_num(tiebreak[ok]))
    return g, ok


def main() -> None:
    global ASSET_OUT, LABELS_OUT
    _configure_stdio()
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    add_out_root(ap)
    args = ap.parse_args()
    ASSET_OUT = rerooted(ASSET_OUT, args.out_root)
    LABELS_OUT = rerooted(LABELS_OUT, args.out_root)

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

    # Contract (era-z) features for covered rows — the two gravity skills
    # combine the box-score contract (3PA, 3P%, BLK) with tracking.
    fidx = {f: k for k, f in enumerate(vec["features"])}
    Vcov = np.array([vec["players"][i]["v"] for i in covered_idx], dtype=np.float64)

    def col(key):
        # None (not measured) is NaN, never 0.0.
        return np.array([np.nan if r.get(key) is None else float(r[key]) for r in raw])

    def cfeat(name):
        return Vcov[:, fidx[name]]

    # Composites (era-z within the covered pool, per season).
    grades = {sk["key"]: np.zeros(len(covered_idx), int) for sk in WIDE_SKILLS}
    graded = {sk["key"]: np.zeros(len(covered_idx), bool) for sk in WIDE_SKILLS}
    for s in sorted(set(seasons.tolist())):
        m = seasons == s
        if m.sum() < 3:  # too few tracked players to rank meaningfully
            continue
        post = 0.6 * zscore(col("post_freq")[m]) + 0.4 * zscore(col("post_ppp")[m])
        trans = 0.6 * zscore(col("trans_freq")[m]) + 0.4 * zscore(col("trans_ppp")[m])
        motor_cols = np.stack([col(c)[m] for c in MOTOR_COLS])
        # Mean over the hustle columns measured for the row. In 2016-17
        # box-outs is null for everyone (was a constant 0, z 0), so the mean
        # of the other four ranks rows exactly as the old mean of five did.
        motor = mean_measured(np.stack([zscore(c) for c in motor_cols]))
        # Shooting gravity = the pull a perimeter threat exerts. Pull-up 3s
        # (self-created, off-dribble) weighted heaviest so movement shooters
        # like Curry outrank stationary spot-up specialists; plus 3PA volume
        # and accuracy. A proxy for spacing gravity, not Second Spectrum data.
        shoot_g = (
            0.40 * zscore(col("pull_up_fg3a")[m]) + 0.35 * zscore(cfeat("FG3A")[m]) + 0.25 * zscore(cfeat("FG3_PCT")[m])
        )
        # Rim gravity = interior deterrence that warps offenses: shot-blocking
        # + contested shots. Rim protectors like Wembanyama top it. A proxy,
        # not Second Spectrum rim gravity. Opponent FG% allowed was meant to
        # be a third term, but d_fg_pct was never measured (see docstring).
        rim_g = 0.50 * zscore(cfeat("BLK")[m]) + 0.30 * zscore(col("contested_shots")[m])
        # Perimeter disruption gravity — on-ball pressure + event creation
        # that shrinks opponent scoring chances (STL + deflections + charges).
        disrupt_g = (
            0.45 * zscore(cfeat("STL")[m]) + 0.35 * zscore(col("deflections")[m]) + 0.20 * zscore(col("charges")[m])
        )
        # Tie-break each skill by its own volume. A NaN score (an input not
        # measured for that row) leaves the skill ungraded and masked.
        scored = {
            "post": (post, col("post_freq")[m]),
            "transition": (trans, col("trans_freq")[m]),
            "motor": (motor, np.nansum(motor_cols, axis=0)),
            "shooting_gravity": (shoot_g, col("pull_up_fg3a")[m]),
            "rim_gravity": (rim_g, cfeat("BLK")[m]),
            "disruption_gravity": (disrupt_g, col("deflections")[m] + cfeat("STL")[m]),
        }
        for key, (score, tiebreak) in scored.items():
            grades[key][m], graded[key][m] = grade_measured(score, tiebreak)

    built = time.strftime("%Y-%m-%d")
    splits = {}
    for k, i in enumerate(covered_idx):
        splits[f"{names[k]}|{seasons[k]}"] = {
            sk["key"]: int(grades[sk["key"]][k]) for sk in WIDE_SKILLS if graded[sk["key"]][k]
        }

    # assets/skills_wide.json ships only from a complete cache.
    if complete:
        ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
        ASSET_OUT.write_text(
            json.dumps(
                {
                    "built": built,
                    "note": (
                        "masked wide-matrix skills — synergy play-types + hustle, "
                        "2015-16+. Same era-z percentile grading as the core lens."
                    ),
                    "skills": [{"key": s["key"], "label": s["label"], "badge": s["badge"]} for s in WIDE_SKILLS],
                    "badgeGrade": BADGE_GRADE,
                    "goldGrade": GOLD_GRADE,
                    "grades": splits,
                },
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        asset_msg = f"wrote {shown(ASSET_OUT)} ({len(splits)} rows)"
    else:
        asset_msg = "assets/skills_wide.json NOT written (partial cache — wide skills stay dormant in the game)"

    LABELS_OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        LABELS_OUT,
        name=names,
        season=seasons,
        keys=np.array([s["key"] for s in WIDE_SKILLS]),
        grades=np.stack([grades[s["key"]] for s in WIDE_SKILLS], axis=1).astype(np.float32) / 100.0,
        # Per-skill: 1 where the skill was graded from measured inputs. A
        # masked cell's grade is 0.0 and carries no weight in the skill loss.
        mask=np.stack([graded[s["key"]] for s in WIDE_SKILLS], axis=1).astype(np.float32),
    )

    print(
        f"wide skills: {len(covered_idx)} covered rows across "
        f"{len(set(seasons.tolist()))} seasons (cache complete={complete})"
    )
    for sk in WIDE_SKILLS:
        top = [str(n) for n in names[np.argsort(-grades[sk["key"]])[:3]]]
        n_graded = int(graded[sk["key"]].sum())
        print(f"  {sk['key']:<11} graded {n_graded}/{len(covered_idx)}  top: {_safe_console(', '.join(top))}")
    print(f"wrote {shown(LABELS_OUT)}; {asset_msg}")


if __name__ == "__main__":
    main()
