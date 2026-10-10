"""Recompute CQS v2 (composite_v2.py) for a run that already happened, without retraining.

    python pipeline/eval_v2.py --run pipeline/data/promoted/<run_id>
    python pipeline/eval_v2.py --report R.json --embedding E.npz [--checkpoint C.pt] [--out v2.json]
    python pipeline/eval_v2.py --report R.json --checkpoint C.pt --encode-from-checkpoint

Inputs: a run's mtnn_report.json, its embedding_v3.npz, and the training
matrix (pipeline/data/train_matrix.npz + feature_manifest.json by default),
plus pipeline/data/skill_labels.npz for the skills diagnostic. It writes
nothing but --out (stdout without it): never pipeline/data, never assets.

What needs a model. The embedding npz carries the archetype, position,
next-season and skill head outputs beside E, so every component but the
regime slice comes from the npz alone; the next-season head does not need
the checkpoint. The regime slice re-encodes held-out anchors with the
<=2012-unobserved columns zeroed, so it needs the weights: --checkpoint (a
--run directory's own mtnn_best.pt is used when it has one). The model is
rebuilt through train_mtnn.mtnn_arch_kwargs from the checkpoint's saved
args and loaded strictly. Before its numbers are used, it must reproduce
the npz's E (max |difference| <= 1e-4); a checkpoint from another run
leaves the regime slice missing with that reason, rather than mixing two
models' numbers. Pass --checkpoint explicitly otherwise:
pipeline/data/mtnn_best.pt is the last run's best checkpoint, not
necessarily the run whose embedding sits next to it.

--encode-from-checkpoint takes E and the head outputs from the checkpoint
instead of an npz, so a report whose embedding was overwritten can still be
scored. The checkpoint's input transforms are replayed first, as
train_mtnn.main applies them (--era-align procrustes, --robust-scaling,
--mask-families, --mask-features, --drop-features, --exclude-families).
The replay is a copy of main's code, so it is checked: archetype_top1_acc,
position_top1_acc and next_profile.test from the rebuilt heads are compared
with the report's own, and "checks" says whether they agree.

Which run args say what the model read: with --encode-from-checkpoint, the
checkpoint's own. Otherwise the report's lineage.args (reports since the
lineage block), else the checkpoint's when it reproduces the embedding,
else none, and "checks" says the transforms were assumed off. composite_v2
gets both the matrix as built and the matrix as the model read it.

Torch is imported only on the checkpoint paths.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import sys
from pathlib import Path
from typing import Any

import composite_v2
import numpy as np
from artifact_io import BUNDLE_FILES, fingerprint_differences, load_matrix_fingerprint, sha256_file

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"

# A checkpoint must reproduce the embedding it is said to have produced. A
# CPU re-encode of a model trained on another device can differ in the last
# float32 bits; 1e-4 on unit vectors leaves room for that and none for
# another run (the 08-14 mtnn_best.pt against the 08-07 embedding_v3.npz:
# max |dE| 0.78).
REPRODUCE_ATOL = 1e-4
# Report values are rounded to 4 places (next_profile), or are all-row
# accuracies where one flipped argmax out of 12,966 rows moves 7.7e-5.
REPORT_ATOL = 2e-4


def _split_list(value) -> set[str]:
    return {s.strip() for s in str(value or "").split(",") if s.strip()}


def load_matrix(matrix: Path, manifest_path: Path) -> dict:
    npz = np.load(matrix, allow_pickle=False)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    return {
        "Z": npz["Z"].astype(np.float32),
        "M": npz["mask"].astype(np.float32),
        "player_id": npz["player_id"],
        "season": npz["season"],
        "name": npz["name"],
        "cluster": npz["cluster"].astype(np.int64),
        "manifest": manifest,
    }


def replay_input_transforms(Z, M, season, manifest, a: dict) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Z and M as train_mtnn.main hands them to the model, for run args `a`. A copy of main's code."""
    applied = []
    seasons = [str(s) for s in season]
    if a.get("era_align") == "procrustes":
        from vector_core import align_batch, load_alignment

        chains = load_alignment(ROOT / "assets" / "drift.json")["chains"]
        Z = align_batch(Z, seasons, chains)
        applied.append("era_align procrustes (assets/drift.json as it is now)")
    if a.get("robust_scaling"):
        from vector_core import RealMLPPreprocessor

        preproc = RealMLPPreprocessor(manifest["features"])
        preproc.fit(Z, seasons, M, by_season=True)
        Z = preproc.transform(Z, seasons)
        applied.append("robust_scaling")
    Z, M = np.array(Z, dtype=np.float32), np.array(M, dtype=np.float32)
    drop = _split_list(a.get("drop_features"))
    by_fam: dict[str, list[int]] = {}
    for j, f in enumerate(manifest["features"]):
        if f not in drop:
            by_fam.setdefault(manifest["families"][f], []).append(j)
    for fam in sorted(_split_list(a.get("mask_families"))):
        for c in by_fam.get(fam) or []:
            Z[:, c] = 0.0
            M[:, c] = 0.0
        applied.append(f"mask_families {fam}")
    for f in sorted(_split_list(a.get("mask_features"))):
        j = manifest["features"].index(f)
        Z[:, j] = 0.0
        M[:, j] = 0.0
        applied.append(f"mask_features {f}")
    return Z, M, applied


