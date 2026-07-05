"""Backfill team_base / team_advanced cache from Brescou NBA team CSVs.

Used when stats.nba.com is throttled. Produces the same cache layout as
fetch_team_season.py so ``python pipeline/fetch_team_season.py --offline``
can merge seasons into pipeline/data/team_season_{season}.json.

Sources:
  - Brescou NBA-dataset-stats-player-team (1996-97 .. 2022-23)
  - Basketball-Reference league pages (2024-25, 2025-26 when API blocked)

Run: python pipeline/import_team_season_cache.py
"""

from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"

TRAD_URL = (
    "https://raw.githubusercontent.com/Brescou/"
    "NBA-dataset-stats-player-team/main/team/team_stats_traditional_rs.csv"
)
ADV_URL = (
    "https://raw.githubusercontent.com/Brescou/"
    "NBA-dataset-stats-player-team/main/team/team_stats_advanced_rs.csv"
)
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

BBREF_RECENT = (
    ("2024-25", 2025),
    ("2025-26", 2026),
)


def _fetch_csv(url: str) -> list[dict[str, str]]:
    raw = urllib.request.urlopen(url, timeout=120).read().decode("utf-8")
    return list(csv.DictReader(raw.splitlines()))


def _float(val: str | None) -> float | None:
    if val is None or val == "":
        return None
    return float(val)


def import_cache(*, skip_existing: bool = True) -> tuple[int, int]:
    trad_rows = _fetch_csv(TRAD_URL)
    adv_rows = _fetch_csv(ADV_URL)

    adv_by_season_team: dict[tuple[str, int], dict] = {}
    for r in adv_rows:
        adv_by_season_team[(r["SEASON"], int(r["TEAM_ID"]))] = r

    base_by_season: dict[str, list[dict]] = defaultdict(list)
    adv_by_season: dict[str, list[dict]] = defaultdict(list)

    for r in trad_rows:
        season = r["SEASON"]
        team_id = int(r["TEAM_ID"])
        base_by_season[season].append({
            "TEAM_ID": team_id,
            "TEAM_NAME": r["TEAM_NAME"],
            "W": _float(r["W"]),
            "L": _float(r["L"]),
            "W_PCT": _float(r["W_PCT"]),
        })
        a = adv_by_season_team.get((season, team_id), {})
        adv_by_season[season].append({
            "TEAM_ID": team_id,
            "TEAM_NAME": r["TEAM_NAME"],
            "PACE": _float(a.get("PACE")),
            "OFF_RATING": _float(a.get("OFF_RATING")),
            "DEF_RATING": _float(a.get("DEF_RATING")),
            "NET_RATING": _float(a.get("NET_RATING")),
        })

    CACHE.mkdir(parents=True, exist_ok=True)
    written, skipped = 0, 0
    for season in sorted(base_by_season):
        base_path = CACHE / f"team_base_{season}.json"
        adv_path = CACHE / f"team_advanced_{season}.json"
        if skip_existing and base_path.exists() and adv_path.exists():
            skipped += 1
            continue
        base_path.write_text(
            json.dumps(base_by_season[season], separators=(",", ":")),
            encoding="utf-8",
        )
        adv_path.write_text(
            json.dumps(adv_by_season[season], separators=(",", ":")),
            encoding="utf-8",
        )
        written += 1
        print(f"  cached {season}: {len(base_by_season[season])} teams")

    return written, skipped


def _team_name_to_id() -> dict[str, int]:
    """Build TEAM_NAME -> TEAM_ID from any cached team_base file."""
    mapping: dict[str, int] = {}
    for path in sorted(CACHE.glob("team_base_*.json")):
        for row in json.loads(path.read_text(encoding="utf-8")):
            mapping[row["TEAM_NAME"]] = int(row["TEAM_ID"])
    return mapping


def import_bbref_recent(*, skip_existing: bool = True) -> int:
    name_to_id = _team_name_to_id()
    written = 0
    for season, bbref_year in BBREF_RECENT:
        base_path = CACHE / f"team_base_{season}.json"
        adv_path = CACHE / f"team_advanced_{season}.json"
        if skip_existing and base_path.exists() and adv_path.exists():
            continue
        url = f"https://www.basketball-reference.com/leagues/NBA_{bbref_year}.html"
        html = requests.get(url, headers={"User-Agent": UA}, timeout=60).text
        m = re.search(r'id="advanced-team".*?</table>', html, re.S)
        if not m:
            print(f"  {season}: BBRef advanced-team table not found")
            continue
        base_rows, adv_rows = [], []
        pattern = (
            r'data-stat="team"[^>]*>.*?>([^<]+)</a>.*?'
            r'data-stat="wins"[^>]*>(\d+).*?'
            r'data-stat="losses"[^>]*>(\d+).*?'
            r'data-stat="off_rtg"[^>]*>([\d.]+).*?'
            r'data-stat="def_rtg"[^>]*>([\d.]+).*?'
            r'data-stat="pace"[^>]*>([\d.]+)'
        )
        for name, w, l, ortg, drtg, pace in re.findall(pattern, m.group(0), re.S):
            team_id = name_to_id.get(name)
            if team_id is None:
                print(f"  {season}: unknown team {name!r} — skip")
                continue
            w_f, l_f = float(w), float(l)
            gp = w_f + l_f
            base_rows.append({
                "TEAM_ID": team_id,
                "TEAM_NAME": name,
                "W": w_f,
                "L": l_f,
                "W_PCT": round(w_f / gp, 3) if gp else None,
            })
            adv_rows.append({
                "TEAM_ID": team_id,
                "TEAM_NAME": name,
                "PACE": float(pace),
                "OFF_RATING": float(ortg),
                "DEF_RATING": float(drtg),
                "NET_RATING": round(float(ortg) - float(drtg), 1),
            })
        if len(base_rows) < 25:
            print(f"  {season}: only {len(base_rows)} teams parsed — not writing")
            continue
        CACHE.mkdir(parents=True, exist_ok=True)
        base_path.write_text(json.dumps(base_rows, separators=(",", ":")), encoding="utf-8")
        adv_path.write_text(json.dumps(adv_rows, separators=(",", ":")), encoding="utf-8")
        written += 1
        print(f"  BBRef {season}: {len(base_rows)} teams")
    return written


def main() -> None:
    print("Importing Brescou team-season cache (1996-97 .. 2022-23)")
    written, skipped = import_cache(skip_existing=True)
    print(f"Brescou: {written} seasons written, {skipped} skipped (already cached)")
    print("Importing BBRef recent seasons (2024-25, 2025-26)")
    bbref_n = import_bbref_recent(skip_existing=True)
    print(f"DONE: {bbref_n} BBRef season(s) written")


if __name__ == "__main__":
    main()
