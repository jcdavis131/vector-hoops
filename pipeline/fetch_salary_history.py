"""Backfill NBA player-season salaries from Basketball-Reference team pages.

Why
---
`pipeline/cache/salaries_history.csv` covers 1990-91 .. 2017-18 and then jumps
to 2025-26 (BBRef "current contracts"). Seasons **2018-19 .. 2024-25** were
never backfilled, so the `market` tower and the 0.12-weight `salary_head` are
fully masked across the entire modern era — including the whole val/test split.

BBRef team-season pages (`/teams/<TM>/<endyear>.html`) embed a `salaries2`
table inside an HTML comment, with the raw figure in `csk="35654150"`.

Politeness
----------
BBRef asks for <= 20 requests/minute. Default delay is 3.5s (~17/min).
Every (team, season) response is cached to `pipeline/cache/bbref_salaries/`
so re-runs are free and the scrape is resumable.

Run:
    python pipeline/fetch_salary_history.py                # fetch missing seasons
    python pipeline/fetch_salary_history.py --write-csv    # merge into salaries_history.csv
    python pipeline/fetch_salary_history.py --status
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

from name_utils import ascii_fold

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
SAL_DIR = CACHE / "bbref_salaries"
CSV_PATH = CACHE / "salaries_history.csv"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# Stable BBRef franchise codes for 2019-2025 (no relocations in range).
BBREF_TEAMS = [
    "ATL", "BOS", "BRK", "CHO", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHO", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]
# BBRef code -> abbreviation used elsewhere in this repo (assets/teams.json).
TEAM_OUT = {"BRK": "BKN", "CHO": "CHA", "PHO": "PHX"}

# 2018-19 .. 2024-25 (BBRef pages are keyed by season END year).
DEFAULT_END_YEARS = list(range(2019, 2026))

ROW_RE = re.compile(
    r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>.*?'
    r'data-stat="salary"[^>]*?(?:csk="(\d+)")?[^>]*>\s*\$?([\d,]*)',
    re.S,
)


def demojibake(s: str) -> str:
    """Undo UTF-8 bytes that were decoded as latin-1.

    BBRef serves UTF-8 without declaring a charset, so requests' RFC fallback
    yields 'SmailagiÄ‡' for 'Smailagić'. Round-tripping recovers the original.
    Correctly-decoded names contain codepoints latin-1 cannot encode, so they
    raise and are returned untouched.
    """
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def clean_name(raw: str) -> str:
    """Repo convention: joins and vectors.json display names are ASCII."""
    return ascii_fold(demojibake(raw)).strip()


def season_label(end_year: int) -> str:
    return f"{end_year - 1}-{str(end_year)[-2:]}"


def cache_path(team: str, end_year: int) -> Path:
    return SAL_DIR / str(end_year) / f"{team}.json"


def parse_salaries(html: str) -> list[dict]:
    blob = next((c for c in re.findall(r"<!--(.*?)-->", html, re.S)
                 if "salaries2" in c), None)
    if blob is None:
        return []
    body = re.search(r"<tbody>(.*?)</tbody>", blob, re.S)
    body = body.group(1) if body else blob
    out: list[dict] = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S):
        m = ROW_RE.search(tr)
        if not m:
            continue
        name, csk, text = m.group(1), m.group(2), m.group(3)
        raw = csk or text.replace(",", "")
        if not raw:
            continue
        try:
            out.append({"name": name.strip(), "salary": float(raw)})
        except ValueError:
            continue
    return out


def fetch_team_season(team: str, end_year: int, delay: float,
                      force: bool = False) -> list[dict]:
    path = cache_path(team, end_year)
    if path.exists() and not force:
        return json.loads(path.read_text(encoding="utf-8"))
    import requests

    url = f"https://www.basketball-reference.com/teams/{team}/{end_year}.html"
    for attempt in range(4):
        r = requests.get(url, headers={"User-Agent": UA}, timeout=40)
        if r.status_code == 429:  # rate limited — back off hard
            wait = 60 * (attempt + 1)
            print(f"  429 on {team} {end_year}; sleeping {wait}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code == 404:
            return []
        r.raise_for_status()
        r.encoding = "utf-8"  # BBRef omits charset; don't let requests guess latin-1
        rows = parse_salaries(r.text)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(rows), encoding="utf-8")
        time.sleep(delay)
        return rows
    raise RuntimeError(f"repeated 429 for {team} {end_year}")


def existing_seasons() -> set[str]:
    if not CSV_PATH.exists():
        return set()
    with CSV_PATH.open(encoding="utf-8") as f:
        return {row["season"] for row in csv.DictReader(f) if row.get("season")}


def status() -> None:
    have = existing_seasons()
    print("salaries_history.csv seasons:", len(have))
    missing = [season_label(y) for y in DEFAULT_END_YEARS
               if season_label(y) not in have]
    print("target backfill seasons:", [season_label(y) for y in DEFAULT_END_YEARS])
    print("still missing from CSV:", missing or "none")
    cached = sum(1 for y in DEFAULT_END_YEARS for t in BBREF_TEAMS
                 if cache_path(t, y).exists())
    print(f"cached (team,season) pages: {cached}/{len(DEFAULT_END_YEARS) * len(BBREF_TEAMS)}")


def collect(end_years: list[int]) -> dict[tuple[str, str], dict]:
    """(name, season) -> row; a traded player keeps his largest cap hit."""
    best: dict[tuple[str, str], dict] = {}
    for y in end_years:
        season = season_label(y)
        for team in BBREF_TEAMS:
            path = cache_path(team, y)
            if not path.exists():
                continue
            for rec in json.loads(path.read_text(encoding="utf-8")):
                # Repairs any latin-1-decoded cache written before the fix.
                name = clean_name(rec["name"])
                key = (name, season)
                prev = best.get(key)
                if prev is None or rec["salary"] > prev["salary"]:
                    best[key] = {
                        "name": name, "season": season,
                        "salary": rec["salary"], "team": TEAM_OUT.get(team, team),
                    }
    return best


def write_csv(end_years: list[int]) -> None:
    rows = collect(end_years)
    if not rows:
        print("nothing collected — run the fetch first", file=sys.stderr)
        sys.exit(1)
    have = existing_seasons()
    new = [r for r in rows.values() if r["season"] not in have]
    if not new:
        print("all target seasons already present in CSV; nothing to append")
        return
    backup = CSV_PATH.with_suffix(".csv.bak")
    if CSV_PATH.exists() and not backup.exists():
        backup.write_text(CSV_PATH.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"backup -> {backup.name}")
    exists = CSV_PATH.exists()
    with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["name", "season", "salary", "team", "cap_pct"])
        if not exists:
            w.writeheader()
        for r in sorted(new, key=lambda x: (x["season"], -x["salary"])):
            w.writerow({**r, "salary": int(r["salary"]), "cap_pct": ""})
    seasons = sorted({r["season"] for r in new})
    print(f"appended {len(new)} rows for {len(seasons)} seasons: {seasons}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--write-csv", action="store_true",
                    help="append cached rows into salaries_history.csv")
    ap.add_argument("--delay", type=float, default=3.5, help="seconds between requests")
    ap.add_argument("--force", action="store_true", help="refetch cached pages")
    ap.add_argument("--end-years", type=str, default="",
                    help="comma-separated season END years (default 2019..2025)")
    args = ap.parse_args()

    end_years = ([int(x) for x in args.end_years.split(",") if x.strip()]
                 or DEFAULT_END_YEARS)

    if args.status:
        status()
        return
    if args.write_csv:
        write_csv(end_years)
        return

    SAL_DIR.mkdir(parents=True, exist_ok=True)
    total = len(end_years) * len(BBREF_TEAMS)
    done = 0
    for y in end_years:
        got = 0
        for team in BBREF_TEAMS:
            rows = fetch_team_season(team, y, args.delay, force=args.force)
            got += len(rows)
            done += 1
        print(f"{season_label(y)}: {got} salary rows  [{done}/{total} pages]", flush=True)
    print("done. now:  python pipeline/fetch_salary_history.py --write-csv")


if __name__ == "__main__":
    main()
