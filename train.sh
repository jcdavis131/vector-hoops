#!/usr/bin/env bash
# Vector Hoops one-command rebuild: matrix -> train -> export -> verify.
# Solo personal project, no connection to employer, built with public/free-tier only
#
# A thin wrapper. Every step lives in pipeline/rebuild_all.py; this file maps
# its old flags onto that script and execs it with the pipeline's interpreter.
#
# Usage:
#   ./train.sh                       # recipe ship (the climb's flags), its 40 epochs
#   ./train.sh --quick               # 40 epochs
#   ./train.sh --full                # 150 epochs
#   ./train.sh --v6                  # recipe legacy-v6-refit (the old v6 refit, 64-d)
#   ./train.sh --quick --epochs=20   # an explicit --epochs wins over --quick/--full
#   ./train.sh --device=cuda --batch=512 --seeds=7
#   ./train.sh --dry-run             # anything else goes to rebuild_all.py as is
#   ./train.sh --list                # (--stage, --from, --to, --only, --refresh-context, ...)
#
# Flag mapping:
#   --quick --full --v6                passed through, as is --recipe NAME|PATH
#   --epochs=N --batch=N --device=D    -> --epochs N --batch N --device D
#   --seeds=N                          -> --seed N. One seed: the refit trains one
#                                         model. Seed panels are the herdmux climb's job.
#   --rebuild-matrix                   accepted and ignored: the matrix stage always
#                                      rebuilds now, with the climb's three steps.
#
# Why it is thin (2026-10-09). This used to be its own orchestrator and did not
# do what its header promised [orchestration#1, #2, #5, #6, #12, health#1, #2]:
#   - it built wide skills, pedigree and playoffs from the committed test
#     fixtures first; the real-cache fallback after `||` never ran, because the
#     fixture run always succeeds;
#   - 23 `|| true` and 3 `|| echo` defeated its own `set -euo pipefail`, and it
#     still ended by suggesting `vercel --prod   # or push master`;
#   - its "leakfree selection" asked ablate_v5 for configs that exist only in
#     sweep_v5, so it trained 0 arms and exited 0;
#   - --rebuild-matrix ran bootstrap_train_matrix.py (14 game features), and
#     nothing ran enrich_vectors.py, the only writer of position labels;
#   - --device=X never reached train_mtnn;
#   - PY defaulted to `python3`, which on this box is the Windows Store Python
#     (torch 2.0.0, no vector_core), and the "asset-only mode" it announced when
#     torch was missing did not exist.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# The pipeline's venv when there is one (Windows or POSIX layout), else python3.
if [[ -z "${PY:-}" ]]; then
  if [[ -x pipeline/.venv/Scripts/python.exe ]]; then
    PY=pipeline/.venv/Scripts/python.exe
  elif [[ -x pipeline/.venv/bin/python ]]; then
    PY=pipeline/.venv/bin/python
  else
    PY=python3
  fi
fi

args=()
for arg in "$@"; do
  case "$arg" in
    --quick | --full | --v6) args+=("$arg") ;;
    --rebuild-matrix) echo "train.sh: --rebuild-matrix is the default now (the matrix stage always rebuilds)" ;;
    --epochs | --batch | --device | --seeds) echo "train.sh: use ${arg}=VALUE" >&2; exit 2 ;;
    --epochs=*) args+=(--epochs "${arg#*=}") ;;
    --batch=*) args+=(--batch "${arg#*=}") ;;
    --device=*) args+=(--device "${arg#*=}") ;;
    --seeds=*)
      seed="${arg#*=}"
      if [[ "$seed" == *,* ]]; then
        echo "train.sh: --seeds=$seed: the refit trains one seed; run seed panels with the herdmux climb" >&2
        exit 2
      fi
      args+=(--seed "$seed")
      ;;
    --help | -h) sed -n '2,24p' "$0" | cut -c3-; exit 0 ;;
    *) args+=("$arg") ;;
  esac
done

echo "train.sh: $PY pipeline/rebuild_all.py ${args[*]-}"
exec "$PY" pipeline/rebuild_all.py ${args[@]+"${args[@]}"}
