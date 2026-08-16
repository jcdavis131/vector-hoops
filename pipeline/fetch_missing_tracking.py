#!/usr/bin/env python3
"""
fetch_missing_tracking.py — Advanced Tracking completeness + Wide skills scaffold (zero-deps v2)

- Verifies tracking_*.json completeness (13 seasons 2013-14..2025-26, 189-238K each)
- Verifies wide_skills_*.json completeness (11 seasons 2015-16..2025-26, 106-137K each)
- Documents SportVU era boundary (2013): pre-2013 tracking unavailable, cannot fabricate
- Writes tracking_availability.json + tracking_pre2013_unavailable.json
- Gap closure: if tracking exists for 2013-14/2014-15 but wide_skills missing, builds proxy wide_skills from tracking + bio name mapping
- Zero-deps resumable

Usage:
  python pipeline/fetch_missing_tracking.py
  python pipeline/fetch_missing_tracking.py --verify
"""

from __future__ import annotations
import argparse
import json
import pathlib
import time
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
TRACKING_GLOB = "tracking_*.json"
WIDE_GLOB = "wide_skills_*.json"

SEASON_LENGTH = {
    "1998-99": 50,
    "2011-12": 66,
    "2019-20": 72,
    "2020-21": 72,
}

def expected_length(season: str) -> int:
    return SEASON_LENGTH.get(season, 82)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="only verification, no writes")
    args=ap.parse_args()

    tracking_files = sorted(CACHE.glob(TRACKING_GLOB))
    wide_files = sorted([p for p in CACHE.glob(WIDE_GLOB) if "example" not in p.name])

    print(f"[tracking] found {len(tracking_files)} tracking files")
    for tf in tracking_files:
        sz=tf.stat().st_size
        try:
            data=json.loads(tf.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "players" in data:
                count=len(data.get("players",{}))
            elif isinstance(data, dict):
                count=len(data)
            elif isinstance(data, list):
                count=len(data)
            else:
                count=-1
        except Exception:
            count=-1
        print(f"  {tf.name} {sz/1024:.1f}KB {count} players {'OK' if sz>50000 else 'SMALL'}")

    print(f"[wide] found {len(wide_files)} wide_skills files (excluding example)")
    for wf in wide_files:
        sz=wf.stat().st_size
        try:
            doc=json.loads(wf.read_text(encoding="utf-8"))
            season=doc.get("season","?")
            complete=doc.get("complete")
            players=len(doc.get("players",{}))
            print(f"  {wf.name} {sz/1024:.1f}KB season={season} complete={complete} players={players} {'OK' if players>100 else 'SMALL'}")
        except Exception as e:
            print(f"  {wf.name} err {e}")

    expected_tracking_seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2013, 2026)]
    have_tracking_seasons = set()
    for tf in tracking_files:
        name=tf.stem.replace("tracking_","")
        have_tracking_seasons.add(name)
    missing_tracking = [s for s in expected_tracking_seasons if s not in have_tracking_seasons]
    print(f"[tracking] expected 13 seasons 2013-14..2025-26, have {len(have_tracking_seasons)}, missing {missing_tracking}")

    expected_wide_seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2015, 2026)]
    have_wide = set()
    for wf in wide_files:
        if wf.name.startswith("wide_skills_") and wf.name.endswith(".json"):
            have_wide.add(wf.stem.replace("wide_skills_",""))
    missing_wide = [s for s in expected_wide_seasons if s not in have_wide]
    print(f"[wide] expected synergy+hustle 11 seasons 2015-16..2025-26, have {len(have_wide)}, missing {missing_wide}")

    pre2013_note_path = CACHE / "tracking_pre2013_unavailable.json"
    tracking_notes_path = CACHE / "tracking_availability.json"

    availability_doc = {
        "built": time.strftime("%Y-%m-%d"),
        "source": "SportVU / Second Spectrum era boundary check",
        "note": "NBA player tracking via SportVU started 2013-14; Second Spectrum after. Pre-2013 tracking is genuinely unavailable — cannot fabricate.",
        "earliest_tracking": "2013-14",
        "tracking_seasons_present": sorted(list(have_tracking_seasons)),
        "tracking_seasons_complete_13": len(have_tracking_seasons)==13,
        "tracking_file_sizes_bytes": {tf.name: tf.stat().st_size for tf in tracking_files},
        "wide_skills_seasons_present": sorted(list(have_wide)),
        "wide_skills_earliest_synergy_hustle": "2015-16",
        "missing_tracking_expected": missing_tracking,
        "missing_wide_expected": missing_wide,
        "gap_closure_note": "2013-14 & 2014-15: tracking exists but synergy (post/transition) + hustle coverage starts 2015-16 per NBA stats; wide_skills missing for those two seasons is EXPECTED. Can optionally build proxy wide_skills from tracking totals but not true synergy.",
        "fabrication_policy": "Do NOT fabricate pre-2013 tracking. For modeling, mask tracking features before 2013.",
    }

    if not args.verify:
        tracking_notes_path.write_text(json.dumps(availability_doc, indent=2), encoding="utf-8")
        pre2013_note_path.write_text(json.dumps({
            "built": time.strftime("%Y-%m-%d"),
            "earliest_tracking_season": "2013-14",
            "reason": "SportVU camera system installed league-wide beginning 2013-14 season. No player tracking (DIST, SPEED, TOUCHES, DRIVES) before then.",
            "seasons_unavailable": [f"{y}-{str(y+1)[-2:]}" for y in range(1996, 2013)],
            "policy": "Return empty scaffold for those seasons; downstream models must mask or use box-score proxies.",
            "scaffold": {},
        }, indent=2), encoding="utf-8")
        print(f"[tracking] wrote {tracking_notes_path.name} + {pre2013_note_path.name}")

    for gap_season in ["2013-14", "2014-15"]:
        gap_wide_path = CACHE / f"wide_skills_{gap_season}.json"
        gap_track_path = CACHE / f"tracking_{gap_season}.json"
        if gap_track_path.exists() and not gap_wide_path.exists() and not args.verify:
            print(f"[gap] building proxy wide_skills for {gap_season} from tracking (best-effort)")
            try:
                tdata=json.loads(gap_track_path.read_text(encoding="utf-8"))
                bio_path = CACHE / f"bio_{gap_season}.json"
                id_to_name = {}
                if bio_path.exists():
                    b=json.loads(bio_path.read_text(encoding="utf-8"))
                    if isinstance(b, list):
                        for rec in b:
                            pid=str(rec.get("PLAYER_ID"))
                            pname=rec.get("PLAYER_NAME","")
                            import unicodedata, re
                            s=unicodedata.normalize("NFD", pname)
                            s="".join(c for c in s if not unicodedata.combining(c))
                            s=re.sub(r"[.'’-]", "", s.lower())
                            s=re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
                            s=re.sub(r"\s+", " ", s)
                            id_to_name[pid]=s
                players_out={}
                for pid, stats in tdata.items():
                    if not isinstance(stats, dict): continue
                    nn=id_to_name.get(str(pid), str(pid))
                    drives=float(stats.get("DRIVES") or 0)
                    touches=float(stats.get("TOUCHES") or 0)
                    players_out[nn]={
                        "post_freq": float(stats.get("POST_TOUCHES") or 0)/max(0.1,touches)*100 if touches>0 else 0,
                        "post_ppp": 0.9,
                        "trans_freq": max(0, drives*2.2 + float(stats.get("DIST_MILES") or 0)*2),
                        "trans_ppp": 1.15,
                        "screen_ast": float(stats.get("PASSES_MADE") or 0)*0.05,
                        "deflections": 0.0,
                        "loose_balls": 0.0,
                        "charges": 0.0,
                        "box_outs": 0.0,
                        "contested_shots": float(stats.get("DIST_MILES") or 0)*2,
                        "pull_up_fg3a": float(stats.get("PULL_UP_FGA") or 0),
                        "d_fg_pct": 0.45,
                        "_proxy": True,
                        "_source": "tracking_ + heuristic (no synergy/hustle for 13-14/14-15)",
                    }
                doc={
                    "built": time.strftime("%Y-%m-%d"),
                    "source": "proxy from tracking_*.json (SportVU) because synergyplaytypes + hustle unavailable pre-2015-16; NOT official",
                    "complete": False,
                    "season": gap_season,
                    "players": players_out,
                    "proxy": True,
                }
                gap_wide_path.write_text(json.dumps(doc, separators=(",",":")), encoding="utf-8")
                print(f"[gap] wrote proxy {gap_wide_path.name} {len(players_out)} players")
            except Exception as e:
                print(f"[gap] failed proxy for {gap_season}: {e}")
                import traceback; traceback.print_exc()
    print("[tracking] done verification")
    return 0

if __name__=="__main__":
    sys.exit(main())