def join_core_skills(skill_path: Path, names, seasons):
    """skill_labels.npz joined by (name, season), as train_mtnn._join_skill_npz does: (grades, mask, keys)."""
    npz = np.load(skill_path, allow_pickle=False)
    keys = [str(k) for k in npz["keys"]]
    lookup = {(str(n), str(s)): g for n, s, g in zip(npz["name"], npz["season"], npz["grades"], strict=False)}
    G = np.zeros((len(names), len(keys)), dtype=np.float32)
    Mk = np.zeros_like(G)
    for i, (n, s) in enumerate(zip(names, seasons, strict=False)):
        g = lookup.get((str(n), str(s)))
        if g is not None:
            G[i] = g
            Mk[i] = 1.0
    return G, Mk, keys


class Model:
    """A checkpoint rebuilt through train_mtnn's own construction path, CPU, eval mode."""

    def __init__(self, ckpt_path: Path, manifest: dict, season):
        import torch
        import train_mtnn as T
        from _torch_safe import safe_torch_load

        self.T, self.torch = T, torch
        self.problem: str | None = None
        ckpt = safe_torch_load(ckpt_path, map_location="cpu")
        a = dict(ckpt.get("args") or {})
        self.args = a
        absent = [k for k in T.ARCH_ARGS if k not in a]
        if absent:
            self.problem = f"the checkpoint's saved args lack {absent}, so its network cannot be rebuilt"
            return
        drop, exclude = _split_list(a.get("drop_features")), _split_list(a.get("exclude_families"))
        fams = {k: v for k, v in T.family_slices(manifest, drop).items() if k not in exclude and k != "injury"}
        state = ckpt["model"]
        n_skills = len({k.split(".")[2] for k in state if k.startswith("skill_towers.towers.")})
        form_cols = T.feature_cols(manifest, T.FORM_FEATURES)
        injury_cols = T.feature_cols(manifest, T.INJURY_FEATURES)
        bbref_cols = T.feature_cols(manifest, T.BBREF_FEATURES)
        model = T.MTNN(
            {f: len(c) for f, c in fams.items()},
            int(T.season_index(season).max()) + 1,
            n_game=len(T.game_feature_cols(manifest)),
            n_skills=n_skills,
            n_form=len(form_cols) if form_cols else 0,
            n_injury=len(injury_cols) if injury_cols and "injury" not in exclude else 0,
            n_bbref=len(bbref_cols) if bbref_cols else 0,
            **T.mtnn_arch_kwargs(a),
        )
        try:
            model.load_state_dict(state, strict=True)
        except RuntimeError as exc:
            self.problem = f"the checkpoint's weights do not fit the network its args describe: {str(exc)[:300]}"
            return
        model.eval()
        self.model, self.fams = model, fams
        self.seas_t = torch.tensor(T.season_index(season))

    def heads(self, Z, M, chunk: int = 2048) -> dict[str, np.ndarray]:
        """E and the head outputs composite_v2 reads, for every row."""
        T, torch = self.T, self.torch
        parts: dict[str, list] = {k: [] for k in ("E", "archetype", "position", "next_profile", "skills")}
        with torch.no_grad():
            for lo in range(0, len(Z), chunk):
                xs, ms = T.split_by_family(Z[lo : lo + chunk], M[lo : lo + chunk], self.fams, "cpu")
                emb, out = self.model(xs, ms, self.seas_t[lo : lo + chunk])
                parts["E"].append(emb.numpy())
                for k in ("archetype", "position", "next_profile", "skills"):
                    if k in out:
                        parts[k].append(out[k].numpy())
        return {k: np.concatenate(v).astype(np.float32) for k, v in parts.items() if v}

    def masked(self, Z, M, rows, cols) -> np.ndarray:
        return self.T.encode_masked_rows(self.model, Z, M, rows, cols, self.fams, self.seas_t, "cpu")


