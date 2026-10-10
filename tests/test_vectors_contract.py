"""assets/vectors.json must carry each player-season's position.

Only enrich_vectors.py sets `p` (and the `positions` legend); build_vectors.py
alone writes a vectors.json with neither. That file is both the training input
and a deployed asset. Trained on, it leaves the position head (loss weight 0.15)
with no labels, which costs about 4 CQS and logs nothing louder than a WARNING
from train_mtnn.load_positions. The skills-dataset workflow would have
committed exactly such a file to master every week.

This is the check that makes that commit fail CI. Measured 2026-10-09: 12,925
of 12,966 rows carry an int p in [0, 5); the other 41 are -1 (no position
source), so the floor is 0.99 rather than an exact row count, which identity
fixes are allowed to change.

Run:  python -m pytest tests/test_vectors_contract.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"

MIN_POSITION_COVERAGE = 0.99


def test_vectors_json_carries_positions():
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = vec["players"]
    assert vec.get("positions") == ["PG", "SG", "SF", "PF", "C"], "no positions legend: enrich_vectors.py did not run"
    labelled = sum(1 for p in players if isinstance(p.get("p"), int) and 0 <= p["p"] < 5)
    cov = labelled / max(len(players), 1)
    assert cov >= MIN_POSITION_COVERAGE, (
        f"only {labelled}/{len(players)} rows ({cov:.4f}) carry a position; "
        "vectors.json was rebuilt without enrich_vectors.py"
    )
