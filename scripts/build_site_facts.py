#!/usr/bin/env python3
"""Build assets/site_facts.json — the site's canonical numbers, computed
from the served data files (never hand-typed). Pages fill their stat
blocks from this sheet via assets/site-facts.js ([data-fact] spans, with
the correct value as static fallback text).

Run:  python3 scripts/build_site_facts.py
Gate: python3 scripts/check_site_facts.py  (fails if the sheet is stale)

Stdlib only. Every fact names its source file so a reader can recompute.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def A(p):
    return str(ROOT / "assets" / p)


def load(name):
    with open(A(name), encoding="utf-8") as f:
        return json.load(f)


def compute_facts():
    lite = load("vectors_search_lite.json")["players"]
    meta = load("mtnn_meta.json")
    arch = load("mtnn_arch.json")
    drift = load("drift.json")
    trails = load("trails_index.json")
    insights = load("insights.json")
    ghost = load("ghost_db.json")
    timesfm = load("timesfm_forecasts.json")
    priors = load("arc_priors_2026-27.json")["priors"]
    backtest = load("backtest_summary.json")
    vectors = load("vectors.json")

    seasons = sorted({r["s"] for r in lite})
    pairs = sorted(drift["pairs"], key=lambda p: p["rotationDeg"], reverse=True)
    facts = {
        "player_seasons": len(lite),
        "players": len({r["pid"] for r in lite}),
        "players_note": "distinct player IDs (pid) in vectors_search_lite.json",
        "player_names": len({r["n"] for r in lite}),
        "player_names_note": "distinct display names; a few names belong to two players",
        "seasons": len(seasons),
        "season_first": seasons[0],
        "season_last": seasons[-1],
        "model_name": meta["model"],
        "model_dim": meta["dim"],
        "model_inputs": arch["dIn"],
        "archetypes": arch["nArchetypes"],
        "model_built": meta["built"],
        "recall_at_10": meta["test_recall_at_10"],
        "purity_at_20": round(meta["purity_at_20"], 4),
        "archetype_top1": round(meta["archetype_top1_acc"], 4),
        "onnx_bytes": Path(A("mtnn.onnx")).stat().st_size,
        "embeddings_bytes": Path(A("mtnn_embeddings.f32")).stat().st_size,
        "eligibility": vectors["eligibility"]["method"],
        "drift_pairs": len(drift["pairs"]),
        "drift_biggest": {
            "from": pairs[0]["from"],
            "to": pairs[0]["to"],
            "rotation_deg": pairs[0]["rotationDeg"],
            "shared_players": pairs[0]["sharedPlayers"],
        },
        "drift_top5": [
            {"from": p["from"], "to": p["to"], "rotation_deg": p["rotationDeg"]}
            for p in pairs[:5]
        ],
        "trails_players": len(trails),
        "insights_cards": len(insights["insights"]),
        "ghost_games": len(ghost["g"]),
        "forecasts": timesfm["N"],
        "arc_priors_players": len(priors),
        "props_evals": backtest["overall"]["n_eval"],
        "props_proj_mae": backtest["overall"]["proj_mae"],
        "props_line_mae": backtest["overall"]["line_mae"],
        "props_gate_passed": backtest["overall"]["gate"],
    }
    return {"generated_by": "scripts/build_site_facts.py", "facts": facts}


def main():
    out = compute_facts()
    with open(A("site_facts.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, sort_keys=False)
        f.write("\n")
    print("wrote assets/site_facts.json —", len(out["facts"]), "facts")


if __name__ == "__main__":
    main()
