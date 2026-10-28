"""Shared paths, column pins, and provenance helpers for the MTNN v2
training-data pipelines.

Rules enforced here, not just documented:
- All outputs go under mlops-v2/out/ (staged, non-prod). Nothing in
  this package writes to assets/, public/, or any production mirror.
- Provenance (source, license, fetch date/method, transform version)
  travels with every output manifest.
- No synthetic data, no silent drops: a missing input is a BLOCKED
  manifest entry, never a filled zero.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPE = ROOT / "pipeline"
CACHE = PIPE / "cache"
OUT = ROOT / "mlops-v2" / "out"
VERSION = "mlops-v2-pipeline-1"

# --- Column pins (FREE_SOURCES.md column census, authority on width) ---
GAME14 = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV", "FG3A",
          "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]
ADVANCED14 = ["AST_PCT", "AST_TO", "DEF_RATING", "DREB_PCT", "EFG_PCT",
              "NET_RATING", "OFF_RATING", "OREB_PCT", "PACE", "PIE",
              "REB_PCT", "TM_TOV_PCT", "TS_PCT", "USG_PCT"]
SCORING13 = ["PCT_AST_2PM", "PCT_AST_3PM", "PCT_AST_FGM", "PCT_PTS_2PT",
             "PCT_PTS_2PT_MR", "PCT_PTS_3PT", "PCT_PTS_FB", "PCT_PTS_FT",
             "PCT_PTS_OFF_TOV", "PCT_PTS_PAINT", "PCT_UAST_2PM",
             "PCT_UAST_3PM", "PCT_UAST_FGM"]
BIO5 = ["AGE", "DRAFT_NUMBER", "PLAYER_HEIGHT_INCHES", "PLAYER_WEIGHT",
        "DRAFT_UNDRAFTED"]
TRACKING13 = ["AVG_SPEED", "CATCH_SHOOT_FG3_PCT", "CATCH_SHOOT_FGA",
              "CATCH_SHOOT_PTS", "DIST_MILES", "DRIVES", "DRIVE_PASSES",
              "DRIVE_PTS", "ELBOW_TOUCHES", "PAINT_TOUCHES",
              "POST_TOUCHES", "PULL_UP_FGA", "PULL_UP_PTS"]
PLAYMAKING7 = ["AVG_SEC_PER_TOUCH", "FRONT_CT_TOUCHES", "PASSES_MADE",
               "POTENTIAL_AST", "SECONDARY_AST", "TIME_OF_POSS", "TOUCHES"]
HUSTLE6 = ["HUSTLE_BOX_OUTS", "HUSTLE_CHARGES", "HUSTLE_CONTESTED_SHOTS",
           "HUSTLE_DEFLECTIONS", "HUSTLE_LOOSE_BALLS", "HUSTLE_SCREEN_AST"]
MARKET1 = ["SALARY_LOG"]

BASE73 = (GAME14 + ADVANCED14 + SCORING13 + BIO5 + TRACKING13
          + PLAYMAKING7 + HUSTLE6 + MARKET1)
assert len(BASE73) == 73 and len(set(BASE73)) == 73

# Context families (contract target 143), by unblocker. Honors 5 are
# QUARANTINED: they count in NO width scenario until the semantics
# decision (zero-fill vs mask-honest) is recorded.
CONTEXT = {
    "form": (["FORM_CEIL", "FORM_DD_RATE", "FORM_MIN_AVG", "FORM_TD_RATE",
              "FORM_VOL"], "gamelog fetch (11 JSONLs, operator machine)"),
    "roster": (["ROSTER_MIN_RANK", "ROSTER_USAGE_CROWD", "ROSTER_COMPLEMENT",
                "ROSTER_STAR_GAP", "ROSTER_MATES_N"],
               "gamelog fetch + roster 002-filter ruling"),
    "career_gamelog": (["GP_RATIO", "CAREER_MPG_SLOPE", "CAREER_TEAM_CHANGE"],
                       "gamelog fetch"),
    "competition": (["SOS_NET_RTG", "B2B_RATE", "REST_AVG", "CONF_STRENGTH"],
                    "gamelog fetch + team_season T2"),
    "injury": (["INJ_GP_PCT", "INJ_MISS_N", "INJ_MAX_MISS_STREAK",
                "INJ_MISS_SPELLS"], "gamelog fetch"),
    "team": (["TM_PACE", "TM_OFF_RTG", "TM_DEF_RTG", "TM_NET_RTG",
              "TM_WIN_PCT"], "gamelog fetch (roster teamId join key)"),
    "system": (["SYSTEM_PACE_SPACE", "SYSTEM_MOREYBALL", "SYSTEM_GRIND",
                "SYSTEM_POST_HEAVY", "SYSTEM_TRANSITION", "SYSTEM_BALANCED"],
               "gamelog fetch, transitively via roster + T2 pace"),
    "career_internal": (["YEAR_IN_LEAGUE", "LAG1_COSINE", "DELTA_NORM",
                         "DRAFT_SLOT_Z", "CAREER_SLOPE_3Y",
                         "CAREER_GAP_YEARS", "CAREER_EXP_YEARS",
                         "CAREER_GP_SLOPE", "CAREER_ACTIVE_FRAC"],
                        "derivable offline; inherits base posture"),
    "pedigree": (["PED_PICK_QUALITY", "PED_ROUND_ONE", "PED_UNDRAFTED",
                  "PED_EXPECT_SLOT", "PED_TEAM_WINPCT", "PED_YEARS_SINCE",
                  "PED_PICK_DECAY"],
                 "Wikipedia draft lists (CLEAR, sourcing)"),
    "honors_QUARANTINED": (["HON_ALL_NBA_TEAM_LAG", "HON_ALL_NBA_VOTE_LAG",
                            "HON_ASG_LAG", "HON_ASG_CUM", "HON_VOTE_RECOG"],
                           "HONORS SEMANTICS DECISION (zero-fill vs mask-honest)"),
    "playoffs": (["PO_GP", "PO_MIN", "PO_MIN_DELTA", "PO_USG_DELTA",
                  "PO_PTS_DELTA", "PO_EFF_DELTA", "PO_PLUS_MINUS",
                  "PO_TEAM_WINS", "PO_ROUNDS", "PO_SERIES", "PO_CLOSE_GAMES",
                  "PO_AVG_PTS", "PO_HIGH_PTS", "PO_CLUTCH_PTS"],
                 "NBA playoff gamelog fetch (SeasonType=Playoffs)"),
    "market_expansion": (["SALARY_CAP_PCT", "SALARY_TEAM_PCT",
                          "SALARY_RANK_POS"],
                         "identified lawful bulk salary source (today: NO SOURCE)"),
}
assert sum(len(v[0]) for v in CONTEXT.values()) == 70  # 73 + 70 = 143


def provenance(source, license_, method, note=""):
    """One provenance record, attached to every output manifest."""
    return {
        "source": source,
        "license": license_,
        "fetch_date": time.strftime("%Y-%m-%d"),
        "method": method,
        "transform_version": VERSION,
        "note": note,
    }


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1), encoding="utf-8")
    return path


def season_start_year(season):
    """'2022-23' -> 2022. Season key is YYYY-YY; start year is first 4 digits."""
    return int(season.split("-")[0])
