"""Model: which served forecasts are scored on games played after the forecast, and what the files record.

served_products_scored_2026_27: of the served forecast products (wave 1's B-MODEL inventory), how many carry any
score on a 2026-27 game or player-season: next_profile_eval rows with to == 2026-27 and status "scored",
paper_trades season.n, and any "actual" field in arc_priors_2026-27 or timesfm_forecasts. Repo only.

next_profile_vs_carry_forward: the next-season profile head on players.html against last-season carry-forward on
the held-out target seasons (start year >= 2024), primary macro MAE in era-z (B-MODEL probe_next_profile.py).

Recorded scores are read from the files as they stand (eval_scoreboard test top1, arc forecaster_metrics), and the
served lineage's cqs / forced flags from assets/mtnn_lineage.json. CQS for origin is null until F1 sets it.
"""

from __future__ import annotations

from . import common as c

PRODUCTS = {
    "next_profile_head": "assets/next_profile_eval.json",
    "paper_trades": "assets/paper_trades.json",
    "arc_priors_2026_27": "assets/arc_priors_2026-27.json",
    "timesfm_forecasts": "assets/timesfm_forecasts.json",
}
SEASON = "2026-27"


def _has_actual(obj) -> bool:
    if isinstance(obj, dict):
        return any(k == "actual" or _has_actual(v) for k, v in obj.items())
    if isinstance(obj, list):
        return any(_has_actual(v) for v in obj)
    return False


def _scored(name: str, doc) -> int:
    if name == "next_profile_head":
        return sum(1 for r in doc["rows"].values() if r.get("to") == SEASON and r.get("status") == "scored")
    if name == "paper_trades":
        return int((doc.get("season") or {}).get("n") or 0)
    return 1 if _has_actual(doc) else 0


def _split(season: str) -> str:
    y = int(season.split("-")[0])
    return "train" if y <= 2021 else ("val" if y <= 2023 else "test")


def next_profile_scores(doc: dict) -> dict:
    feats = doc["features"]
    prim = set(doc.get("primaryFeatures") or feats)
    prim_idx = [i for i, k in enumerate(feats) if k in prim]
    rows = doc["rows"]
    actual_at = {}
    for key, r in rows.items():
        if r.get("status") == "scored" and r.get("actual"):
            actual_at[(key.rsplit("|", 1)[0], r["to"])] = r["actual"]
    acc = {s: {"n": 0, "m": [0.0] * len(feats), "c": [0.0] * len(feats), "k": [0] * len(feats)} for s in ("train", "val", "test")}
    for key, r in rows.items():
        if r.get("status") != "scored" or not r.get("pred") or not r.get("actual"):
            continue
        name, season = key.rsplit("|", 1)
        cur = actual_at.get((name, season))
        if not cur:
            continue
        a = acc[_split(r["to"])]
        a["n"] += 1
        for i in range(len(feats)):
            p, t, q = r["pred"][i], r["actual"][i], cur[i]
            if p is None or t is None or q is None:
                continue
            a["m"][i] += abs(p - t)
            a["c"][i] += abs(q - t)
            a["k"][i] += 1
    out = {}
    for s, a in acc.items():
        idx = [i for i in prim_idx if a["k"][i]]
        if not idx:
            out[s] = {"rows": a["n"], "model": None, "carry_forward": None}
            continue
        # Per-feature MAE rounded to 4 dp before the macro mean, as B-MODEL probe_next_profile.py does.
        out[s] = {
            "rows": a["n"],
            "model": round(sum(round(a["m"][i] / a["k"][i], 4) for i in idx) / len(idx), 4),
            "carry_forward": round(sum(round(a["c"][i] / a["k"][i], 4) for i in idx) / len(idx), 4),
        }
    return out


