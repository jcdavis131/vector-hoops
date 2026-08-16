"""Track H fetcher — full NBA draft history in one stats.nba.com call.

Writes pipeline/cache/draft_history.json:

  {
    "built": "YYYY-MM-DD",
    "source": "stats.nba.com drafthistory via nba_api",
    "complete": true,          # full-history pull -> absence implies undrafted
    "years": [1947, 2025],
    "players": {
      "<norm_name>": [          # LIST — names collide across eras
        {"year": 2003, "round": 1, "pick": 1, "overall": 1,
         "team_id": 1610612739, "team_abbr": "CLE", "person_id": 2544},
        ...
      ]
    }
  }

The committed draft_history.example.json fixture has the same shape with
"complete": false (a handful of hand-checked picks) so build_pedigree.py
and test_pedigree.py exercise the join without claiming full coverage —
absence in an incomplete cache masks the family instead of implying
"undrafted".

Run:  python pipeline/fetch_draft_history.py [--offline]
Requires network to stats.nba.com. Install ``curl_cffi`` on operator
machines — Akamai blocks plain ``requests`` / ``nba_api`` TLS fingerprints:

  pip install curl_cffi
  python pipeline/fetch_draft_history.py

One request, no per-season loop, standard retry/backoff.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nba_http import fetch_stats_json, legacy_result_set_rows

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
OUT = CACHE / "draft_history.json"


def norm_name(name: str) -> str:
    """Documented join convention (DATA_SOURCES_DEEP.md): accent-strip +
    lowercase + drop punctuation + trim suffixes. Accent folding matters
    here because stats.nba.com draft names are unaccented ("Nikola Jokic")
    while vectors.json carries accents ("Nikola Jokić")."""
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[.'’-]", "", s.lower())
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def fetch_all_drafts() -> list[dict]:
    payload = fetch_stats_json("drafthistory", {"LeagueID": "00"}, timeout=90)
    return legacy_result_set_rows(payload, "DraftHistory")


def to_cache(rows: list[dict]) -> dict:
    players: dict[str, list[dict]] = defaultdict(list)
    years: list[int] = []
    for r in rows:
        name = r.get("PLAYER_NAME")
        overall = r.get("OVERALL_PICK")
        year = r.get("SEASON")
        if not name or overall in (None, "", 0) or year in (None, ""):
            continue
        years.append(int(year))
        players[norm_name(str(name))].append(
            {
                "year": int(year),
                "round": int(r.get("ROUND_NUMBER") or 0),
                "pick": int(r.get("ROUND_PICK") or 0),
                "overall": int(overall),
                "team_id": int(r.get("TEAM_ID") or 0),
                "team_abbr": str(r.get("TEAM_ABBREVIATION") or ""),
                "person_id": int(r.get("PERSON_ID") or 0),
            }
        )
    for recs in players.values():
        recs.sort(key=lambda x: x["year"])
    return {
        "built": time.strftime("%Y-%m-%d"),
        "source": "stats.nba.com drafthistory via nba_api",
        "complete": True,
        "years": [min(years), max(years)] if years else None,
        "players": dict(players),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--offline",
        action="store_true",
        help="verify the existing cache only; no network",
    )
    args = ap.parse_args()

    if args.offline:
        if not OUT.exists():
            raise SystemExit("no draft_history.json cache and --offline set")
        doc = json.loads(OUT.read_text(encoding="utf-8"))
        print(
            f"cache ok: {len(doc['players'])} drafted names, years {doc.get('years')}, complete={doc.get('complete')}"
        )
        return

    rows = fetch_all_drafts()
    doc = to_cache(rows)
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    n_recs = sum(len(v) for v in doc["players"].values())
    print(f"wrote {OUT.name}: {n_recs} picks, {len(doc['players'])} names, years {doc['years']}")


if __name__ == "__main__":
    main()
