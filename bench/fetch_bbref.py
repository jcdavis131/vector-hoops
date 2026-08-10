"""Fetch Basketball-Reference advanced + per-game season tables into pipeline/cache.

Real-data fetcher for the vector-bench hoops lane. Writes two cache families,
following the repo convention established by pipeline/fetch_bbref_advanced.py:

  pipeline/cache/bbref_advanced_{season}.json
      { "<norm_name>": {"per": float, "ws": float, "ws_per_48": float,
                        "bpm": float, "obpm": float, "dbpm": float,
                        "vorp": float, "usg_pct": float, "games": float,
                        "mp": float}, ... }

  pipeline/cache/bbref_per_game_{season}.json
      { "<norm_name>": {"pts_per_g": float, "trb_per_g": float,
                        "ast_per_g": float, "games": float,
                        "mp_per_g": float}, ... }

Parsing is scoped to the REGULAR-SEASON table only (id="advanced" /
id="per_game_stats"; the *_post playoff tables on the same page are ignored).
For traded players Basketball-Reference lists the combined 2TM/3TM (older:
TOT) row first; the first occurrence per player wins, so season aggregates are
used. Names that normalize to the same key within one season are DROPPED from
that season's cache (ambiguous join) and counted in stderr — never guessed.

Rate-limited (3.5 s/request, well under BBRef's 20 req/min policy), resumable
(a season with >= 50 cached rows is skipped), parse-and-discard (raw HTML is
never stored).

Run:
  python bench/fetch_bbref.py                 # all seasons 1996-97 .. 2025-26
  python bench/fetch_bbref.py --season 2023-24
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scout/1.0 (research; MLOps)"
DELAY_S = 3.5

ADV_KEYS = ("per", "ws", "ws_per_48", "bpm", "obpm", "dbpm", "vorp", "usg_pct", "games", "mp")
PG_KEYS = ("pts_per_g", "trb_per_g", "ast_per_g", "games", "mp_per_g")

TABLES = {
    "advanced": ("advanced", "bbref_advanced_{season}.json", ADV_KEYS),
    "per_game": ("per_game_stats", "bbref_per_game_{season}.json", PG_KEYS),
}

_CELL_RE = re.compile(r'<t[dh][^>]*data-stat="([a-z_0-9]+)"[^>]*>(.*?)</t[dh]>', flags=re.S)
_TAG_RE = re.compile(r"<[^>]+>")


def norm_name(name: str) -> str:
    """Accent-strip, lowercase, drop suffixes and non-alphanumerics.

    Identical to pipeline/fetch_bbref_advanced.py::norm_name so both cache
    families join the same way.
    """
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".", "").rstrip().endswith(suffix):
            s = s.replace(".", "").rstrip()
            s = s[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]", "", s)


def season_url(season: str, page: str) -> str:
    end_year = int(season[:4]) + 1
    return f"https://www.basketball-reference.com/leagues/NBA_{end_year}_{page}.html"


def parse_table(html: str, table_id: str, keys: tuple[str, ...]) -> dict[str, dict[str, float]]:
    """Parse one bbref stats table into norm_name -> {stat: value}."""
    m = re.search(rf'<table[^>]*id="{table_id}"[^>]*>(.*?)</table>', html, flags=re.S)
    if not m:
        # BBRef sometimes comment-wraps tables; retry with comments stripped.
        stripped = html.replace("<!--", "").replace("-->", "")
        m = re.search(rf'<table[^>]*id="{table_id}"[^>]*>(.*?)</table>', stripped, flags=re.S)
    if not m:
        print(f"[warn] table id={table_id!r} not found", file=sys.stderr)
        return {}
    body = m.group(1)
    out: dict[str, dict[str, float]] = {}
    dupes: set[str] = set()
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", body, flags=re.S):
        cells = {}
        for stat, raw in _CELL_RE.findall(row):
            cells[stat] = _TAG_RE.sub("", raw).strip()
        name = cells.get("name_display") or cells.get("player") or ""
        if not name or name == "Player":
            continue
        key = norm_name(name)
        if key in out:
            # First occurrence is the combined 2TM/3TM/TOT row for traded
            # players; later per-team partials for the SAME player are the
            # expected duplicates and are skipped. A different player mapping
            # to the same key is an ambiguous join -> drop the key entirely.
            if out[key].get("_name") != name:
                dupes.add(key)
            continue
        rec: dict[str, float] = {"_name": name}
        ok = False
        for k in keys:
            v = cells.get(k, "")
            try:
                rec[k] = float(v)
                ok = True
            except ValueError:
                rec[k] = float("nan")
        if ok:
            out[key] = rec
    for key in dupes:
        out.pop(key, None)
    if dupes:
        print(f"[info] dropped {len(dupes)} ambiguous name(s): {sorted(dupes)[:5]}...", file=sys.stderr)
    for rec in out.values():
        rec.pop("_name", None)
    return out


def fetch_one(season: str, table: str) -> dict[str, dict[str, float]]:
    table_id, fname_tpl, keys = TABLES[table]
    cpath = CACHE / fname_tpl.format(season=season)
    if cpath.exists():
        try:
            data = json.loads(cpath.read_text())
            if len(data) >= 50:
                print(f"skip {season} {table}: cache hit {len(data)} rows")
                return data
        except Exception:
            pass
    page = "advanced" if table == "advanced" else "per_game"
    url = season_url(season, page)
    print(f"fetch {season} {table} -> {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"[error] fetch {season} {table} failed: {e}", file=sys.stderr)
        return {}
    data = parse_table(html, table_id, keys)
    if data:
        CACHE.mkdir(parents=True, exist_ok=True)
        cpath.write_text(json.dumps(data, indent=1, sort_keys=True))
        print(f"wrote {cpath.name} rows={len(data)}")
    time.sleep(DELAY_S)
    return data


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--season", help="Single season like 2023-24 (default: all 1996-97..2025-26)")
    args = ap.parse_args()
    seasons = [args.season] if args.season else [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]
    n_fail = 0
    for s in seasons:
        for table in ("advanced", "per_game"):
            data = fetch_one(s, table)
            if not data:
                n_fail += 1
    print(f"done: {len(seasons)} season(s) x 2 tables, {n_fail} failures")
    if n_fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
