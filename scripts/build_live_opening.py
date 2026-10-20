#!/usr/bin/env python3
"""Build assets/live_opening.json for the opening-night live companion.

Outputs:
  - game metadata for OKC @ SA, event 401909090, tip 2026-10-20 20:30 CT
  - archetype map: display name -> {c, name} (mtnnGlobal K=8 cluster of the
    player's LATEST player-season <= 2025-26, from archetype_assignments.json)
  - team archetype composition for both rosters (from current_rosters_2026_27.json)
  - star twin chips from eratwins.json (only names that exist there)

Ruff-clean, stdlib only. Run from repo root.
"""

import json
from collections import Counter

ROOT = "."
ASSETS = ROOT + "/assets"


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main():
    vectors = load(ASSETS + "/vectors.json")
    assigns = load(ASSETS + "/archetype_assignments.json")
    eratwins = load(ASSETS + "/eratwins.json")
    rosters = load(ASSETS + "/current_rosters_2026_27.json")

    # id -> (name, season)
    id2ns = {p["id"]: (p["name"], p["season"]) for p in vectors["players"]}
    # latest player-season per name at or before 2025-26
    latest = {}
    for a in assigns["assignments"]:
        nm, season = id2ns.get(a["id"], (None, None))
        if nm is None or season > "2025-26":
            continue
        cur = latest.get(nm)
        if cur is None or season > cur[0]:
            latest[nm] = (season, a["mtnnGlobal"], a["mtnnGlobalName"])

    arch_map = {nm: {"season": s, "c": c, "name": cn} for nm, (s, c, cn) in latest.items()}

    # Trim the client map to 2026-27 camp-roster players: a live game can only
    # ever need players on an NBA roster. The full 2,422-player map would be
    # ~225 KB of dead weight on a mobile-first page; the roster subset is ~1/4.
    roster_names = {r["name"] for team in rosters["teams"].values() for r in team if r.get("name")}
    arch_map = {nm: hit for nm, hit in arch_map.items() if nm in roster_names}

    # team archetype composition for OKC and SA rosters
    teams = rosters["teams"]
    comp = {}
    for abbr in ("OKC", "SAS"):
        names = [r["name"] for r in teams.get(abbr, []) if r.get("name")]
        cnt = Counter()
        mapped = 0
        for nm in names:
            hit = arch_map.get(nm)
            if hit:
                cnt[hit["name"]] += 1
                mapped += 1
        comp[abbr] = {
            "roster_n": len(names),
            "mapped_n": mapped,
            "clusters": [{"name": k, "n": v} for k, v in cnt.most_common()],
        }

    # star twin chips — only players present in eratwins.json
    want = {
        "OKC": ["Shai Gilgeous-Alexander", "Jalen Williams", "Chet Holmgren", "Isaiah Hartenstein", "Luguentz Dort"],
        "SAS": [
            "Victor Wembanyama",
            "De'Aaron Fox",
            "Stephon Castle",
            "Chris Paul",
            "Harrison Barnes",
            "Devin Vassell",
            "Keldon Johnson",
        ],
    }
    twins = {p["name"]: p for p in eratwins["players"]}
    chips = {}
    for abbr, cands in want.items():
        out = []
        for nm in cands:
            p = twins.get(nm)
            if not p:
                continue
            t = p["twin"]
            out.append(
                {
                    "name": nm,
                    "season": p["season"],
                    "archetype": p.get("archetype"),
                    "twin": t["name"],
                    "twin_season": t["season"],
                    "similarity": t["similarity"],
                }
            )
        chips[abbr] = out

    doc = {
        "built": "2026-10-20",
        "game": {
            "event_id": "401909090",
            "away": "OKC",
            "home": "SA",
            "tip_ct": "2026-10-20T20:30:00-05:00",
            "venue": "Frost Bank Center, San Antonio TX",
            "label": "Opening night",
            "predictor": {"home_win_pct": 52.6, "away_win_pct": 47.4, "source": "ESPN Matchup Predictor"},
        },
        "archetype_method": (
            "archetype = mtnnGlobal, the K=8 k-means cluster of the player's "
            "player-season representation (assets/archetype_assignments.json, "
            "built 2026-10-11). Each live player is mapped by display name to "
            "their latest player-season at or before 2025-26; unmatched "
            "players are excluded."
        ),
        "archetypes": arch_map,
        "team_composition": comp,
        "star_twins": chips,
    }
    out_path = ASSETS + "/live_opening.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    print(
        f"wrote {out_path}: {len(arch_map)} archetype mappings, "
        f"OKC chips={len(chips['OKC'])} SAS chips={len(chips['SAS'])}"
    )


if __name__ == "__main__":
    main()
