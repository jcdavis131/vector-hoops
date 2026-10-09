"""pipeline/composite_v2.py: every component, the baselines it is scored against, and the aggregation, by hand.

The hand cases set K_RECALL / K_PURITY to 1 or 2 so a six-row space can be
ranked in the head; the real values (10, 20) only change how far down the
list a hit may sit. Nothing reads pipeline/data. A synthetic
season-by-season dataset built in memory checks what the parts cannot:
missing components leave cqs_v2 None, the block is JSON, two calls agree,
and the global numpy RNG is not touched.

The last group tests train_mtnn's hook on a tiny MTNN over that dataset and
imports torch for it, as tests/test_recipes.py does: the masked re-encode
runs in eval mode and restores the model's mode, nothing draws from either
RNG, and a failure inside composite_v2 is written into the block rather
than raised.

Run:  python -m pytest tests/test_composite_v2.py
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import composite_v2 as cv  # noqa: E402


def _imports(path: Path) -> set[str]:
    out: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            out.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            out.add(node.module.split(".")[0])
    return out


def test_module_does_not_import_torch():
    assert "torch" not in _imports(ROOT / "pipeline" / "composite_v2.py")


def test_aux_targets_are_train_mtnns():
    """AUX_TARGETS is a copy (train_mtnn imports torch); read the originals out of its source."""
    consts = {}
    for node in ast.parse((ROOT / "pipeline" / "train_mtnn.py").read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    consts[t.id] = node.value.value
    assert cv.AUX_TARGETS["team_fit"] == (consts["TEAM_FIT_FEATURE"],)
    assert cv.AUX_TARGETS["roster_lift"] == (consts["ROSTER_LIFT_FEATURE"],)
    assert cv.AUX_TARGETS["career_slope"] == (consts["CAREER_SLOPE_FEATURE"], "DELTA_NORM")
    assert cv.AUX_TARGETS["competition"] == (consts["COMPETITION_FEATURE"],)
    assert cv.AUX_TARGETS["honors_recognition"] == (consts["HONORS_PRIMARY"],)
    src = (ROOT / "pipeline" / "train_mtnn.py").read_text(encoding="utf-8")
    assert 'col_idx("PED_PICK_QUALITY")' in src and 'col_idx("PO_PTS_DELTA")' in src
    assert 'col_idx("DELTA_NORM")' in src


def test_weights_sum_to_one_and_name_no_unscored_component():
    assert sum(cv.WEIGHTS.values()) == pytest.approx(1.0)
    assert not {"purity", "skills_r2", "aux_r2", "margin_14d"} & set(cv.WEIGHTS)


# --- centered ---------------------------------------------------------------------------


def test_centered_maps_no_skill_baseline_perfect_to_0_half_1():
    c = cv.centered
    assert c(0.0, no_skill=0.0, baseline=0.8, perfect=1.0) == 0.0
    assert c(0.8, no_skill=0.0, baseline=0.8, perfect=1.0) == 0.5
    assert c(1.0, no_skill=0.0, baseline=0.8, perfect=1.0) == 1.0
    assert c(0.9, no_skill=0.0, baseline=0.8, perfect=1.0) == pytest.approx(0.75)
    assert c(0.4, no_skill=0.0, baseline=0.8, perfect=1.0) == pytest.approx(0.25)


def test_centered_works_for_an_error_where_lower_is_better():
    # MAE: no-skill 1.0, baseline 0.5, perfect 0.
    c = cv.centered
    assert c(0.25, no_skill=1.0, baseline=0.5, perfect=0.0) == pytest.approx(0.75)
    assert c(0.75, no_skill=1.0, baseline=0.5, perfect=0.0) == pytest.approx(0.25)
    assert c(1.5, no_skill=1.0, baseline=0.5, perfect=0.0) == 0.0  # clipped


def test_centered_degenerate_baselines():
    c = cv.centered
    # A perfect baseline: parity is the best a model can do.
    assert c(1.0, no_skill=0.0, baseline=1.0, perfect=1.0) == 0.5
    assert c(0.5, no_skill=0.0, baseline=1.0, perfect=1.0) == pytest.approx(0.25)
    # A baseline with no skill (or worse, clamped to no_skill): only the upper half is used.
    assert c(0.0, no_skill=0.0, baseline=-0.3, perfect=1.0) == 0.5
    assert c(-0.2, no_skill=0.0, baseline=0.0, perfect=1.0) == 0.0
    assert c(0.5, no_skill=0.0, baseline=0.0, perfect=1.0) == pytest.approx(0.75)


# --- ranks and recall -------------------------------------------------------------------


def test_pessimistic_ranks_count_ties_against_and_exclude_self():
    g = np.array([[1.0, 0.0], [0.6, 0.8], [0.6, 0.8], [0.0, 1.0], [1.0, 0.0]])
    # Query row 0; target row 1 ties with row 2 (same vector); row 4 duplicates
    # the query and scores higher than the target; row 0 itself is excluded.
    r = cv.pessimistic_ranks(g[[0]], g, np.array([1]), np.array([0]))
    assert r.tolist() == [2]  # row 4 above, row 2 tied
    # Exclude row 4 too by making it the excluded row: only the tie remains.
    r = cv.pessimistic_ranks(g[[4]], g, np.array([1]), np.array([4]))
    assert r.tolist() == [2]  # row 0 (identical to the query) above, row 2 tied


def test_pessimistic_ranks_agree_with_build_eval_scoreboard():
    """Same rule as build_eval_scoreboard.retrieval_ranks, which ranks self-queries."""
    rng = np.random.default_rng(0)
    space = cv.unit_rows(np.round(rng.normal(size=(60, 4)), 1))
    pairs = np.array([[i, (i + 7) % 60] for i in range(60)])
    sims = space @ space.T
    want = []
    for a, b in pairs:
        s = sims[a].copy()
        t = s[b]
        s[a] = -np.inf
        want.append(int((s > t).sum() + max((s == t).sum() - 1, 0)))
    got = cv.pessimistic_ranks(space[pairs[:, 0]], space, pairs[:, 1], pairs[:, 0], chunk=7)
    assert got.tolist() == want


# Six rows, three players A, B, C, seasons 2023-24 and 2024-25: three test
# pairs (the target season starts in 2024). Columns: 0 a game column equal on
# every row, 1 an identity column (A 1, B -1, C unobserved = 0), 2 a column
# the regime mask zeroes.
PIDS = np.array([1, 1, 2, 2, 3, 3])
SEASONS = np.array(["2023-24", "2024-25"] * 3)
Z6 = np.array(
    [[1.0, 1.0, 0.5], [1.0, 1.0, 0.5], [1.0, -1.0, 0.5], [1.0, -1.0, 0.5], [1.0, 0.0, 0.5], [1.0, 0.0, 0.5]],
    dtype=np.float32,
)
# A23 (1,0), A24 (0.8,0.6), B23 (0,1), B24 (-1,0), C23 (0.6,0.8), C24 (-0.6,-0.8).
E6 = np.array([[1, 0], [0.8, 0.6], [0, 1], [-1, 0], [0.6, 0.8], [-0.6, -0.8]], dtype=np.float32)


@pytest.fixture
def top1(monkeypatch):
    monkeypatch.setattr(cv, "K_RECALL", 1)


def test_pair_recall_by_hand(top1):
    pairs = cv.split_pairs(PIDS, SEASONS)["test"]
    assert pairs.tolist() == [[0, 1], [2, 3], [4, 5]]
    # A23's nearest is A24 (0.8): hit. B23's is C23 (0.8): miss. C23's is A24 (0.96): miss.
    assert cv.pair_recall(E6, pairs) == pytest.approx(1 / 3)


def test_recall_component_scores_against_the_identity_lookup(top1):
    out = cv.recall_component(E6, Z6, [0], [1], cv.split_pairs(PIDS, SEASONS))
    test = out["baselines"]["test"]
    # Column 0 is the same on every row: every row ties, pessimistic rank 4, no hits.
    assert test["transparent_14d"] == 0.0
    # Identity: A and B find their own other season at cosine 1; C's zero vector ties everything.
    assert test["identity_lookup"] == pytest.approx(0.6667)
    assert test["best"] == pytest.approx(0.6667)
    assert test["margin"] == pytest.approx(1 / 3 - 2 / 3, abs=1e-4)
    assert out["measures"]["test"] == {"recall_at_10": pytest.approx(0.3333), "pairs": 3}
    assert out["scores"]["test"] == pytest.approx(0.25)  # 0.5 * (1/3) / (2/3)
    assert out["scores"]["val"] is None


def test_recall_component_without_identity_columns_is_missing():
    assert "missing" in cv.recall_component(E6, Z6, [0], [], cv.split_pairs(PIDS, SEASONS))


# --- regime slice -----------------------------------------------------------------------


def test_regime_mask_columns_are_the_ones_the_old_era_never_observed():
    seasons = np.array(["2005-06", "2010-11", "2012-13", "2024-25"])
    M = np.array([[1, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]], dtype=np.float32)
    # <=2012 rows are the first three: col 0 rate 1, col 1 rate 2/3, col 2 rate 0.
    assert cv.regime_mask_columns(M, seasons) == [2]
    assert cv.regime_mask_columns(M[3:], seasons[3:]) == []  # no old-era rows at all


def test_regime_component_by_hand(top1):
    pairs = cv.split_pairs(PIDS, SEASONS)
    # Masked anchors: A23 -> (0,1), whose nearest (A23 itself excluded) is B23: miss.
    # B23 -> (-1,0), nearest B24 at 1.0: hit. C23 unchanged: miss as before.
    regime = {"rows": np.array([0, 2, 4]), "E": np.array([[0, 1], [-1, 0], [0.6, 0.8]], dtype=np.float32)}
    out = cv.regime_component(E6, Z6, [0], [1], pairs, regime, [2])
    assert out["measures"]["test"]["recall_at_10"] == pytest.approx(0.3333)
    assert out["measures"]["test"]["unmasked_recall_at_10"] == pytest.approx(0.3333)
    assert out["measures"]["test"]["retained"] == 1.0  # one hit each, though not the same pair
    # Column 2 is neither a game nor an identity column, so the baselines do not move.
    assert out["baselines"]["test"]["identity_lookup"] == pytest.approx(0.6667)
    assert out["scores"]["test"] == pytest.approx(0.25)


def test_regime_component_missing_cases():
    pairs = cv.split_pairs(PIDS, SEASONS)
    regime = {"rows": np.array([0, 2]), "E": E6[[0, 2]]}
    assert "needs the model" in cv.regime_component(E6, Z6, [0], [1], pairs, None, [2])["missing"]
    assert "no column" in cv.regime_component(E6, Z6, [0], [1], pairs, regime, [])["missing"]
    assert "not re-encoded" in cv.regime_component(E6, Z6, [0], [1], pairs, regime, [2])["missing"]


def test_regime_anchor_rows_are_val_and_test_anchors():
    pids = np.array([1, 1, 1, 2, 2])
    seasons = np.array(["2021-22", "2022-23", "2024-25", "2023-24", "2024-25"])
    pairs = cv.split_pairs(pids, seasons)
    # (0->1) targets 2022: val. (3->4) targets 2024: test. Rows 1 and 2 are not adjacent years.
    assert cv.regime_anchor_rows(pairs).tolist() == [0, 3]


# --- next-season head -------------------------------------------------------------------


def test_next_head_against_raw_and_shrunk_persistence_by_hand():
    # One game column. Train pairs (targets 2020): x [1, 2] -> y [0.5, 1.0], so
    # beta = (0.5 + 2.0) / (1 + 4) = 0.5. Test pairs (targets 2024): x [2, -2]
    # -> y [1.5, -1.0]; y mean 0.25, SS_tot 3.125.
    pids = np.array([1, 1, 2, 2, 3, 3, 4, 4])
    seasons = np.array(["2019-20", "2020-21"] * 2 + ["2023-24", "2024-25"] * 2)
    Z = np.array([[1], [0.5], [2], [1.0], [2], [1.5], [-2], [-1.0]], dtype=np.float32)
    pred = np.zeros((8, 1), np.float32)
    pred[4], pred[6] = 0.8, -0.8
    out = cv.next_head_component(pred, Z, [0], cv.split_pairs(pids, seasons), ["PTS"])
    base = out["baselines"]["test"]
    # Raw persistence: residuals [-0.5, 1.0], SS_res 1.25 -> R2 0.6, MAE 0.75.
    assert base["persistence"] == {"r2": pytest.approx(0.6), "mae_z": pytest.approx(0.75)}
    # Shrunk: predictions [1, -1], residuals [0.5, 0] -> R2 1 - 0.25/3.125 = 0.92, MAE 0.25.
    assert base["shrunk_persistence"] == {"r2": pytest.approx(0.92), "mae_z": pytest.approx(0.25)}
    # Train-mean forecast 0.75: |1.5-0.75| and |-1-0.75| -> MAE 1.25.
    assert base["train_mean"] == {"mae_z": pytest.approx(1.25)}
    assert out["baselines"]["shrink_factors"] == {"PTS": pytest.approx(0.5)}
    # Model: residuals [0.7, -0.2], SS_res 0.53 -> R2 0.8304, MAE 0.45.
    assert out["measures"]["test"] == {"r2": pytest.approx(0.8304), "mae_z": pytest.approx(0.45), "pairs": 2}
    assert base["r2_margin"] == pytest.approx(0.8304 - 0.92)
    assert base["mae_margin"] == pytest.approx(0.25 - 0.45)
    assert out["scores"]["next_r2"]["test"] == pytest.approx(0.5 * 0.8304 / 0.92, abs=1e-4)
    # MAE 0.45 between no-skill 1.25 and baseline 0.25: 0.5 * (1.25 - 0.45) / (1.25 - 0.25) = 0.4.
    assert out["scores"]["next_mae"]["test"] == pytest.approx(0.4)


def test_next_head_without_predictions_is_missing():
    assert "missing" in cv.next_head_component(None, Z6, [0], cv.split_pairs(PIDS, SEASONS), ["PTS"])


# --- archetype labels, position and archetype top-1 ------------------------------------


def test_train_only_archetypes_ignore_held_out_rows():
    Zg = np.array([[0.0], [0.1], [10.0], [10.1], [0.05], [9.9]])
    is_train = np.array([True] * 4 + [False] * 2)
    lab = cv.train_only_archetypes(Zg, is_train, k=2)
    assert lab[0] == lab[1] == lab[4] and lab[2] == lab[3] == lab[5] and lab[0] != lab[2]
    # Moving held-out rows anywhere changes no train row's label.
    Zg2 = Zg.copy()
    Zg2[4:] = [[100.0], [-50.0]]
    assert cv.train_only_archetypes(Zg2, is_train, k=2)[:4].tolist() == lab[:4].tolist()


def test_match_labels_finds_the_permutation_on_train_rows_only():
    new = np.array([0, 0, 1, 1, 2, 2])
    stored = np.array([2, 2, 0, 0, 1, 0])
    rows = np.array([True, True, True, True, True, False])
    # On the first five rows new 0 -> 2, 1 -> 0, 2 -> 1; the last row does not vote.
    assert cv.match_labels(new, stored, rows, k=3).tolist() == [2, 2, 0, 0, 1, 1]


def test_classification_component_scores_held_out_rows_only():
    split = np.array(["train", "train", "test", "test", "test", "val"])
    labels = np.array([0, 0, 1, 0, -1, 2])
    logits = np.eye(3)[[0, 1, 1, 1, 2, 2]]  # predictions 0, 1, 1, 1, 2, 2
    out = cv.classification_component(logits, labels, split, "position")
    # Test rows with a label: rows 2 (1 vs 1, right) and 3 (1 vs 0, wrong). Row 4 is unlabelled.
    assert out["measures"]["test"] == {"top1": 0.5, "rows": 2}
    assert out["measures"]["val"] == {"top1": 1.0, "rows": 1}
    assert out["scores"]["test"] == 0.5
    # Most common train label is 0: right on row 3 of the two labelled test rows.
    assert out["baselines"]["test"] == {"majority_class": 0.5}
    assert "missing" in cv.classification_component(None, labels, split, "position")
    assert "missing" in cv.classification_component(logits, np.full(6, -1), split, "position")


# --- diagnostics ------------------------------------------------------------------------


def test_exact_purity_by_hand(monkeypatch):
    monkeypatch.setattr(cv, "K_PURITY", 2)
    E = cv.unit_rows(np.array([[1, 0], [0.9, 0.1], [0.8, 0.2], [0, 1], [0.1, 0.9]], dtype=np.float32))
    years = np.array([2024, 2024, 2010, 2010, 2024])
    labels = np.array([0, 1, 0, 1, 1])
    # Anchor 0: top-2 are rows 1 and 2; row 1 is the same year, so only row 2
    # counts, and it shares label 0: purity 1.0. Anchor 4: top-2 rows 3 and 2;
    # row 3 (2010) shares label 1, row 2 (2010) does not: 0.5.
    got, n = cv.exact_purity(E, labels, years, np.array([0, 4]))
    assert n == 2 and got == pytest.approx(0.75)


def test_skills_formula_reproduces_build_skills_grades():
    """The ceiling the skills head is measured against: grades from its own input columns."""
    import build_skills

    game = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV", "FG3A", "FGA", "FTA"]
    game += ["FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]
    rng = np.random.default_rng(3)
    n = 30
    Z = rng.normal(size=(n, len(game))).astype(np.float32)
    seasons = np.array(["2024-25"] * 15 + ["2023-24"] * 15)
    target, keys = cv.skill_formula_grades(Z, game, seasons)
    assert keys == [s["key"] for s in build_skills.SKILLS]
    split = np.array([cv.eval_split(s) for s in seasons])
    pred = np.tile(target[split == "test"].mean(axis=0), (n, 1))  # the test mean: R2 0 on test
    skills = {"pred": pred, "target": target, "mask": np.ones_like(target), "keys": keys, "n_core": len(keys)}
    out = cv.skills_diagnostic(skills, Z, list(range(len(game))), game, seasons, split, None)
    assert out["test"]["formula_mean_r2"] == 1.0
    assert out["test"]["model_mean_r2"] == pytest.approx(0.0, abs=1e-4)
    assert out["scored"] is False


def test_aux_diagnostic_marks_targets_that_are_inputs():
    features = ["TM_NET_RTG", "CAREER_SLOPE_3Y", "DELTA_NORM", "PED_PICK_QUALITY", "SOS_NET_RTG"]
    families = {"TM_NET_RTG": "team", "CAREER_SLOPE_3Y": "career", "DELTA_NORM": "career"}
    families |= {"PED_PICK_QUALITY": "pedigree", "SOS_NET_RTG": "competition"}
    M = np.array([[1, 0, 1, 1, 1], [1, 0, 1, 1, 1]], dtype=np.float32)
    report = {"team_fit": {"val": {"r2": 0.7}, "test": {"r2": 0.8}}, "competition": {"val": None, "test": None}}
    out = cv.aux_diagnostic(report, features, families, M, {"exclude_families": "pedigree", "drop_features": ""})
    heads = out["heads"]
    assert heads["team_fit"] == {
        "target": "TM_NET_RTG",
        "target_is_input": True,
        "identity_ceiling_r2": 1.0,
        "val_r2": 0.7,
        "test_r2": 0.8,
    }
    # CAREER_SLOPE_3Y has no observations, so the head trains on DELTA_NORM, as train_mtnn falls back.
    assert heads["career_slope"]["target"] == "DELTA_NORM"
    # An excluded family is not an input, so there is no identity ceiling.
    assert heads["pedigree_expectation"]["target_is_input"] is False
    assert heads["pedigree_expectation"]["identity_ceiling_r2"] is None
    assert heads["competition"]["test_r2"] is None
    assert heads["roster_lift"] == {"target": None}


def test_margin_14d_diagnostic_reads_v1():
    report = {
        "composite": {"components": {"margin_14d": 1.0}},
        "held_out_recall": {"test": {"recall_at_10_mtnn": 0.742, "recall_at_10_transparent_14d": 0.234}},
    }
    out = cv.margin_14d_diagnostic(report)
    assert (out["v1_component"], out["v1_test_recall_at_10"], out["v1_transparent_14d"]) == (1.0, 0.742, 0.234)
    assert out["scored"] is False


# --- aggregation ------------------------------------------------------------------------


def test_cqs_from_by_hand():
    half = dict.fromkeys(cv.WEIGHTS, 0.5)
    assert cv.cqs_from(half) == 50.0
    mixed = {"recall": 1.0, "regime": 0.0, "next_r2": 0.5, "next_mae": 0.5, "position": 0.8, "archetype": 0.6}
    # 100 * (0.30*1 + 0.20*0 + 0.15*0.5 + 0.10*0.5 + 0.15*0.8 + 0.10*0.6) = 60.5
    assert cv.cqs_from(mixed) == pytest.approx(60.5)
    assert cv.cqs_from({**half, "regime": None}) is None
    assert cv.cqs_from({k: v for k, v in half.items() if k != "position"}) is None


def test_failed_block_scores_nothing():
    b = cv.failed_block("boom")
    assert b["cqs_v2"] is None and b["cqs_v2_val"] is None
    assert b["components_missing"] == list(cv.WEIGHTS)
    assert set(b["components"].values()) == {None}
    assert b["error"] == "boom"


# --- end to end on a synthetic dataset --------------------------------------------------

GAME = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV", "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT"]
GAME += ["PLUS_MINUS"]


def synthetic(n_players: int = 30, first: int = 2008, last: int = 2025) -> dict:
    """Player-seasons with a per-player style, identity columns, and a column the old era never observed."""
    rng = np.random.default_rng(11)
    features = [*GAME, *cv.IDENTITY_FEATURES, "TOUCHES", "TM_NET_RTG"]
    families = dict.fromkeys(GAME, "volume") | dict.fromkeys(cv.IDENTITY_FEATURES, "bio")
    families |= {"TOUCHES": "tracking", "TM_NET_RTG": "team"}
    rows = []
    for p in range(n_players):
        style = rng.normal(size=len(GAME))
        ident = rng.normal(size=len(cv.IDENTITY_FEATURES))
        for y in range(first + p % 5, last + 1):
            g = style + 0.3 * rng.normal(size=len(GAME))
            rows.append((p, y, g, ident, rng.normal(), rng.normal()))
    n = len(rows)
    Z = np.zeros((n, len(features)), np.float32)
    M = np.ones_like(Z)
    for i, (_p, y, g, ident, touches, tm) in enumerate(rows):
        Z[i, : len(GAME)] = g
        Z[i, len(GAME) : len(GAME) + 7] = ident
        if y <= 2012:
            M[i, -2] = 0.0  # TOUCHES: not recorded before 2013
        else:
            Z[i, -2] = touches
        Z[i, -1] = tm
    pids = np.array([r[0] for r in rows])
    seasons = np.array([f"{r[1]}-{(r[1] + 1) % 100:02d}" for r in rows])
    E = cv.unit_rows(np.concatenate([Z[:, : len(GAME)], 0.1 * rng.normal(size=(n, 4))], axis=1))
    return {
        "E": E,
        "Z": Z,
        "M": M,
        "features": features,
        "families": families,
        "game_features": GAME,
        "player_id": pids,
        "season": seasons,
        "cluster": rng.integers(0, cv.N_ARCHETYPES, size=n),
        "position": rng.integers(-1, 5, size=n),
        "archetype_logits": rng.normal(size=(n, cv.N_ARCHETYPES)),
        "position_logits": rng.normal(size=(n, 5)),
        "next_profile_pred": 0.8 * Z[:, : len(GAME)],
    }


def with_regime(inp: dict) -> dict:
    pairs = cv.split_pairs(inp["player_id"], inp["season"])
    rows = cv.regime_anchor_rows(pairs)
    # Stand-in for the model's re-encode: the embedding with a little noise.
    noisy = inp["E"][rows] + 0.05 * np.random.default_rng(5).normal(size=inp["E"][rows].shape)
    return {**inp, "regime": {"rows": rows, "E": noisy.astype(np.float32)}}


def test_a_complete_input_scores_and_the_cqs_is_the_weighted_components():
    out = cv.composite_v2(with_regime(synthetic()))
    assert out["components_missing"] == [] and out["missing_reasons"] == {}
    comps = out["components"]
    assert set(comps) == set(cv.WEIGHTS) and all(0.0 <= v <= 1.0 for v in comps.values())
    assert out["cqs_v2"] == round(100 * sum(cv.WEIGHTS[k] * comps[k] for k in cv.WEIGHTS), 2)
    assert out["cqs_v2_val"] == round(100 * sum(cv.WEIGHTS[k] * out["components_val"][k] for k in cv.WEIGHTS), 2)
    assert out["diagnostics"]["regime_masked_features"] == ["TOUCHES"]
    assert out["diagnostics"]["identity_features"] == list(cv.IDENTITY_FEATURES)
    assert out["version"] == cv.VERSION
    json.dumps(out)  # plain Python types only


@pytest.mark.parametrize(
    ("drop", "missing"),
    [
        ("next_profile_pred", ["next_r2", "next_mae"]),
        ("regime", ["regime"]),
        ("position_logits", ["position"]),
        ("cluster", ["archetype"]),
    ],
)
def test_a_missing_input_leaves_the_cqs_unscored_and_says_why(drop, missing):
    inp = with_regime(synthetic())
    inp[drop] = None
    out = cv.composite_v2(inp)
    assert out["cqs_v2"] is None and out["cqs_v2_val"] is None
    assert out["components_missing"] == missing
    for k in missing:
        assert out["components"][k] is None  # never 0.0
        assert out["missing_reasons"][k]
    assert all(out["components"][k] is not None for k in cv.WEIGHTS if k not in missing)


def test_a_missing_required_input_is_an_error():
    inp = synthetic()
    del inp["Z"]
    with pytest.raises(ValueError, match="Z"):
        cv.composite_v2(inp)


def test_it_never_touches_the_global_numpy_rng():
    inp = with_regime(synthetic())
    np.random.seed(1234)
    before = np.random.get_state()
    cv.composite_v2(inp)
    after = np.random.get_state()
    assert before[0] == after[0]
    np.testing.assert_array_equal(before[1], after[1])
    assert before[2:] == after[2:]


def test_two_calls_agree():
    inp = with_regime(synthetic())
    assert json.dumps(cv.composite_v2(inp)) == json.dumps(cv.composite_v2(inp))


# --- the train_mtnn hook (imports torch, as tests/test_recipes.py does) -----------------


@pytest.fixture(scope="module")
def tm():
    import importlib

    return importlib.import_module("train_mtnn")


def tiny_model(tm, inp: dict, token_dropout: float = 0.5):
    """A small MTNN over the synthetic dataset's families, built under a forked torch RNG."""
    import torch

    feats, fams_of = inp["features"], inp["families"]
    fams: dict[str, list[int]] = {}
    for j, f in enumerate(feats):
        fams.setdefault(fams_of[f], []).append(j)
    seasons = sorted(set(inp["season"].tolist()))
    season_ids = np.array([seasons.index(s) for s in inp["season"]])
    args = vars(tm.build_parser().parse_args(["--dim", "8", "--tower-width", "4", "--tower-hidden", "8"]))
    args["token_dropout"] = token_dropout
    with torch.random.fork_rng():
        torch.manual_seed(0)
        model = tm.MTNN(
            {f: len(c) for f, c in fams.items()},
            len(seasons),
            n_game=len(GAME),
            **tm.mtnn_arch_kwargs(args),
        )
    return model, fams, torch.tensor(season_ids)


