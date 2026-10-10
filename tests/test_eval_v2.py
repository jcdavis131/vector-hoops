"""pipeline/eval_v2.py: recompute CQS v2 from files, and refuse files that do not belong together.

Everything is built in tmp_path: a small season-by-season matrix, a tiny
MTNN trained on nothing (its random weights are a model like any other),
the embedding npz and checkpoint it produces, and a report whose v1 numbers
come from its heads. Imports torch through train_mtnn, as
tests/test_recipes.py does.

Run:  python -m pytest tests/test_eval_v2.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import composite_v2 as cv  # noqa: E402
import eval_v2  # noqa: E402
from artifact_io import matrix_fingerprint  # noqa: E402

GAME = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV", "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT"]
GAME += ["PLUS_MINUS"]
FEATURES = [*GAME, *cv.IDENTITY_FEATURES, "TOUCHES", "TM_NET_RTG"]
FAMILIES = dict.fromkeys(GAME, "volume") | dict.fromkeys(cv.IDENTITY_FEATURES, "bio")
FAMILIES |= {"TOUCHES": "tracking", "TM_NET_RTG": "team"}


@pytest.fixture(scope="module")
def tm():
    import importlib

    return importlib.import_module("train_mtnn")


def matrix(n_players: int = 24):
    rng = np.random.default_rng(2)
    rows = []
    for p in range(n_players):
        style, ident = rng.normal(size=len(GAME)), rng.normal(size=7)
        for y in range(2008 + p % 4, 2026):
            rows.append((p, y, style + 0.3 * rng.normal(size=len(GAME)), ident, rng.normal(), rng.normal()))
    Z = np.zeros((len(rows), len(FEATURES)), np.float32)
    M = np.ones_like(Z)
    for i, (_p, y, g, ident, touches, tm_net) in enumerate(rows):
        Z[i, : len(GAME)], Z[i, len(GAME) : len(GAME) + 7], Z[i, -1] = g, ident, tm_net
        if y <= 2012:
            M[i, -2] = 0.0
        else:
            Z[i, -2] = touches
    pids = np.array([r[0] for r in rows], dtype=np.int64)
    seasons = np.array([f"{r[1]}-{(r[1] + 1) % 100:02d}" for r in rows])
    names = np.array([f"player {r[0]}" for r in rows])
    cluster = rng.integers(0, cv.N_ARCHETYPES, size=len(rows))
    position = rng.integers(-1, 5, size=len(rows))
    return Z, M, pids, seasons, names, cluster, position


def build_model(tm, n_seasons: int, seed: int):
    import torch

    args = vars(tm.build_parser().parse_args(["--dim", "8", "--tower-width", "4", "--tower-hidden", "8"]))
    manifest = {"features": FEATURES, "families": FAMILIES, "game_features": GAME}
    fams = {k: v for k, v in tm.family_slices(manifest).items() if k != "injury"}
    with torch.random.fork_rng():
        torch.manual_seed(seed)
        model = tm.MTNN({f: len(c) for f, c in fams.items()}, n_seasons, n_game=len(GAME), **tm.mtnn_arch_kwargs(args))
    model.eval()
    return model, fams, args


@pytest.fixture(scope="module")
def run(tm, tmp_path_factory):
    """A run directory as train_mtnn --run-dir leaves it, plus the matrix and manifest."""
    import torch

    d = tmp_path_factory.mktemp("run")
    Z, M, pids, seasons, names, cluster, position = matrix()
    np.savez(d / "train_matrix.npz", Z=Z, mask=M, player_id=pids, season=seasons, name=names, cluster=cluster)
    manifest = {"features": FEATURES, "families": FAMILIES, "game_features": GAME}
    (d / "feature_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    season_ids = torch.tensor(tm.season_index(seasons))
    model, fams, args = build_model(tm, int(season_ids.max()) + 1, seed=0)
    with torch.no_grad():
        xs, ms = tm.split_by_family(Z, M, fams, "cpu")
        E, heads = model(xs, ms, season_ids)
    E = E.numpy()
    arch, pos, nxt = (heads[k].numpy() for k in ("archetype", "position", "next_profile"))
    np.savez(
        d / "embedding_v3.npz",
        E=E,
        player_id=pids,
        season=seasons,
        name=names,
        cluster=cluster,
        position=position,
        archetype_logits=arch,
        position_logits=pos,
        skill_pred=np.zeros((len(E), 0), np.float32),
        skill_keys=np.array([]),
        next_profile_pred=nxt,
    )
    torch.save({"model": model.state_dict(), "args": args}, d / "mtnn_best.pt")
    test = cv.split_pairs(pids, seasons)["test"]
    r2, mae = cv._r2_mae(Z[test[:, 1]][:, : len(GAME)].astype(np.float64), nxt[test[:, 0]].astype(np.float64))
    ok = position >= 0
    report = {
        "composite": {"cqs": 50.0, "test_recall_at_10": 0.5, "purity_at_20": 0.5, "components": {"margin_14d": 1.0}},
        "archetype_top1_acc": float((arch.argmax(1) == cluster).mean()),
        "position_top1_acc": float((pos[ok].argmax(1) == position[ok]).mean()),
        "next_profile": {"test": {"r2": round(r2, 4), "mae_z": round(mae, 4)}},
        "lineage": {"matrix_fingerprint": matrix_fingerprint(Z, M, pids, seasons, FEATURES, FAMILIES), "args": args},
    }
    (d / "mtnn_report.json").write_text(json.dumps(report), encoding="utf-8")
    return d


def evaluate(run: Path, *extra: str, out_name: str = "v2.json") -> dict:
    out = run.parent / f"{run.name}-{out_name}"
    argv = [
        "--run",
        str(run),
        "--matrix",
        str(run / "train_matrix.npz"),
        "--manifest",
        str(run / "feature_manifest.json"),
    ]
    argv += ["--skill-labels", str(run / "absent.npz"), "--out", str(out), *extra]
    assert eval_v2.main(argv) == 0
    return json.loads(out.read_text(encoding="utf-8"))


def test_without_a_checkpoint_everything_but_the_regime_slice_comes_from_the_npz(run, tmp_path):
    bare = tmp_path / "bare"
    bare.mkdir()
    for f in ("mtnn_report.json", "embedding_v3.npz", "train_matrix.npz", "feature_manifest.json"):
        (bare / f).write_bytes((run / f).read_bytes())
    doc = evaluate(bare)
    v2 = doc["composite_v2"]
    assert v2["components_missing"] == ["regime"] and v2["cqs_v2"] is None
    assert "no checkpoint" in v2["missing_reasons"]["regime"]
    assert doc["checks"]["matrix"] == "fingerprint matches the report's lineage"
    assert doc["checks"]["report_v1_from_these_heads"]["all_agree"] is True
    # The same numbers composite_v2 gives on the arrays directly.
    emb, mat = np.load(bare / "embedding_v3.npz"), np.load(bare / "train_matrix.npz")
    direct = cv.composite_v2(
        {
            "E": emb["E"],
            "Z": mat["Z"],
            "M": mat["mask"],
            "features": FEATURES,
            "families": FAMILIES,
            "game_features": GAME,
            "player_id": mat["player_id"],
            "season": mat["season"],
            "cluster": emb["cluster"],
            "position": emb["position"],
            "archetype_logits": emb["archetype_logits"],
            "position_logits": emb["position_logits"],
            "next_profile_pred": emb["next_profile_pred"],
        }
    )
    assert v2["components"] == direct["components"] and v2["baselines"] == direct["baselines"]


def test_the_runs_own_checkpoint_reproduces_the_embedding_and_scores_the_regime_slice(run):
    doc = evaluate(run)
    v2 = doc["composite_v2"]
    assert doc["checks"]["checkpoint_reproduces_embedding"]["max_abs_diff"] <= eval_v2.REPRODUCE_ATOL
    assert v2["components_missing"] == [] and v2["cqs_v2"] is not None
    assert v2["components"]["regime"] is not None


def test_a_checkpoint_from_another_run_leaves_the_regime_slice_missing(tm, run, tmp_path):
    import torch

    other = tmp_path / "other.pt"
    seasons = np.load(run / "train_matrix.npz")["season"]
    model, _fams, args = build_model(tm, len(set(seasons.tolist())), seed=1)
    torch.save({"model": model.state_dict(), "args": args}, other)
    doc = evaluate(run, "--checkpoint", str(other), out_name="other.json")
    v2 = doc["composite_v2"]
    assert v2["components_missing"] == ["regime"]
    assert "does not reproduce" in v2["missing_reasons"]["regime"]


def test_a_checkpoint_without_its_architecture_args_is_not_rebuilt(tm, run, tmp_path):
    import torch

    ck = torch.load(run / "mtnn_best.pt", weights_only=False)
    del ck["args"]["d_head_hidden"]
    partial = tmp_path / "partial.pt"
    torch.save(ck, partial)
    doc = evaluate(run, "--checkpoint", str(partial), out_name="partial.json")
    assert "lack ['d_head_hidden']" in doc["composite_v2"]["missing_reasons"]["regime"]


def test_encode_from_checkpoint_scores_like_the_npz_and_checks_the_report(tm, run, monkeypatch):
    mat = np.load(run / "train_matrix.npz")
    position = np.load(run / "embedding_v3.npz")["position"]
    vectors = run.parent / "vectors.json"
    players = [{"name": str(n), "season": str(s), "p": int(p)} for n, s, p in zip(mat["name"], mat["season"], position)]
    vectors.write_text(json.dumps({"players": players}), encoding="utf-8")
    monkeypatch.setattr(tm, "VECTORS", vectors)
    from_npz = evaluate(run)
    from_ckpt = evaluate(run, "--encode-from-checkpoint", out_name="ckpt.json")
    assert from_ckpt["checks"]["report_v1_from_these_heads"]["all_agree"] is True
    a, b = from_npz["composite_v2"], from_ckpt["composite_v2"]
    assert a["components"] == b["components"]


def test_stdout_carries_only_the_json(run, capsys):
    argv = [
        "--run",
        str(run),
        "--matrix",
        str(run / "train_matrix.npz"),
        "--manifest",
        str(run / "feature_manifest.json"),
    ]
    argv += ["--skill-labels", str(run / "absent.npz")]
    assert eval_v2.main(argv) == 0
    json.loads(capsys.readouterr().out)


def test_files_that_do_not_belong_together_are_refused(run, tmp_path):
    other = tmp_path / "train_matrix.npz"
    mat = dict(np.load(run / "train_matrix.npz"))
    mat["Z"] = mat["Z"] + 1.0
    np.savez(other, **mat)
    argv = ["--run", str(run), "--matrix", str(other), "--manifest", str(run / "feature_manifest.json")]
    with pytest.raises(SystemExit, match="not the matrix this run trained on"):
        eval_v2.main([*argv, "--out", str(tmp_path / "x.json")])

    emb = dict(np.load(run / "embedding_v3.npz"))
    emb["player_id"] = emb["player_id"][::-1].copy()
    shuffled = tmp_path / "embedding_v3.npz"
    np.savez(shuffled, **emb)
    argv = ["--run", str(run), "--embedding", str(shuffled), "--matrix", str(run / "train_matrix.npz")]
    argv += ["--manifest", str(run / "feature_manifest.json"), "--out", str(tmp_path / "y.json")]
    with pytest.raises(SystemExit, match="not the matrix's rows"):
        eval_v2.main(argv)


def test_replayed_masks_zero_values_and_mask_like_train_mtnn():
    manifest = {"features": FEATURES, "families": FAMILIES, "game_features": GAME}
    Z = np.ones((3, len(FEATURES)), np.float32)
    M = np.ones_like(Z)
    a = {"mask_families": "tracking", "mask_features": "PTS", "drop_features": ""}
    Zr, Mr, applied = eval_v2.replay_input_transforms(Z, M, ["2020-21"] * 3, manifest, a)
    for j in (FEATURES.index("TOUCHES"), FEATURES.index("PTS")):
        assert (Zr[:, j] == 0).all() and (Mr[:, j] == 0).all()
    assert Zr.sum() == Z.sum() - 6 and applied == ["mask_families tracking", "mask_features PTS"]
    assert Z.sum() == Z.size  # the input is not modified
