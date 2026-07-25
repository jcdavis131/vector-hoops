.PHONY: sync offline train eval test ci

sync:
	python3 -m pip install -e .[dev]

offline:
	python3 pipeline/fetch_bbref_advanced.py --offline
	python3 pipeline/fetch_2k_ratings.py --offline
	python3 pipeline/build_vectors.py --offline --quick

train:
	./train.sh --quick

eval:
	python3 -m pytest pipeline -q

test: eval

ci: offline test
	@echo "CI green ✓ — offline fixtures, no external network"
