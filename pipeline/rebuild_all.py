#!/usr/bin/env python3
"""rebuild_all.py -- the one rebuild orchestrator: matrix -> train -> export -> verify.

Why it was rewritten (2026-10-09). This script and train.sh both claimed to
rebuild everything, and neither ran the path the model is measured on:

  - Test fixtures as training inputs [orchestration#1, training#5]:
    build_wide_skills, build_pedigree and build_playoffs ran with --fixture,
    overwriting wide_skill_labels.npz, pedigree.json and playoffs.json with
    the committed *.example.json fixtures. Measured into a scratch dir: 18
    wide-skill rows against 5,154 real, pedigree on 112 of 12,966 rows (under
    integrate_context's 1% gate, so its 7 columns are deleted), 8 playoff
    appearances against 5,950.
  - Failures swallowed [orchestration#5]: run() exited only on check="hard".
    The default printed FAIL and carried on, nothing read its return value,
    and the script ended "=== DONE ===" with exit 0 whatever happened.
  - The wrong matrix [orchestration#2, features#8]: it came from
    bootstrap_train_matrix.py (14 game features + SALARY_LOG, row-index
    player_ids) or from whatever train_matrix.npz was already on disk.
    Nothing in this repo ran build_vectors --offline -> enrich_vectors ->
    integrate_context, the chain the herdmux climb trains every measured arm
    on, and no script at all called enrich_vectors, the only writer of the
    position labels.
  - A selection step that selected nothing [orchestration#6]: its ablate_v5
    --only names (tx_b2_h160_t32_d64, b1_h96_t24_d48, hb128_d48) are
    sweep_v5 GRID keys. ablate_v5.CONFIGS holds only A_v4_control,
    B_deep_concat and C_transformer, so it trained 0 arms, wrote an empty
    ablation_report.json and exited 0, and the refit's flags were hard-coded
    anyway.
  - assets/scoring_lite.f32 was never rebuilt after a re-export
    [orchestration#11], so the play page scored against the previous model.

What it is now. One ordered table of named steps. Each runs as
`<this interpreter> -u <script> <args>` from the repo root. The first nonzero
exit stops the run, and the run exits nonzero naming that step. No step is
optional; what does not run is left out of the plan by a flag you passed.

  matrix   build_vectors.py --offline, enrich_vectors.py, integrate_context.py:
           exactly the herdmux climb's prepare for vector-hoops
           (tests/test_rebuild_all.py compares the two when climb.py is on
           the box). Then stage_contract.py, which fails the run when the
           matrix drifted from pipeline/contracts/train_matrix.contract.json.
  context  only with --refresh-context, between enrich_vectors and
           integrate_context: the side builders whose outputs
           integrate_context and train_mtnn read, from real caches only and
           never with --fixture. Every selected step's real input is checked
           (pipeline/real_caches.py) before the first step runs, so a missing
           or synthetic cache stops the run before anything is written. Off
           by default, so the default matrix stage is the climb's prepare and
           nothing else.
  train    train_mtnn.py --recipe ship (or --recipe NAME|PATH; --v6 is
           --recipe legacy-v6-refit) with --run-dir pipeline/data/runs/
           <run_id>, then promote.py --run on that directory. Without a
           passing promotion the export stage never runs, so it can only
           publish a bundle promote.py checked.
  export   the exporters, then build_scoring_lite.py. Each reads the model
           through promote.load_promoted(): the current promoted bundle.
  verify   test_scoring_lite.py, verify_accuracy.py.

Promotion (2026-10-09). The train step used to write its embedding to
pipeline/data/_scratch while its report and checkpoint went to pipeline/data,
and the export stage then published the PREVIOUS pipeline/data/
embedding_v3.npz under this run's report: on the box, an 08-07 embedding
under an 08-14 report [orchestration#0, health#0]. Now the run's four files
land together in its run directory with a lineage block naming their
sha256s, and promote.py checks them before anything is exported. With one
seed, composite_score's CQS bar is baseline + 1.2, so a single run will
often be refused; --promote-force "<reason>" passes the reason to
promote.py --force, which records it. A refused promotion stops the run at
the promote step; promote.py --run <that run dir> --force can still promote
it afterwards, then `--stage export`.

Recipes (2026-10-09). The train step used to pass flags hard-coded here
(SHIPPING_RECIPES): a 48-d v5 final refit, or with --v6 the transformer
refit. Neither was what the herdmux climb measures, and train.sh had passed
a third spelling [orchestration#3, training#6]. Those two are
pipeline/recipes/legacy-v5-refit.json and legacy-v6-refit.json now, flag
for flag, plus the --epochs 80 this script passed by default. The default is
ship.json, the climb's measured flags: --phase select, so the run's held-out
numbers are held out, where a final refit's are in-sample [training#0].
--epochs is passed only with --epochs, --quick or --full, and --batch and
--seed only when given; otherwise the recipe's values (or train_mtnn's
defaults, batch 512 and seed 7) stand.

Ship what you measure (2026-10-09). A default run trains ship.json, writes
its bundle (with --val-every 0 --no-best-checkpoint, train_mtnn keeps its
final weights as the bundle's checkpoint) and promote.py ships it on its own
held-out numbers. Until then promote.py shipped only final-refit runs and
required a checkpoint ship never wrote, so a default run always stopped at
the promote step. A legacy refit recipe (--recipe legacy-v5-refit, --v6)
fits every row, so its numbers are in-sample and promote.py refuses it,
--promote-force included, unless it is promoted with --selection-run, the
select run of the same recipe and seed that measured it. This script does
not pass one: such a run stops at the promote step, and
`promote.py --run <its run dir> --selection-run <the select run dir>`
followed by `--stage export` ships it. The climb measured on cuda; pass
--device cuda.

Selection does not happen here. Recipes are chosen in the herdmux climb
(gpu/climb.py: paired seed panels against a measured baseline); this script
trains the recipe it is given, and tests/test_recipes.py holds measure.json
(and so ship.json) to the climb's pinned flags.

Every real run writes pipeline/data/runs/<run_id>/rebuild.json (atomically,
after every step): the options, each step's argv, exit code and duration,
the git state and library versions, and the matrix's stats manifest next to
it; the train step adds the run's bundle (mtnn_report.json, mtnn_best.pt,
embedding_v3.npz, mtnn_centroids.npz). A run that stops still records where.
--list and --dry-run write nothing.

Usage:
  python pipeline/rebuild_all.py --list
  python pipeline/rebuild_all.py --dry-run
  python pipeline/rebuild_all.py --stage matrix
  python pipeline/rebuild_all.py --device cuda          # ship: train, promote, export, verify
  python pipeline/rebuild_all.py --device cuda --promote-force "single-seed run, reviewed by hand"
  python pipeline/rebuild_all.py --v6 --device cuda     # stops at promote: needs --selection-run
  python pipeline/rebuild_all.py --stage export        # re-export the promoted bundle
  python pipeline/rebuild_all.py --from train_mtnn --to build_scoring_lite
  python pipeline/rebuild_all.py --refresh-context --stage matrix
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mtnn_recipe  # noqa: E402
import real_caches  # noqa: E402
from artifact_io import BUNDLE_FILES, atomic_write_json, display_path, env_versions, git_state  # noqa: E402

RUNS_DIR = ROOT / "pipeline" / "data" / "runs"
STAGES = ("matrix", "train", "export", "verify")

# The train step's flags come from a recipe file (pipeline/recipes/, read by
# train_mtnn.py --recipe). The two refits this script used to hard-code are
# legacy-v5-refit.json and legacy-v6-refit.json now, flag for flag; ship is
# the default [orchestration#3, training#6].
DEFAULT_RECIPE = "ship"
V6_RECIPE = "legacy-v6-refit"

# Passed as --epochs only when asked for; otherwise the recipe's own epochs
# (ship: 40) stand. EPOCHS_DEFAULT = 80 used to be passed on every run, which
# would override ship's 40; the legacy refits carry their 80 themselves.
EPOCHS_QUICK, EPOCHS_FULL = 40, 150


@dataclass(frozen=True)
class Step:
    name: str
    argv: tuple[str, ...]  # script and arguments, relative to the repo root
    stage: str
    produces: tuple[str, ...] = ()
    # Returns why the step's real input is missing, or None. Checked for every
    # selected step before the first one runs.
    preflight: Callable[[], str | None] | None = None
    context: bool = False  # in the plan only with --refresh-context

    def command(self, python: str = sys.executable) -> list[str]:
        return [python, "-u", *self.argv]


def _context_steps() -> list[Step]:
    """Side builders, in dependency order. integrate_context reads roster,
    form, career, competition, pedigree, playoffs, honors, availability and
    system tags (salary_market and game_ratings it builds itself);
    train_mtnn reads the skill labels; export_assets serves player_meta and
    current_rosters. roster_context comes before everything that joins on its
    teams, build_availability before build_career_context, build_honors
    before build_player_meta. All of them read assets/vectors.json, and
    build_career_context and derive_system_tags read train_matrix.npz, so the
    block sits after build_vectors and enrich_vectors."""
    rc = real_caches
    D, A = "pipeline/data/", "assets/"
    rows = [
        ("build_skills", (), (A + "skills.json", A + "skill_probe.json", D + "skill_labels.npz"), None),
        ("test_skills", (), (), None),
        ("build_wide_skills", (), (D + "wide_skill_labels.npz", A + "skills_wide.json"), rc.wide_skills),
        ("test_wide_skills", (), (), rc.wide_skills),
        ("build_pedigree", (), (D + "pedigree.json", A + "pedigree.json"), rc.draft_history),
        ("build_playoffs", (), (D + "playoffs.json", A + "playoffs.json", A + "playoff_paths.json"), rc.playoffs),
        ("build_honors", (), (D + "honors.json", A + "honors.json"), rc.honors),
        ("roster_context", (), (D + "roster_context.json",), rc.gamelogs),
        ("build_availability", (), (D + "availability.json",), rc.gamelogs),
        ("build_career_context", (), (D + "career_arc.json", D + "career_sequences.npz"), rc.gamelogs),
        ("form_context", (), (D + "form_context.json",), rc.gamelogs),
        ("competition_context", (), (D + "competition.json",), rc.all_of(rc.gamelogs, rc.team_season)),
        ("derive_system_tags", (), (D + "system_tags.json",), rc.team_season),
        ("build_player_meta", (), (A + "player_meta.json",), None),
        ("build_current_rosters", (), (A + "current_rosters.json",), rc.gamelogs),
    ]
    return [
        Step(name, (f"pipeline/{name}.py", *args), "matrix", produces, preflight, context=True)
        for name, args, produces, preflight in rows
    ]


def build_plan(
    *,
    recipe: str = DEFAULT_RECIPE,
    epochs: int | None = None,
    batch: int | None = None,
    seed: int | None = None,
    device: str | None = None,
    refresh_context: bool = False,
    promote_force: str | None = None,
    run_dir: str = "pipeline/data/runs/<run_id>",
) -> list[Step]:
    """Every step, in order, for these options (before --stage/--from/--to/--only)."""
    D, A = "pipeline/data/", "assets/"
    plan = [
        Step(
            "build_vectors",
            ("pipeline/build_vectors.py", "--offline"),
            "matrix",
            (A + "vectors.json", D + "train_matrix.npz", D + "feature_manifest.json"),
        ),
        Step("enrich_vectors", ("pipeline/enrich_vectors.py",), "matrix", (A + "vectors.json",)),
    ]
    if refresh_context:
        plan += _context_steps()
    plan += [
        Step(
            "integrate_context",
            ("pipeline/integrate_context.py",),
            "matrix",
            (D + "salary_market.json", D + "game_ratings.json", D + "train_matrix.npz", D + "feature_manifest.json"),
        ),
        Step(
            "stage_contract",
            ("pipeline/stage_contract.py", "--stats-out", f"{run_dir}/train_matrix.stats.json"),
            "matrix",
            (f"{run_dir}/train_matrix.stats.json",),
        ),
    ]

    # No --write-artifacts, and none is needed: --run-dir copies the run's
    # report, checkpoint, embedding and centroids into its run directory, and
    # promote.py ships from there. --write-artifacts would also overwrite
    # pipeline/data/embedding_v3.npz directly, past the promotion checks.
    # --epochs, --batch and --seed only when asked for: a flag passed here
    # beats the recipe's value, so passing this script's defaults on every
    # run would quietly override a recipe that sets them. 512 and 7 were also
    # train_mtnn's defaults, so a run that asks for neither trains the same.
    train = ["pipeline/train_mtnn.py", "--recipe", recipe]
    for flag, value in (("--epochs", epochs), ("--batch", batch), ("--seed", seed)):
        if value is not None:
            train += [flag, str(value)]
    train += ["--run-dir", run_dir]
    if device is not None:
        # Only when asked. train_mtnn's own default (cpu) is what this script
        # has always run with; the orchestrator does not change it.
        train += ["--device", device]
    bundle = tuple(f"{run_dir}/{name}" for name in BUNDLE_FILES.values())
    plan.append(
        Step(
            "train_mtnn",
            tuple(train),
            "train",
            # The last-run copies in pipeline/data, and the run's own bundle.
            (D + "mtnn_report.json", D + "mtnn_best.pt", D + "_scratch/embedding_v3.npz", *bundle),
        )
    )
    # Checks the bundle the train step just wrote and makes it the promoted
    # model, or stops the run before any export.
    promote = ["pipeline/promote.py", "--run", run_dir]
    if promote_force is not None:
        promote += ["--force", promote_force]
    plan.append(
        Step(
            "promote",
            tuple(promote),
            "train",
            (D + "promoted/CURRENT.json", D + "promoted/<run_id>/", D + "embedding_v3.npz", D + "mtnn_centroids.npz"),
        )
    )

    # The exporters this script ran before, now required, then the scoring
    # subset nothing rebuilt. export_assets also runs several of the steps
    # after it (softly) when its gates allow; they are idempotent, and here
    # each one has to succeed.
    exporters = [
        ("export_assets", (A + "manifest.json",)),
        ("export_mtnn_embeddings", (A + "mtnn_embeddings.f32", A + "mtnn_meta.json")),
        ("export_mtnn_jacobian", (A + "mtnn_jacobian.json", A + "mtnn_jacobian.f32", A + "mtnn_attr_pop.json")),
        ("export_mtnn_viz", (A + "mtnn_arch.json", A + "mtnn_map.json", A + "mtnn_heads.f32", A + "mtnn_inputs.f32")),
        ("export_season_norms", (A + "season_norms.json",)),
        ("procrustes_drift", (A + "drift.json",)),
        ("archetype_time", (A + "archetypes_time.json", A + "archetype_assignments.json")),
        ("build_scoring_lite", (A + "scoring_lite.f32", A + "scoring_lite_index.json")),
    ]
    plan += [Step(name, (f"pipeline/{name}.py",), "export", produces) for name, produces in exporters]

    # composite_score.py used to be a step here. It has no __main__: running
    # it imported a module and exited 0. CQS is computed by train_mtnn into
    # mtnn_report.json, and export_assets reads it from there.
    plan += [
        Step("test_scoring_lite", ("pipeline/test_scoring_lite.py",), "verify"),
        Step("verify_accuracy", ("pipeline/verify_accuracy.py",), "verify"),
    ]
    return plan


def select(
    plan: Sequence[Step],
    *,
    stages: Sequence[str] | None = None,
    start: str | None = None,
    stop: str | None = None,
    only: Sequence[str] | None = None,
    all_steps: Sequence[Step] | None = None,
) -> list[Step]:
    """Apply --stage, then --from/--to (inclusive), then --only. Unknown names are an error."""
    names = [s.name for s in plan]
    known = {s.name: s for s in (all_steps or plan)}
    for flag, wanted in (("--from", [start]), ("--to", [stop]), ("--only", list(only or []))):
        for name in wanted:
            if name is None or name in names:
                continue
            if name in known and known[name].context:
                raise SystemExit(f"{flag} {name}: a context step; add --refresh-context to put it in the plan")
            raise SystemExit(f"{flag} {name}: no such step. Steps: {', '.join(names)}")

    out = [s for s in plan if not stages or s.stage in stages]
    if start is not None:
        i = names.index(start)
        out = [s for s in out if names.index(s.name) >= i]
    if stop is not None:
        j = names.index(stop)
        out = [s for s in out if names.index(s.name) <= j]
    if only:
        out = [s for s in out if s.name in set(only)]
    if not out:
        raise SystemExit("the options select no steps; see --list")
    return out


def _new_run_dir() -> tuple[str, Path]:
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    short = git_state(ROOT)["short"] or "nogit"
    for k in range(100):
        run_id = f"{stamp}-{short}" + (f"-{k}" if k else "")
        path = RUNS_DIR / run_id
        try:
            path.mkdir(parents=True, exist_ok=False)
        except FileExistsError:
            continue
        return run_id, path
    raise SystemExit(f"could not create a run directory under {RUNS_DIR}")


def print_list(plan: Sequence[Step], selected: Sequence[Step], context_on: bool) -> None:
    chosen = {s.name for s in selected}
    full = list(plan)
    if not context_on:
        # Show the opt-in block where it would go.
        i = next(k for k, s in enumerate(full) if s.name == "integrate_context")
        full[i:i] = _context_steps()
    for s in full:
        mark = "*" if s.name in chosen else " "
        tag = " (only with --refresh-context)" if s.context and not context_on else ""
        print(f"{mark} {s.stage:<6} {s.name:<24}{tag}".rstrip())
        print(f"         $ {' '.join(s.argv)}")
        if s.produces:
            print(f"         -> {', '.join(s.produces)}")
    print("\n* = selected by these options")


def run_plan(steps: Sequence[Step], record: dict, record_path: Path) -> int:
    """Run steps in order; stop at the first nonzero exit. Returns the exit code."""
    record["steps"] = []
    try:
        for k, step in enumerate(steps, 1):
            cmd = step.command()
            print(f"\n== [{k}/{len(steps)}] {step.stage}/{step.name}\n   $ {' '.join(cmd)}", flush=True)
            t0 = time.time()
            rc = subprocess.run(cmd, cwd=ROOT).returncode
            secs = round(time.time() - t0, 1)
            record["steps"].append(
                {
                    "name": step.name,
                    "stage": step.stage,
                    "argv": cmd,
                    "returncode": rc,
                    "seconds": secs,
                    "produces": list(step.produces),
                }
            )
            if rc != 0:
                not_run = [s.name for s in steps[k:]]
                record.update(status="failed", failed_step=step.name, not_run=not_run)
                print(f"\nFAILED at {step.name} (exit {rc}) after {secs:.0f}s.", flush=True)
                if not_run:
                    print(f"Not run: {', '.join(not_run)}")
                return rc if 0 < rc < 256 else 1
            print(f"== {step.name}: ok ({secs:.0f}s)", flush=True)
            atomic_write_json(record_path, record, indent=2)
        record["status"] = "ok"
        return 0
    except BaseException:
        record["status"] = "interrupted"
        raise
    finally:
        record["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        atomic_write_json(record_path, record, indent=2)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Rebuild matrix -> train -> export -> verify; stops at the first failing step."
    )
    ap.add_argument("--list", action="store_true", help="print the plan and exit")
    ap.add_argument("--dry-run", action="store_true", help="print the commands that would run; run nothing")
    ap.add_argument("--stage", action="append", choices=STAGES, help="run only this stage (repeatable)")
    ap.add_argument("--from", dest="start", metavar="STEP", help="start at this step")
    ap.add_argument("--to", dest="stop", metavar="STEP", help="stop after this step")
    ap.add_argument("--only", action="append", metavar="STEP", help="run only this step (repeatable)")
    ap.add_argument(
        "--refresh-context",
        action="store_true",
        help="also rebuild the side inputs integrate_context and train_mtnn read, from real caches",
    )
    which = ap.add_mutually_exclusive_group()
    which.add_argument(
        "--recipe",
        default=None,
        metavar="NAME|PATH",
        help=f"train_mtnn.py recipe: a name in pipeline/recipes/ or a path (default {DEFAULT_RECIPE}, "
        "the climb's measure flags)",
    )
    which.add_argument("--v6", action="store_true", help=f"the legacy v6 transformer refit: --recipe {V6_RECIPE}")
    preset = ap.add_mutually_exclusive_group()
    preset.add_argument("--quick", action="store_true", help=f"{EPOCHS_QUICK} epochs")
    preset.add_argument("--full", action="store_true", help=f"{EPOCHS_FULL} epochs")
    ap.add_argument(
        "--epochs", type=int, default=None, help="default: the recipe's (ship: 40); wins over --quick/--full"
    )
    ap.add_argument("--batch", type=int, default=None, help="passed to train_mtnn only when given (its default: 512)")
    ap.add_argument("--seed", type=int, default=None, help="passed to train_mtnn only when given (its default: 7)")
    ap.add_argument("--device", default=None, help="passed to train_mtnn only when given")
    ap.add_argument(
        "--promote-force",
        metavar="REASON",
        default=None,
        help="passed to promote.py --force: promote although should_promote says no; REASON is recorded",
    )
    return ap.parse_args(argv)


def recipe_arg(spec: str) -> tuple[str, mtnn_recipe.Recipe]:
    """The --recipe value to hand train_mtnn, and the recipe it names.

    Loaded here so that an unknown or malformed recipe stops the run before
    the matrix is rebuilt. Its flags are checked against train_mtnn's parser
    by train_mtnn itself, at the start of the train step (the parser lives in
    a module that imports torch). A path is passed on relative to the repo
    root, because every step runs from there.
    """
    recipe = mtnn_recipe.load(spec)
    if recipe.path.parent == mtnn_recipe.RECIPES_DIR and recipe.path.stem == spec:
        return spec, recipe
    return display_path(recipe.path, ROOT), recipe


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    # `is not None`: --epochs 0 is a value, and `args.epochs or ...` replaced it.
    if args.epochs is not None:
        epochs = args.epochs
    else:
        epochs = EPOCHS_QUICK if args.quick else EPOCHS_FULL if args.full else None
    recipe_spec, recipe = recipe_arg(V6_RECIPE if args.v6 else (args.recipe or DEFAULT_RECIPE))
    opts = {
        "recipe": recipe_spec,
        "epochs": epochs,
        "batch": args.batch,
        "seed": args.seed,
        "device": args.device,
        "refresh_context": args.refresh_context,
        "promote_force": args.promote_force,
    }
    sel = {"stages": args.stage, "start": args.start, "stop": args.stop, "only": args.only}

    if args.list or args.dry_run:
        plan = build_plan(**opts)
        steps = select(plan, **sel, all_steps=build_plan(**{**opts, "refresh_context": True}))
        if args.list:
            print_list(plan, steps, args.refresh_context)
        else:
            print(f"dry run: {len(steps)} step(s), nothing will be run or written")
            for s in steps:
                print(f"  {s.stage}/{s.name}: {' '.join(s.command())}")
        return 0

    # Refuse before anything runs, so a missing or synthetic cache cannot
    # leave half the context block rebuilt.
    probe = select(build_plan(**opts), **sel, all_steps=build_plan(**{**opts, "refresh_context": True}))
    blocked = [(s.name, why) for s in probe if s.preflight and (why := s.preflight())]
    if blocked:
        for name, why in blocked:
            print(f"cannot run {name}: {why}")
        print(f"\nnothing was run: {len(blocked)} step(s) lack a real input")
        return 1

    run_id, run_dir = _new_run_dir()
    try:
        shown_dir = run_dir.relative_to(ROOT).as_posix()
    except ValueError:
        shown_dir = run_dir.as_posix()
    steps = select(build_plan(**opts, run_dir=shown_dir), **sel)
    record_path = run_dir / "rebuild.json"
    record = {
        "run_id": run_id,
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "argv": ["pipeline/rebuild_all.py", *(sys.argv[1:] if argv is None else argv)],
        "options": {**opts, **sel},
        "recipe": {"name": recipe.name, "path": display_path(recipe.path, ROOT), "sha256": recipe.sha256},
        "python": sys.executable,
        "git": git_state(ROOT),
        "env_versions": env_versions(),
        "plan": [s.name for s in steps],
        "status": "running",
    }
    atomic_write_json(record_path, record, indent=2)
    print(f"run {run_id}: {len(steps)} step(s) -> {record_path}", flush=True)

    rc = run_plan(steps, record, record_path)
    if rc == 0:
        print(f"\nall {len(steps)} step(s) passed; run record {record_path}")
        if any(s.stage == "export" for s in steps):
            print("assets/ was rewritten: review `git status` and `git diff --stat assets/` before committing.")
            print("Pushing master deploys hoops.dumbmodel.com.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
