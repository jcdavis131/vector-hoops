"""pipeline/mtnn_metrics.py: the code behind held-out recall@10, purity@20 and the 14-d baseline.

Every expected value here is worked out by hand from a few rows built in the
test. Nothing reads pipeline/data, and nothing imports torch: these are the
functions every recorded CQS depends on, and until 2026-10-09 none of them had
a test [tests#7, training#13].

recall_at_k's draw from the global numpy RNG is pinned on purpose. It is the
protocol the recorded baselines were measured under; a change to it should
fail here and ship as a deliberate protocol change.

Run:  python -m pytest tests/test_mtnn_metrics.py
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mtnn_metrics as mm  # noqa: E402

MOVED = (
    "adjacent_season_pairs",
    "cross_era_archetype_purity",
    "eval_split",
    "filter_pairs_by_split",
    "next_season_index",
    "recall_at_k",
    "season_start_year",
    "transparent_baseline_embeddings",
)


def _imports(path: Path) -> set[str]:
    out: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            out.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


def test_module_does_not_import_torch():
    # Read from the source, not sys.modules: in a full pytest run another test
    # may already have imported torch, which would make that check meaningless.
    assert "torch" not in _imports(ROOT / "pipeline" / "mtnn_metrics.py")


def test_train_mtnn_imports_these_instead_of_defining_its_own():
    """ablate_v5, leakfree, sweep_v5 and score_mtnn_validation reach these as
    train_mtnn.<name>; a second copy in train_mtnn would let the two drift."""
    tree = ast.parse((ROOT / "pipeline" / "train_mtnn.py").read_text(encoding="utf-8"))
    defined = {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}
    imported = {
        a.name for n in tree.body if isinstance(n, ast.ImportFrom) and n.module == "mtnn_metrics" for a in n.names
    }
    assert set(MOVED) <= imported
    assert not set(MOVED) & defined


# --- splits --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("season", "split"),
    [
        ("1996-97", "train"),
        ("2021-22", "train"),  # last train season: start year 2021
        ("2022-23", "val"),  # first val season
        ("2023-24", "val"),  # last val season
        ("2024-25", "test"),  # first test season
        ("2025-26", "test"),
    ],
)
def test_eval_split_cutoffs(season, split):
    assert mm.eval_split(season) == split


def test_pairs_are_split_by_their_target_row():
    """A 2021-22 -> 2022-23 pair is a val pair: the split follows the season
    being predicted (index b), not the query season."""
    seasons = np.array(["2020-21", "2021-22", "2022-23", "2023-24", "2024-25"])
    pairs = np.array([(0, 1), (1, 2), (2, 3), (3, 4)])
    assert mm.filter_pairs_by_split(pairs, seasons, "train").tolist() == [[0, 1]]
    assert mm.filter_pairs_by_split(pairs, seasons, "val").tolist() == [[1, 2], [2, 3]]
    assert mm.filter_pairs_by_split(pairs, seasons, "test").tolist() == [[3, 4]]

    none = mm.filter_pairs_by_split(np.array([(0, 1)]), seasons, "test")
    assert none.shape == (0, 2)
    empty = np.zeros((0, 2), int)
    assert mm.filter_pairs_by_split(empty, seasons, "val") is empty


# --- pairs ---------------------------------------------------------------------

# Rows: (player_id, display name, season). Two different players share the
# display name "Same Name" in consecutive seasons (rows 0 and 1); player 303
# skips 2011-12; player 404's rows are stored newest first.
ROWS = [
    (101, "Same Name", "2013-14"),  # 0
    (202, "Same Name", "2014-15"),  # 1
    (101, "Same Name", "2014-15"),  # 2
    (303, "Gap Year", "2010-11"),  # 3
    (303, "Gap Year", "2012-13"),  # 4
    (303, "Gap Year", "2013-14"),  # 5
    (202, "Same Name", "2015-16"),  # 6
    (404, "Reversed", "2019-20"),  # 7
    (404, "Reversed", "2018-19"),  # 8
]
PIDS = np.array([r[0] for r in ROWS], dtype=np.int64)
NAMES = np.array([r[1] for r in ROWS])
SEASONS = np.array([r[2] for r in ROWS])


def test_pairs_key_on_player_id_not_the_display_name():
    pairs = mm.adjacent_season_pairs(PIDS, SEASONS, NAMES)
    # Grouped by player id in first-seen order, each group sorted by year.
    assert pairs == [(0, 2), (1, 6), (4, 5), (8, 7)]
    # Keyed by name, rows 0 -> 1 (two careers) would have been a positive.
    assert (0, 1) not in pairs
    assert mm.adjacent_season_pairs(PIDS, SEASONS) == pairs


def test_a_gap_year_makes_no_pair():
    pairs = mm.adjacent_season_pairs(PIDS, SEASONS)
    assert (3, 4) not in pairs  # 2010-11 -> 2012-13
    assert [p for p in pairs if p[0] == 3 or p[1] == 3] == []


def test_next_season_index():
    nxt = mm.next_season_index(len(ROWS), np.array(mm.adjacent_season_pairs(PIDS, SEASONS)))
    assert nxt.dtype == np.int64
    assert nxt.tolist() == [2, 6, -1, -1, 5, -1, -1, -1, 7]


# --- recall@k ------------------------------------------------------------------


def _paired_rows(n_pairs: int, d: int, seed: int) -> np.ndarray:
    """Rows 2i and 2i+1 are the same random unit vector."""
    base = np.random.default_rng(seed).normal(size=(n_pairs, d))
    base /= np.linalg.norm(base, axis=1, keepdims=True)
    return np.repeat(base, 2, axis=0).astype(np.float32)


def _hit(E: np.ndarray, a: int, b: int, k: int) -> bool:
    sims = E @ E[a]
    sims[a] = -np.inf
    return b in np.argsort(-sims, kind="stable")[:k]


def test_recall_is_one_when_each_target_is_its_query_copy():
    # 12 one-hot directions, two rows each: the partner is the only row with
    # similarity 1, every other row has 0, and the query itself is excluded.
    E = np.repeat(np.eye(12, dtype=np.float32), 2, axis=0)
    pairs = np.array([(2 * i, 2 * i + 1) for i in range(12)])
    np.random.seed(0)
    assert mm.recall_at_k(E, pairs, k=10) == 1.0
    assert mm.recall_at_k(E, pairs, k=1) == 1.0
    assert mm.recall_at_k(E, pairs[:, ::-1].copy(), k=1) == 1.0


def test_recall_on_shuffled_rows_is_near_chance():
    E = _paired_rows(200, 32, seed=0)
    pairs = np.array([(2 * i, 2 * i + 1) for i in range(200)])
    np.random.seed(0)
    assert mm.recall_at_k(E, pairs, k=10) == 1.0
    # Same pairs, rows permuted: each target is now an unrelated row. Chance
    # for a top-10 hit among 399 candidates is 10/399 = 0.025.
    shuffled = E[np.random.default_rng(1).permutation(len(E))]
    np.random.seed(0)
    r = mm.recall_at_k(shuffled, pairs, k=10)
    assert r is not None and r < 0.1


def test_recall_of_no_pairs_is_none_and_draws_nothing():
    np.random.seed(5)
    assert mm.recall_at_k(np.eye(4, dtype=np.float32), np.zeros((0, 2), int)) is None
    after = np.random.random()
    np.random.seed(5)
    assert np.random.random() == after


def test_recall_subsample_is_one_draw_from_the_global_rng():
    """The protocol every recorded recall was measured under: one
    np.random.choice(len(pairs), min(500, len(pairs)), replace=False) on the
    global state, then score that subset. Pinned so that a switch to a local
    rng, shared indices or exhaustive scoring fails here (tests#7 verifier
    note: that is a protocol change and needs re-measured anchors)."""
    # 600 pairs over 1200 distinct rows (no tied similarities, so the top-10
    # set is unique): even-numbered pairs target a near copy of the query (a
    # hit), odd ones an unrelated random row (almost always a miss). The score
    # therefore depends on which 500 pairs are drawn.
    rng = np.random.default_rng(3)
    E = rng.normal(size=(1200, 24))
    E[1::2] = E[0::2] + 0.01 * rng.normal(size=(600, 24))
    E = (E / np.linalg.norm(E, axis=1, keepdims=True)).astype(np.float32)
    odd = rng.integers(0, 1200, size=600)
    pairs = np.array([(2 * i, 2 * i + 1 if i % 2 == 0 else int(odd[i])) for i in range(600)])
    pairs = pairs[pairs[:, 0] != pairs[:, 1]]
    n = len(pairs)
    assert n > 500

    np.random.seed(1234)
    idx = np.random.choice(n, min(500, n), replace=False)
    want = sum(_hit(E, int(a), int(b), 10) for a, b in pairs[idx]) / len(idx)
    want_next = np.random.random()

    np.random.seed(1234)
    got = mm.recall_at_k(E, pairs, k=10)
    assert got == want
    # The global state moved by exactly that one draw.
    assert np.random.random() == want_next


def test_recall_with_fewer_than_500_pairs_still_draws_a_permutation():
    E = _paired_rows(20, 8, seed=6)
    pairs = np.array([(2 * i, 2 * i + 1) for i in range(20)])
    np.random.seed(9)
    np.random.choice(20, 20, replace=False)
    want_next = np.random.random()
    np.random.seed(9)
    mm.recall_at_k(E, pairs, k=10)
    assert np.random.random() == want_next


# --- purity@20 -----------------------------------------------------------------


def _two_groups(labels_a: list[int], labels_b: list[int], seasons=None):
    """Group A rows all sit at e1, group B rows at e2; labels are the clusters."""
    na, nb = len(labels_a), len(labels_b)
    E = np.zeros((na + nb, 2), dtype=np.float32)
    E[:na, 0] = 1.0
    E[na:, 1] = 1.0
    clusters = np.array(labels_a + labels_b, dtype=np.int64)
    if seasons is None:
        seasons = np.array([f"{1980 + i}-{(81 + i) % 100:02d}" for i in range(na + nb)])
    return E, clusters, seasons


def test_purity_is_one_when_clusters_match_the_geometry():
    E, clusters, seasons = _two_groups([0] * 21, [1] * 21)
    assert mm.cross_era_archetype_purity(E, clusters, seasons, k=20, n_sample=42) == 1.0


def test_purity_on_a_two_cluster_toy_by_hand():
    """21 rows per group, every row its own season, k = 20: a row's 20
    neighbours are exactly the other 20 rows of its group, all cross-era.
    Group A has 15 rows labelled 0 and 6 labelled 1 (B the mirror image).
      a row labelled 0 in A sees 14 zeros of 20 -> 0.70 (15 rows per group)
      a row labelled 1 in A sees  5 ones  of 20 -> 0.25 ( 6 rows per group)
    mean over 42 rows = (30 * 0.70 + 12 * 0.25) / 42 = 24 / 42."""
    E, clusters, seasons = _two_groups([0] * 15 + [1] * 6, [1] * 15 + [0] * 6)
    got = mm.cross_era_archetype_purity(E, clusters, seasons, k=20, n_sample=42)
    assert got == pytest.approx(24 / 42, abs=1e-12)


def test_purity_counts_only_cross_era_neighbours():
    # Every row in one season: no cross-era neighbour anywhere, so None.
    E, clusters, _ = _two_groups([0] * 21, [1] * 21)
    same = np.array(["2010-11"] * 42)
    assert mm.cross_era_archetype_purity(E, clusters, same, k=20, n_sample=42) is None


def test_purity_needs_n_sample_labelled_rows():
    E, clusters, seasons = _two_groups([0] * 21, [1] * 21)
    clusters[:5] = -1  # unlabelled rows are not candidates
    assert mm.cross_era_archetype_purity(E, clusters, seasons, k=20, n_sample=40) is None


# --- 14-d baseline ---------------------------------------------------------------


def test_transparent_baseline_is_the_l2_normalised_game_columns():
    Z = np.array([[9.0, 3.0, 9.0, 4.0], [9.0, 0.0, 9.0, 0.0]], dtype=np.float32)
    G = mm.transparent_baseline_embeddings(Z, [1, 3])
    assert G.dtype == np.float32
    assert G.tolist() == [[pytest.approx(0.6), pytest.approx(0.8)], [0.0, 0.0]]
