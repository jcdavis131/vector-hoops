"""--out-root for the context builders, so a gate can rebuild without writing the repo.

build_honors, build_pedigree, build_playoffs, build_wide_skills,
build_salary_market and build_game_ratings each write fixed paths: a
pipeline/data file that integrate_context.py or train_mtnn.py reads as a training
input, and usually an assets/ file the site serves. Their gates (test_honors.py
and friends) re-ran the builder so they always checked fresh derivation logic,
which meant running a "test" rewrote training inputs and tracked assets in place.
Measured on 90ef66a4, running the six gate scripts once changed 6 pipeline/data
files (honors, pedigree, playoffs, salary_market, game_ratings,
wide_skill_labels.npz) and 4 tracked assets (honors, pedigree, playoffs,
playoff_paths). build_embedding_map_manifest (three assets/embedding_map_*.json,
no pipeline/data output) takes the same flag so its test can run it.

`--out-root DIR` keeps each output's repo-relative path but roots it at DIR:
DIR/pipeline/data/honors.json, DIR/assets/honors.json. Inputs are still read
from the repo. Without the flag every path is exactly what it was.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import argparse

ROOT = Path(__file__).resolve().parents[1]


def add_out_root(ap: argparse.ArgumentParser) -> None:
    ap.add_argument(
        "--out-root",
        type=Path,
        default=None,
        metavar="DIR",
        help="write outputs under DIR with their repo-relative layout instead of into the repo "
        "(inputs are still read from the repo). The gate tests pass a tmp dir.",
    )


def rerooted(path: Path, out_root: Path | None) -> Path:
    """`path` (an output under ROOT) moved under `out_root`; unchanged when out_root is None."""
    if out_root is None:
        return path
    return Path(out_root) / path.relative_to(ROOT)


def shown(path: Path) -> Path:
    """Repo-relative for printing when the output is in the repo, absolute otherwise."""
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path
