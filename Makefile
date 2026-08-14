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

.PHONY: sync offline build train eval test ci

sync:
	python3 -m pip install -e .[dev]

# What .github/workflows/ci.yml runs offline. Both read pipeline/cache and
# write nothing under assets/, which is why the stamp check can follow them.
offline:
	python3 pipeline/fetch_bbref_advanced.py --offline
	python3 pipeline/fetch_2k_ratings.py --offline

# Split out of `offline`, because this one REWRITES assets/vectors.json,
# assets/*.npz and pipeline/data/feature_manifest.json. CI does not run it and
# a check should not either -- `make ci` used to, which made verifying the repo
# a way to modify it. Verified exit 0 on a scratch copy of the tree:
# 12,966 player-seasons, 8 archetypes, 72 wide features.
build:
	python3 pipeline/build_vectors.py --offline

train:
	./train.sh --quick

# test_provenance_gate.py calls sys.exit() at module scope -- it is a script,
# not a pytest module, and it aborts collection for every other file. Same
# split as ci.yml.
eval:
	python3 -m pytest pipeline tests -q --ignore=pipeline/test_provenance_gate.py
	python3 pipeline/test_provenance_gate.py

test: eval

# Mirrors .github/workflows/ci.yml step for step. If the two drift, a local
# green stops meaning anything -- which is the failure this whole file just had.
ci: offline test
	python3 scripts/stamp_assets.py --check
	@echo "CI green - offline fixtures, no external network"