def report_checks(report: dict, src: dict, season) -> dict:
    """Whether the report's own v1 numbers come from these head outputs (a torn bundle says no)."""
    out: dict[str, Any] = {}
    clusters, positions = src["cluster"], src.get("position")

    def compare(name, got, want):
        if want is None or got is None:
            out[name] = {"recomputed": got, "report": want, "agree": None}
        else:
            out[name] = {"recomputed": round(got, 4), "report": want, "agree": abs(got - float(want)) <= REPORT_ATOL}

    arch = src.get("archetype_logits")
    compare(
        "archetype_top1_acc",
        float((arch.argmax(1) == clusters).mean()) if arch is not None else None,
        report.get("archetype_top1_acc"),
    )
    pos = src.get("position_logits")
    if pos is not None and positions is not None and (positions >= 0).any():
        ok = positions >= 0
        compare(
            "position_top1_acc", float((pos[ok].argmax(1) == positions[ok]).mean()), report.get("position_top1_acc")
        )
    nxt = src.get("next_profile_pred")
    test = ((report.get("next_profile") or {}).get("test")) or {}
    if nxt is not None:
        pairs = composite_v2.split_pairs(src["player_id"], season)["test"]
        Zg = src["Z_model"][:, composite_v2.feature_index(src["features"], src["game_features"])].astype(np.float64)
        r2, mae = composite_v2._r2_mae(Zg[pairs[:, 1]], nxt[pairs[:, 0]].astype(np.float64))
        compare("next_profile.test.r2", r2, test.get("r2"))
        compare("next_profile.test.mae_z", mae, test.get("mae_z"))
    agree = [v["agree"] for v in out.values() if v["agree"] is not None]
    out["all_agree"] = all(agree) if agree else None
    return out


def _flatten(d, prefix="") -> dict[str, Any]:
    flat: dict[str, Any] = {}
    if isinstance(d, dict):
        for k, v in d.items():
            flat.update(_flatten(v, f"{prefix}.{k}" if prefix else str(k)))
    elif isinstance(d, list):
        flat[prefix] = json.dumps(d)
    else:
        flat[prefix] = d
    return flat


# The leaves that depend on the regime slice, skipped when it could not be recomputed here.
REGIME_LEAVES = ("measures.regime", "baselines.regime", "missing_reasons.regime", "components.regime")
REGIME_LEAVES += ("components_val.regime", "cqs_v2", "cqs_v2_val", "components_missing")


def compare_with_report_block(recomputed: dict, in_report: dict | None) -> dict | None:
    """Every leaf of the report's composite_v2 against the recomputed one, regime aside when it is missing here."""
    if not in_report:
        return None
    regime_missing = "regime" in recomputed.get("components_missing", [])
    a, b = _flatten(in_report), _flatten(recomputed)
    keys = sorted(set(a) | set(b))
    if regime_missing:
        keys = [k for k in keys if not k.startswith(REGIME_LEAVES)]
    differ = [{"key": k, "report": a.get(k), "recomputed": b.get(k)} for k in keys if a.get(k) != b.get(k)]
    return {
        "leaves_compared": len(keys),
        "regime_skipped": regime_missing,
        "differ": differ[:50],
        "identical": not differ,
    }