def test_mtnn_arch_kwargs_reads_exactly_arch_args_and_matches_mains_old_spelling(tm):
    args = vars(tm.build_parser().parse_args([]))
    kw = tm.mtnn_arch_kwargs(args)
    # The keyword arguments main() spelled out before mtnn_arch_kwargs existed.
    assert kw == {
        "d_tower": args["tower_width"],
        "d_tower_hidden": args["tower_hidden"],
        "d_emb": args["dim"],
        "d_skill_hidden": args["skill_hidden"],
        "fusion_mode": args["fusion"],
        "n_tower_blocks": args["tower_blocks"],
        "mlp_heads": args["mlp_heads"],
        "d_head_hidden": args["d_head_hidden"],
        "d_model": args["d_model"],
        "n_fusion_layers": args["n_fusion_layers"],
        "n_attn_heads": args["n_attn_heads"],
        "d_fusion_hidden": (args["fusion_hidden"] or None),
        "token_dropout": args["token_dropout"],
    }
    for key in tm.ARCH_ARGS:
        with pytest.raises(KeyError):
            tm.mtnn_arch_kwargs({k: v for k, v in args.items() if k != key})
    assert tm.mtnn_arch_kwargs({k: v for k, v in args.items() if k != "token_dropout"})["token_dropout"] == 0.0


