"""Stage 1 — ingest audit: inventory pipeline/cache/ without fetching.

Read-only. Counts files per family, seasons covered, and flags each
family's license posture per FREE_SOURCES.md. BBRef-fed families are
flagged BARRED-for-training (Sports Reference Terms §5 item 11) and
NBA-origin families NEEDS PERMISSION; neither flag is cleared by this
audit. Output: mlops-v2/out/ingest/cache_audit.json
"""
from __future__ import annotations

import json
import re
from collections import Counter

from .common import CACHE, OUT, provenance, write_json

# (cache filename prefix, family, posture, note)
FAMILIES = [
    ("base_", "game base (NBA leaguedash)", "NEEDS PERMISSION", ""),
    ("dashbase_", "game base dashboard", "NEEDS PERMISSION", ""),
    ("dashadvanced_", "advanced dashboard", "NEEDS PERMISSION", ""),
    ("dashscoring_", "scoring dashboard", "NEEDS PERMISSION", ""),
    ("bio_", "bio", "NEEDS PERMISSION", ""),
    ("tracking_", "tracking 2013-14+", "NEEDS PERMISSION",
     "pre-2013 structural gap, masked, never backfilled"),
    ("wide_skills_", "hustle / wide skills", "NEEDS PERMISSION",
     "hustle era from 2016-17; box-outs from 2017-18"),
    ("bbref_per_game_", "BBRef per-game aggregates", "BARRED for training",
     "SRL §5 item 11; aggregate cross-check only, never a gamelog substitute"),
    ("bbref_advanced_", "BBRef advanced", "BARRED for training",
     "SRL §5 item 11"),
    ("team_base_", "team base", "NEEDS PERMISSION", "30/30 seasons"),
    ("team_advanced_", "team advanced", "NEEDS PERMISSION", "30/30 seasons"),
    ("playoffs_", "playoff aggregates", "NEEDS PERMISSION",
     "inputs present 30/30; playoff-stat build + permission still owed"),
    ("playoff_games_", "playoff games", "NEEDS PERMISSION", "30/30 seasons"),
    ("honors_award_", "honors award lists (BBRef-fed)",
     "BARRED for training as-is",
     "replaceable from Wikipedia award lists (CC BY-SA 4.0); semantics open"),
    ("draft_history", "draft history", "UNVERIFIED provenance",
     "provenance-ledger check owed before training use; BBRef draft KILLED"),
    ("salaries_history", "salary history composite", "NO SOURCE (bulk)",
     "unattributed composite; BBRef backfill BARRED for training"),
    ("salaries_merged", "salaries merged", "NO SOURCE (bulk)", ""),
    ("totals_", "official totals minutes", "NEEDS PERMISSION",
     "per-season files under official_totals/"),
    ("matchup_enriched", "matchup enriched", "NEEDS PERMISSION", ""),
    ("positions_bbref", "positions (BBRef)", "BARRED for training",
     "SRL §5 item 11"),
]

SEASON_RE = re.compile(r"(\d{4}-\d{2})")


def run():
    all_files = sorted(p for p in CACHE.rglob("*") if p.is_file())
    files = [p.name for p in all_files]
    total_bytes = sum(p.stat().st_size for p in all_files)
    by_family = {}
    matched = set()
    for prefix, family, posture, note in FAMILIES:
        hits = [f for f in files if f.startswith(prefix)]
        seasons = sorted({m.group(1) for f in hits
                          for m in (SEASON_RE.search(f),) if m})
        if family.startswith("honors award"):
            # Bare award years (1997..2026), not YYYY-YY seasons.
            seasons = sorted({re.search(r"(\d{4})", f).group(1)
                              for f in hits})
        by_family[family] = {
            "files": len(hits), "seasons": seasons,
            "season_count": len(seasons), "posture": posture, "note": note,
        }
        matched.update(hits)
    unmatched = [f for f in files if f not in matched]
    # Gamelog gap: the single blocking fetch.
    gamelogs = [f for f in files if f.startswith("gamelogs_")]
    pbp_dir = CACHE / "cdn_pbp"
    pbp = sorted(p.name for p in pbp_dir.iterdir()) if pbp_dir.exists() else []
    audit = {
        "stage": "ingest/cache-audit",
        "cache_files": len(files),
        "cache_bytes": total_bytes,
        "families": by_family,
        "unmatched_files": len(unmatched),
        "unmatched_sample": unmatched[:20],
        "gamelog_files_present": gamelogs,
        "gamelog_gap": "BLOCKED: 11 JSONLs 2015-16..2025-26 absent; "
                      "fetch must run on an operator machine",
        "pbp_cached_games": pbp,
        "pbp_note": "5 games only (2.2 MB). Full PBP is ~17.5 GB and "
                    "must NOT move through git; transport decision owed.",
        "provenance": provenance(
            "pipeline/cache/ (on-disk, pre-existing)",
            "mixed: see per-family posture; NO family cleared for training "
            "by this audit",
            "read-only inventory; no network, no fetch",
            "Legal read still owed before any BBRef-fed training. "
            "Partner-permissioning claim recorded as UNVERIFIED."),
    }
    write_json(OUT / "ingest" / "cache_audit.json", audit)
    print(f"cache: {len(files)} files, {total_bytes / 1048576:.1f} MiB")
    for fam, v in by_family.items():
        print(f"  {fam}: {v['files']} files, {v['season_count']} seasons, "
              f"{v['posture']}")
    print(f"  gamelogs present: {len(gamelogs)} (need 11) — BLOCKED")
    print(f"  pbp cached games: {len(pbp)}")
    return audit


if __name__ == "__main__":
    run()
