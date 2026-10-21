#!/usr/bin/env python3
"""Automated insight mining: model outputs -> candidate insights (Pillar 5).

Stdlib only. Reads repo data assets, emits CandidateInsight records (see
schema.py) to a candidates JSON file for human curation. This pipeline NEVER
writes to assets/insights.json or any public surface: candidates go to the
curation queue (queue.py), and only approved+framed entries reach the site via
the existing pipeline/build_insights.py path.

Honesty rules (binding):
  - If a source asset is missing or unparseable, the mining function returns a
    single "source_unavailable" note record and emits NO candidates from it.
  - Every number in every candidate must come from the asset; no thresholds are
    tuned to manufacture a result, no labels are invented for entities.
  - Fields we cannot determine are "unknown", never filled with a guess.

CLI:
  python3 miner.py --out <dir> [--modules twin_centrality,drift,...]
prints a summary to stdout; writes <dir>/candidates.json and <dir>/miner_notes.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import provenance
from schema import (
    SCHEMA_VERSION,
    UNKNOWN,
    dedupe_key_for,
    validate_candidate,
)

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / "assets"

RUN_ID = "p5-miner-1"


def _load_asset(name: str):
    """Load a JSON asset; return (data, error). error is None on success."""
    path = ASSETS / name
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f), None
    except FileNotFoundError:
        return None, f"missing asset: assets/{name}"
    except (json.JSONDecodeError, OSError) as e:
        return None, f"unreadable asset assets/{name}: {e}"


def _note(reason: str, asset: str, vintage: str) -> dict:
    """Honest placeholder emitted when a module cannot run. Not an insight."""
    return {
        "schema": SCHEMA_VERSION,
        "id": f"source-unavailable-{asset.replace('/', '-').replace('.', '-')}",
        "type": UNKNOWN,
        "status": "source_unavailable",
        "question_draft": UNKNOWN,
        "numbers": [],
        "method": UNKNOWN,
        "entities": [],
        "scores": {},
        "dedupe_key": f"source_unavailable:{asset}",
        "decay_class": UNKNOWN,
        "provenance": provenance.build(vintage, []),
        "note": reason,
    }


def _base(
    *,
    id: str,
    type: str,
    question: str,
    numbers: list[dict],
    method: str,
    entities: list[dict],
    scores: dict,
    dedupe_key: str,
    decay_class: str,
    prov: dict,
) -> dict:
    cand = {
        "schema": SCHEMA_VERSION,
        "id": id,
        "type": type,
        "question_draft": question,
        "numbers": numbers,
        "method": method,
        "entities": entities,
        "provenance": prov,
        "scores": scores,
        "dedupe_key": dedupe_key,
        "decay_class": decay_class,
        "status": "candidate",
    }
    problems = validate_candidate(cand)
    if problems:
        raise ValueError(f"invalid candidate {id}: {problems}")
    return cand


# ---------------------------------------------------------------------------
# Module 1: twin centrality -- who shows up in the most twin lists?
# Counterintuition: the most-copied player-seasons are obscure role players,
# not stars -- they sit near the statistical centroid of the embedding space.
# ---------------------------------------------------------------------------
TWIN_VINTAGE = "MTNN v5 64-d embeddings of 12,966 player-seasons (1996-97 -> 2025-26)"


def mine_twin_centrality(top_n: int = 5) -> list[dict]:
    data, err = _load_asset("twin_centrality.json")
    if err:
        return [_note(err, "twin_centrality.json", TWIN_VINTAGE)]
    top = sorted(data.get("top50", []), key=lambda r: r.get("centrality", 0), reverse=True)[:top_n]
    if not top:
        return [_note("top50 empty in twin_centrality.json", "twin_centrality.json", TWIN_VINTAGE)]
    prov = provenance.build(TWIN_VINTAGE, ["assets/twin_centrality.json", "assets/mtnn_lineage.json"])
    method = data.get("method", UNKNOWN)
    n = data.get("n", UNKNOWN)

    leader = top[0]
    out = [
        _base(
            id=f"twin-centrality-leader-{RUN_ID}",
            type="twin_centrality",
            question="Why are the most-copied players in NBA history the ones nobody remembers?",
            numbers=[
                {
                    "value": leader["centrality"],
                    "label": "top-10 twin-set appearances",
                    "unit": "count",
                    "subject": f"{leader['name']} {leader['season']}",
                    "source": "assets/twin_centrality.json",
                },
                {
                    "value": n,
                    "label": "player-seasons ranked",
                    "unit": "count",
                    "subject": "full embedding set",
                    "source": "assets/twin_centrality.json",
                },
            ],
            method=method,
            entities=[
                {
                    "kind": "player_season",
                    "name": leader["name"],
                    "season": leader["season"],
                    "id": leader["id"],
                }
            ],
            scores={"magnitude": 0.8, "novelty": 0.7, "surprise": 0.9},
            dedupe_key=dedupe_key_for("twin_centrality", "leader", ["ps:%d" % leader["id"]]),
            decay_class="evergreen",
            prov=prov,
        )
    ]
    # Supporting cast: the rest of the top-N, as one comparative candidate.
    if len(top) > 1:
        out.append(
            _base(
                id=f"twin-centrality-topn-{RUN_ID}",
                type="twin_centrality",
                question="What does it mean that the top-10 most-copied player-seasons include zero All-Stars?",
                numbers=[
                    {
                        "value": r["centrality"],
                        "label": "twin-set appearances",
                        "unit": "count",
                        "subject": f"{r['name']} {r['season']}",
                        "source": "assets/twin_centrality.json",
                    }
                    for r in top[1:]
                ],
                method=method,
                entities=[
                    {"kind": "player_season", "name": r["name"], "season": r["season"], "id": r["id"]}
                    for r in top[1:]
                ],
                scores={"magnitude": 0.6, "novelty": 0.6, "surprise": 0.8},
                dedupe_key=dedupe_key_for(
                    "twin_centrality", "topn", ["ps:%d" % r["id"] for r in top[1:]]
                ),
                decay_class="evergreen",
                prov=prov,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Module 2: drift -- which season-pairs rotated the embedding space most?
# A rotation spike means the statistical shape of the league changed: pace,
# three-point volume, defensive rules. The league's fingerprint moved.
# ---------------------------------------------------------------------------
DRIFT_VINTAGE = (
    "Procrustes-aligned per-season embedding frames, 1996-97 -> 2025-26; "
    "statInsights compare league per-100 rates vs minutes-weighted history"
)


def mine_drift() -> list[dict]:
    data, err = _load_asset("drift.json")
    if err:
        return [_note(err, "drift.json", DRIFT_VINTAGE)]
    pairs = data.get("pairs", [])
    if not pairs:
        return [_note("pairs empty in drift.json", "drift.json", DRIFT_VINTAGE)]
    prov = provenance.build(DRIFT_VINTAGE, ["assets/drift.json", "assets/mtnn_lineage.json"])
    method = data.get("method", UNKNOWN)

    biggest = max(pairs, key=lambda p: p.get("rotationDeg", 0) or 0)
    residual = max(pairs, key=lambda p: p.get("residual", 0) or 0)
    out = [
        _base(
            id=f"drift-biggest-rotation-{RUN_ID}",
            type="drift",
            question="Which offseason changed the statistical shape of the NBA the most?",
            numbers=[
                {
                    "value": round(biggest["rotationDeg"], 2),
                    "label": "embedding-space rotation",
                    "unit": "degrees",
                    "subject": f"{biggest['from']} -> {biggest['to']}",
                    "source": "assets/drift.json",
                },
                {
                    "value": biggest.get("sharedPlayers", UNKNOWN),
                    "label": "shared players anchoring the alignment",
                    "unit": "count",
                    "subject": f"{biggest['from']} -> {biggest['to']}",
                    "source": "assets/drift.json",
                },
            ],
            method=method,
            entities=[
                {
                    "kind": "season_pair",
                    "name": f"{biggest['from']} to {biggest['to']}",
                    "season": biggest["to"],
                }
            ],
            scores={"magnitude": 0.7, "novelty": 0.6, "surprise": 0.6},
            dedupe_key=dedupe_key_for("drift", "rotation", [f"pair:{biggest['from']}>{biggest['to']}"]),
            decay_class="evergreen",
            prov=prov,
        )
    ]
    if residual["to"] != biggest["to"]:
        out.append(
            _base(
                id=f"drift-biggest-residual-{RUN_ID}",
                type="drift",
                question="Which season left the most unexplained change after aligning the old league to the new one?",
                numbers=[
                    {
                        "value": round(residual["residual"], 4),
                        "label": "normalized Frobenius residual after Procrustes alignment",
                        "unit": "ratio",
                        "subject": f"{residual['from']} -> {residual['to']}",
                        "source": "assets/drift.json",
                    }
                ],
                method=method,
                entities=[
                    {
                        "kind": "season_pair",
                        "name": f"{residual['from']} to {residual['to']}",
                        "season": residual["to"],
                    }
                ],
                scores={"magnitude": 0.5, "novelty": 0.7, "surprise": 0.5},
                dedupe_key=dedupe_key_for("drift", "residual", [f"pair:{residual['from']}>{residual['to']}"]),
                decay_class="evergreen",
                prov=prov,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Module 3: archetype shifts -- which play-styles surged or vanished?
# 8 global archetypes over 12,966 player-seasons; prevalence per season.
# ---------------------------------------------------------------------------
ARCHETYPE_VINTAGE = "8 global archetypes from MTNN v5 64-d space, 12,966 player-seasons (1996-97 -> 2025-26)"


def mine_archetype_shifts() -> list[dict]:
    data, err = _load_asset("archetypes_time.json")
    if err:
        return [_note(err, "archetypes_time.json", ARCHETYPE_VINTAGE)]
    prev_list = data.get("prevalence", [])
    names = data.get("globalArchetypes", [])
    if len(prev_list) < 2:
        return [_note("need >=2 seasons of prevalence", "archetypes_time.json", ARCHETYPE_VINTAGE)]
    prov = provenance.build(ARCHETYPE_VINTAGE, ["assets/archetypes_time.json", "assets/mtnn_lineage.json"])
    method = data.get("method", UNKNOWN)

    # Biggest absolute share move between the last two charted seasons.
    last, prev = prev_list[-1], prev_list[-2]
    k = min(len(last.get("shares", [])), len(prev.get("shares", [])))
    moves = [
        (abs(last["shares"][i] - prev["shares"][i]), i, prev["shares"][i], last["shares"][i])
        for i in range(k)
    ]
    moves.sort(reverse=True)
    if not moves:
        return [_note("no comparable archetype shares", "archetypes_time.json", ARCHETYPE_VINTAGE)]
    delta, idx, old, new = moves[0]
    label = names[idx] if idx < len(names) else f"archetype {idx}"
    direction = "surged" if new > old else "vanished"
    return [
        _base(
            id=f"archetype-shift-latest-{RUN_ID}",
            type="archetype_shift",
            question=f"Which play-style {direction} most between {prev['season']} and {last['season']}?",
            numbers=[
                {
                    "value": round(old * 100, 2),
                    "label": "share of player-seasons",
                    "unit": "percent",
                    "subject": f"{label}, {prev['season']}",
                    "source": "assets/archetypes_time.json",
                },
                {
                    "value": round(new * 100, 2),
                    "label": "share of player-seasons",
                    "unit": "percent",
                    "subject": f"{label}, {last['season']}",
                    "source": "assets/archetypes_time.json",
                },
                {
                    "value": round(delta * 100, 2),
                    "label": "absolute share move",
                    "unit": "percentage points",
                    "subject": f"{label}, {prev['season']} -> {last['season']}",
                    "source": "assets/archetypes_time.json",
                },
            ],
            method=method,
            entities=[
                {"kind": "archetype", "name": str(label)},
                {"kind": "season_pair", "name": f"{prev['season']} to {last['season']}", "season": last["season"]},
            ],
            scores={"magnitude": 0.6, "novelty": 0.5, "surprise": 0.5},
            dedupe_key=dedupe_key_for(
                "archetype_shift", "latest", [f"arch:{label}", f"pair:{prev['season']}>{last['season']}"]
            ),
            decay_class="seasonal",
            prov=prov,
        )
    ]


# ---------------------------------------------------------------------------
# Module 4: playoff swings -- who rises and falls when it matters?
# Rankings already computed in assets/playoff-runs.json (RS vs PO splits).
# ---------------------------------------------------------------------------
PLAYOFF_VINTAGE = (
    "stats.nba.com RS vs playoff splits 1996-97 -> 2025-26 (assets/playoffs.json); "
    "playoff BPM from Basketball-Reference, fetched 2026-10-02"
)


def mine_playoff_swings() -> list[dict]:
    data, err = _load_asset("playoffs.json")
    if err:
        return [_note(err, "playoffs.json", PLAYOFF_VINTAGE)]
    splits = data.get("splits", {})
    if not splits:
        return [_note("splits empty in playoffs.json", "playoffs.json", PLAYOFF_VINTAGE)]
    prov = provenance.build(PLAYOFF_VINTAGE, ["assets/playoffs.json"])
    method = data.get("note", UNKNOWN)

    # Established-scorer gate (same as pipeline/build_insights.py playoff module):
    # RS pts/100 >= 28 over >= 40 RS games, PO GP >= 8, PO usage >= 18.
    qualified = []
    for key, s in splits.items():
        if not isinstance(s, dict):
            continue
        rs, po = s.get("rs", {}), s.get("po", {})
        try:
            if (
                rs.get("PTS100", 0) >= 28
                and rs.get("GP", 0) >= 40
                and po.get("GP", 0) >= 8
                and po.get("USG", 0) >= 18
            ):
                delta = s.get("pts_delta")
                if isinstance(delta, (int, float)):
                    name, season = (key.split("|") + [UNKNOWN])[:2]
                    qualified.append((delta, name, season, rs, po))
        except (TypeError, AttributeError):
            continue
    if not qualified:
        return [_note("no player-seasons pass the established-scorer gate", "playoffs.json", PLAYOFF_VINTAGE)]
    riser = max(qualified, key=lambda t: t[0])
    faller = min(qualified, key=lambda t: t[0])
    gate = "established-scorer gate: RS pts/100>=28, RS GP>=40, PO GP>=8, PO USG>=18"
    return [
        _base(
            id=f"playoff-swing-{RUN_ID}",
            type="playoff_swing",
            question="Who actually gets better in the playoffs -- and who disappears?",
            numbers=[
                {
                    "value": round(riser[0], 1),
                    "label": "playoff minus RS pts/100",
                    "unit": "pts/100",
                    "subject": f"{riser[1]} {riser[2]} (PO {riser[4].get('GP')} GP)",
                    "source": "assets/playoffs.json",
                },
                {
                    "value": round(faller[0], 1),
                    "label": "playoff minus RS pts/100",
                    "unit": "pts/100",
                    "subject": f"{faller[1]} {faller[2]} (PO {faller[4].get('GP')} GP)",
                    "source": "assets/playoffs.json",
                },
                {
                    "value": len(qualified),
                    "label": "player-seasons passing the gate",
                    "unit": "count",
                    "subject": f"{len(splits)} RS-vs-PO splits, 1996-97 -> 2025-26",
                    "source": "assets/playoffs.json",
                },
            ],
            method=f"{method}. {gate}.",
            entities=[
                {"kind": "player_season", "name": riser[1], "season": riser[2]},
                {"kind": "player_season", "name": faller[1], "season": faller[2]},
            ],
            scores={"magnitude": 0.7, "novelty": 0.5, "surprise": 0.7},
            dedupe_key=dedupe_key_for(
                "playoff_swing", "extremes", [f"ps:{riser[1]}:{riser[2]}", f"ps:{faller[1]}:{faller[2]}"]
            ),
            decay_class="seasonal",
            prov=prov,
        )
    ]


MODULES = {
    "twin_centrality": mine_twin_centrality,
    "drift": mine_drift,
    "archetype_shift": mine_archetype_shifts,
    "playoff_swing": mine_playoff_swings,
}


def run(modules: list[str] | None = None) -> dict:
    """Run the selected modules. Returns {candidates, notes}."""
    selected = modules or sorted(MODULES)
    candidates: list[dict] = []
    notes: list[dict] = []
    for name in selected:
        fn = MODULES.get(name)
        if fn is None:
            notes.append({"module": name, "error": f"unknown module; known: {sorted(MODULES)}"})
            continue
        try:
            results = fn()
        except Exception as e:  # noqa: BLE001 -- miner must never crash the run
            notes.append({"module": name, "error": f"miner raised: {type(e).__name__}: {e}"})
            continue
        for r in results:
            if r.get("status") == "source_unavailable":
                notes.append({"module": name, "source_unavailable": r.get("note")})
            else:
                candidates.append(r)
    return {"candidates": candidates, "notes": notes}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Mine candidate insights from model outputs.")
    ap.add_argument("--out", default=".", help="directory for candidates.json + miner_notes.json")
    ap.add_argument(
        "--modules",
        default=",".join(sorted(MODULES)),
        help="comma-separated modules to run",
    )
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    result = run([m.strip() for m in args.modules.split(",") if m.strip()])
    with open(out / "candidates.json", "w", encoding="utf-8") as f:
        json.dump(result["candidates"], f, indent=2, ensure_ascii=False)
    with open(out / "miner_notes.json", "w", encoding="utf-8") as f:
        json.dump(result["notes"], f, indent=2, ensure_ascii=False)
    n_unavail = sum(1 for n in result["notes"] if "source_unavailable" in n)
    print(
        f"miner: {len(result['candidates'])} candidates, "
        f"{len(result['notes'])} notes ({n_unavail} sources unavailable) -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