def test_encode_masked_rows_zeroes_the_columns_in_eval_mode_and_restores_train_mode(tm):
    import torch

    inp = synthetic()
    model, fams, seas_t = tiny_model(tm, inp)
    Z, M = inp["Z"], inp["M"]
    rows, cols = np.array([3, 40, 41]), [len(GAME), len(GAME) + 1]
    model.train()
    np_before, t_before = np.random.get_state(), torch.get_rng_state()
    got = tm.encode_masked_rows(model, Z, M, rows, cols, fams, seas_t, "cpu", chunk=2)
    assert model.training  # restored
    np.testing.assert_array_equal(np.random.get_state()[1], np_before[1])
    assert torch.equal(torch.get_rng_state(), t_before)  # token dropout (0.5 here) drew nothing
    Zr, Mr = Z[rows].copy(), M[rows].copy()
    Zr[:, cols] = 0.0
    Mr[:, cols] = 0.0
    model.eval()
    with torch.no_grad():
        xs, ms = tm.split_by_family(Zr, Mr, fams, "cpu")
        want = model.encode(xs, ms, seas_t[torch.tensor(rows)]).numpy()
    np.testing.assert_allclose(got, want, rtol=0, atol=1e-6)


def hook_inputs(tm, inp, model, fams, seas_t) -> dict:
    import torch

    xs, ms = tm.split_by_family(inp["Z"], inp["M"], fams, "cpu")
    with torch.no_grad():
        E = tm.embed_all(model, xs, ms, seas_t)
    out = {k: v for k, v in inp.items() if k not in ("Z", "M")}
    return {**out, "E": E}


