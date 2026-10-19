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

Steps: player_meta, current_rosters, season_norms, procrustes drift; then,
       with a promoted bundle that clears the export floors (or was forced),
       export_mtnn_embeddings, archetype_time + career_trajectories on the new
       f32, project_next_season, export_mtnn_viz; without one, archetype_time
       + career_trajectories on the f32 already served. Last, the
       assets/manifest.json ledger stamp.

Not here since 2026-10-11 [final#4, final#21, final#25]: the side builders
(skills, wide skills, pedigree, playoffs, honors, salary market, game
ratings). They wrote pipeline/data training inputs nobody declared; they
are rebuild_all.py's --refresh-context block, and this script reads their
assets/ files and writes nothing under pipeline/data.
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


def wide_skills_source(asset_doc: dict) -> str:
    """Where this export's assets/skills_wide.json came from, as a sentence that is true.

    This used to be "real_caches" whenever any wide_skills_*.json existed,
    which counted the two proxy docs of constants (2013-14/2014-15) as real
    and said "real_caches" even when this export had skipped the rebuild and
    shipped whatever file an earlier build left [ingest#5]. The export no
    longer rebuilds it at all [final#25]: rebuild_all's context block does.
    """
    built = asset_doc.get("built") or "unknown date"
    return f"not rebuilt by this export (rebuild_all.py --refresh-context builds it); file on disk built {built}"


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


def mtnn_exports_allowed(bundle: promote.PromotedBundle) -> tuple[bool, str | None]:
    """(run the MTNN exports?, the forced-promotion reason that waived the floors, if one did).

    The floors are read on the numbers the bundle carries (metrics_report).
    A forced promotion waives them, as export_mtnn_embeddings.export_floors
    does and records (2026-10-10); an unforced bundle that misses them is
    skipped, as before.
    """
    if mtnn_promotion_eligible(bundle.metrics_report):
        return True, None
    if bundle.manifest.get("forced"):
        return True, bundle.manifest.get("force_reason")
    return False, None


def mtnn_promotion_eligible(report: dict | None) -> bool:
    """export_mtnn_embeddings' floors, applied to the promoted run's report,
    plus the trainer's own promote verdict.

    A run the trainer refused (report["promote"]["ok"] is False) must not
    export silently even when the three floors clear [promote.py docstring,
    2026-10-09 incident]. An operator --force still overrides via the
    manifest's recorded `forced` flag in mtnn_exports_allowed.
    """
    if not report:
        return False
    verdict = report.get("promote") or {}
    if verdict.get("ok") is not True:
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


# The side builders (build_skills/test_skills, build_wide_skills, build_pedigree,
# build_playoffs, build_honors, build_salary_market, build_game_ratings) used to
# run here, without --out-root, so every export rewrote pipeline/data training
# inputs (skill_labels.npz and wide_skill_labels.npz are train_mtnn lineage
# inputs; honors, pedigree and playoffs feed integrate_context) that the plan,
# --list, rebuild.json and PIPELINE.md never declared [final#4, final#21,
# final#25]. They are rebuild_all's context block now (--refresh-context,
# behind the real_caches preflight), which also writes their assets/ files;
# integrate_context builds salary_market and game_ratings itself. This script
# only reads their assets/ outputs, and writes nothing under pipeline/data.
SIDE_ASSETS_REMEDY = (
    "they are written by rebuild_all.py's context block: "
    "`python pipeline/rebuild_all.py --refresh-context --stage matrix`, or only the builders whose caches "
    "this box has, e.g. `python pipeline/rebuild_all.py --refresh-context --only build_skills --only test_skills "
    "--only build_pedigree --only build_playoffs --only build_honors --only build_player_meta` (docs/PIPELINE.md)"
)

# Steps that cluster the served MTNN embedding: they read
# assets/mtnn_embeddings.f32, so they run after export_mtnn_embeddings
# writes it [final#2]. procrustes_drift reads only vectors.json.
EMBEDDING_READERS = ("archetype_time.py", "career_trajectories.py")


def check_side_assets() -> None:
    """Stop when skills.json, which the archetype naming and the manifest read, is missing or
    was built from another vectors.json than the one on disk."""
    path = ASSETS / "skills.json"
    if not path.exists():
        raise SystemExit(f"export_assets: assets/skills.json is missing; {SIDE_ASSETS_REMEDY}")
    built_from = json.loads(path.read_text(encoding="utf-8")).get("vectors_sha256")
    if built_from is None:
        print(
            "== side assets: assets/skills.json does not record the vectors.json it was built from "
            "(written before build_skills stamped it); not checked\n"
        )
        return
    now = hashlib.sha256((ASSETS / "vectors.json").read_bytes()).hexdigest()
    if built_from != now:
        raise SystemExit(
            f"export_assets: assets/skills.json was built from vectors.json {built_from[:12]}, "
            f"but assets/vectors.json is {now[:12]}; rebuild it first: {SIDE_ASSETS_REMEDY}"
        )


def run_embedding_readers(py: str, steps_ok: dict[str, bool], *, required: bool) -> None:
    for script in EMBEDDING_READERS:
        steps_ok[script] = run(script, [py, f"pipeline/{script}"], required=required)


def main() -> None:
    py = sys.executable
    steps_ok: dict[str, bool] = {}

    check_side_assets()
    # Assets-only builders: they read pipeline/data and the caches, and write assets/ only.
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
    # Drift sidecar (vectors.json only; idempotent).
    steps_ok["procrustes_drift.py"] = run("procrustes_drift.py", [py, "pipeline/procrustes_drift.py"], required=False)

    bundle, not_promoted = promoted_bundle()
    # The floors read the report the bundle's metrics come from: for a refit,
    # the select run promote.py --selection-run recorded, not the refit's
    # in-sample report. A forced promotion waives them (mtnn_exports_allowed).
    allowed, waived = mtnn_exports_allowed(bundle) if bundle else (False, None)
    if not allowed:
        if bundle is None:
            print(f"== MTNN exports: skipped, {not_promoted}\n")
        else:
            print(f"== MTNN exports: skipped, promoted run {bundle.run_id} misses the export floors\n")
        # Not a fallback: the export with nothing (re)promoted, the way the
        # live assets were built (origin b7ccea45). The archetype and
        # trajectory files cluster the f32 already served and carry that
        # f32's lineage (null when no mtnn_lineage.json names it).
        run_embedding_readers(py, steps_ok, required=False)
    else:
        if waived is not None:
            print(
                f"== MTNN exports: run {bundle.run_id} misses the export floors; its promotion was forced: {waived}\n"
            )
        steps_ok["mtnn_export"] = run("export_mtnn_embeddings", [py, "pipeline/export_mtnn_embeddings.py"])
        # After the new f32 and before the projections: project_next_season
        # reads archetype_assignments.json's names. Both files used to cluster
        # the previous model's f32 and ship under the new run [final#2].
        run_embedding_readers(py, steps_ok, required=True)
        steps_ok["projections"] = run("project_next_season", [py, "pipeline/project_next_season.py"])
        steps_ok["mtnn_viz"] = run("export_mtnn_viz", [py, "pipeline/export_mtnn_viz.py"])
        # Last: it reads mtnn_arch.json too, which ran before export_mtnn_viz
        # wrote it, so it checked the previous export's arch (or none).
        steps_ok["mtnn_export_gates"] = run("test_mtnn_export", [py, "pipeline/test_mtnn_export.py"], required=False)
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
            "source": wide_skills_source(wide_doc),
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
