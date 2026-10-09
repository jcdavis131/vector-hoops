"""Is the real input there? One answer per context builder, so no rebuild trains on a fixture.

Why this exists [orchestration#1, training#5, ingest#5]. train.sh and
rebuild_all.py ran build_wide_skills, build_pedigree and build_playoffs with
--fixture, and export_assets ran build_game_ratings with --fixture, so a
production rebuild replaced real training inputs with the committed
*.example.json test fixtures. Measured 2026-10-09 with --out-root into a
scratch dir: the draft fixture covers 112 of 12,966 rows (0.86%, under
integrate_context's 1% gate, so the 7 pedigree columns are deleted), the
playoffs fixture 8 appearances against 5,950 real, and the wide-skills
fixture 18 labelled rows against 5,154 real.

Dropping --fixture is not enough on its own. build_wide_skills,
build_playoffs, build_honors and build_game_ratings each fall back to their
fixture by themselves when they find no real cache, and exit 0. Changing
those builders is a separate fix (and build_game_ratings' fallback runs
inside integrate_context, i.e. inside the herdmux climb's prepare chain), so
the orchestrators ask here first and refuse, or skip, instead.

Each function returns None when the real input is present, or a message
saying what is missing and how to get it. Cheap: globs, plus reading the
wide-skills season docs (13 files, ~1.7 MB) for their `proxy` flag.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DATA = ROOT / "pipeline" / "data"

OPERATOR = "on an operator machine (stats.nba.com blocks datacenter IPs)"


def _matching(directory: Path, glob: str, pattern: str) -> list[Path]:
    rx = re.compile(pattern)
    return sorted(p for p in directory.glob(glob) if rx.fullmatch(p.name))


def wide_skills() -> str | None:
    """build_wide_skills: per-season synergy/hustle caches, none of them proxies.

    wide_skills_2013-14.json and wide_skills_2014-15.json are `proxy: true`
    docs written by fetch_missing_tracking.py with constants (post_ppp 0.9,
    trans_ppp 1.15, d_fg_pct 0.45) and formula stand-ins, not measurements
    [ingest#5]. build_wide_skills.load_caches reads every wide_skills_*.json
    with no per-doc check, so building now would put those two docs' 973
    player records into wide_skill_labels.npz, which train_mtnn uses as
    skill targets.
    """
    docs = _matching(CACHE, "wide_skills_*.json", r"wide_skills_\d{4}-\d{2}\.json")
    if not docs:
        return f"no pipeline/cache/wide_skills_<season>.json; run pipeline/fetch_wide_skills.py {OPERATOR}"
    proxies = [p.name for p in docs if json.loads(p.read_text(encoding="utf-8")).get("proxy")]
    if proxies:
        return (
            f"{', '.join(proxies)} are proxy docs (constants and formula stand-ins, not measurements "
            "[ingest#5]); build_wide_skills would write them into wide_skill_labels.npz. "
            "Remove or quarantine them, or make build_wide_skills skip proxy docs, first"
        )
    return None


def draft_history() -> str | None:
    """build_pedigree: the draft cache (the builder itself also refuses without it)."""
    if not (CACHE / "draft_history.json").exists():
        return f"no pipeline/cache/draft_history.json; run pipeline/fetch_draft_history.py {OPERATOR}"
    return None


def playoffs() -> str | None:
    """build_playoffs: per-season playoff caches (same pattern as nba_http.real_playoff_cache_paths)."""
    if not _matching(CACHE, "playoffs_*.json", r"playoffs_\d{4}-\d{2}\.json"):
        return f"no pipeline/cache/playoffs_<season>.json; run pipeline/fetch_playoffs.py {OPERATOR}"
    return None


def honors() -> str | None:
    """build_honors: per-year award caches (same pattern as build_honors.real_honor_cache_paths)."""
    if not _matching(CACHE, "honors_award_*.json", r"honors_award_\d{4}\.json"):
        return f"no pipeline/cache/honors_award_<year>.json; run pipeline/fetch_honors.py {OPERATOR}"
    return None


def gamelogs() -> str | None:
    """roster/form/availability/career/competition context and current rosters: VH-101 game logs."""
    if not _matching(DATA, "gamelogs_*.jsonl", r"gamelogs_\d{4}-\d{2}\.jsonl"):
        return f"no pipeline/data/gamelogs_<season>.jsonl; run pipeline/fetch_gamelogs.py {OPERATOR}"
    return None


def team_season() -> str | None:
    """competition_context and derive_system_tags: merged team-season tables."""
    if not _matching(DATA, "team_season_*.json", r"team_season_\d{4}-\d{2}\.json"):
        return (
            "no pipeline/data/team_season_<season>.json; run pipeline/fetch_team_season.py --offline "
            "(after pipeline/import_team_season_cache.py if the team caches are missing)"
        )
    return None


def game_ratings() -> str | None:
    """build_game_ratings: a release cache that is not the example fixture.

    Not a name check: `fetch_2k_ratings.py --offline`, which CI and
    `make offline` run, copies game_ratings.example.json to
    game_ratings_2k25.json byte for byte.
    """
    fixture = CACHE / "game_ratings.example.json"
    fixture_bytes = fixture.read_bytes() if fixture.exists() else None
    real = [p for p in CACHE.glob("game_ratings_*.json") if p.read_bytes() != fixture_bytes]
    if not real:
        return (
            "no real pipeline/cache/game_ratings_<release>.json (only the example fixture or a byte copy of it); "
            "an operator scrape is the only source"
        )
    return None


def all_of(*checks: Callable[[], str | None]) -> Callable[[], str | None]:
    """A check that fails with every message its parts fail with."""

    def check() -> str | None:
        msgs = [m for m in (c() for c in checks) if m]
        return "; ".join(msgs) or None

    return check