def measure(ctx: c.Ctx) -> dict:
    cmd = ctx.cmd
    root = ctx.root
    out: dict = {}
    per, inputs, absent = {}, [], []
    for name, rel in PRODUCTS.items():
        inp = c.file_input(root, rel)
        if inp.get("missing"):
            absent.append(rel)
            continue
        inputs.append(inp)
        per[name] = _scored(name, c.load_json(root / rel))
    if not per:
        out["served_products_scored_2026_27"] = c.null(
            "products", "no served forecast file in this checkout", command=cmd("model.served_products_scored_2026_27")
        )
    else:
        out["served_products_scored_2026_27"] = c.metric(
            sum(1 for v in per.values() if v > 0), f"products of {len(per)} present",
            command=cmd("model.served_products_scored_2026_27"), inputs=inputs, fetched_at=None,
            detail={"scored_rows_per_product": per, "absent": absent},
        )  # fmt: skip

    npi = c.file_input(root, "assets/next_profile_eval.json")
    if npi.get("missing"):
        out["next_profile_vs_carry_forward"] = c.null(
            "era-z MAE difference", "assets/next_profile_eval.json is not in this checkout", command=cmd("model.next_profile_vs_carry_forward")
        )
    else:
        sc = next_profile_scores(c.load_json(root / "assets/next_profile_eval.json"))
        t = sc["test"]
        if t["model"] is None:
            out["next_profile_vs_carry_forward"] = c.null(
                "era-z MAE difference", "no held-out row with a prior season", command=cmd("model.next_profile_vs_carry_forward"), detail=sc
            )
        else:
            out["next_profile_vs_carry_forward"] = c.metric(
                round(t["model"] - t["carry_forward"], 4), "era-z MAE, model minus carry-forward (test; > 0 means it loses)",
                command=cmd("model.next_profile_vs_carry_forward"), inputs=[npi], fetched_at=None, detail=sc,
            )  # fmt: skip

    ev = c.file_input(root, "assets/eval_scoreboard.json")
    if ev.get("missing"):
        out["retrieval_test_top1"] = c.null("top1", "assets/eval_scoreboard.json is not in this checkout", command=cmd("model.retrieval_test_top1"))
    else:
        d = c.load_json(root / "assets/eval_scoreboard.json")["results"]
        out["retrieval_test_top1"] = c.metric(
            d["mtnn"]["by_split"]["test"]["top1"], "top1 (recorded, adjacent-season retrieval, test split)",
            command=cmd("model.retrieval_test_top1"), inputs=[ev], fetched_at=None,
            detail={"n": d["mtnn"]["by_split"]["test"]["n"],
                    "baseline_transparent_14d": d["baseline_transparent_14d"]["by_split"]["test"]["top1"]},
        )  # fmt: skip

    ap = c.file_input(root, "assets/arc_priors_2026-27.json")
    if ap.get("missing"):
        out["arc_ridge_test_macro_mae"] = c.null("era-z MAE", "assets/arc_priors_2026-27.json is not in this checkout", command=cmd("model.arc_ridge_test_macro_mae"))
    else:
        fm = c.load_json(root / "assets/arc_priors_2026-27.json").get("forecaster_metrics") or {}
        val = (fm.get("challenger") or {}).get("macro_mae")
        if val is None:
            out["arc_ridge_test_macro_mae"] = c.null("era-z MAE", "forecaster_metrics.challenger.macro_mae absent", command=cmd("model.arc_ridge_test_macro_mae"))
        else:
            out["arc_ridge_test_macro_mae"] = c.metric(
                round(val, 4), "era-z MAE (recorded, held-out test)", command=cmd("model.arc_ridge_test_macro_mae"),
                inputs=[ap], fetched_at=None,
                detail={"naive_last": round((fm.get("naive_last") or {}).get("macro_mae") or float("nan"), 4)},
            )  # fmt: skip

    li = c.file_input(root, "assets/mtnn_lineage.json")
    if li.get("missing"):
        for n in ("served_lineage_cqs", "served_lineage_forced"):
            out[n] = c.null("flag", "assets/mtnn_lineage.json is not in this checkout", command=cmd(f"model.{n}"))
    else:
        lin = c.load_json(root / "assets/mtnn_lineage.json")
        cqs = (lin.get("metrics") or {}).get("cqs")
        nulls = sorted(k for k in ("embedding_npz_sha256", "checkpoint_sha256", "centroids_sha256", "report_sha256", "manifest_sha256") if lin.get(k) is None)
        if cqs is None:
            out["served_lineage_cqs"] = c.null(
                "CQS", "assets/mtnn_lineage.json metrics.cqs is null (forced promotion); origin's CQS baseline is F1's job",
                command=cmd("model.served_lineage_cqs"), inputs=[li], detail={"null_provenance_sha256s": nulls},
            )  # fmt: skip
        else:
            out["served_lineage_cqs"] = c.metric(cqs, "CQS", command=cmd("model.served_lineage_cqs"), inputs=[li], fetched_at=None)
        out["served_lineage_forced"] = c.metric(
            bool(lin.get("forced")), "flag", command=cmd("model.served_lineage_forced"), inputs=[li], fetched_at=None,
            detail={"run_id": lin.get("run_id"), "export_floors": lin.get("export_floors"), "null_provenance_sha256s": nulls},
        )  # fmt: skip
    return out
