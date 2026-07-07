"""Track J fetcher — All-NBA voting, All-NBA teams, All-Star from BBRef.

BBRef awards pages list vote-getters (not just the 15 All-NBA selections),
expanding recognition coverage for honors weighting and the MTNN honors tower.

Writes per-award-year caches:
  pipeline/cache/honors_award_YYYY.json   (YYYY = end year of NBA season)

Run:  python pipeline/fetch_honors.py [--offline] [--year 2024]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
AWARD_YEARS = list(range(1997, 2027))  # awards_1997 .. awards_2026
BBREF_AWARDS = "https://www.basketball-reference.com/awards/awards_{year}.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def norm_name(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def award_year_to_season(year: int) -> str:
    """BBRef awards_2024.html covers the 2023-24 NBA season."""
    return f"{year - 1}-{str(year)[-2:]}"


def cache_path(year: int) -> Path:
    return CACHE / f"honors_award_{year}.json"


def fetch_html(url: str) -> str:
    try:
        from curl_cffi import requests as cr
        r = cr.get(url, impersonate="chrome120", headers={"User-Agent": UA}, timeout=60)
        r.raise_for_status()
        return r.text
    except ImportError:
        import urllib.request
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace")


class _TableParser(HTMLParser):
    """Collect rows from the first table after a marker id."""

    def __init__(self, after_id: str):
        super().__init__()
        self.after_id = after_id
        self.seen_id = False
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.row: list[str] = []
        self.rows: list[list[str]] = []
        self._cell = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "span" and attrs_d.get("id") == self.after_id:
            self.seen_id = True
        if self.seen_id and tag == "table" and not self.in_table:
            self.in_table = True
        if self.in_table and tag == "tr":
            self.in_row = True
            self.row = []
        if self.in_row and tag in ("td", "th"):
            self.in_cell = True
            self._cell = []

    def handle_endtag(self, tag):
        if self.in_row and tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            self.row.append(" ".join(self._cell).strip())
        if self.in_table and tag == "tr" and self.in_row:
            self.in_row = False
            if self.row:
                self.rows.append(self.row)
        if self.in_table and tag == "table":
            self.in_table = False

    def handle_data(self, data):
        if self.in_cell:
            self._cell.append(data.strip())


def _html_section(html: str, start: str, end: str) -> str:
    if start not in html:
        return ""
    chunk = html.split(start, 1)[1]
    if end in chunk:
        chunk = chunk.split(end, 1)[0]
    return chunk


_TIER_FROM_TM = {
    "1T": 3, "2T": 2, "3T": 1,
    "1ST": 3, "2ND": 2, "3RD": 1,  # pre-2022 BBRef label in # Tm column
}


def _int_stat_cell(row: str, stat: str) -> int:
    m = re.search(rf'data-stat="{stat}"[^>]*>([^<]*)</td>', row, re.IGNORECASE)
    if not m:
        return 0
    digits = re.sub(r"\D", "", m.group(1))
    return int(digits) if digits else 0


def _tier_from_row(row: str) -> int:
    """All-NBA tier 3/2/1/0 from # Tm code or team-vote columns (legacy pages)."""
    tm_m = re.search(
        r'data-stat="all_nba_team"[^>]*>([^<]+)</t[dh]>', row, re.IGNORECASE)
    tier_code = (tm_m.group(1).strip().upper() if tm_m else "")
    tier = _TIER_FROM_TM.get(tier_code, 0)
    if tier:
        return tier
    f1 = _int_stat_cell(row, "first_team_votes")
    f2 = _int_stat_cell(row, "second_team_votes")
    f3 = _int_stat_cell(row, "third_team_votes")
    if f1 > 0:
        return 3
    if f2 > 0:
        return 2
    if f3 > 0:
        return 1
    return 0


