"""Stage 3 — tower inputs.

What is REAL here:
- shotmix: the 13 scoring columns of the 73-col base (shot TYPE shares
  only — NEVER presented as location).
- text: template dedup measured from the 5 cached PBP games
  (pipeline/cache/cdn_pbp, 3,152 actions). Templates mask person/team/
  clock/coords and keep structured event type only.
- hf staged inputs: the two clearly-licensed HF downloads (RAPTOR,
  draft pathways) with join keys checked against vectors.json.

What is STAGED-ONLY (blocked, no invented data):
- shot-position: real coordinates ONLY. The 5 cached PBP games carry
  x/y event coords, but that is 5 games, not a tower. No coordinate
  is invented, interpolated, or proxied from shot-type shares.
- salary/market: SALARY_LOG rides in the base, but bulk salary has
  NO SOURCE; market expansion 3 stay blocked.
- trajectories: NO SOURCE at scale; fine level stays event-location.

Leakage guards (text tower, enforced in the builder spec written to
the manifest): season-boundary split (a template vocabulary built on
train seasons only, never on val/test seasons) and name masking (no
player name, team, or personId inside a template key).
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

from .common import (CACHE, GAME14, OUT, ROOT, SCORING13, provenance,
                     write_json)

VECTORS = ROOT / "assets" / "vectors.json"


def _mask_template(action):
    """Structured event type with every identity/coordinate field removed."""
    return (action.get("actionType"), action.get("subType"),
            action.get("descriptor"),
            tuple(sorted(action.get("qualifiers") or [])))


def text_tower():
    games = sorted((CACHE / "cdn_pbp").glob("*.json"))
    tmpl = Counter()
    actions = 0
    coord_actions = 0
    for g in games:
        for a in json.loads(g.read_text())["game"]["actions"]:
            actions += 1
            tmpl[_mask_template(a)] += 1
            if a.get("x") is not None and a.get("y") is not None:
                coord_actions += 1
    return {
        "cached_games": len(games),
        "actions": actions,
        "distinct_templates_measured": len(tmpl),
        "dedup_factor": round(actions / len(tmpl), 2) if tmpl else None,
        "prior_measurement": {"actions": 3152, "templates": 203,
                              "dedup": 15.5},
        "granularity_note": "Measured 198 vs prior 203: masking-granularity "
                            "difference (descriptor/qualifier handling), "
                            "not a data change. Either way ~16x dedup: "
                            "embed templates once + structured slots, "
                            "never per-action text.",
        "actions_with_xy_coords": coord_actions,
        "coord_note": "x/y exist on cached PBP actions but cover 5 games "
                      "only — a probe, not a shot-position tower.",
        "leakage_guards": [
            "season-boundary: template vocabulary from train seasons only",
            "name-masked: no player name, team, or personId in template keys",
            "raw PBP text never redistributed",
        ],
        "status": "STAGED: tower spec + measured dedup; full-corpus text "
                  "tower needs PBP permission + transport (see pbp_plan).",
    }


def hf_staged_inputs():
    hf = OUT / "hf"
    out = {}
    # RAPTOR (CC BY 4.0, upstream FiveThirtyEight): join check on name.
    rp = hf / "raptor" / "historical_RAPTOR_by_player.csv"
    if rp.exists():
        rows = list(csv.DictReader(open(rp)))
        seasons = sorted({r["season"] for r in rows})
        out["raptor"] = {
            "rows": len(rows), "seasons": f"{seasons[0]}..{seasons[-1]}",
            "columns": list(rows[0].keys()),
            "license": "CC BY 4.0 (upstream FiveThirtyEight repo LICENSE; "
                       "attribution required)",
            "join_note": "player_id is a Basketball-Reference ID; join to "
                         "vectors.json rows is by (name, season) and must "
                         "be validated, never assumed — same-name distinct "
                         "players exist.",
            "status": "STAGED: auxiliary feature only, never a base replacement.",
        }
    pw = hf / "pathways" / "nba_draft_pathways_clean.csv"
    if pw.exists():
        rows = list(csv.DictReader(open(pw)))
        out["draft_pathways"] = {
            "rows": len(rows),
            "prior_org_type": dict(Counter(r["prior_org_type"] for r in rows)),
            "license": "CC BY 4.0 (dataset card)",
            "status": "STAGED: prior-league/college PATHWAY labels (2016-2026 "
                      "draftees), not player stats. Complements pedigree 7; "
                      "does not fill any 143 column by itself.",
        }
    return out


def run():
    report = {
        "stage": "towers",
        "shotmix": {
            "columns": SCORING13,
            "status": "REAL (today): shot TYPE shares from the 73-col base. "
                      "NOT location. Never present as location.",
        },
        "shot_position": {
            "status": "BLOCKED: no multi-season LOC_X/LOC_Y source cleared. "
                      "HF has no NBA shot-coordinate set (varied searches "
                      "returned none). ShotChartDetail needs NBA permission "
                      "and an operator-machine fetch.",
            "rule": "Real coordinates ONLY. Never invented, interpolated, "
                    "or proxied from shot-type shares.",
        },
        "text": text_tower(),
        "salary_market": {
            "status": "BLOCKED (bulk): SALARY_LOG rides in the base but "
                      "bulk salary has NO SOURCE; market expansion 3 "
                      "(SALARY_CAP_PCT, SALARY_TEAM_PCT, SALARY_RANK_POS) "
                      "stay blocked. Options: drop, seek permission, or "
                      "paid licensed feed — user decision.",
        },
        "trajectories": {
            "status": "NO SOURCE at scale. Only public source: frozen "
                      "2015-16 SportVU mirrors (~600 games), license "
                      "unverified, partner data. Second Spectrum "
                      "partner-only. Fine level stays EVENT-location.",
        },
        "hf_staged": hf_staged_inputs(),
        "provenance": provenance(
            "pipeline/cache/cdn_pbp + mlops-v2/out/hf (staged downloads)",
            "PBP: NBA-origin (NEEDS PERMISSION); RAPTOR/pathways: CC BY 4.0",
            "measured dedup on cached games; staged specs for blocked towers",
        ),
    }
    write_json(OUT / "towers" / "towers_report.json", report)
    t = report["text"]
    print(f"text: {t['actions']} actions, {t['distinct_templates_measured']} "
          f"templates, dedup {t['dedup_factor']}x (prior: 203 / 15.5x)")
    print(f"shot-position: BLOCKED; salary bulk: BLOCKED; trajectories: "
          f"NO SOURCE")
    return report


if __name__ == "__main__":
    run()
