# Every recipe here used to end in `|| true`, so `make ci` printed "CI green"
# no matter what happened. Two of the four commands under it could not have
# succeeded:
#
#   build_vectors.py --offline --quick   argparse has no --quick; exits 2 with
#                                        "unrecognized arguments: --quick"
#   pytest pipeline/tests                that directory does not exist
#
# So the target that existed to tell you the repo was fine had never run the
# build and had never run a test. Flags fixed, `|| true` gone.

.PHONY: sync offline build train eval test lint ci

# `python`, not `python3`. On Windows `python3` resolves to the Microsoft Store
# alias (WindowsApps\python3.exe), not the venv, so every target here ran a
# different interpreter from the one the pipeline uses. Point it at a venv with
# `make PYTHON=pipeline/.venv/Scripts/python.exe ci`.
PYTHON ?= python

sync:
	$(PYTHON) -m pip install -e .[dev]

# What .github/workflows/ci.yml runs offline. Both read pipeline/cache and
# write nothing under assets/, which is why the stamp check can follow them.
offline:
	$(PYTHON) pipeline/fetch_bbref_advanced.py --offline
	$(PYTHON) pipeline/fetch_2k_ratings.py --offline

# Split out of `offline`, because this one REWRITES assets/vectors.json,
# assets/*.npz and pipeline/data/feature_manifest.json. CI does not run it and
# a check should not either -- `make ci` used to, which made verifying the repo
# a way to modify it. Verified exit 0 on a scratch copy of the tree:
# 12,966 player-seasons, 8 archetypes, 72 wide features.
build:
	$(PYTHON) pipeline/build_vectors.py --offline

train:
	./train.sh --quick

# The whole suite, local_data tests included (testpaths covers pipeline +
# tests). On the training box run it with HOOPS_REQUIRE_LOCAL_DATA=1, so a
# missing pipeline/data artifact fails instead of skipping.
eval:
	$(PYTHON) -m pytest

test: eval

# Mirrors .github/workflows/lint.yml (same ruff version as the pre-commit hook).
lint:
	$(PYTHON) -m ruff check . --statistics
	$(PYTHON) -m ruff format --check .

# Mirrors .github/workflows/ci.yml step for step. If the two drift, a local
# green stops meaning anything -- which is the failure this whole file just had.
# Same pytest selection as CI: local_data tests are deselected because a runner
# has no pipeline/data. `make eval` is the one that runs them.
ci: offline
	$(PYTHON) -m pytest -m "not local_data"
	$(PYTHON) scripts/stamp_assets.py --check
	@echo "CI green - offline fixtures, no external network"