def parse_all_nba_table(html: str) -> list[dict]:
    """All-NBA vote-getters + team tiers from the unified BBRef voting table."""
    chunk = _html_section(html, "All-NBA Teams Table", "All-Defensive Teams Table")
    if not chunk:
        chunk = _html_section(html, 'id="all_leading_all_nba"', "All-Defensive")
    out: list[dict] = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", chunk, re.DOTALL | re.IGNORECASE):
        pm = re.search(
            r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', row, re.IGNORECASE)
        if not pm:
            continue
        name = re.sub(r"\s*\(\d+\)\s*$", "", pm.group(1)).strip()
        if not name or name.lower() in ("player", "rank"):
            continue
        tier = _tier_from_row(row)
        pts_m = re.search(
            r'data-stat="points_won"[^>]*>([^<]*)</td>', row, re.IGNORECASE)
        vote_pts = 0
        if pts_m:
            digits = re.sub(r"\D", "", pts_m.group(1))
            vote_pts = int(digits) if digits else 0
        out.append({
            "name": name,
            "norm": norm_name(name),
            "vote_pts": vote_pts,
            "all_nba_team": tier,
        })
    return out


def parse_all_nba_voting(html: str) -> list[dict]:
    """Backward-compatible alias — returns rows with vote_pts (incl. ORV)."""
    return [r for r in parse_all_nba_table(html) if r["vote_pts"] > 0 or r["all_nba_team"]]


def parse_all_nba_teams(html: str) -> dict[str, int]:
    """norm_name -> team tier (3=1st, 2=2nd, 1=3rd)."""
    return {r["norm"]: r["all_nba_team"] for r in parse_all_nba_table(html) if r["all_nba_team"]}


def parse_all_stars(html: str, award_year: int) -> set[str]:
    """All-Star selections from the awards page or the dedicated ASG page."""
    stars: set[str] = set()
    chunk = _html_section(html, "All-Star Game", "All-Defensive")
    if not chunk:
        chunk = _html_section(html, "All-Star", "Coach of the Year")
    for m in re.finditer(
        r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', chunk, re.IGNORECASE):
        stars.add(norm_name(m.group(1)))
    if stars:
        return stars
    try:
        asg_html = fetch_html(
            f"https://www.basketball-reference.com/allstar/NBA_{award_year}.html")
        for m in re.finditer(
            r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>',
            asg_html, re.IGNORECASE):
            stars.add(norm_name(m.group(1)))
    except Exception:  # noqa: BLE001
        pass
    return stars


def build_year_cache(year: int) -> dict:
    url = BBREF_AWARDS.format(year=year)
    html = fetch_html(url)
    season = award_year_to_season(year)
    table_rows = parse_all_nba_table(html)
    teams = {r["norm"]: r["all_nba_team"] for r in table_rows if r["all_nba_team"]}
    votes = [r for r in table_rows if r["vote_pts"] > 0]
    stars = parse_all_stars(html, year)
    players: dict[str, dict] = {}
    for row in table_rows:
        nn = row["norm"]
        rec = players.setdefault(nn, {
            "name": row["name"], "vote_pts": 0, "all_nba_team": 0, "asg": 0,
        })
        rec["vote_pts"] = max(rec["vote_pts"], row["vote_pts"])
        rec["all_nba_team"] = max(rec["all_nba_team"], row["all_nba_team"])
    for nn in stars:
        rec = players.setdefault(nn, {"name": nn, "vote_pts": 0,
                                      "all_nba_team": 0, "asg": 0})
        rec["asg"] = 1
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": "basketball-reference.com/awards",
        "award_year": year,
        "season": season,
        "complete": True,
        "players": players,
        "vote_getters": len([p for p in players.values() if p["vote_pts"] > 0]),
        "all_nba_selected": sum(1 for p in players.values() if p["all_nba_team"]),
        "all_stars": len(stars),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--refresh", action="store_true",
                    help="re-fetch even when cache file exists")
    ap.add_argument("--year", type=int, default=None)
    args = ap.parse_args()
    years = [args.year] if args.year else AWARD_YEARS

    if args.offline:
        have = [y for y in years if cache_path(y).exists()]
        print(f"cached honor years: {len(have)}/{len(years)}")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    for year in years:
        p = cache_path(year)
        if p.exists() and not args.refresh:
            print(f"award {year}: cached, skipping")
            continue
        try:
            doc = build_year_cache(year)
            p.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
            print(f"award {year} ({doc['season']}): {doc['vote_getters']} vote-getters, "
                  f"{doc['all_nba_selected']} All-NBA, {doc['all_stars']} ASG")
            time.sleep(3.5)  # polite BBRef throttle
        except Exception as e:  # noqa: BLE001
            print(f"award {year}: FAILED ({e})")


if __name__ == "__main__":
    main()