def evaluate(args: argparse.Namespace) -> dict:
    """The eval_v2 document for resolved arguments (see main)."""
    report = json.loads(args.report.read_text(encoding="utf-8"))
    mat = load_matrix(args.matrix, args.manifest)
    manifest = mat["manifest"]
    checks: dict[str, Any] = {}

    lineage = report.get("lineage") or {}
    want_fp = lineage.get("matrix_fingerprint")
    if want_fp:
        diffs = fingerprint_differences(want_fp, load_matrix_fingerprint(args.matrix, args.manifest))
        if diffs:
            raise SystemExit(
                f"eval_v2: {args.matrix} is not the matrix this run trained on ({'; '.join(diffs)}, "
                "the report's lineage first)"
            )
        checks["matrix"] = "fingerprint matches the report's lineage"
    else:
        checks["matrix"] = "not verified: the report has no lineage.matrix_fingerprint"

    model = Model(args.checkpoint, manifest, mat["season"]) if args.checkpoint is not None else None
    regime_reason = None
    if model is None:
        regime_reason = "no checkpoint given, so the masked anchors cannot be re-encoded"
    elif model.problem:
        regime_reason = model.problem
    lineage_args = dict(lineage.get("args") or {})

    def replay(a: dict):
        return replay_input_transforms(mat["Z"], mat["M"], mat["season"], manifest, a)

    def heads_src(h: dict) -> dict:
        return {
            "E": h["E"],
            "archetype_logits": h["archetype"],
            "position_logits": h["position"],
            "next_profile_pred": h["next_profile"],
            "skill_pred": h.get("skills"),
        }

    model_in = None  # (Z, M) as the checkpoint's own run fed its model
    if args.encode_from_checkpoint:
        if model.problem:
            raise SystemExit(f"eval_v2: {model.problem}")
        run_args = model.args
        checks["run_args"] = "the checkpoint's saved args"
        Z, M, applied = replay(run_args)
        model_in = (Z, M)
        # The checkpoint's run decided whether missing position labels stop it
        # (train_mtnn --allow-missing-positions); its re-encode follows that.
        src = heads_src(model.heads(Z, M)) | {
            "position": model.T.load_positions(
                mat["name"],
                mat["season"],
                mat["player_id"],
                allow_missing=bool(run_args.get("allow_missing_positions")),
            )
        }
        src["cluster"] = mat["cluster"]
        checks["source"] = f"re-encoded from {args.checkpoint}"
    else:
        emb = np.load(args.embedding, allow_pickle=False)
        same_rows = len(emb["E"]) == len(mat["Z"]) and bool(
            (np.asarray(emb["player_id"]) == np.asarray(mat["player_id"])).all()
            and (np.asarray(emb["season"]).astype(str) == np.asarray(mat["season"]).astype(str)).all()
        )
        if not same_rows:
            raise SystemExit(f"eval_v2: {args.embedding} rows are not the matrix's rows by (player_id, season)")
        src = {
            "E": emb["E"].astype(np.float32),
            "archetype_logits": emb["archetype_logits"] if "archetype_logits" in emb else None,
            "position_logits": emb["position_logits"] if "position_logits" in emb else None,
            "next_profile_pred": emb["next_profile_pred"] if "next_profile_pred" in emb else None,
            "skill_pred": emb["skill_pred"] if "skill_pred" in emb else None,
            "position": emb["position"].astype(np.int64) if "position" in emb else None,
            "cluster": mat["cluster"],
        }
        if "cluster" in emb and not np.array_equal(emb["cluster"], mat["cluster"]):
            checks["cluster"] = "the embedding's stored cluster ids differ from the matrix's; the embedding's are used"
            src["cluster"] = emb["cluster"].astype(np.int64)
        checks["source"] = f"{args.embedding}"
        run_args = lineage_args
        reproduced = False
        if regime_reason is None:
            # The checkpoint reads the matrix as its own run's args made it.
            Zc, Mc, _ = replay(model.args)
            diff = float(np.abs(model.heads(Zc, Mc)["E"] - src["E"]).max())
            checks["checkpoint_reproduces_embedding"] = {"max_abs_diff": round(diff, 6), "atol": REPRODUCE_ATOL}
            reproduced = diff <= REPRODUCE_ATOL
            if reproduced:
                model_in = (Zc, Mc)
            else:
                regime_reason = (
                    f"{args.checkpoint} does not reproduce {args.embedding} (max |dE| {diff:.4f}): "
                    "they are from different runs"
                )
        if lineage_args:
            checks["run_args"] = "the report's lineage.args"
        elif reproduced:
            run_args = model.args
            checks["run_args"] = "the checkpoint's saved args (it reproduces the embedding)"
        else:
            checks["run_args"] = "unknown: no lineage.args and no checkpoint of this run; input transforms assumed off"
        Z, M, applied = replay(run_args)
    checks["input_transforms_replayed"] = applied
    src |= {
        "Z": mat["Z"],
        "M": mat["M"],
        "Z_model": Z,
        "M_model": M,
        "features": manifest["features"],
        "families": manifest["families"],
        "game_features": manifest["game_features"],
        "player_id": mat["player_id"],
        "season": mat["season"],
    }
    checks["report_v1_from_these_heads"] = report_checks(report, src, mat["season"])

    regime = None
    if regime_reason is None and model_in is not None:
        pairs = composite_v2.split_pairs(mat["player_id"], mat["season"])
        rows = composite_v2.regime_anchor_rows(pairs)
        cols = composite_v2.regime_mask_columns(mat["M"], mat["season"])
        if len(rows) and cols:
            regime = {"rows": rows, "E": model.masked(*model_in, rows, cols)}

    skills = None
    if src.get("skill_pred") is not None and args.skill_labels.exists():
        G, Mk, keys = join_core_skills(args.skill_labels, mat["name"], mat["season"])
        pred = np.asarray(src["skill_pred"])
        if pred.shape[1] >= len(keys):
            skills = {"pred": pred, "target": G, "mask": Mk, "keys": keys, "n_core": len(keys)}

    block = composite_v2.composite_v2(
        {
            **{k: src[k] for k in src if k != "skill_pred"},
            "regime": regime,
            "skills": skills,
            "report": report,
            "run_args": run_args,
        }
    )
    if regime_reason and "regime" in block["missing_reasons"]:
        block["missing_reasons"]["regime"] = regime_reason

    comp = report.get("composite") or {}
    return {
        "eval_v2": {
            "report": str(args.report),
            "report_sha256": sha256_file(args.report),
            "embedding": None if args.encode_from_checkpoint else str(args.embedding),
            "checkpoint": str(args.checkpoint) if args.checkpoint else None,
            "matrix": str(args.matrix),
        },
        "checks": checks,
        "v1": {
            "cqs": comp.get("cqs"),
            "test_recall_at_10": comp.get("test_recall_at_10"),
            "purity_at_20": comp.get("purity_at_20"),
            "trained": report.get("trained"),
            "protocol": report.get("protocol"),
        },
        "composite_v2": block,
        "matches_report_composite_v2": compare_with_report_block(block, report.get("composite_v2")),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--run", type=Path, help="a run or promoted bundle directory (report, embedding, checkpoint)")
    ap.add_argument("--report", type=Path)
    ap.add_argument("--embedding", type=Path)
    ap.add_argument("--checkpoint", type=Path)
    ap.add_argument("--encode-from-checkpoint", action="store_true")
    ap.add_argument("--matrix", type=Path, default=DATA_DIR / "train_matrix.npz")
    ap.add_argument("--manifest", type=Path, default=DATA_DIR / "feature_manifest.json")
    ap.add_argument("--skill-labels", type=Path, default=DATA_DIR / "skill_labels.npz")
    ap.add_argument("--out", type=Path, help="write the JSON here instead of stdout")
    args = ap.parse_args(argv)

    if args.run is not None:
        args.report = args.report or args.run / BUNDLE_FILES["report"]
        args.embedding = args.embedding or args.run / BUNDLE_FILES["embedding"]
        if args.checkpoint is None and (args.run / BUNDLE_FILES["checkpoint"]).exists():
            args.checkpoint = args.run / BUNDLE_FILES["checkpoint"]
    if args.report is None:
        raise SystemExit("eval_v2: --report (or --run) is required")
    if args.encode_from_checkpoint and args.checkpoint is None:
        raise SystemExit("eval_v2: --encode-from-checkpoint needs --checkpoint")
    if not args.encode_from_checkpoint and args.embedding is None:
        raise SystemExit("eval_v2: --embedding (or --run, or --encode-from-checkpoint) is required")

    # train_mtnn and vector_core print progress; stdout carries only the JSON.
    with contextlib.redirect_stdout(sys.stderr):
        out = evaluate(args)
    text = json.dumps(out, indent=2)
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    block, v1 = out["composite_v2"], out["v1"]
    print(
        f"v1 CQS {v1['cqs']} | CQS v2 {block['cqs_v2']} (val {block['cqs_v2_val']}) | "
        f"missing: {', '.join(block['components_missing']) or 'none'}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
