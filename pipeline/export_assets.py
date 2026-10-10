"""Promote client-safe pipeline outputs into assets/ for the static site.

The game contract stays transparent 14-d vectors.json; MTNN embeddings are
exported only from a promoted bundle (pipeline/promote.py), read through
promote.load_promoted(). This script refreshes everything the UI actually
fetches.

MTNN steps (2026-10-09). The gate here used to read the LAST run's
pipeline/data/mtnn_report.json and pass it on three floors without reading
the trainer's own verdict: on this box an 08-14 select-phase report with
promote ok=False passed it, and the manifest would have recorded
mtnn_promoted=true for an export of an 08-07 embedding [artifacts#2]. Now:
no promoted bundle -> the MTNN steps are skipped and the manifest says
mtnn_promoted false; a promoted bundle that fails verification (an edited,
missing or mixed file) -> this script stops; a verified one -> the MTNN
exports run and must succeed, and the manifest's model and metrics are
copied from the promoted manifest, never from the last-run report.

Run after integrate_context.py + train (or in parallel with training):

  python pipeline/export_assets.py
  python pipeline/verify_accuracy.py

Steps: skills, player_meta, pedigree asset, playoffs asset (if cache),
       archetype sidecars, assets/manifest.json ledger stamp.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import promote
import real_caches

ASSETS = ROOT / "assets"
CACHE_DIR = ROOT / "pipeline" / "cache"
MANIFEST = ASSETS / "manifest.json"
LEDGER = ROOT / "pipeline" / "cache" / "dataset_ledger.json"
SWEEP = ROOT / "pipeline" / "data" / "mtnn_hp_sweep.json"

CLIENT_ASSETS = [
    "season_norms.json",
    "vectors.json",
    "skills.json",
    "skills_wide.json",
    "skill_probe.json",
    "player_meta.json",
    "teams.json",
    "pedigree.json",
    "playoffs.json",
    "honors.json",
    "archetypes_time.json",
    "archetype_assignments.json",
    "archetype_emergence.json",
    "trajectories.json",
    "drift.json",
    "deadline.json",
    "chemistry.json",
    "pivots.json",
    "current_rosters.json",
    "projections.json",
    "mtnn_arch.json",
    "mtnn_map.json",
    "mtnn_heads.f32",
    "mtnn_inputs.f32",
    "eratwins.json",
    "faderfinisher.json",
    "roles.json",
    "mtnn_meta.json",
]


def run(name: str, cmd: list[str], required: bool = True) -> bool:
    print(f"== {name}: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=ROOT)
    ok = proc.returncode == 0
    print(f"== {name}: {'ok' if ok else 'FAILED'}\n")
    if not ok and required:
        raise SystemExit(f"required step failed: {name}")
    return ok


def sha1(path: Path) -> str | None:
    if not path.exists():
        return None
    return hashlib.sha1(path.read_bytes()).hexdigest()[:12]


def has_real_wide_caches() -> bool:
    """True when operator season caches exist (not just the example fixture)."""
    return any(CACHE_DIR.glob("wide_skills_*.json"))


# No fixture builds in the export path [artifacts#12, orchestration#1]. This
# used to pass --fixture to build_wide_skills when no real cache existed and
# to build_game_ratings always, so a production export rewrote
# pipeline/data/wide_skill_labels.npz (train_mtnn's skill targets) or
# game_ratings.json (an integrate_context input) from the committed example
# fixtures. Dropping the flag alone was not enough while both builders fell
# back to the fixture by themselves; they no longer do [ingest#5]. Each step
# still runs only when real_caches says its input is real, and otherwise is
# skipped with the reason instead of failing the export.
def run_if_real(name: str, cmd: list[str], why_not: str | None) -> bool:
    if why_not:
        print(f"== {name}: skipped, {why_not}\n")
        return False
    return run(name, cmd, required=False)


PROMOTION_PURITY_FLOOR = 0.63
PROMOTION_RECALL_MARGIN = 0.05
PROMOTION_ARCHETYPE_TOP1 = 0.55


def leakfree_evidence() -> dict | None:
    """The inductive numbers for the promoted recipe, read from the frozen
    recipe (pipeline/promote_recipe.json) -- never recomputed or invented here.

    These come from the apples-to-apples sweep: leak-free protocol, player-level
    split, three seeds, with the previous recipe measured in the same run.
    """
    path = ROOT / "pipeline" / "promote_recipe.json"
    if not path.exists():
        return None
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    ev = doc.get("_evidence", {})
    winner = ev.get(doc.get("_name", ""), {})
    if not winner:
        return None
    return {
        "protocol": "leak-free (pipeline/leakfree.py), player-level split, 3 seeds",
        "objective": ev.get("objective"),
        "recipe": doc.get("_name"),
        "recall_at_10": winner.get("recall"),
        "purity_at_20_test": winner.get("purity_test"),
        "composite": winner.get("composite"),
        "gain_vs_previous": ev.get("gain_vs_v4"),
        "separates_from_previous": ev.get("separates"),
    }


def promoted_bundle() -> tuple[promote.PromotedBundle | None, str | None]:
    """(bundle, None) when a verified bundle is promoted, (None, why) when nothing is.

    A bundle that is promoted but does not verify stops the export: that is a
    broken model, not a missing one.
    """
    try:
        return promote.load_promoted(), None
    except promote.NoPromotedBundleError as e:
        return None, str(e)
    except promote.BundleError as e:
        raise SystemExit(f"export_assets: {e}") from None


def eval_protocol_label(bundle: promote.PromotedBundle | None) -> str | None:
    """What the published MTNN metrics are, from the promoted manifest's metrics_source."""
    if bundle is None:
        return None
    src = bundle.metrics_source
    if src.get("kind") == "this_run":
        return "held out: the promoted model trained on train-split seasons only; recall scored on test-split pairs"
    if src.get("kind") == "selection_run":
        return (
            f"held out, from select run {src.get('run_id')}: the promoted model is its refit on all rows, "
            "which was not itself scored on held-out rows"
        )
    # Promoted before the manifest recorded where its metrics came from: those
    # bundles were final refits, trained on every row.
    return "transductive (atlas) — trained on all rows; NOT held-out"


