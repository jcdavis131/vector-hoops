"""Continuously-growing dataset orchestrator — one command, auditable growth.

Runs the refresh loop end to end and records what actually changed:

  1. FETCH (best-effort): refresh the current season's stats.nba.com caches
     via build_vectors.py. stats.nba.com blocks most datacenter IPs, so a
     fetch failure is EXPECTED off an operator machine — the run degrades
     to offline rebuild instead of dying.
  2. REBUILD: build_vectors.py --offline when the wide cache is healthy
     (skipped gracefully on the compact legacy cache), then
     build_skills.py — deterministic from assets/vectors.json.
  3. GATE: pipeline/test_skills.py must pass or the run reports failure.
  4. LEDGER: append a row to pipeline/data/dataset_ledger.json with row
     counts, season coverage, badge counts and a grade checksum, so
     dataset growth is auditable run-over-run.

Run:  python pipeline/update_dataset.py [--offline] [--season 2025-26]
Cadence: weekly in season (see docs/SKILLS_LENS.md section 4).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
LEDGER = PIPELINE / "cache" / "dataset_ledger.json"  # committed — auditable growth
VECTORS = ROOT / "assets" / "vectors.json"
SKILLS = ROOT / "assets" / "skills.json"


def run_step(name: str, cmd: list[str], required: bool) -> dict:
    print(f"== {name}: {' '.join(cmd)}")
    t0 = time.time()
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    ok = proc.returncode == 0
    tail = "\n".join((proc.stdout + proc.stderr).strip().splitlines()[-6:])
    print(tail)
    status = "ok" if ok else ("failed" if required else "skipped (best-effort)")
    print(f"== {name}: {status} ({time.time() - t0:.0f}s)\n")
    if not ok and required:
        raise SystemExit(f"required step failed: {name}")
    return {"step": name, "ok": ok, "seconds": round(time.time() - t0, 1)}


def snapshot() -> dict:
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    sk = json.loads(SKILLS.read_text(encoding="utf-8"))
    grades_blob = json.dumps(sk["grades"], separators=(",", ":")).encode()
    n_badges = sum(1 for row in sk["grades"] for g in row if g >= sk["badgeGrade"])
    ped_path = PIPELINE / "data" / "pedigree.json"
    pedigree = None
    if ped_path.exists():
        ped = json.loads(ped_path.read_text(encoding="utf-8"))
        pedigree = {
            "cache_complete": ped.get("cache_complete"),
            **ped.get("coverage", {}),
        }
    po_path = PIPELINE / "data" / "playoffs.json"
    playoffs = None
    if po_path.exists():
        po = json.loads(po_path.read_text(encoding="utf-8"))
        playoffs = {
            "cache_complete": po.get("cache_complete"),
            **po.get("coverage", {}),
        }
    return {
        "pedigree": pedigree,
        "playoffs": playoffs,
        "player_seasons": len(vec["players"]),
        "seasons": [vec["seasons"][0], vec["seasons"][-1]]
        if isinstance(vec.get("seasons"), list)
        else None,
        "n_seasons": len({p["season"] for p in vec["players"]}),
        "skills": len(sk["skills"]),
        "badges": n_badges,
        "grade_sha1": hashlib.sha1(grades_blob).hexdigest()[:12],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--offline", action="store_true", help="skip the network fetch entirely"
    )
    ap.add_argument(
        "--season",
        default=None,
        help="hint for logs only; fetch always resumes from cache",
    )
    args = ap.parse_args()

    steps = []
    if not args.offline:
        # Best-effort: resumes from cache, throttles per repo policy.
        steps.append(
            run_step(
                "fetch+rebuild (stats.nba.com)",
                [sys.executable, "pipeline/build_vectors.py"],
                required=False,
            )
        )
        steps.append(
            run_step(
                "fetch draft history (Track H)",
                [sys.executable, "pipeline/fetch_draft_history.py"],
                required=False,
            )
        )
        steps.append(
            run_step(
                "fetch playoffs (Track I)",
                [sys.executable, "pipeline/fetch_playoffs.py"],
                required=False,
            )
        )
        steps.append(
            run_step(
                "fetch wide skills (Track J)",
                [sys.executable, "pipeline/fetch_wide_skills.py"],
                required=False,
            )
        )
    else:
        print("== fetch: skipped (--offline)\n")

    # Offline rebuild only when the fetch produced/kept a healthy wide cache;
    # on the compact legacy cache this fails harmlessly and we keep the
    # shipped vectors.json (still the source of truth for skills).
    steps.append(
        run_step(
            "rebuild vectors (offline)",
            [sys.executable, "pipeline/build_vectors.py", "--offline"],
            required=False,
        )
    )

    steps.append(
        run_step(
            "rebuild skills",
            [sys.executable, "pipeline/build_skills.py"],
            required=True,
        )
    )
    steps.append(
        run_step(
            "skill gates", [sys.executable, "pipeline/test_skills.py"], required=True
        )
    )
    # Pedigree derivation is dormant until the real draft cache exists;
    # the gate itself always runs (fixture mode validates the logic).
    steps.append(
        run_step(
            "rebuild pedigree (Track H)",
            [sys.executable, "pipeline/build_pedigree.py"],
            required=False,
        )
    )
    steps.append(
        run_step(
            "pedigree gates",
            [sys.executable, "pipeline/test_pedigree.py"],
            required=True,
        )
    )
    # Playoffs (Track I) — dormant until real playoff caches exist; the
    # gate always runs (fixture mode validates the derivation logic).
    steps.append(
        run_step(
            "rebuild playoffs (Track I)",
            [sys.executable, "pipeline/build_playoffs.py"],
            required=False,
        )
    )
    steps.append(
        run_step(
            "playoff gates",
            [sys.executable, "pipeline/test_playoffs.py"],
            required=True,
        )
    )
    # Wide skills (Track J) — dormant until real synergy/hustle caches exist;
    # the gate always runs (fixture mode validates the derivation logic).
    steps.append(
        run_step(
            "rebuild wide skills (Track J)",
            [sys.executable, "pipeline/build_wide_skills.py"],
            required=False,
        )
    )
    steps.append(
        run_step(
            "wide-skill gates",
            [sys.executable, "pipeline/test_wide_skills.py"],
            required=True,
        )
    )
    # Eval scoreboard — held-out adjacent-season retrieval over the shipped
    # embedding assets (assets/mtnn_embeddings.f32 + vectors.json). Pure
    # derivation from committed assets, so both steps are hard requirements.
    steps.append(
        run_step(
            "rebuild eval scoreboard",
            [sys.executable, "pipeline/build_eval_scoreboard.py"],
            required=True,
        )
    )
    steps.append(
        run_step(
            "eval-scoreboard gates",
            [sys.executable, "pipeline/test_eval_scoreboard.py"],
            required=True,
        )
    )
    # Arena bundle — the /fingerprint game's compact repack of the assets
    # rebuilt above. Pure derivation, so both steps are hard requirements.
    steps.append(
        run_step(
            "rebuild arena bundle",
            [sys.executable, "pipeline/build_arena.py"],
            required=True,
        )
    )
    steps.append(
        run_step(
            "arena gates", [sys.executable, "pipeline/test_arena.py"], required=True
        )
    )

    entry = {
        "run": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "season_hint": args.season,
        "steps": steps,
        **snapshot(),
    }
    ledger = []
    if LEDGER.exists():
        ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
    prev = ledger[-1] if ledger else None
    ledger.append(entry)
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(ledger, indent=1), encoding="utf-8")

    print(f"ledger: {len(ledger)} runs -> {LEDGER.relative_to(ROOT)}")
    if prev:
        d_rows = entry["player_seasons"] - prev["player_seasons"]
        changed = entry["grade_sha1"] != prev["grade_sha1"]
        print(
            f"growth since last run: {d_rows:+d} player-seasons; "
            f"grades {'CHANGED' if changed else 'unchanged'}"
        )
    print(json.dumps({k: v for k, v in entry.items() if k != "steps"}, indent=2))


if __name__ == "__main__":
    main()
