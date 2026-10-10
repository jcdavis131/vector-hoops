"""Track J fetcher — All-NBA voting, All-NBA teams, All-Star from BBRef.

BBRef awards pages list vote-getters (not just the 15 All-NBA selections),
expanding recognition coverage for honors weighting and the MTNN honors tower.

Writes per-award-year caches:
  pipeline/cache/honors_award_YYYY.json   (YYYY = end year of NBA season)

Run:  python pipeline/fetch_honors.py [--offline] [--year 2024]

Exit codes (ingest.run_fetch): 0 when every year is cached, 2 when any year
failed or (offline) has no cache. A failed year used to print "FAILED" and
the script exited 0 [ingest#7]; it writes nothing now, and the other years
are still fetched.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest import EmptyPayloadError, Failures, FetchError, cache_is_fresh, run_fetch, write_cache
from name_utils import norm_name
from nba_http import retry_call, status_of
from seasons import is_final, season_end_year, season_range

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
# BBRef names an awards page after the season's end year: awards_1997 .. awards_2026.
AWARD_YEARS = [season_end_year(s) for s in season_range()]
BBREF_AWARDS = "https://www.basketball-reference.com/awards/awards_{year}.html"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def award_year_to_season(year: int) -> str:
    """BBRef awards_2024.html covers the 2023-24 NBA season."""
    return f"{year - 1}-{str(year)[-2:]}"


def cache_path(year: int) -> Path:
    return CACHE / f"honors_award_{year}.json"


def fetch_html(url: str) -> str:
    """GET url (curl_cffi when installed, else urllib). FetchError when it never succeeds.

    nba_http.retry_call classifies the failure: a 403 is BlockedError after
    two tries, a 404 is not retried, 429/5xx back off.
    """

    def get() -> str:
        try:
            from curl_cffi import requests as cr
        except ImportError:
            cr = None
        if cr is not None:
            r = cr.get(url, impersonate="chrome120", headers={"User-Agent": UA}, timeout=60)
            r.raise_for_status()
            return r.text
        import urllib.request

        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8", errors="replace")

    return retry_call(get, url)


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
    "1T": 3,
    "2T": 2,
    "3T": 1,
    "1ST": 3,
    "2ND": 2,
    "3RD": 1,  # pre-2022 BBRef label in # Tm column
}


def _int_stat_cell(row: str, stat: str) -> int:
    m = re.search(rf'data-stat="{stat}"[^>]*>([^<]*)</td>', row, re.IGNORECASE)
    if not m:
        return 0
    digits = re.sub(r"\D", "", m.group(1))
    return int(digits) if digits else 0


def _tier_from_row(row: str) -> int:
    """All-NBA tier 3/2/1/0 from # Tm code or team-vote columns (legacy pages)."""
    tm_m = re.search(r'data-stat="all_nba_team"[^>]*>([^<]+)</t[dh]>', row, re.IGNORECASE)
    tier_code = tm_m.group(1).strip().upper() if tm_m else ""
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
        pm = re.search(r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', row, re.IGNORECASE)
        if not pm:
            continue
        name = re.sub(r"\s*\(\d+\)\s*$", "", pm.group(1)).strip()
        if not name or name.lower() in ("player", "rank"):
            continue
        tier = _tier_from_row(row)
        pts_m = re.search(r'data-stat="points_won"[^>]*>([^<]*)</td>', row, re.IGNORECASE)
        vote_pts = 0
        if pts_m:
            digits = re.sub(r"\D", "", pts_m.group(1))
            vote_pts = int(digits) if digits else 0
        out.append(
            {
                "name": name,
                "norm": norm_name(name),
                "vote_pts": vote_pts,
                "all_nba_team": tier,
            }
        )
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
    for m in re.finditer(r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', chunk, re.IGNORECASE):
        stars.add(norm_name(m.group(1)))
    if stars:
        return stars
    # This fallback fetch sat in `except Exception: pass`, so any failed GET
    # left every player of the year at asg=0 in a cache marked complete
    # [health#8]. A 404 is the one expected answer: 1999 had no All-Star Game.
    try:
        asg_html = fetch_html(f"https://www.basketball-reference.com/allstar/NBA_{award_year}.html")
    except FetchError as e:
        if status_of(e.__cause__) == 404:
            return stars
        raise
    for m in re.finditer(r'data-stat="player"[^>]*>\s*<a[^>]*>([^<]+)</a>', asg_html, re.IGNORECASE):
        stars.add(norm_name(m.group(1)))
    return stars


def build_year_cache(year: int) -> dict:
    url = BBREF_AWARDS.format(year=year)
    html = fetch_html(url)
    season = award_year_to_season(year)
    table_rows = parse_all_nba_table(html)
    {r["norm"]: r["all_nba_team"] for r in table_rows if r["all_nba_team"]}
    [r for r in table_rows if r["vote_pts"] > 0]
    stars = parse_all_stars(html, year)
    players: dict[str, dict] = {}
    for row in table_rows:
        nn = row["norm"]
        rec = players.setdefault(
            nn,
            {
                "name": row["name"],
                "vote_pts": 0,
                "all_nba_team": 0,
                "asg": 0,
            },
        )
        rec["vote_pts"] = max(rec["vote_pts"], row["vote_pts"])
        rec["all_nba_team"] = max(rec["all_nba_team"], row["all_nba_team"])
    for nn in stars:
        rec = players.setdefault(nn, {"name": nn, "vote_pts": 0, "all_nba_team": 0, "asg": 0})
        rec["asg"] = 1
    # A held game names 22-26 All-Stars (1997-2024 caches); 2025 and 2026 came
    # back with 15 after the game changed format, missing named All-Stars
    # (Giannis Antetokounmpo, LeBron James 2025). build_honors reads a list
    # under 20 as partial (1 for a listed player, unknown otherwise); the doc
    # says so too, so a refetch does not pass for a full list.
    asg_partial = 0 < len(stars) < 20
    if asg_partial:
        print(f"WARNING {year}: only {len(stars)} All-Stars parsed; marked asg_partial")
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
        "asg_partial": asg_partial,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--refresh", action="store_true", help="re-fetch even when cache file exists")
    ap.add_argument("--year", type=int, default=None)
    args = ap.parse_args()
    years = [args.year] if args.year else AWARD_YEARS

    if args.offline:
        have = [y for y in years if cache_path(y).exists()]
        print(f"cached honor years: {len(have)}/{len(years)}")
        if len(have) < len(years):
            raise FetchError(f"no honors cache for award years {[y for y in years if y not in have]}")
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    failures = Failures("fetch_honors")
    for year in years:
        p = cache_path(year)
        season = award_year_to_season(year)
        if not args.refresh and cache_is_fresh(p, season):
            print(f"award {year}: cached, skipping")
            continue
        try:
            doc = build_year_cache(year)
            write_cache(p, doc, source=doc["source"], n_rows=len(doc["players"]), season=season)
        except EmptyPayloadError as e:
            if is_final(season):
                failures.add(str(year), e)
            else:
                print(f"award {year}: no honors yet for {season}; nothing cached")
            continue
        except FetchError as e:
            failures.add(str(year), e)
            continue
        print(
            f"award {year} ({doc['season']}): {doc['vote_getters']} vote-getters, "
            f"{doc['all_nba_selected']} All-NBA, {doc['all_stars']} ASG"
        )
        time.sleep(3.5)  # polite BBRef throttle
    failures.raise_if_any()


if __name__ == "__main__":
    run_fetch(main, name="fetch_honors")
