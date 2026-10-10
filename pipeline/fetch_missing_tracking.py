#!/usr/bin/env python3
"""fetch_missing_tracking.py — tracking + wide-skills cache completeness check (no network).

- Verifies tracking_<season>.json for every season from TRACKING_FIRST_SEASON (2013-14)
- Verifies wide_skills_<season>.json for every season from HUSTLE_FIRST_SEASON (2015-16)
- Documents the SportVU era boundary: no player tracking before 2013-14, and
  synergy/hustle start 2015-16. Those seasons stay missing; nothing is built
  for them.
- Without --verify, writes tracking_availability.json + tracking_pre2013_unavailable.json
  (atomic writes, artifact_io)

Exit codes (ingest.run_fetch): 0 when every expected season is cached, 2 when
any is missing.

This script used to close the 2013-14/2014-15 "gap" by writing
wide_skills_2013-14.json and wide_skills_2014-15.json itself: proxy docs with
constants for every player (post_ppp 0.9, trans_ppp 1.15, d_fg_pct 0.45),
formula stand-ins (contested_shots = DIST_MILES*2, screen_ast =
PASSES_MADE*0.05) and the hustle fields set to 0.0, in the canonical cache
namespace build_wide_skills reads [ingest#5]. That path is deleted, the two
docs are deleted, and build_wide_skills/build_vectors refuse any proxy doc.

Usage:
  python pipeline/fetch_missing_tracking.py
  python pipeline/fetch_missing_tracking.py --verify
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from artifact_io import atomic_write_text
from ingest import FetchError, run_fetch
from seasons import HUSTLE_FIRST_SEASON, TRACKING_FIRST_SEASON, season_range

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"

# Season caches only: tracking_*.json also matches tracking_availability.json,
# tracking_pre2013_unavailable.json and tracking_summary.json, which this
# script and fetch_advanced_tracking write next to them.
SEASON_FILE = re.compile(r"(tracking|wide_skills)_(\d{4}-\d{2})\.json")


def season_files(prefix: str) -> dict[str, Path]:
    out = {}
    for p in sorted(CACHE.glob(f"{prefix}_*.json")):
        m = SEASON_FILE.fullmatch(p.name)
        if m and m.group(1) == prefix:
            out[m.group(2)] = p
    return out


def player_count(path: Path) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "players" in data:
        return len(data["players"])
    return len(data)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="only verification, no writes")
    args = ap.parse_args()

    tracking = season_files("tracking")
    wide = season_files("wide_skills")

    print(f"[tracking] found {len(tracking)} season files")
    for season, tf in tracking.items():
        print(f"  {tf.name} {tf.stat().st_size / 1024:.1f}KB {player_count(tf)} players")
    print(f"[wide] found {len(wide)} season files")
    for season, wf in wide.items():
        doc = json.loads(wf.read_text(encoding="utf-8"))
        print(f"  {wf.name} complete={doc.get('complete')} proxy={bool(doc.get('proxy'))} players={len(doc.get('players', {}))}")

    expected_tracking = season_range(TRACKING_FIRST_SEASON)
    expected_wide = season_range(HUSTLE_FIRST_SEASON)
    missing_tracking = [s for s in expected_tracking if s not in tracking]
    missing_wide = [s for s in expected_wide if s not in wide]
    early_wide = sorted(s for s in wide if s < HUSTLE_FIRST_SEASON)
    print(f"[tracking] expected {len(expected_tracking)} seasons, missing {missing_tracking}")
    print(f"[wide] expected {len(expected_wide)} seasons, missing {missing_wide}")

    if not args.verify:
        availability_doc = {
            "built": time.strftime("%Y-%m-%d"),
            "source": "SportVU / Second Spectrum era boundary check",
            "note": (
                "NBA player tracking via SportVU started 2013-14; Second Spectrum after. "
                "Pre-2013 tracking is genuinely unavailable and is never fabricated."
            ),
            "earliest_tracking": TRACKING_FIRST_SEASON,
            "tracking_seasons_present": sorted(tracking),
            "tracking_seasons_complete": not missing_tracking,
            "tracking_file_sizes_bytes": {p.name: p.stat().st_size for p in tracking.values()},
            "wide_skills_seasons_present": sorted(wide),
            "wide_skills_earliest_synergy_hustle": HUSTLE_FIRST_SEASON,
            "missing_tracking_expected": missing_tracking,
            "missing_wide_expected": missing_wide,
            "gap_closure_note": (
                f"{TRACKING_FIRST_SEASON}..{season_range(TRACKING_FIRST_SEASON)[1]}: tracking exists but synergy "
                f"(post/transition) and hustle coverage start {HUSTLE_FIRST_SEASON}, so no wide_skills cache "
                "exists for those seasons and none is built: the wide skills are masked there."
            ),
            "fabrication_policy": "Never fabricate tracking or wide skills. Mask what was not measured.",
        }
        atomic_write_text(CACHE / "tracking_availability.json", json.dumps(availability_doc, indent=2), encoding="utf-8")
        atomic_write_text(
            CACHE / "tracking_pre2013_unavailable.json",
            json.dumps(
                {
                    "built": time.strftime("%Y-%m-%d"),
                    "earliest_tracking_season": TRACKING_FIRST_SEASON,
                    "reason": (
                        "SportVU camera system installed league-wide beginning 2013-14 season. "
                        "No player tracking (DIST, SPEED, TOUCHES, DRIVES) before then."
                    ),
                    "seasons_unavailable": [s for s in season_range() if s < TRACKING_FIRST_SEASON],
                    "policy": "Downstream models mask tracking features for those seasons.",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print("[tracking] wrote tracking_availability.json + tracking_pre2013_unavailable.json")

    problems = []
    if missing_tracking:
        problems.append(f"no tracking cache for {missing_tracking}")
    if missing_wide:
        problems.append(f"no wide_skills cache for {missing_wide}")
    if early_wide:
        problems.append(f"wide_skills caches before {HUSTLE_FIRST_SEASON} (no synergy/hustle exists): {early_wide}")
    if problems:
        raise FetchError("; ".join(problems))
    print("[tracking] done verification")


if __name__ == "__main__":
    run_fetch(main, name="fetch_missing_tracking")
