#!/usr/bin/env python3
"""Draft combine anthropometrics and athletic testing, as measured (stats.nba.com draftcombinestats).

Writes pipeline/cache/combine_measurements.json:
  {"source", "fetched", "years", "years_missing",
   "players": {"<PLAYER_ID>": {"name", "combine_year", <measured fields>}}}

Only what the endpoint returned is kept. A player with no combine row has no
record; a test he skipped (the endpoint's null) has no field. Nothing is
estimated, defaulted or filled from another source.

This script used to write assets/data/combine_measurements.json (served) and
fabricate most of it [health#5]. When the live fetch was blocked or returned
under 200 players it built a record for every bio_*.json name from typical
ratios plus str-hash jitter, e.g. `wingspan_in = inches + 4.5 + (hash(nn) %
5 - 2) * 0.3` and `max_vert = 28 + (hash(nn) % 12)`, with a bare-except
fallback to a 78 in height and a 200 lb default weight; str hashing is salted
per process, so even the "deterministic jitter" changed on every run. It then
added a record for every 2000+ draftee without a combine row. The committed
file: 3,014 records, 2,839 'bio_estimated' and 175 'draft_history_no_combine',
none measured. Those paths are deleted. The served copies stay until the
frontend follow-up replaces them (build_vectors.SOURCE_CONTRACTS keeps
combine fields out of the training matrix either way).

Fetch rules are the ingest helpers': nba_http (curl_cffi, retries, 403 is a
block), required columns (a renamed header fails instead of reading as
null), write_cache (atomic, refuses an empty payload), and exit 2 from
run_fetch when any year fails.

Run:  python pipeline/fetch_combine.py [--refresh] [--first-year 2000]
      python pipeline/fetch_combine.py --offline     (report the cache; exit 2 without one)
Requires network to stats.nba.com from a residential IP (datacenter IPs are blocked).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import BlockedError, EmptyPayloadError, Failures, FetchError, run_fetch, write_cache
from nba_http import fetch_stats_json, legacy_result_set_rows
from seasons import LAST_SEASON, season_label, season_start_year

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
OUT = CACHE / "combine_measurements.json"
SOURCE = "stats.nba.com draftcombinestats via nba_http"

FIRST_YEAR = 2000
_CALL_GAP_S = 3.0

# Response column -> cache field. Column names are nba_api's
# DraftCombineStats.expected_data; every one is required, so a renamed column
# raises MissingColumnsError instead of becoming a field of nulls.
FIELDS = {
    "HEIGHT_WO_SHOES": "height_wo_shoes_in",
    "HEIGHT_W_SHOES": "height_w_shoes_in",
    "WEIGHT": "weight_lbs",
    "WINGSPAN": "wingspan_in",
    "STANDING_REACH": "standing_reach_in",
    "BODY_FAT_PCT": "body_fat_pct",
    "HAND_LENGTH": "hand_length_in",
    "HAND_WIDTH": "hand_width_in",
    "STANDING_VERTICAL_LEAP": "standing_vertical_in",
    "MAX_VERTICAL_LEAP": "max_vertical_in",
    "LANE_AGILITY_TIME": "lane_agility_sec",
    "MODIFIED_LANE_AGILITY_TIME": "modified_lane_agility_sec",
    "THREE_QUARTER_SPRINT": "sprint_3_4_sec",
    "BENCH_PRESS": "bench_press_reps",
}
REQUIRED = ["PLAYER_ID", "PLAYER_NAME", *FIELDS]


def measured(v) -> float | None:
    """The endpoint's value as a number, or None for null/blank/unparseable."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def records_for_year(rows: list[dict], year: int) -> dict[str, dict]:
    """PLAYER_ID -> {name, combine_year, measured fields only}."""
    out: dict[str, dict] = {}
    for r in rows:
        pid = r.get("PLAYER_ID")
        if pid in (None, ""):
            continue
        rec = {"name": str(r.get("PLAYER_NAME") or ""), "combine_year": year}
        for col, field in FIELDS.items():
            v = measured(r.get(col))
            if v is not None:
                rec[field] = v
        out[str(int(pid))] = rec
    return out


def fetch_year(year: int) -> dict[str, dict]:
    # SeasonYear takes a season label: the 2019 combine is "2019-20" (nba_api's SeasonAll_Time format).
    payload = fetch_stats_json(
        "draftcombinestats", {"LeagueID": "00", "SeasonYear": season_label(year)}, timeout=60
    )
    rows = legacy_result_set_rows(payload, "DraftCombineStats", required=REQUIRED)
    time.sleep(_CALL_GAP_S)
    recs = records_for_year(rows, year)
    if not recs:
        raise EmptyPayloadError(f"draft combine {year}: no player rows")
    return recs


def main() -> None:
    ap = argparse.ArgumentParser(description="fetch_combine: measured draft combine rows only")
    ap.add_argument("--offline", action="store_true", help="report the cache; never fetch")
    ap.add_argument("--refresh", action="store_true", help="refetch even when the cache exists")
    ap.add_argument("--first-year", type=int, default=FIRST_YEAR)
    args = ap.parse_args()

    if args.offline:
        if not OUT.exists():
            raise FetchError(f"no {OUT.name} cached; run without --offline on an operator machine")
        doc = json.loads(OUT.read_text(encoding="utf-8"))
        print(f"offline: {OUT.name} has {len(doc.get('players', {}))} players, years {doc.get('years')}")
        return
    if OUT.exists() and not args.refresh:
        doc = json.loads(OUT.read_text(encoding="utf-8"))
        print(f"{OUT.name} cached ({len(doc.get('players', {}))} players); --refresh to refetch")
        return

    # A combine is held in May before the draft, so the last one is the
    # spring of LAST_SEASON's end year.
    years = list(range(args.first_year, season_start_year(LAST_SEASON) + 2))
    failures = Failures("fetch_combine")
    players: dict[str, dict] = {}
    fetched: list[int] = []
    for year in years:
        try:
            recs = fetch_year(year)
        except BlockedError as e:
            failures.add(str(year), e)
            break  # backing off does not lift a block
        except FetchError as e:
            failures.add(str(year), e)
            continue
        # A player measured at two combines keeps the later one.
        players.update(recs)
        fetched.append(year)
        print(f"combine {year}: {len(recs)} players")

    missing = [y for y in years if y not in fetched]
    if players:
        doc = {
            "source": SOURCE,
            "fetched": time.strftime("%Y-%m-%d"),
            "years": fetched,
            "years_missing": missing,
            "players": players,
        }
        write_cache(OUT, doc, source=SOURCE, n_rows=len(players))
        print(f"wrote {OUT.name}: {len(players)} players from {len(fetched)} combines")
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_combine")
