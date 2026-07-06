"""Skills Lens invariant gates — run after every build_skills.py.

Gates (docs/SKILLS_LENS.md section 5): alignment with the frozen game
contract, grade bounds, era honesty (every season pool carries the same
grade distribution), discriminative spread, probe round-trip fidelity,
and curated face-validity spot checks.

Run:  python pipeline/test_skills.py        (exit 0 = all gates pass)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
SKILLS = ROOT / "assets" / "skills.json"
PROBE = ROOT / "assets" / "skill_probe.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        FAILURES.append(msg)


def main() -> None:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    sk = json.loads(SKILLS.read_text(encoding="utf-8"))
    probe = json.loads(PROBE.read_text(encoding="utf-8"))

    players = vec["players"]
    grades = np.array(sk["grades"], dtype=np.int64)
    keys = [s["key"] for s in sk["skills"]]
    n, k = grades.shape

    print("alignment")
    check(n == len(players), f"grades rows == vectors players ({n})")
    check(k == len(keys) == 12, f"12 skills ({k})")
    check(probe["skills"] == keys, "probe skill order matches skills.json")
    check(probe["features"] == vec["features"], "probe feature order matches contract")

    print("bounds")
    check(int(grades.min()) >= 0 and int(grades.max()) <= 99, "grades in [0, 99]")

    print("era honesty")
    seasons = np.array([p["season"] for p in players])
    uniq = sorted(set(seasons.tolist()))
    means_ok, stds_ok = True, True
    for s in uniq:
        g = grades[seasons == s]
        if not (42 <= g.mean(axis=0).min() and g.mean(axis=0).max() <= 58):
            means_ok = False
        if g.std(axis=0).min() < 20:
            stds_ok = False
    check(means_ok, f"per-season mean grade in [42, 58] for all {len(uniq)} seasons")
    check(stds_ok, "per-season grade std >= 20 for every skill")

    print("probe round-trip")
    # The probe grades vs the pooled ALL-ERA distribution (the right pool
    # for fused chimera vectors); season grades use the season pool. So the
    # gates are: (a) interpolation fidelity vs the exact pooled percentile,
    # (b) rank agreement with season grades.
    V = np.array([p["v"] for p in players], dtype=np.float64)
    W = np.array(probe["W"], dtype=np.float64)
    scores = V @ W.T
    knots_p = np.linspace(0.0, 100.0, len(next(iter(probe["quantiles"].values()))))
    fid_ok, corr_ok, worst_fid, worst_corr = True, True, 0.0, 1.0
    for j, key in enumerate(keys):
        q = np.array(probe["quantiles"][key], dtype=np.float64)
        est = np.clip(np.interp(scores[:, j], q, knots_p), 0, 99)
        exact = np.clip(
            (scores[:, j].argsort().argsort() + 0.5) / n * 100.0, 0, 99)
        worst_fid = max(worst_fid, float(np.abs(est - exact).max()))
        r = float(np.corrcoef(est, grades[:, j])[0, 1])
        worst_corr = min(worst_corr, r)
        fid_ok &= worst_fid <= 1.0
        corr_ok &= r >= 0.98
    check(fid_ok, f"probe within 1 pt of exact pooled percentile (worst {worst_fid:.2f})")
    check(corr_ok, f"probe vs season-grade corr >= 0.98 per skill (worst {worst_corr:.4f})")

    print("face validity")
    gl = {(p["name"], p["season"]): grades[i] for i, p in enumerate(players)}
    ki = {key: j for j, key in enumerate(keys)}

    def spot(name: str, season: str, skill: str, floor: int) -> None:
        row = gl.get((name, season))
        if row is None:
            check(False, f"{name} {season} present")
            return
        check(int(row[ki[skill]]) >= floor,
              f"{name} {season} {skill} >= {floor} (got {int(row[ki[skill]])})")

    spot("Stephen Curry", "2015-16", "shooting", 95)
    spot("Shaquille O'Neal", "1999-00", "finishing", 95)
    spot("John Stockton", "1996-97", "playmaking", 95)
    spot("Dennis Rodman", "1996-97", "dreb", 95)
    spot("Dikembe Mutombo", "1996-97", "rim", 95)
    spot("Michael Jordan", "1996-97", "scoring", 95)
    spot("Chris Paul", "2008-09", "hands", 90)
    spot("Steve Nash", "2005-06", "ft", 90)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print("all skill gates passed")


if __name__ == "__main__":
    main()
