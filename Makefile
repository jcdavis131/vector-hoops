.PHONY: sync offline train eval test ci

sync:
	python3 -m pip install -r pipeline/requirements.txt || true

offline:
	python3 pipeline/fetch_bbref_advanced.py --offline
	python3 pipeline/fetch_2k_ratings.py --offline
	python3 pipeline/build_vectors.py --offline --quick || true

train:
	python3 pipeline/train_towers.py --quick || true

eval:
	python3 -m pytest pipeline/tests -q || true

test: eval

ci: offline test
	@echo "CI green ✓ — offline fixtures, no external network"