def test_composite_v2_block_scores_the_regime_slice_from_the_model(tm):
    import logging

    inp = synthetic()
    model, fams, seas_t = tiny_model(tm, inp)
    block = tm.composite_v2_block(
        model, fams, inp["Z"], inp["M"], seas_t, "cpu", hook_inputs(tm, inp, model, fams, seas_t), logging
    )
    assert "error" not in block
    assert block["components"]["regime"] is not None
    assert block["components_missing"] == [] and block["cqs_v2"] is not None
    assert block["diagnostics"]["regime_masked_features"] == ["TOUCHES"]


def test_composite_v2_block_writes_a_failure_into_the_block_instead_of_raising(tm, monkeypatch, caplog):
    import logging

    inp = synthetic()
    model, fams, seas_t = tiny_model(tm, inp)
    args = (model, fams, inp["Z"], inp["M"], seas_t, "cpu", hook_inputs(tm, inp, model, fams, seas_t))

    def boom(_inputs):
        raise RuntimeError("bad input")

    monkeypatch.setattr(tm.composite_v2, "composite_v2", boom)
    block = tm.composite_v2_block(*args, logging.getLogger("t"))
    assert block["cqs_v2"] is None and block["error"] == "RuntimeError: bad input"
    assert block["components_missing"] == list(cv.WEIGHTS)

    def draws(_inputs):
        np.random.random()
        return {"cqs_v2": 1.0}

    monkeypatch.setattr(tm.composite_v2, "composite_v2", draws)
    with caplog.at_level(logging.ERROR):
        block = tm.composite_v2_block(*args, logging.getLogger("t"))
    assert block["cqs_v2"] is None and "RNG" in block["error"]
    assert "RNG" in caplog.text
