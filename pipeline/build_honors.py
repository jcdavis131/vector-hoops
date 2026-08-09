"""Track J deriver — lagged peer recognition per charted player-season.

Honors awarded after season S are applied to season S+1 rows (leak-free
for MTNN). For game puzzle weighting, build_player_meta.py also emits
same-season recognition (contemporaneous fame).

Features (raw; integrate_context era-z's within season pool when merged):
  HON_ALL_NBA_TEAM_LAG   0/1/2/3 — prior season All-NBA tier
  HON_ALL_NBA_VOTE_LAG   prior season vote points (0 if none)
  HON_ASG_LAG            1 if prior season All-Star
  HON_ASG_CUM            career ASG count through prior season
  HON_VOTE_RECOG         1 if prior season received any All-NBA vote pts

Run:  python pipeline/build_honors.py
Output: pipeline/data/honors.json, assets/honors.json (when cache complete)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "honors.example.json"
FMVP_CACHE = CACHE_DIR / "honors_finals_mvp.json"
OUT = ROOT / "pipeline" / "data" / "honors.json"
ASSET_OUT = ROOT / "assets" / "honors.json"


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def season_start(season: str) -> int:
    return int(season[:4])


def prior_season(season: str) -> str | None:
    y = season_start(season)
    if y <= 1996:
        return None
    return f"{y - 1}-{str(y)[-2:]}"


def real_honor_cache_paths(cache_dir: Path) -> list[Path]:
    pat = re.compile(r"honors_award_\d{4}\.json$")
    return sorted(p for p in cache_dir.glob("honors_award_*.json") if pat.match(p.name))


def load_award_index(use_fixture: bool) -> tuple[dict[str, dict], bool]:
    """season -> norm_name -> {vote_pts, all_nba_team, asg}."""
    by_season: dict[str, dict[str, dict]] = {}
    complete = True

    caches = [] if use_fixture else real_honor_cache_paths(CACHE_DIR)
    if caches:
        for path in caches:
            doc = json.loads(path.read_text(encoding="utf-8"))
            season = doc["season"]
            complete = complete and bool(doc.get("complete"))
            by_season[season] = doc.get("players", {})
        return by_season, complete

    if not FIXTURE.exists():
        raise SystemExit(f"no honor caches and no fixture at {FIXTURE} — run pipeline/fetch_honors.py (or --fixture)")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    complete = bool(doc.get("complete"))
    for season, recs in doc.get("players", {}).items():
        by_season[season] = recs
    return by_season, complete


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    args = ap.parse_args()

    award_idx, complete = load_award_index(args.fixture)
    fmvp_by_season: dict[str, str] = {}
    if not args.fixture and FMVP_CACHE.exists():
        fmvp_doc = json.loads(FMVP_CACHE.read_text(encoding="utf-8"))
        for season, rec in (fmvp_doc.get("bySeason") or {}).items():
            if rec.get("norm"):
                fmvp_by_season[season] = rec["norm"]
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    cum_asg: dict[str, int] = {}
    entries = []
    contemporaneous: dict[str, dict] = {}
    lagged_rows = 0
    vote_reco_rows = 0
    fmvp_rows = 0

    for p in vec["players"]:
        name, season = p["name"], p["season"]
        nn = norm_name(name)
        key = f"{name}|{season}"

        # Same-season (game weighting / UI)
        same = award_idx.get(season, {}).get(nn, {})
        is_fmvp = fmvp_by_season.get(season) == nn
        if same or is_fmvp:
            contemporaneous[key] = {
                "asg": int(same.get("asg") or 0),
                "allNbaTeam": int(same.get("all_nba_team") or 0),
                "allNbaVotePts": int(same.get("vote_pts") or 0),
                "finalsMvp": 1 if is_fmvp else 0,
            }
            if is_fmvp:
                fmvp_rows += 1

        prev_s = prior_season(season)
        prev = award_idx.get(prev_s, {}).get(nn, {}) if prev_s else {}
        if prev.get("asg"):
            cum_asg[nn] = cum_asg.get(nn, 0) + 1

        vote_pts = int(prev.get("vote_pts") or 0)
        team_tier = int(prev.get("all_nba_team") or 0)
        asg_lag = int(prev.get("asg") or 0)
        if not prev_s or (vote_pts == 0 and team_tier == 0 and asg_lag == 0):
            continue

        row = {
            "name": name,
            "season": season,
            "HON_ALL_NBA_TEAM_LAG": float(team_tier),
            "HON_ALL_NBA_VOTE_LAG": float(vote_pts),
            "HON_ASG_LAG": float(asg_lag),
            "HON_ASG_CUM": float(cum_asg.get(nn, 0)),
            "HON_VOTE_RECOG": 1.0 if vote_pts > 0 else 0.0,
        }
        entries.append(row)
        lagged_rows += 1
        if vote_pts > 0:
            vote_reco_rows += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "built": time.strftime("%Y-%m-%d"),
                "cache_complete": complete,
                "coverage": {
                    "lagged_rows": lagged_rows,
                    "vote_recognized_rows": vote_reco_rows,
                    "contemporaneous_keys": len(contemporaneous),
                    "finals_mvp_keys": fmvp_rows,
                    "award_seasons": len(award_idx),
                    "rows_total": len(vec["players"]),
                },
                "players": entries,
                "contemporaneous": contemporaneous,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    if complete and contemporaneous:
        ASSET_OUT.write_text(
            json.dumps(
                {
                    "built": time.strftime("%Y-%m-%d"),
                    "note": (
                        "All-NBA voting expands beyond the 15 team slots. "
                        "Same-season keys for UI include Finals MVP when "
                        "honors_finals_mvp.json is present. Lagged HON_* in pipeline/data."
                    ),
                    "bySeason": contemporaneous,
                },
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        asset_msg = f"wrote {ASSET_OUT.relative_to(ROOT)} ({len(contemporaneous)} keys)"
    else:
        asset_msg = "assets/honors.json NOT written (partial cache)"

    print(
        f"honors: {lagged_rows} lagged rows ({vote_reco_rows} with vote pts), "
        f"{len(contemporaneous)} contemporaneous keys ({fmvp_rows} Finals MVP), "
        f"{len(award_idx)} award seasons (complete={complete})"
    )
    print(f"wrote {OUT.relative_to(ROOT)}; {asset_msg}")


if __name__ == "__main__":
    main()
