"""Track I deriver — per player-season postseason features (a distinct regime).

Joins playoff caches to every charted player-season in assets/vectors.json
and derives the `playoffs` tower family. Every value is either a
playoff-only role/availability fact or a playoff-**minus**-regular-season
contrast, so the tower represents what *changes* in the postseason rather
than re-encoding regular-season stats.

Features (raw; integrate_context.py era-z's within the season's playoff pool):

  PO_GP          playoff games played
  PO_MIN         playoff minutes per game (raw playoff role)
  PO_MIN_DELTA   PO MPG - RS MPG (minutes elevation)
  PO_USG_DELTA   PO usage - RS usage (offensive-role shift)
  PO_PTS_DELTA   PO pts/100 - RS pts/100 (scoring riser/fader)
  PO_EFF_DELTA   PO TS% - RS TS% (efficiency under pressure)
  PO_PLUS_MINUS  PO on-court plus-minus per 100
  PO_TEAM_WINS   team playoff wins that postseason (0-16)
  PO_ROUNDS      rounds advanced (0-4)

Coverage: only player-seasons with >=1 playoff game. A player who did not
appear in the postseason is **masked** (did-not-play != played-badly);
absence in a partial cache is likewise masked, never fabricated.

Inputs (either works):
  pipeline/cache/playoffs_{season}.json     per-season caches (fetcher output)
  pipeline/cache/playoffs.example.json      committed multi-season fixture (tests)

Run:  python pipeline/build_playoffs.py [--fixture]
Output: pipeline/data/playoffs.json (consumed by integrate_context.py);
        assets/playoffs.json (transparent splits for the game Playoff Lens)
        is written ONLY from a complete cache.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "playoffs.example.json"
OUT = ROOT / "pipeline" / "data" / "playoffs.json"
ASSET_OUT = ROOT / "assets" / "playoffs.json"


def load_caches(use_fixture: bool) -> tuple[dict, dict, bool]:
    """Return (player_index, team_index, complete).

    player_index: (season, norm_name) -> {team_id, po{...}, rs{...}}
    team_index:   (season, team_id_str) -> {po_wins, rounds}
    """
    players: dict[tuple[str, str], dict] = {}
    teams: dict[tuple[str, str], dict] = {}
    complete = True

    per_season = sorted(CACHE_DIR.glob("playoffs_*.json"))
    if per_season and not use_fixture:
        for path in per_season:
            doc = json.loads(path.read_text(encoding="utf-8"))
            season = doc["season"]
            complete = complete and bool(doc.get("complete"))
            for nn, rec in doc.get("players", {}).items():
                players[(season, nn)] = rec
            for tid, rec in doc.get("teams", {}).items():
                teams[(season, str(tid))] = rec
        return players, teams, complete

    # Fixture: one bundled file, players/teams keyed by season.
    if not FIXTURE.exists():
        raise SystemExit(
            f"no playoff caches and no fixture at {FIXTURE} — run "
            "pipeline/fetch_playoffs.py on an operator machine (or --fixture)")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    complete = bool(doc.get("complete"))
    for season, recs in doc.get("players", {}).items():
        for nn, rec in recs.items():
            players[(season, nn)] = rec
    for season, recs in doc.get("teams", {}).items():
        for tid, rec in recs.items():
            teams[(season, str(tid))] = rec
    return players, teams, complete


def norm_name(name: str) -> str:
    import re
    import unicodedata
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def delta(a, b):
    return round(a - b, 4) if (a is not None and b is not None) else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true",
                    help="force the committed example fixture (tests)")
    args = ap.parse_args()

    players_idx, teams_idx, complete = load_caches(args.fixture)
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    entries = []
    splits = {}
    appearances = 0
    seasons_seen = set()
    for p in vec["players"]:
        name, season = p["name"], p["season"]
        rec = players_idx.get((season, norm_name(name)))
        if not rec or (rec.get("po", {}).get("GP") or 0) <= 0:
            continue  # did not appear -> masked family
        po, rs = rec["po"], rec.get("rs", {})
        team = teams_idx.get((season, str(rec.get("team_id"))), {})
        row = {
            "name": name, "season": season,
            "PO_GP": float(po["GP"]),
            "PO_MIN": float(po["MIN"]),
            "PO_MIN_DELTA": delta(po.get("MIN"), rs.get("MIN")),
            "PO_USG_DELTA": delta(po.get("USG"), rs.get("USG")),
            "PO_PTS_DELTA": delta(po.get("PTS100"), rs.get("PTS100")),
            "PO_EFF_DELTA": delta(po.get("TS"), rs.get("TS")),
            "PO_PLUS_MINUS": float(po.get("PLUS_MINUS") or 0.0),
            "PO_TEAM_WINS": float(team["po_wins"]) if "po_wins" in team else None,
            "PO_ROUNDS": float(team["rounds"]) if "rounds" in team else None,
        }
        entries.append(row)
        appearances += 1
        seasons_seen.add(season)
        splits[f"{name}|{season}"] = {
            "po": po, "rs": rs,
            "wins": team.get("po_wins"), "rounds": team.get("rounds"),
            "pts_delta": row["PO_PTS_DELTA"], "min_delta": row["PO_MIN_DELTA"],
            "usg_delta": row["PO_USG_DELTA"],
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "cache_complete": complete,
        "coverage": {
            "appearances": appearances,
            "seasons_covered": len(seasons_seen),
            "rows_total": len(vec["players"]),
        },
        "players": entries,
    }, separators=(",", ":")), encoding="utf-8")

    # Transparent splits for the game Playoff Lens ONLY from a complete cache —
    # never ship the partial fixture as if it were prod coverage.
    if complete and appearances:
        ASSET_OUT.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "note": ("regular-season vs playoff per-100 splits; riser/fader = "
                     "PO minus RS pts/100. Source: stats.nba.com."),
            "splits": splits,
        }, separators=(",", ":")), encoding="utf-8")
        asset_msg = f"wrote {ASSET_OUT.relative_to(ROOT)} ({len(splits)} splits)"
    else:
        asset_msg = ("assets/playoffs.json NOT written (partial cache — game "
                     "Playoff Lens stays dormant)")

    print(f"playoffs: {appearances} appearances across {len(seasons_seen)} seasons "
          f"of {len(vec['players'])} player-seasons (cache complete={complete})")
    print(f"wrote {OUT.relative_to(ROOT)}; {asset_msg}")


if __name__ == "__main__":
    main()
