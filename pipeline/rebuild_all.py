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
  train    train_mtnn.py with the shipping recipe: --v6, or the v5 default.
  export   the exporters, then build_scoring_lite.py.
  verify   test_scoring_lite.py, verify_accuracy.py.

Selection does not happen here. Recipes are chosen in the herdmux climb
(gpu/climb.py: paired seed panels against a measured baseline); this script
refits the recipe it is given.

Every real run writes pipeline/data/runs/<run_id>/rebuild.json (atomically,
after every step): the options, each step's argv, exit code and duration,
the git state and library versions, and the matrix's stats manifest next to
it. A run that stops still records where. --list and --dry-run write nothing.

Usage:
  python pipeline/rebuild_all.py --list
  python pipeline/rebuild_all.py --dry-run
  python pipeline/rebuild_all.py --stage matrix
  python pipeline/rebuild_all.py --v6 --device cuda
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

import real_caches  # noqa: E402
from artifact_io import atomic_write_json, env_versions, git_state  # noqa: E402

RUNS_DIR = ROOT / "pipeline" / "data" / "runs"
STAGES = ("matrix", "train", "export", "verify")

# The shipping recipes, spelled once. These are the flags this script passed
# before 2026-10-09, unchanged; --epochs, --batch, --seed and --device are
# added around them from the CLI. They are not the climb's protocol and not
# necessarily what the site serves [orchestration#3]; moving them into
# recipe files is a separate change.
#
# Neither passes --write-artifacts, as before. Without it train_mtnn writes
# embedding_v3.npz and mtnn_centroids.npz to pipeline/data/_scratch, while
# mtnn_report.json and mtnn_best.pt go to pipeline/data, so the export stage
# publishes the PREVIOUS pipeline/data/embedding_v3.npz next to this run's
# report and checkpoint [orchestration#0, health#2]. That is the torn-triple
# fix's to change, not this one's.
SHIPPING_RECIPES: dict[str, tuple[str, ...]] = {
    "v5": (
        "--dim", "48",
        "--tower-width", "32",
        "--tower-hidden", "160",
        "--tower-blocks", "2",
        "--mlp-heads",
        "--d-head-hidden", "128",
        "--fusion", "concat",
        "--fusion-hidden", "256",
        "--nce-loss", "hybrid",
        "--nce-player-weight", "0.7",
        "--nce-arch-weight", "0.3",
        "--drop-p", "0.12",
        "--weight-decay", "0.0001",
        "--lr-schedule", "onecycle",
        "--warmup-pct", "0.1",
        "--anneal-strategy", "linear",
        "--checkpoint-metric", "cqs",
        "--phase", "final-refit",
        "--era-align", "procrustes",
        "--robust-scaling",
    ),
    "v6": (
        "--dim", "64",
        "--tower-width", "40",
        "--tower-hidden", "192",
        "--tower-blocks", "3",
        "--mlp-heads",
        "--d-head-hidden", "128",
        "--fusion", "transformer",
        "--d-model", "128",
        "--n-fusion-layers", "4",
        "--n-attn-heads", "4",
        "--fusion-hidden", "512",
        "--nce-loss", "hybrid",
        "--nce-player-weight", "0.65",
        "--nce-arch-weight", "0.35",
        "--drop-p", "0.15",
        "--weight-decay", "0.0002",
        "--lr-schedule", "onecycle",
        "--warmup-pct", "0.1",
        "--anneal-strategy", "linear",
        "--checkpoint-metric", "cqs",
        "--phase", "final-refit",
        "--era-align", "procrustes",
        "--robust-scaling",
    ),
}  # fmt: skip

EPOCHS_DEFAULT, EPOCHS_QUICK, EPOCHS_FULL = 80, 40, 150


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
    v6: bool = False,
    epochs: int = EPOCHS_DEFAULT,
    batch: int = 512,
    seed: int = 7,
    device: str | None = None,
    refresh_context: bool = False,
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

    train = ["pipeline/train_mtnn.py", "--epochs", str(epochs), *SHIPPING_RECIPES["v6" if v6 else "v5"]]
    train += ["--batch", str(batch), "--seed", str(seed)]
    if device is not None:
        # Only when asked. train_mtnn's own default (cpu) is what this script
        # has always run with; the orchestrator does not change it.
        train += ["--device", device]
    plan.append(
        Step(
            "train_mtnn",
            tuple(train),
            "train",
            (D + "mtnn_report.json", D + "mtnn_best.pt", D + "_scratch/embedding_v3.npz"),
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
    ap.add_argument("--v6", action="store_true", help="v6 transformer recipe (default: v5)")
    preset = ap.add_mutually_exclusive_group()
    preset.add_argument("--quick", action="store_true", help=f"{EPOCHS_QUICK} epochs")
    preset.add_argument("--full", action="store_true", help=f"{EPOCHS_FULL} epochs")
    ap.add_argument("--epochs", type=int, default=None, help=f"default {EPOCHS_DEFAULT}; wins over --quick/--full")
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--device", default=None, help="passed to train_mtnn only when given")
    return ap.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    epochs = args.epochs or (EPOCHS_QUICK if args.quick else EPOCHS_FULL if args.full else EPOCHS_DEFAULT)
    opts = {
        "v6": args.v6,
        "epochs": epochs,
        "batch": args.batch,
        "seed": args.seed,
        "device": args.device,
        "refresh_context": args.refresh_context,
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
