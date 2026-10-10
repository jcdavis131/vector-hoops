"""Vector Hoops pipeline v2: multi-source NBA player-season data ->
era-normalized statistical-profile vectors -> PCA map + named archetypes
-> one static vectors.json the game serves with zero backend, PLUS a wide
training matrix for the multi-tower embedding net (train_towers.py).

Design (deliberate, documented):
- Per-100-possession rates from the source = pace-adjusted at the door.
- Era normalization: z-score every feature WITHIN its season -- every
  player is "sigmas vs their own era," so 1997 centers and 2026 guards
  share one honest space.
- The GAME vector stays the transparent 14-dim profile (unchanged
  contract with assets/game.js). The WIDE matrix adds Advanced,
  shot-mix (Scoring), bio, player-tracking (2013-14+), and salary
  features with availability masks -- fuel for the learned embedding v2.
- PCA(3) for the 3D map; k-means archetypes named from centroids.

Data sources (each cached under pipeline/cache/, resumable):
  1. stats.nba.com leaguedashplayerstats  Base / Advanced / Scoring
  2. stats.nba.com leaguedashplayerbiostats  (height, weight, age, draft)
  3. stats.nba.com leaguedashptstats  (tracking: drives, touches,
     catch-and-shoot, pull-ups, speed/distance -- 2013-14 onward only;
     masked before that. Honest: no imputation of unmeasured eras.)
  4. Salary (pipeline/fetch_salaries.py + merge_salaries.py):
       a. pipeline/cache/salaries_history.csv drop-in (name,season,salary)
          -- full-history file (Kaggle/hoopshype export); validate/merge via
          merge_salaries.py -> salaries_merged.json (preferred at join).
       b. basketball-reference.com/contracts/players.html -- current
          contracts, fills the most recent seasons when (a) is absent.
     Salary becomes log-salary z-scored within season + a mask column.

Cleaning applied (all guaranteed, audited by end-of-build assertions):
  - player-season eligibility: schedule-aware GP + total minutes (see
    pipeline/eligibility.py) — drops small-sample per-100 outliers
  - dedupe on (PLAYER_ID, season) keeping the row with most minutes
  - NaN/None -> season mean (z = 0) with per-feature missing masks
  - empirical-Bayes shrinkage of FG3_PCT / FT_PCT / FG_PCT toward the
    season mean, weighted by attempts (kills 1-attempt 100% noise)
  - z-clip at +/-4 sigma

Run:  python pipeline/build_vectors.py            (full build)
      python pipeline/build_vectors.py --offline  (rebuild from cache only)
stats.nba.com throttles aggressively; the fetcher retries with long
backoff and every season/endpoint is cached, so re-running resumes.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from artifact_io import atomic_savez_compressed, atomic_write_text
from hustle_coverage import honest_players
from eligibility import (
    DEFAULT_MIN_GP,
    DEFAULT_MIN_TOTAL_MINUTES,
    gates_for_season,
)
from eligibility import (
    season_eligible as check_eligible,
)
from ingest import FetchError, cache_is_fresh, require_columns, run_fetch, write_cache
from name_utils import canonical_name, norm_name
from nba_http import fetch_stats_json, legacy_result_set_rows, patch_nba_api_session, retry_call
from seasons import HUSTLE_FIRST_SEASON, TRACKING_FIRST_SEASON, is_regular_season, season_range

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "vectors.json"
CACHE = ROOT / "pipeline" / "cache"
DATA_DIR = ROOT / "pipeline" / "data"

SEASONS = season_range()  # FIRST_SEASON..LAST_SEASON, pipeline/seasons.py
# Eligibility gates live in pipeline/eligibility.py (schedule-aware GP + minutes).

# ---------------------------------------------------------------------------
# Feature groups. GAME_FEATURES is the frozen 14-dim game contract
# (order matters: assets/game.js indexes into it). WIDE adds everything else.
# ---------------------------------------------------------------------------

GAME_FEATURES = [
    "PTS",
    "AST",
    "OREB",
    "DREB",
    "STL",
    "BLK",
    "TOV",
    "FG3A",
    "FGA",
    "FTA",
    "FG3_PCT",
    "FG_PCT",
    "FT_PCT",
    "PLUS_MINUS",
]
LABELS = {
    "PTS": "scoring volume",
    "AST": "playmaking",
    "OREB": "offensive glass",
    "DREB": "defensive glass",
    "STL": "steals",
    "BLK": "rim protection",
    "TOV": "turnovers",
    "FG3A": "three-point volume",
    "FGA": "shot volume",
    "FTA": "rim pressure (FTs)",
    "FG3_PCT": "three-point accuracy",
    "FG_PCT": "finishing",
    "FT_PCT": "free-throw touch",
    "PLUS_MINUS": "on-court impact",
}

# Desired columns per extra endpoint; intersected with what the API returns
# so column drift never crashes a build (actual set recorded in the manifest).
ADVANCED_COLS = [
    "TS_PCT",
    "EFG_PCT",
    "USG_PCT",
    "AST_PCT",
    "AST_TO",
    "OREB_PCT",
    "DREB_PCT",
    "REB_PCT",
    "TM_TOV_PCT",
    "OFF_RATING",
    "DEF_RATING",
    "NET_RATING",
    "PACE",
    "PIE",
]
SCORING_COLS = [
    "PCT_PTS_2PT",
    "PCT_PTS_2PT_MR",
    "PCT_PTS_3PT",
    "PCT_PTS_FB",
    "PCT_PTS_FT",
    "PCT_PTS_OFF_TOV",
    "PCT_PTS_PAINT",
    "PCT_AST_2PM",
    "PCT_UAST_2PM",
    "PCT_AST_3PM",
    "PCT_UAST_3PM",
    "PCT_AST_FGM",
    "PCT_UAST_FGM",
]
BIO_COLS = ["PLAYER_HEIGHT_INCHES", "PLAYER_WEIGHT", "AGE", "DRAFT_NUMBER"]
# Undrafted as its own observed fact. fetch_bio wrote DRAFT_NUMBER 61.0 for any
# value that was not a number ("Undrafted"), so 2,850 cached player-seasons
# carried an invented pick one past the last real one: z-scored as a pick, it
# ranked undrafted players above the 27 real late-round picks still in the
# data (63 to 165: Kevin Gamble 63, Mario Elie 160, Charles Jones 165). All
# 2,850 are absent from the complete draft history (person_id), and no
# drafted player sat at 61. Now the pick is missing for them and
# DRAFT_UNDRAFTED is 1; a drafted player has his pick and 0.
BIO_UNDRAFTED = "DRAFT_UNDRAFTED"

# Which columns each wide source may contribute to a player-season row.
#
# advanced/scoring arrive from fetch_dash with an explicit column list, so they
# are already held to their contract by the fetch itself and need no entry here.
# fetch_bio has no such list: it returns whatever pipeline/cache/bio_*.json
# holds, and those files have since gained ten keys nobody declared --
# combine_method, combine_source, wingspan_in, standing_reach_in,
# vertical_max_in, vertical_max, wingspan, standing_reach, vertical_standing_in,
# pos_used.
#
# Two of those are strings and abort the float cast in the matrix build, which
# is the visible half of the problem. The other eight are the dangerous half,
# precisely because they do NOT abort: they are synthetic. fetch_combine.py:154
# built wingspan from "inches + 4.5 + deterministic jitter"; fetch_missing_
# combine.py:9 used "height*1.07 + pos_adj + bounded_noise" (both paths deleted
# 2026-10-09 [health#5]; the contract stays as defense in depth). Unfiltered, the
# next rebuild widens the bio tower from 4 columns to 11 with fabricated
# measurements, and audit_features.py's whole rationale is that a family's width
# is its fusion share. A source is entitled to its contract, not to its cache.
SOURCE_CONTRACTS: dict[str, frozenset[str]] = {"bio": frozenset([*BIO_COLS, BIO_UNDRAFTED])}

# Identity columns, never features.
_NEVER_FEATURES = ("PLAYER_ID", "PLAYER_NAME")


def source_columns(name: str, record: dict) -> dict:
    """The subset of `record` that source `name` is allowed to contribute."""
    allowed = SOURCE_CONTRACTS.get(name)
    return {k: v for k, v in record.items() if k not in _NEVER_FEATURES and (allowed is None or k in allowed)}


TRACKING_SPECS = [  # (pt_measure_type, wanted columns)
    ("SpeedDistance", ["DIST_MILES", "AVG_SPEED"]),
    ("Drives", ["DRIVES", "DRIVE_PTS", "DRIVE_PASSES"]),
    ("CatchShoot", ["CATCH_SHOOT_FGA", "CATCH_SHOOT_PTS", "CATCH_SHOOT_FG3_PCT"]),
    ("PullUpShot", ["PULL_UP_FGA", "PULL_UP_PTS"]),
    (
        "Possessions",
        [
            "TOUCHES",
            "FRONT_CT_TOUCHES",
            "TIME_OF_POSS",
            "AVG_SEC_PER_TOUCH",
            "PAINT_TOUCHES",
            "POST_TOUCHES",
            "ELBOW_TOUCHES",
        ],
    ),
    ("Passing", ["PASSES_MADE", "POTENTIAL_AST", "SECONDARY_AST"]),
]

# tracking_*.json rows used to be copied into the matrix row key by key, so
# the TRACKING_SPECS lists were enforced only when this script fetched. A
# file written by anything else joined the tracking family whole:
# fetch_advanced_tracking.py wrote every response column (`rec[k.lower()] =
# v`: player_name, team_abbreviation, gp, min, ...) into the same files
# [ingest#11]. The 13 caches hold exactly these 20 keys today (checked
# 2026-10-09), so the filter changes nothing in the current matrix.
SOURCE_CONTRACTS["tracking"] = frozenset(c for _, cols in TRACKING_SPECS for c in cols)

# Tower families for train_towers.py (feature name -> family).
FAMILY_OF = {}
for f in ["PTS", "FGA", "FTA", "FG3A", "USG_PCT"]:
    FAMILY_OF[f] = "volume"
for f in [
    "AST",
    "TOV",
    "AST_PCT",
    "AST_TO",
    "TM_TOV_PCT",
    "PASSES_MADE",
    "POTENTIAL_AST",
    "SECONDARY_AST",
    "TOUCHES",
    "FRONT_CT_TOUCHES",
    "TIME_OF_POSS",
    "AVG_SEC_PER_TOUCH",
]:
    FAMILY_OF[f] = "playmaking"
for f in ["OREB", "DREB", "OREB_PCT", "DREB_PCT", "REB_PCT"]:
    FAMILY_OF[f] = "rebounding"
for f in ["STL", "BLK", "DEF_RATING"]:
    FAMILY_OF[f] = "defense"
# Real hustle-tracking defense (fetch_wide_skills.py, stats.nba.com,
# 2015-16+ only -- masked pre-2015-16, never fabricated). Previously only
# fed the skill-grade display + motor/disruption_gravity/rim_gravity
# skill-tower targets, never the tower inputs that shape the embedding.
HUSTLE_FEATURES = [
    "HUSTLE_DEFLECTIONS",
    "HUSTLE_LOOSE_BALLS",
    "HUSTLE_CHARGES",
    "HUSTLE_BOX_OUTS",
    "HUSTLE_SCREEN_AST",
    "HUSTLE_CONTESTED_SHOTS",
    "HUSTLE_D_FG_PCT",
]
for f in HUSTLE_FEATURES:
    FAMILY_OF[f] = "defense"
for f in [
    "FG3_PCT",
    "FG_PCT",
    "FT_PCT",
    "TS_PCT",
    "EFG_PCT",
    "PIE",
    "OFF_RATING",
    "NET_RATING",
    "PLUS_MINUS",
    "PACE",
]:
    FAMILY_OF[f] = "efficiency"
for f in SCORING_COLS:
    FAMILY_OF[f] = "shotmix"
for f in [
    "DIST_MILES",
    "AVG_SPEED",
    "DRIVES",
    "DRIVE_PTS",
    "DRIVE_PASSES",
    "CATCH_SHOOT_FGA",
    "CATCH_SHOOT_PTS",
    "CATCH_SHOOT_FG3_PCT",
    "PULL_UP_FGA",
    "PULL_UP_PTS",
    "PAINT_TOUCHES",
    "POST_TOUCHES",
    "ELBOW_TOUCHES",
]:
    FAMILY_OF[f] = "tracking"
for f in [*BIO_COLS, BIO_UNDRAFTED]:
    FAMILY_OF[f] = "bio"
FAMILY_OF["SALARY_LOG"] = "market"
# Form features derived from local per-game logs (pipeline/data/gamelogs_*.jsonl)
FORM_FEATURES = [
    "FORM_VOL",
    "FORM_CEIL",
    "FORM_DD_RATE",
    "FORM_TD_RATE",
    "FORM_GP",
    "FORM_MIN_AVG",
]
for f in FORM_FEATURES:
    FAMILY_OF[f] = "form"
# Within-season trajectory, from the same per-game logs. The form family asks
# "how good, how steady"; shape asks "which direction, and when" -- two
# player-seasons with identical FORM_* can be a rookie earning minutes all year
# and a veteran losing them, and nothing in the other 18 towers separates them.
SHAPE_FEATURES = [
    "SHAPE_PTS_H2H1",
    "SHAPE_REB_H2H1",
    "SHAPE_MIN_SLOPE",
    "SHAPE_PEAK_POS",
]
for f in SHAPE_FEATURES:
    FAMILY_OF[f] = "shape"

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


# ---------------------------------------------------------------------------
# Cached fetch layer
# ---------------------------------------------------------------------------


def cache_path(tag: str, season: str) -> Path:
    return CACHE / f"{tag}_{season}.json"


# Older cache drops used short tags (e.g. base_1996-97.json); current code
# writes dashbase_*.json. Accept both so offline rebuilds resume honestly.
_CACHE_ALIASES = {
    "dashbase": "base",
    "dashadvanced": "advanced",
    "dashscoring": "scoring",
}


def _cached_file(tag: str, season: str) -> Path | None:
    """The file load_cached reads for (tag, season): the current name, else its legacy alias."""
    for t in (tag, _CACHE_ALIASES.get(tag)):
        if t and cache_path(t, season).exists():
            return cache_path(t, season)
    return None


def load_cached(tag: str, season: str):
    p = _cached_file(tag, season)
    if p is None:
        return None
    # A file that did not decode used to `return None` here, so a corrupt
    # dashbase cache made its season "missing" and a corrupt advanced,
    # scoring, bio or tracking cache masked that family with no message at
    # all [health#8]. pipeline/cache is git-tracked, so the fix is a restore.
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"{p}: cache does not decode ({e}); restore it from git, or delete it to refetch") from e
    # Legacy base_*.json caches are name-keyed dicts without MIN/GP;
    # treat as a miss so online runs refetch dashbase_* rows.
    if tag.startswith("dash") and isinstance(data, dict):
        return None
    # The old fetch_dash cached an empty response as '[]', and later runs read
    # it as a season with no players [ingest#8]. Empty is a miss.
    if not data:
        print(f"  {p.name}: empty cache, treated as missing")
        return None
    return data


def _keep_cached(tag: str, season: str, offline: bool) -> bool:
    """Read the cache rather than fetch: always offline; online only while it is fresh.

    A season whose playoffs are over keeps its cache as before. A season
    still being played is refetched once its fetch record is older than
    HOOPS_CACHE_TTL_HOURS (ingest.cache_is_fresh) [ingest#8].
    """
    if offline:
        return True
    p = _cached_file(tag, season)
    return p is not None and cache_is_fresh(p, season)


def with_retries(fn, what: str, attempts: int = 5):
    """Call fn under nba_http.retry_call's backoff; raise FetchError when it never succeeds.

    This used to print "EXHAUSTED retries -- skipping" and return None, and
    the build went on to write vectors.json and the matrix without the
    season [ingest#7]. A probe with 3 failing attempts returned None.
    """
    return retry_call(fn, what, attempts=attempts)


def canonicalize_player_rows(rows: list[dict] | None) -> list[dict] | None:
    if not rows:
        return rows
    for r in rows:
        if r.get("PLAYER_NAME"):
            r["PLAYER_NAME"] = canonical_name(str(r["PLAYER_NAME"]))
    return rows


def df_to_rows(df, id_col: str, wanted: list[str]) -> tuple[list[dict], list[str]]:
    present = [c for c in wanted if c in df.columns]
    rows = []
    for _, x in df.iterrows():
        row = {
            "PLAYER_ID": int(x[id_col]),
            "PLAYER_NAME": canonical_name(str(x.get("PLAYER_NAME", ""))),
        }
        for c in present:
            v = x[c]
            row[c] = None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)
        rows.append(row)
    return rows, present


def fetch_dash(season: str, measure: str, wanted: list[str], offline: bool):
    """Rows for (season, measure); None when offline with no cache. Raises FetchError online."""
    tag = f"dash{measure.lower()}"
    cached = load_cached(tag, season)
    if cached is not None and _keep_cached(tag, season, offline):
        return canonicalize_player_rows(cached)
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashplayerstats

    extra = ["MIN", "GP"] if measure == "Base" else []

    def call():
        r = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            per_mode_detailed="Per100Possessions",
            measure_type_detailed_defense=measure,
            timeout=75,
        )
        df = r.get_data_frames()[0]
        # df_to_rows keeps whichever wanted columns exist, so a dropped column
        # became an absent feature for the season with no error [ingest#11].
        # Every one is in all 30 cached seasons (checked 2026-10-09), so a
        # missing one now is upstream drift, not history.
        require_columns(df.columns, ["PLAYER_ID", "PLAYER_NAME", *wanted, *extra], f"{season} {measure}")
        rows, _ = df_to_rows(df, "PLAYER_ID", wanted + extra)
        return rows

    rows = with_retries(call, f"{season} {measure}")
    canonicalize_player_rows(rows)
    write_cache(
        cache_path(tag, season),
        rows,
        source=f"stats.nba.com leaguedashplayerstats {measure} Per100Possessions via nba_api",
        season=season,
    )
    time.sleep(1.2)
    return rows


def fetch_bio(season: str, offline: bool):
    """Bio rows for a season; None when offline with no cache. Raises FetchError online."""
    cached = load_cached("bio", season)
    if cached is not None and _keep_cached("bio", season, offline):
        return canonicalize_player_rows(cached)
    if offline:
        return None

    def call():
        # fetch_stats_json retries on its own; wrapping it in with_retries as
        # well made up to 25 attempts per season [ingest#10].
        payload = fetch_stats_json(
            "leaguedashplayerbiostats",
            {
                "LeagueID": "00",
                "Season": season,
                "SeasonType": "Regular Season",
            },
            timeout=90,
        )
        raw = legacy_result_set_rows(payload, required=["PLAYER_ID", "PLAYER_NAME", *BIO_COLS])
        rows = []
        for raw_row in raw:
            row = {
                "PLAYER_ID": int(raw_row["PLAYER_ID"]),
                "PLAYER_NAME": canonical_name(str(raw_row.get("PLAYER_NAME", ""))),
            }
            for c in BIO_COLS:
                if c not in raw_row:
                    continue
                v = raw_row[c]
                if c == "DRAFT_NUMBER":
                    # A pick, or nothing: "Undrafted" is BIO_UNDRAFTED, a null is unknown.
                    # This used to write 61.0 for both.
                    picked = str(v).strip().isdigit()
                    row[c] = float(v) if picked else None
                    undrafted = str(v).strip().lower() == "undrafted"
                    row[BIO_UNDRAFTED] = 0.0 if picked else (1.0 if undrafted else None)
                elif v is None:
                    row[c] = None
                else:
                    try:
                        fv = float(v)
                        row[c] = None if math.isnan(fv) else fv
                    except (TypeError, ValueError):
                        row[c] = None
            rows.append(row)
        return rows

    rows = call()
    write_cache(
        cache_path("bio", season),
        rows,
        source="stats.nba.com leaguedashplayerbiostats via nba_http",
        season=season,
    )
    time.sleep(1.2)
    return rows


def fetch_tracking(season: str, offline: bool):
    """Tracking by player id; {} before 2013-14, None offline with no cache. Raises FetchError online."""
    if season < TRACKING_FIRST_SEASON:
        return {}
    merged_cached = load_cached("tracking", season)
    if merged_cached is not None and _keep_cached("tracking", season, offline):
        return merged_cached
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashptstats

    merged: dict[str, dict] = {}
    for measure, wanted in TRACKING_SPECS:

        def call(measure=measure, wanted=wanted):
            r = leaguedashptstats.LeagueDashPtStats(
                season=season,
                pt_measure_type=measure,
                per_mode_simple="PerGame",
                player_or_team="Player",
                timeout=75,
            )
            df = r.get_data_frames()[0]
            require_columns(df.columns, ["PLAYER_ID", *wanted], f"{season} tracking/{measure}")
            rows, _ = df_to_rows(df, "PLAYER_ID", wanted)
            return rows

        # A measure that never succeeds raises here. It used to leave a
        # partial merge that was not cached but was still built into the
        # matrix with that measure's columns masked [ingest#7].
        rows = with_retries(call, f"{season} tracking/{measure}")
        for row in rows:
            pid = str(row["PLAYER_ID"])
            merged.setdefault(pid, {})
            for k, v in row.items():
                if k not in ("PLAYER_ID", "PLAYER_NAME"):
                    merged[pid][k] = v
        time.sleep(1.2)
    write_cache(
        cache_path("tracking", season),
        merged,
        source="stats.nba.com leaguedashptstats PerGame via nba_api",
        season=season,
    )
    return merged


# ---------------------------------------------------------------------------
# Wide-skills hustle stats (fetch_wide_skills.py): deflections, loose balls,
# charges drawn, box-outs, screen assists, contested shots, defended FG%.
# Already fully cached 2015-16..2025-26 (pipeline/cache/wide_skills_{season}.
# json, all "complete": true) -- these currently only feed the skill-grade
# display (assets/skills_wide.json) and the motor/disruption_gravity/
# rim_gravity skill-tower TARGETS (pipeline/data/wide_skill_labels.npz), never
# the tower INPUTS, so the "defense" family stays 3 features (STL/BLK/
# DEF_RATING) even though real hustle data already exists. Read-only here --
# no new fetch, the cache is already complete. Pre-2015-16 seasons get an
# empty dict (masked downstream), same discipline as fetch_tracking above.
# ---------------------------------------------------------------------------

WIDE_SKILLS_FIRST_SEASON = HUSTLE_FIRST_SEASON


def load_wide_skills_defense(season: str) -> dict[str, dict]:
    if season < WIDE_SKILLS_FIRST_SEASON:
        return {}
    p = CACHE / f"wide_skills_{season}.json"
    if not p.exists():
        return {}
    # `except Exception: return {}` turned a corrupt cache into a season with
    # no hustle data and no message [health#8].
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"{p}: cache does not decode ({e}); restore it from git") from e
    # A proxy doc (constants, formula stand-ins) is refused outright, the way
    # build_wide_skills refuses it [ingest#5]. fetch_missing_tracking wrote two
    # for 2013-14/2014-15, which this loader never opened (they predate
    # WIDE_SKILLS_FIRST_SEASON); one for a hustle season must not become data.
    if d.get("proxy") or any(isinstance(r, dict) and r.get("_proxy") for r in d.get("players", {}).values()):
        raise ValueError(f"{p}: proxy doc (constants, not measurements); delete it or restore the real cache from git")
    if not d.get("complete"):
        return {}
    out = {}
    # honest_players nulls what the endpoint never measured: every hustle
    # field in 2015-16, box_outs before 2017-18, d_fg_pct always, and (in a
    # cache without field_coverage) a row whose tracked fields are all 0.0,
    # i.e. a player missing from the hustle response. fetch_wide_skills wrote
    # those as 0.0 and they reached the matrix as observed: HUSTLE_BOX_OUTS
    # was one constant over 437 rows (2015-16) and 441 (2016-17), and 292 of
    # 437 2015-16 rows sat at zero on all six columns [ingest#2, features#3].
    # The old `or None` guard on d_fg_pct alone is subsumed.
    for nn, v in honest_players(d).items():
        # Keyed again with today's norm_name: the stored key is the
        # suffix-stripping copy fetch_wide_skills had (name_utils).
        key = norm_name(nn)
        if key in out:
            continue
        out[key] = {
            "HUSTLE_DEFLECTIONS": v.get("deflections"),
            "HUSTLE_LOOSE_BALLS": v.get("loose_balls"),
            "HUSTLE_CHARGES": v.get("charges"),
            "HUSTLE_BOX_OUTS": v.get("box_outs"),
            "HUSTLE_SCREEN_AST": v.get("screen_ast"),
            "HUSTLE_CONTESTED_SHOTS": v.get("contested_shots"),
            "HUSTLE_D_FG_PCT": v.get("d_fg_pct"),
        }
    return out


# ---------------------------------------------------------------------------
# Form features from local per-game logs (offline, unique to this dataset):
# game-to-game volatility, scoring ceiling, double/triple-double rates,
# durability. pipeline/data/gamelogs_{season}.jsonl, one JSON row per
# player-game with box stats.
# ---------------------------------------------------------------------------


def _gamelog_rows(p: Path):
    """Each row of a gamelogs_*.jsonl file; a line that is not JSON raises with its line number.

    Both readers below used to `continue` past such a line, so a season cut
    off mid-write by the old streaming fetch_gamelogs silently lost its last
    games [health#8]. All 11 local files decode line by line (checked
    2026-10-09).
    """
    with p.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"{p}:{n}: not JSON ({e}); refetch the season with fetch_gamelogs.py") from e


def compute_form_features(season: str) -> dict[str, dict]:
    p = DATA_DIR / f"gamelogs_{season}.jsonl"
    if not p.exists():
        return {}
    games: dict[int, list[dict]] = {}
    for g in _gamelog_rows(p):
        # Regular season only. The logs hold every game type, and form used to
        # take them all: in 2023-24 the file has 2,078 preseason, 24 All-Star,
        # 1,685 playoff, 120 play-in and 26 Cup-final rows beside 26,401
        # regular-season ones, so FORM_CEIL and the DD/TD rates absorbed
        # playoff and All-Star games and 18 2015-16 players reached the
        # 10-game floor only through them [ingest#0].
        if not is_regular_season(g.get("GAME_ID")):
            continue
        if (g.get("MIN") or 0) <= 0:
            continue
        pid = g.get("PLAYER_ID")
        if pid is None:
            continue
        games.setdefault(int(pid), []).append(g)

    out: dict[str, dict] = {}
    for pid, rows in games.items():
        if len(rows) < 10:  # too few games for stable form stats
            continue
        pts36 = [(r.get("PTS") or 0) * 36.0 / max(1.0, r["MIN"]) for r in rows]
        mean36 = sum(pts36) / len(pts36)
        var36 = sum((x - mean36) ** 2 for x in pts36) / len(pts36)
        pts_sorted = sorted((r.get("PTS") or 0) for r in rows)
        ceil = pts_sorted[max(0, math.ceil(0.95 * len(pts_sorted)) - 1)]
        dd = td = 0
        for r in rows:
            cats = [
                (r.get("PTS") or 0),
                (r.get("AST") or 0),
                (r.get("OREB") or 0) + (r.get("DREB") or 0),
                (r.get("STL") or 0),
                (r.get("BLK") or 0),
            ]
            tens = sum(1 for c in cats if c >= 10)
            dd += tens >= 2
            td += tens >= 3
        out[str(pid)] = {
            "FORM_VOL": math.sqrt(var36) / max(1.0, mean36),  # CV of per-36 scoring
            "FORM_CEIL": float(ceil),  # 95th-pct game PTS
            "FORM_DD_RATE": dd / len(rows),
            "FORM_TD_RATE": td / len(rows),
            "FORM_GP": float(len(rows)),  # durability
            "FORM_MIN_AVG": sum(r["MIN"] for r in rows) / len(rows),
        }
    return out


# ---------------------------------------------------------------------------
# Within-season shape from the same per-game logs: did production rise or fade
# across the player's OWN game sequence, and where did the peak sit?
#
# The method (halves split at the player's own game-sequence midpoint, per-36
# rate stats) is lifted from faderfinisher_analysis.py, which has computed this
# since the quiz shipped -- but it writes assets/faderfinisher.json for trivia
# and has never fed the model. Its eligibility band (>=25 games per half, delta
# in 1.5-6.0 per-36) is deliberately NOT reused: those thresholds exist to keep
# quiz answers unambiguous, and applying them here would mask every player whose
# arc is small or whose season was short, which is most of them.
#
# Coverage tracks the form/injury families exactly (~0.26 pre-2021, ~0.86 after)
# because it reads the same gamelogs_*.jsonl, which start at 2015-16. A player
# with no usable log simply has no SHAPE_* keys and is masked, same as form.
# ---------------------------------------------------------------------------

# Both halves need enough games for a half-mean to mean anything. form uses 10
# games for a season-level stat; shape splits the season, so it needs twice that.
MIN_SHAPE_GAMES = 20
PEAK_WINDOW = 5


def compute_shape_features(season: str) -> dict[str, dict]:
    p = DATA_DIR / f"gamelogs_{season}.jsonl"
    if not p.exists():
        return {}
    games: dict[int, list[dict]] = {}
    for g in _gamelog_rows(p):
        if not is_regular_season(g.get("GAME_ID")):  # as compute_form_features [ingest#0]
            continue
        if (g.get("MIN") or 0) <= 0:
            continue
        pid = g.get("PLAYER_ID")
        if pid is None:
            continue
        games.setdefault(int(pid), []).append(g)

    out: dict[str, dict] = {}
    for pid, rows in games.items():
        if len(rows) < MIN_SHAPE_GAMES:
            continue
        # Chronological order is the whole point here; form never needed it.
        rows.sort(key=lambda r: r.get("GAME_DATE") or "")
        n = len(rows)

        def per36(rs, key):
            tot_min = sum(r["MIN"] for r in rs)
            if tot_min <= 0:
                return 0.0
            if key == "REB":
                tot = sum((r.get("OREB") or 0) + (r.get("DREB") or 0) for r in rs)
            else:
                tot = sum(r.get(key) or 0 for r in rs)
            return 36.0 * tot / tot_min

        half = n // 2
        h1, h2 = rows[:half], rows[half:]

        # Minutes trajectory: OLS slope over game index, expressed as the share
        # of an average night gained (or lost) across the whole season, so a
        # bench player growing into 20 mpg is comparable to a starter shedding 8.
        mins = [r["MIN"] for r in rows]
        mean_min = sum(mins) / n
        mean_i = (n - 1) / 2.0
        denom = sum((i - mean_i) ** 2 for i in range(n))
        slope = sum((i - mean_i) * (m - mean_min) for i, m in enumerate(mins)) / denom if denom else 0.0

        # Where the hot stretch sat, as a 0-1 position in the season.
        w = min(PEAK_WINDOW, n)
        best_v, best_i = None, 0
        for i in range(n - w + 1):
            v = per36(rows[i : i + w], "PTS")
            if best_v is None or v > best_v:
                best_v, best_i = v, i
        peak_pos = (best_i + (w - 1) / 2.0) / (n - 1) if n > 1 else 0.5

        out[str(pid)] = {
            "SHAPE_PTS_H2H1": per36(h2, "PTS") - per36(h1, "PTS"),
            "SHAPE_REB_H2H1": per36(h2, "REB") - per36(h1, "REB"),
            "SHAPE_MIN_SLOPE": slope * (n - 1) / mean_min if mean_min > 0 else 0.0,
            "SHAPE_PEAK_POS": peak_pos,
        }
    return out


# ---------------------------------------------------------------------------
# Salary sources
# ---------------------------------------------------------------------------


def load_salary_history() -> dict[tuple[str, str], float]:
    """Full-history salaries: prefers merge_salaries output, else raw CSV.

    Sources (in order):
      1. pipeline/cache/salaries_merged.json  (run merge_salaries.py)
      2. pipeline/cache/salaries_history.csv  (name,season,salary drop-in)
    Season labels use '2003-04' format. Join key is norm_name(name) + season.
    """
    merged_p = CACHE / "salaries_merged.json"
    if merged_p.exists():
        # One bad record used to send the whole merged file down an
        # `except Exception` into the CSV fallback with a single printed line,
        # so the salary family silently changed source [health#8]. A merged
        # file that cannot be read is now an error naming the file.
        try:
            data = json.loads(merged_p.read_text(encoding="utf-8"))
            salaries = data.get("salaries", data)
            out: dict[tuple[str, str], float] = {}
            for key, val in salaries.items():
                if key.startswith("_"):
                    continue
                # The stored key is whatever norm_name was when merge_salaries
                # ran; keyed again with today's, it meets norm_name(PLAYER_NAME)
                # below whichever copy wrote it (name_utils).
                if isinstance(val, dict):
                    nn = val.get("norm_name") or key.split("|", 1)[0]
                    season = val.get("season") or key.split("|", 1)[-1]
                    out.setdefault((norm_name(nn), season), float(val["salary"]))
                else:
                    parts = key.split("|", 1)
                    if len(parts) == 2:
                        out.setdefault((norm_name(parts[0]), parts[1]), float(val))
        except (json.JSONDecodeError, UnicodeDecodeError, AttributeError, KeyError, TypeError, ValueError) as e:
            raise ValueError(f"{merged_p}: unreadable ({type(e).__name__}: {e}); fix or rerun merge_salaries.py") from e
        print(f"salary merged JSON: {len(out)} rows")
        return out

    p = CACHE / "salaries_history.csv"
    out = {}
    if not p.exists():
        return out
    skipped = 0
    with p.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            # A missing name/season/salary column is a KeyError on every row:
            # let it raise. A salary that is not a number skips that row only,
            # and the count is printed instead of vanishing.
            try:
                out[(norm_name(row["name"]), row["season"])] = float(re.sub(r"[^0-9.]", "", row["salary"]) or 0)
            except ValueError:
                skipped += 1
    print(f"salary history CSV: {len(out)} rows" + (f", {skipped} unparseable salaries skipped" if skipped else ""))
    return out


def fetch_bbref_contracts(offline: bool) -> dict[tuple[str, str], float]:
    """Current contracts from basketball-reference (static HTML, verified).
    Yields (name, season) -> salary for the seasons the table covers."""
    cached = load_cached("salary_bbref", "current")
    if cached is not None:
        out: dict[tuple[str, str], float] = {}
        for k, v in cached.items():
            out.setdefault((norm_name(k.split("|")[0]), k.split("|")[1]), v)
        return out
    if offline:
        return {}
    import requests

    url = "https://www.basketball-reference.com/contracts/players.html"

    def get() -> str:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=40)
        r.raise_for_status()
        # BBRef sends no charset, so requests decoded the page as latin-1 and
        # every accented name came out as mojibake ('Jokić' -> 'JokiÄ\x87'):
        # 71 keys, 20 of them 2025-26 players with 10+ games who lost all four
        # salary columns [ingest#3]. fetch_salary_history.py had this line.
        r.encoding = "utf-8"
        return r.text

    # A failed fetch used to print one line and return {}, and the build went
    # on [ingest#7]. Now it raises FetchError; main() decides (--allow-partial).
    html = retry_call(get, "basketball-reference contracts")
    out: dict[tuple[str, str], float] = {}
    # header: season columns like >2025-26<
    head = re.search(r"<thead>.*?</thead>", html, re.S)
    seasons = re.findall(r">(\d{4}-\d{2})<", head.group(0)) if head else []
    for m in re.finditer(r'<tr[^>]*>.*?data-stat="player"[^>]*>.*?>([^<]+)</a>(.*?)</tr>', html, re.S):
        name, rest = m.group(1), m.group(2)
        sals = re.findall(r'data-stat="y\d+"[^>]*>\$?([\d,]+)', rest)
        for i, s in enumerate(sals[: len(seasons)]):
            try:
                out[(norm_name(name), seasons[i])] = float(s.replace(",", ""))
            except ValueError:
                continue
    # Zero parsed rows (a changed layout, a block page served as 200) raises
    # EmptyPayloadError here instead of caching {} as the current contracts.
    write_cache(cache_path("salary_bbref", "current"), {f"{k[0]}|{k[1]}": v for k, v in out.items()}, source=url)
    print(f"bbref contracts: {len(out)} (name,season) salaries")
    return out


# ---------------------------------------------------------------------------
# Cleaning helpers
# ---------------------------------------------------------------------------


def shrink_percentages(rows: list[dict]) -> None:
    """Empirical-Bayes: shrink noisy percentages toward the season mean,
    weighted by per-100 attempts. m = prior strength in attempts."""
    for pct, att, m in (
        ("FG3_PCT", "FG3A", 6.0),
        ("FT_PCT", "FTA", 6.0),
        ("FG_PCT", "FGA", 6.0),
    ):
        vals = [r[pct] for r in rows if r.get(pct) is not None]
        mu = sum(vals) / max(1, len(vals))
        for r in rows:
            p, a = r.get(pct), r.get(att)
            if p is None or a is None:
                continue
            r[pct] = (p * a + mu * m) / (a + m)


def dedupe_rows(rows: list[dict]) -> list[dict]:
    best: dict[tuple[int, str], dict] = {}
    for r in rows:
        k = (r["PLAYER_ID"], r["season"])
        minutes = (r.get("MIN") or 0) * (r.get("GP") or 0)
        if k not in best or minutes > (best[k].get("MIN") or 0) * (best[k].get("GP") or 0):
            best[k] = r
    return list(best.values())


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--offline",
        action="store_true",
        help="rebuild from pipeline/cache only; no network",
    )
    ap.add_argument(
        "--fixed-gates",
        action="store_true",
        help="use fixed --min-gp/--min-minutes instead of schedule-aware",
    )
    ap.add_argument(
        "--min-gp",
        type=int,
        default=None,
        help="fixed minimum GP (requires --fixed-gates)",
    )
    ap.add_argument(
        "--min-minutes",
        type=int,
        default=None,
        help="fixed minimum total minutes GP*MIN (requires --fixed-gates)",
    )
    ap.add_argument(
        "--with-shape",
        action="store_true",
        help="emit the SHAPE_* within-season trajectory family (off by default: "
        "measured at -0.81 CQS over 6 seeds, see docs/MTNN_STABILITY_2026-08-13_shape.md)",
    )
    ap.add_argument(
        "--allow-partial",
        action="store_true",
        help="write vectors.json and the matrix even when a season or source is missing or failed to fetch "
        "(seasons without Base rows are left out, other missing sources are masked). Without it, any gap "
        "exits 2 before anything is written",
    )
    args = ap.parse_args()
    schedule_aware = not args.fixed_gates

    # Offline needs no session. Patching warms one with a GET to www.nba.com
    # whenever curl_cffi is installed, so --offline used to touch the network.
    if not args.offline:
        if patch_nba_api_session():
            print("nba_http: nba_api routed through curl_cffi")
        else:
            print("WARNING: curl_cffi not installed — pip install curl_cffi (stats.nba.com often times out without it)")

    # Seasons and sources that are missing or failed, with the reason. Every
    # season is still attempted; the build stops before writing anything if
    # this is non-empty and --allow-partial is not set [ingest#7].
    problems: dict[str, str] = {}

    salary_hist = load_salary_history()
    try:
        salary_bbref = fetch_bbref_contracts(args.offline)
    except FetchError as e:
        problems["salary_bbref"] = f"fetch failed: {e}"
        salary_bbref = {}

    all_rows: list[dict] = []
    extra_presence: dict[str, set] = {
        "advanced": set(),
        "scoring": set(),
        "bio": set(),
        "tracking": set(),
        "hustle": set(),
        "form": set(),
        "shape": set(),
    }
    fetched, missing = [], []

    for season in SEASONS:
        try:
            base = fetch_dash(season, "Base", GAME_FEATURES, args.offline)
            adv_rows = fetch_dash(season, "Advanced", ADVANCED_COLS, args.offline)
            sco_rows = fetch_dash(season, "Scoring", SCORING_COLS, args.offline)
            bio_rows = fetch_bio(season, args.offline)
            trk_rows = fetch_tracking(season, args.offline)
        except FetchError as e:
            problems[season] = f"fetch failed: {e}"
            missing.append(season)
            print(f"{season}: FETCH FAILED ({e})", file=sys.stderr)
            continue
        # A None is a source with no cache (offline). Advanced, Scoring, bio and
        # tracking used to be masked for the season by `or []` without a word.
        absent = [
            name
            for name, rows in (
                ("Base", base),
                ("Advanced", adv_rows),
                ("Scoring", sco_rows),
                ("bio", bio_rows),
                ("tracking", trk_rows),
            )
            if rows is None
        ]
        if absent:
            problems[season] = "no cache for " + ", ".join(absent)
            if base is None or not args.allow_partial:
                missing.append(season)
                continue
        adv = {str(r["PLAYER_ID"]): r for r in (adv_rows or [])}
        sco = {str(r["PLAYER_ID"]): r for r in (sco_rows or [])}
        bio = {str(r["PLAYER_ID"]): r for r in (bio_rows or [])}
        trk = trk_rows or {}
        form = compute_form_features(season)
        shape = compute_shape_features(season) if args.with_shape else {}
        hustle = load_wide_skills_defense(season)
        # A name two PLAYER_IDs share this season (base lists everyone who
        # played) cannot be told apart by the name-keyed hustle and salary
        # caches; the charted one gets neither rather than the other man's
        # (name_utils.shared_name_keys: Marcus Williams 2007-08 carried the
        # $12,890 SAS salary of pid 201173).
        name_pids: dict[str, set] = {}
        for r in base:
            name_pids.setdefault(norm_name(str(r.get("PLAYER_NAME") or "")), set()).add(r["PLAYER_ID"])
        shared_names = {k for k, v in name_pids.items() if len(v) > 1}
        gate = gates_for_season(season, schedule_aware=schedule_aware)
        if schedule_aware:
            min_gp = gate["min_gp"]
            min_minutes = gate["min_total_minutes"]
        else:
            min_gp = args.min_gp if args.min_gp is not None else DEFAULT_MIN_GP
            min_minutes = args.min_minutes if args.min_minutes is not None else DEFAULT_MIN_TOTAL_MINUTES

        n_kept = 0
        for r in base:
            gp = r.get("GP") or 0
            mpg = r.get("MIN") or 0
            if not check_eligible(
                gp,
                mpg,
                season=season,
                min_gp=min_gp,
                min_total_minutes=min_minutes,
                schedule_aware=False,
            ):
                continue
            total_min = float(gp) * float(mpg)
            pid = str(r["PLAYER_ID"])
            row = dict(r)
            row["season"] = season
            row["_gp"] = int(gp)
            row["_mpg"] = float(mpg)
            row["_total_min"] = total_min
            for src, name in ((adv, "advanced"), (sco, "scoring"), (bio, "bio")):
                extra = src.get(pid, {})
                for k, v in source_columns(name, extra).items():
                    row[k] = v
                    extra_presence[name].add(k)
            for k, v in source_columns("tracking", trk.get(pid) or {}).items():
                row[k] = v
                extra_presence["tracking"].add(k)
            for k, v in (form.get(pid) or {}).items():
                row[k] = v
                extra_presence["form"].add(k)
            for k, v in (shape.get(pid) or {}).items():
                row[k] = v
                extra_presence["shape"].add(k)
            nkey = norm_name(row["PLAYER_NAME"])
            ambiguous = nkey in shared_names
            for k, v in ({} if ambiguous else hustle.get(nkey) or {}).items():
                if v is not None:
                    row[k] = v
                    extra_presence["hustle"].add(k)
            # salary
            key = (nkey, season)
            sal = None if ambiguous else salary_hist.get(key, salary_bbref.get(key))
            row["SALARY_LOG"] = math.log10(sal) if sal and sal > 0 else None
            all_rows.append(row)
            n_kept += 1
        fetched.append(season)
        print(f"{season}: {n_kept} qualified (gp>={min_gp}, min>={min_minutes})")

    # The old message blamed throttling for every gap, --offline included. It
    # now says which source was missing or failed, per season.
    if problems and not args.allow_partial:
        hint = (
            "restore the missing caches (pipeline/cache is git-tracked) or run without --offline"
            if args.offline
            else "rerun later; every season that did fetch is cached and is not fetched again"
        )
        raise FetchError(
            f"{len(problems)} season(s)/source(s) incomplete, so vectors.json and the matrix were not written: "
            + "; ".join(f"{k}: {why}" for k, why in problems.items())
            + f". {hint}, or pass --allow-partial to build without them"
        )
    if not all_rows:
        raise SystemExit("no data available (no cache, nothing fetched) -- nothing to build")
    for key, why in problems.items():
        print(f"WARNING (--allow-partial): {key}: {why}")
    if missing:
        print(f"WARNING (--allow-partial): seasons left out of this build: {missing}")

    all_rows = dedupe_rows(all_rows)

    # per-season percentage shrinkage
    by_season: dict[str, list[dict]] = {}
    for r in all_rows:
        by_season.setdefault(r["season"], []).append(r)
    for rows in by_season.values():
        shrink_percentages(rows)

    # ---- wide feature list: game contract first (frozen order) ----
    wide_features = list(GAME_FEATURES)
    # "shape" is last so every pre-existing column keeps its index -- the frozen
    # order above is a contract, and the baseline arm of the A/B must be exactly
    # today's matrix with the new tail removed.
    for name in ("advanced", "scoring", "bio", "tracking", "form", "hustle", "shape"):
        for c in sorted(extra_presence[name]):
            if c not in wide_features and c != BIO_UNDRAFTED:
                wide_features.append(c)
    wide_features.append("SALARY_LOG")
    # After SALARY_LOG, so every column this script already wrote keeps its
    # index (sorted into the bio group it would move the 34 columns after
    # DRAFT_NUMBER); integrate_context's 65 columns, appended after these, move by one.
    if BIO_UNDRAFTED in extra_presence["bio"]:
        wide_features.append(BIO_UNDRAFTED)

    n, d = len(all_rows), len(wide_features)
    X = np.full((n, d), np.nan)
    for i, r in enumerate(all_rows):
        for j, f in enumerate(wide_features):
            v = r.get(f)
            if v is not None:
                X[i, j] = float(v)
    mask = ~np.isnan(X)

    # ---- era z-scores within each season (NaN-aware) ----
    season_idx: dict[str, list[int]] = {}
    for i, r in enumerate(all_rows):
        season_idx.setdefault(r["season"], []).append(i)
    Z = np.zeros_like(X)
    for idxs in season_idx.values():
        block = X[idxs]
        mu = np.nanmean(block, axis=0)
        sd = np.nanstd(block, axis=0)
        sd[(sd == 0) | np.isnan(sd)] = 1.0
        mu = np.where(np.isnan(mu), 0.0, mu)
        zb = (block - mu) / sd
        Z[idxs] = np.where(np.isnan(zb), 0.0, zb)  # missing -> season mean
    Z = np.clip(Z, -4, 4)

    game_cols = [wide_features.index(f) for f in GAME_FEATURES]
    Zg = Z[:, game_cols]

    # ---- PCA(3) map on the game dims (stable across data-variety growth) ----
    C = Zg - Zg.mean(0)
    U, S, _ = np.linalg.svd(C, full_matrices=False)
    P = U[:, :3] * S[:3]
    P = (P - P.min(0)) / (P.max(0) - P.min(0)).max()

    # ---- k-means archetypes (numpy, seeded) on game dims ----
    K = 8
    rng = np.random.default_rng(7)
    cent = Zg[rng.choice(len(Zg), K, replace=False)]
    for _ in range(40):
        dist = ((Zg[:, None, :] - cent[None]) ** 2).sum(-1)
        lab = dist.argmin(1)
        for k in range(K):
            if (lab == k).any():
                cent[k] = Zg[lab == k].mean(0)

    def name_cluster(c: np.ndarray) -> str:
        top = np.argsort(-c)[:2]
        low = np.argsort(c)[0]
        a, b = LABELS[GAME_FEATURES[top[0]]], LABELS[GAME_FEATURES[top[1]]]
        return f"{a} + {b}".title() if c[top[1]] > 0.35 else f"{a} (low {LABELS[GAME_FEATURES[low]]})".title()

    cluster_names = [name_cluster(cent[k]) for k in range(K)]

    # ---- assets/vectors.json: frozen game contract + additive extras ----
    sal_col = wide_features.index("SALARY_LOG")
    # build pid -> birthYear map from bio caches for name+dob uniqueness
    pid_birth = {}
    # This was two nested `except Exception: pass` around open(bf).read()
    # with no encoding (cp1252 on Windows), so an unreadable bio cache quietly
    # cost its players their birth year [health#8]. All 30 caches decode
    # under both encodings and only PLAYER_ID / AGE are read, so the map is
    # unchanged; a cache that does not decode now raises with its path.
    import glob

    for bf in glob.glob(str((ROOT / "pipeline" / "cache" / "bio_*.json").resolve())):
        # file may be list of dicts
        season = bf.split("bio_")[-1].split(".json")[0]
        if not re.fullmatch(r"\d{4}-\d{2}", season):
            continue  # not a per-season cache (e.g. an example file)
        try:
            rows = json.loads(Path(bf).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            raise ValueError(f"{bf}: bio cache does not decode ({e}); restore it from git") from e
        sy = int(season.split("-")[0])
        for r in rows if isinstance(rows, list) else []:
            pid = str(r.get("PLAYER_ID") or r.get("id") or "")
            age = r.get("AGE")
            if pid and isinstance(age, int | float):
                by = int(sy - float(age))
                if pid not in pid_birth:
                    pid_birth[pid] = by

    players = []
    for i, r in enumerate(all_rows):
        pid_str = str(r.get("PLAYER_ID") or "")
        birthYear = pid_birth.get(pid_str)
        p = {
            "id": i,
            "name": r["PLAYER_NAME"],
            "season": r["season"],
            "gp": r["_gp"],
            "mpg": round(r["_mpg"], 1),
            "total_min": round(r["_total_min"]),
            "v": [round(float(z), 3) for z in Zg[i]],
            "x": round(float(P[i, 0]), 4),
            "y": round(float(P[i, 1]), 4),
            "z": round(float(P[i, 2]), 4),
            "c": int(lab[i]),
        }
        if pid_str:
            p["pid"] = int(pid_str) if pid_str.isdigit() else pid_str
        if birthYear:
            p["birthYear"] = birthYear
            p["dob"] = f"{birthYear}-01-01"
        if mask[i, sal_col]:
            p["sal"] = round(float(Z[i, sal_col]), 3)  # salary z (era-honest)
        players.append(p)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # This file and the two below are written atomically, same bytes as the
    # in-place write_text / np.savez_compressed they replace (artifact_io).
    atomic_write_text(
        OUT,
        json.dumps(
            {
                "built": time.strftime("%Y-%m-%d"),
                "seasons": [SEASONS[0], SEASONS[-1]],
                "normalization": "per-100 possessions, z-scored within season (era-honest)",
                "eligibility": {
                    "schedule_aware": schedule_aware,
                    "method": ("15% of season GP (clamp 10–15) + 6% of 48mpg schedule total minutes (floor 450)"),
                    "min_gp": args.min_gp,
                    "min_total_minutes": args.min_minutes,
                    "sample_gates": {
                        s: gates_for_season(s, schedule_aware=schedule_aware) for s in ("1998-99", "2011-12", "2023-24")
                    },
                },
                "features": GAME_FEATURES,
                "featureLabels": LABELS,
                "clusters": cluster_names,
                "players": players,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    # ---- wide training bundle for train_towers.py ----
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    atomic_savez_compressed(
        DATA_DIR / "train_matrix.npz",
        Z=Z.astype(np.float32),
        mask=mask,
        player_id=np.array([r["PLAYER_ID"] for r in all_rows]),
        season=np.array([r["season"] for r in all_rows]),
        name=np.array([r["PLAYER_NAME"] for r in all_rows]),
        cluster=lab,
    )
    manifest = {
        "built": time.strftime("%Y-%m-%d"),
        "n_players": n,
        "eligibility": {
            "schedule_aware": schedule_aware,
            "sample_gates": {
                s: gates_for_season(s, schedule_aware=schedule_aware) for s in ("1998-99", "2011-12", "2023-24")
            },
        },
        "features": wide_features,
        "families": {f: FAMILY_OF.get(f, "efficiency") for f in wide_features},
        "game_features": GAME_FEATURES,
        "tracking_first_season": TRACKING_FIRST_SEASON,
        "seasons_fetched": fetched,
        "seasons_missing": missing,
        "salary_coverage": int(mask[:, sal_col].sum()),
        "notes": "Z is era z-scored (NaN->season mean, clip 4); mask marks measured values",
    }
    atomic_write_text(DATA_DIR / "feature_manifest.json", json.dumps(manifest, indent=2), encoding="utf-8")

    # ---- audit assertions: never ship a dirty file ----
    assert len({(p["name"], p["season"]) for p in players}) == len(players), "dupes"
    assert all(len(p["v"]) == 14 for p in players), "vector length"
    assert all(all(-4.0001 <= v <= 4.0001 for v in p["v"]) for p in players), "clip"
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 and 0 <= p["z"] <= 1 for p in players), "map range"

    print(
        f"wrote {OUT.name}: {len(players)} player-seasons, {K} archetypes, "
        f"{d} wide features, salary coverage {manifest['salary_coverage']}"
    )
    for k, nm in enumerate(cluster_names):
        print(f"  cluster {k}: {nm} ({int((lab == k).sum())} players)")


# run_fetch: a FetchError (a failed or incomplete fetch) exits 2 with one line on stderr.
if __name__ == "__main__":
    run_fetch(main, name="build_vectors")