def mtnn_promotion_eligible(report: dict | None) -> bool:
    """export_mtnn_embeddings' floors, applied to the promoted run's report."""
    if not report:
        return False
    ho = report.get("held_out_recall", {})
    test = ho.get("test", {})
    mtnn_r = test.get("recall_at_10_mtnn")
    base_r = test.get("recall_at_10_transparent_14d")
    purity = report.get("cross_era_archetype_neighbor_purity_at_20")
    arch = report.get("archetype_top1_acc")
    if mtnn_r is None or base_r is None or purity is None or arch is None:
        return False
    return (
        mtnn_r >= base_r + PROMOTION_RECALL_MARGIN
        and arch >= PROMOTION_ARCHETYPE_TOP1
        and purity >= PROMOTION_PURITY_FLOOR
    )


def main() -> None:
    py = sys.executable
    steps_ok: dict[str, bool] = {}

    steps_ok["skills"] = run("build_skills", [py, "pipeline/build_skills.py"])
    steps_ok["skill_gates"] = run("test_skills", [py, "pipeline/test_skills.py"])
    steps_ok["wide_skills"] = run_if_real(
        "build_wide_skills", [py, "pipeline/build_wide_skills.py"], real_caches.wide_skills()
    )
    steps_ok["wide_skill_gates"] = run("test_wide_skills", [py, "pipeline/test_wide_skills.py"], required=False)
    steps_ok["pedigree"] = run("build_pedigree", [py, "pipeline/build_pedigree.py"], required=False)
    steps_ok["pedigree_gates"] = run("test_pedigree", [py, "pipeline/test_pedigree.py"], required=False)
    steps_ok["playoffs"] = run("build_playoffs", [py, "pipeline/build_playoffs.py"], required=False)
    steps_ok["playoffs_gates"] = run("test_playoffs", [py, "pipeline/test_playoffs.py"], required=False)
    steps_ok["honors"] = run("build_honors", [py, "pipeline/build_honors.py"], required=False)
    steps_ok["honors_gates"] = run("test_honors", [py, "pipeline/test_honors.py"], required=False)
    steps_ok["salary_market"] = run("build_salary_market", [py, "pipeline/build_salary_market.py"], required=False)
    steps_ok["salary_gates"] = run("test_salaries", [py, "pipeline/test_salaries.py"], required=False)
    steps_ok["game_ratings"] = run_if_real(
        "build_game_ratings", [py, "pipeline/build_game_ratings.py"], real_caches.game_ratings()
    )
    steps_ok["game_ratings_gates"] = run("test_game_ratings", [py, "pipeline/test_game_ratings.py"], required=False)
    steps_ok["player_meta"] = run("build_player_meta", [py, "pipeline/build_player_meta.py"], required=False)
    steps_ok["current_rosters"] = run(
        "build_current_rosters",
        [py, "pipeline/build_current_rosters.py"],
        required=False,
    )
    # Per-season league mean/SD so the client can turn z-scores back into real
    # per-100-possession numbers. Self-verifying: a (season, feature) pair that
    # fails the round-trip is dropped rather than shipped.
    steps_ok["season_norms"] = run("export_season_norms", [py, "pipeline/export_season_norms.py"], required=False)

    # Archetype / drift sidecars (idempotent; fast when vectors unchanged).
    for script in (
        "procrustes_drift.py",
        "archetype_time.py",
        "career_trajectories.py",
    ):
        steps_ok[script] = run(script, [py, f"pipeline/{script}"], required=False)

    bundle, not_promoted = promoted_bundle()
    # The report the bundle's metrics come from: for a refit, the select run
    # promote.py --selection-run recorded, not the refit's in-sample report.
    mtnn = bundle.metrics_report if bundle else None
    if bundle is None:
        print(f"== MTNN exports: skipped, {not_promoted}\n")
    elif not mtnn_promotion_eligible(mtnn):
        print(f"== MTNN exports: skipped, promoted run {bundle.run_id} misses the export floors\n")
    else:
        steps_ok["mtnn_export"] = run("export_mtnn_embeddings", [py, "pipeline/export_mtnn_embeddings.py"])
        steps_ok["mtnn_export_gates"] = run("test_mtnn_export", [py, "pipeline/test_mtnn_export.py"], required=False)
        steps_ok["projections"] = run("project_next_season", [py, "pipeline/project_next_season.py"])
        steps_ok["mtnn_viz"] = run("export_mtnn_viz", [py, "pipeline/export_mtnn_viz.py"])
    promoted_ok = bool(steps_ok.get("mtnn_export"))
    metrics = bundle.metrics if bundle else {}

    sweep_best = None
    if SWEEP.exists():
        sweep_doc = json.loads(SWEEP.read_text(encoding="utf-8"))
        sweep_best = sweep_doc.get("best")

    ledger_tail = None
    if LEDGER.exists():
        ledger = json.loads(LEDGER.read_text(encoding="utf-8"))
        ledger_tail = ledger[-1] if ledger else None

    wide_meta = None
    wide_path = ASSETS / "skills_wide.json"
    if wide_path.exists():
        wide_doc = json.loads(wide_path.read_text(encoding="utf-8"))
        wide_meta = {
            "skill_count": len(wide_doc.get("skills", [])),
            "grade_rows": len(wide_doc.get("grades", {})),
            "source": "real_caches" if has_real_wide_caches() else "not rebuilt (no real caches)",
        }

    manifest = {
        "built": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()),
        "contract": "transparent_14d",
        "wide_skills": wide_meta,
        "mtnn_promoted": promoted_ok,
        "mtnn_promotion_note": (
            "embeddings promoted to assets/ and consumed by /model + neighbor UI" if promoted_ok else None
        ),
        "mtnn_run_id": bundle.run_id if bundle else None,
        "mtnn_model": bundle.manifest.get("model") if bundle else None,
        # Was always "transductive (atlas) — trained on all rows; NOT held-out".
        # That described the final-refit bundles that used to ship, whose
        # numbers were in-sample; calling them "test" is how recall@10 once
        # read a perfect 1.0. A select run ships now, and a refit only on its
        # select run's held-out numbers (promote.py), so the label comes from
        # the manifest [eval#7]. The key names below are kept for readers.
        "mtnn_eval_protocol": eval_protocol_label(bundle),
        # Copied from the promoted manifest, which promote.py copied from the
        # promoted run's report. Never the last run's report.
        "mtnn_transductive_recall_at_10": metrics.get("test_recall_at_10"),
        "mtnn_transductive_purity_at_20": metrics.get("purity_at_20"),
        "mtnn_leakfree": leakfree_evidence(),
        # Back-compat keys (same values, honest names above).
        "mtnn_test_recall_at_10": metrics.get("test_recall_at_10"),
        "mtnn_purity_at_20": metrics.get("purity_at_20"),
        "hp_sweep_best": sweep_best,
        "dataset_ledger": ledger_tail,
        "steps": steps_ok,
        "assets": {name: {"sha1": sha1(ASSETS / name), "present": (ASSETS / name).exists()} for name in CLIENT_ASSETS},
        "mtnn_embeddings_f32": {
            "sha1": sha1(ASSETS / "mtnn_embeddings.f32"),
            "present": (ASSETS / "mtnn_embeddings.f32").exists(),
            "bytes": (
                (ASSETS / "mtnn_embeddings.f32").stat().st_size if (ASSETS / "mtnn_embeddings.f32").exists() else None
            ),
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")

    present = sum(1 for a in manifest["assets"].values() if a["present"])
    print(f"client assets: {present}/{len(CLIENT_ASSETS)} present on disk")
    if manifest.get("mtnn_promoted"):
        print("MTNN embeddings promoted to assets/ (consumed by /model + neighbors).")
    else:
        print("MTNN embeddings stay in pipeline/data/ until promotion gates pass.")
    print("Next: python pipeline/verify_accuracy.py  then  vercel --prod")


if __name__ == "__main__":
    main()
