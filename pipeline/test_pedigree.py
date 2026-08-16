"""Track H (pedigree) invariant gates — run after every build_pedigree.py.

Uses the real draft cache when present, else the committed hand-checked
fixture (pipeline/cache/draft_history.example.json). The test rebuilds
pedigree.json itself so it always gates fresh derivation logic, then
checks: known-pick joins (including the Tim Hardaway Sr/Jr name
collision), leak-free per-player constancy, decay monotonicity, the
stated expectation curve, and mask honesty (a partial cache must never
label anyone undrafted).

Run:  python pipeline/test_pedigree.py        (exit 0 = all gates pass)
"""

from __future__ import annotations

import itertools
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import canonical_name

CACHE = ROOT / "pipeline" / "cache" / "draft_history.json"
PEDIGREE = ROOT / "pipeline" / "data" / "pedigree.json"

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    tag = "PASS" if cond else "FAIL"
    safe = msg.encode(sys.stdout.encoding or "utf-8", errors="backslashreplace").decode(
        sys.stdout.encoding or "utf-8", errors="backslashreplace"
    )
    print(f"  [{tag}] {safe}")
    if not cond:
        FAILURES.append(msg)


def rebuild() -> bool:
    """Re-derive pedigree.json; returns True if the REAL cache was used."""
    real = CACHE.exists()
    cmd = [sys.executable, "pipeline/build_pedigree.py"] + ([] if real else ["--fixture"])
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stdout + proc.stderr)
        raise SystemExit("build_pedigree.py failed")
    print(f"  (derived from {'REAL cache' if real else 'example fixture'})")
    return real


def main() -> None:
    real = rebuild()
    doc = json.loads(PEDIGREE.read_text(encoding="utf-8"))
    rows = doc["players"]
    covered = [r for r in rows if "PED_UNDRAFTED" in r]
    by = {(r["name"], r["season"]): r for r in covered}

    print("known-pick joins (hand-checked)")

    def spot(name, season, field, want, tol=1e-6):
        # rows carry vectors.json display names (ASCII-folded, suffix-stripped)
        name = canonical_name(name)
        r = by.get((name, season))
        if r is None:
            check(False, f"{name} {season} covered")
            return
        got = r.get(field)
        ok = (got is None and want is None) or (got is not None and want is not None and abs(got - want) <= tol)
        check(ok, f"{name} {season} {field} == {want} (got {got})")

    spot("LeBron James", "2003-04", "PED_PICK_QUALITY", 60)
    spot("LeBron James", "2003-04", "PED_EXPECT_SLOT", 1.0)
    spot("LeBron James", "2003-04", "PED_TEAM_WINPCT", 0.207)  # 17-65 Cavs
    spot("LeBron James", "2003-04", "PED_PICK_DECAY", 1.0)
    spot("Nikola Jokić", "2015-16", "PED_PICK_QUALITY", 20)  # pick 41, accent-fold join
    spot("Nikola Jokić", "2015-16", "PED_ROUND_ONE", 0.0)
    spot("Nikola Jokić", "2015-16", "PED_EXPECT_SLOT", 0.10)
    spot("Nikola Jokić", "2015-16", "PED_TEAM_WINPCT", 0.439)
    spot("Kobe Bryant", "1996-97", "PED_PICK_QUALITY", 48)
    spot("Kobe Bryant", "1996-97", "PED_TEAM_WINPCT", None)  # 1996 draft: pre-cache, masked
    # name-collision disambiguation: two "tim hardaway" draft records
    spot("Tim Hardaway", "1996-97", "PED_PICK_QUALITY", 47)  # Sr, #14 1989
    spot("Tim Hardaway Jr.", "2013-14", "PED_PICK_QUALITY", 37)  # Jr, #24 2013
    spot("Tim Hardaway Jr.", "2013-14", "PED_TEAM_WINPCT", 0.659)

    print("leak-free constancy + decay monotonicity")
    static_fields = [
        "PED_PICK_QUALITY",
        "PED_ROUND_ONE",
        "PED_UNDRAFTED",
        "PED_EXPECT_SLOT",
        "PED_TEAM_WINPCT",
    ]
    const_ok, decay_ok, years_ok = True, True, True
    per_player: dict[str, list[dict]] = {}
    for r in covered:
        per_player.setdefault(r["name"], []).append(r)
    for _name, prs in per_player.items():
        prs.sort(key=lambda r: r["season"])
        for f in static_fields:
            if len({json.dumps(r.get(f)) for r in prs}) != 1:
                const_ok = False
        decays = [r["PED_PICK_DECAY"] for r in prs]
        if any(b > a + 1e-9 for a, b in itertools.pairwise(decays)):
            decay_ok = False
        years = [r["PED_YEARS_SINCE"] for r in prs]
        if any(b < a for a, b in itertools.pairwise(years)):
            years_ok = False
    check(const_ok, "draft-time fields constant across every player's seasons")
    check(decay_ok, "PED_PICK_DECAY non-increasing over a career")
    check(years_ok, "PED_YEARS_SINCE non-decreasing over a career")

    print("expectation curve")
    sys.path.insert(0, str(ROOT / "pipeline"))
    from build_pedigree import expect_slot

    slots = [expect_slot(p) for p in range(1, 61)]
    check(slots[0] == 1.0, "expect_slot(1) == 1.0")
    check(
        all(a >= b - 1e-9 for a, b in itertools.pairwise(slots)),
        "expect_slot non-increasing in pick",
    )
    check(
        all(abs(s - 0.10) < 1e-9 for s in slots[30:]),
        "round-2 picks share the flat 0.10 slot",
    )

    print("mask honesty")
    if real:
        n_players = len(per_player)
        n_undrafted = sum(1 for prs in per_player.values() if prs[0]["PED_UNDRAFTED"] == 1.0)
        total_players = (
            doc["coverage"]["players_drafted"]
            + doc["coverage"]["players_undrafted"]
            + doc["coverage"]["players_unmatched_masked"]
        )
        cov = (doc["coverage"]["players_drafted"] + doc["coverage"]["players_undrafted"]) / max(total_players, 1)
        check(cov >= 0.95, f"complete cache resolves >= 95% of players ({cov:.3f})")
        check(
            0.03 <= n_undrafted / max(n_players, 1) <= 0.45,
            f"undrafted share plausible ({n_undrafted}/{n_players})",
        )
    else:
        check(
            doc["coverage"]["players_undrafted"] == 0,
            "partial cache labels NOBODY undrafted (masked instead)",
        )
        check(
            doc["coverage"]["players_unmatched_masked"] > 0,
            "partial cache leaves unmatched players masked",
        )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} gate(s) FAILED")
        sys.exit(1)
    print(
        "all pedigree gates passed"
        + ("" if real else " (fixture mode — run fetch_draft_history.py on an operator machine for full coverage)")
    )


if __name__ == "__main__":
    main()
