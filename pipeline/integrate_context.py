"""Merge context artifacts into train_matrix.npz for MTNN v4.

Reads pipeline outputs from parallel data-expansion tracks:
  roster_context.json, career_arc.json, competition_context.json,
  salaries_merged.json, team_season_{season}.json

Run:  python pipeline/integrate_context.py [--dry-run]
Requires: pipeline/data/train_matrix.npz + feature_manifest.json
See: pipeline/mtnn_v4_plan.md, docs/DATA_EXPANSION_WORKFLOW.md
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from name_utils import norm_name  # noqa: E402

DATA_DIR = ROOT / "pipeline" / "data"
CACHE_DIR = ROOT / "pipeline" / "cache"

ROSTER_JSON = DATA_DIR / "roster_context.json"
FORM_JSON = DATA_DIR / "form_context.json"
CAREER_JSON = DATA_DIR / "career_arc.json"
COMPETITION_JSON = DATA_DIR / "competition.json"
COMPETITION_JSON_LEGACY = DATA_DIR / "competition_context.json"
SALARIES_JSON = CACHE_DIR / "salaries_merged.json"
SALARY_MARKET_JSON = DATA_DIR / "salary_market.json"
PEDIGREE_JSON = DATA_DIR / "pedigree.json"
PLAYOFFS_JSON = DATA_DIR / "playoffs.json"
HONORS_JSON = DATA_DIR / "honors.json"
GAME_RATINGS_JSON = DATA_DIR / "game_ratings.json"

_GAME_ATTR_KEYS = (
    "overall", "three_pt", "mid_range", "close_shot", "ball_handle",
    "pass_accuracy", "perimeter_def", "interior_def", "steal", "block",
    "off_rebound", "def_rebound", "speed", "strength",
)

V4_FEATURES: dict[str, str] = {
  # roster (VH-109)
  "ROSTER_MIN_RANK": "roster",
  "ROSTER_USAGE_CROWD": "roster",
  "ROSTER_COMPLEMENT": "roster",
  "ROSTER_STAR_GAP": "roster",
  "ROSTER_MATES_N": "roster",
  # career (VH-110)
  "YEAR_IN_LEAGUE": "career",
  "LAG1_COSINE": "career",
  "DELTA_NORM": "career",
  "GP_RATIO": "career",
  "DRAFT_SLOT_Z": "career",
  # competition (VH-111)
  "SOS_NET_RTG": "competition",
  "B2B_RATE": "competition",
  "REST_AVG": "competition",
  "CONF_STRENGTH": "competition",
  # market (VH-108)
  "SALARY_LOG": "market",
  "SALARY_CAP_PCT": "market",
  "SALARY_TEAM_PCT": "market",
  "SALARY_RANK_POS": "market",
  # team env (VH-107) — joined via roster_context teamId
  "TM_PACE": "team",
  "TM_OFF_RTG": "team",
  "TM_DEF_RTG": "team",
  "TM_NET_RTG": "team",
  "TM_WIN_PCT": "team",
  # form (VH-101 / build_vectors FORM_FEATURES)
  "FORM_VOL": "form",
  "FORM_CEIL": "form",
  "FORM_DD_RATE": "form",
  "FORM_TD_RATE": "form",
  "FORM_GP": "form",
  "FORM_MIN_AVG": "form",
  # pedigree (VH-115) — draft + entry expectations, leak-free by construction
  "PED_PICK_QUALITY": "pedigree",
  "PED_ROUND_ONE": "pedigree",
  "PED_UNDRAFTED": "pedigree",
  "PED_EXPECT_SLOT": "pedigree",
  "PED_TEAM_WINPCT": "pedigree",
  "PED_YEARS_SINCE": "pedigree",
  "PED_PICK_DECAY": "pedigree",
  # playoffs (VH-116) — postseason as a distinct regime; masked for
  # player-seasons with no playoff appearance
  "PO_GP": "playoffs",
  "PO_MIN": "playoffs",
  "PO_MIN_DELTA": "playoffs",
  "PO_USG_DELTA": "playoffs",
  "PO_PTS_DELTA": "playoffs",
  "PO_EFF_DELTA": "playoffs",
  "PO_PLUS_MINUS": "playoffs",
  "PO_TEAM_WINS": "playoffs",
  "PO_ROUNDS": "playoffs",
  "PO_SERIES": "playoffs",
  "PO_CLOSE_GAMES": "playoffs",
  "PO_AVG_PTS": "playoffs",
  "PO_HIGH_PTS": "playoffs",
  "PO_CLUTCH_PTS": "playoffs",
  # honors (VH-117) — lagged peer recognition (award year N-1 -> season N)
  "HON_ALL_NBA_TEAM_LAG": "honors",
  "HON_ALL_NBA_VOTE_LAG": "honors",
  "HON_ASG_LAG": "honors",
  "HON_ASG_CUM": "honors",
  "HON_VOTE_RECOG": "honors",
  **{f"GK_{k.upper()}": "game_ratings" for k in _GAME_ATTR_KEYS},
}

PO_FEATURES = [f for f, fam in V4_FEATURES.items() if fam == "playoffs"]
GK_FEATURES = [f for f, fam in V4_FEATURES.items() if fam == "game_ratings"]


def load_train_bundle():
    npz = np.load(DATA_DIR / "train_matrix.npz", allow_pickle=False)
    manifest = json.loads((DATA_DIR / "feature_manifest.json").read_text(encoding="utf-8"))
    return (
        npz["Z"].astype(np.float32),
        npz["mask"].astype(np.float32),
        manifest,
        npz["player_id"],
        npz["season"],
        npz["name"],
        npz["cluster"].astype(np.int64),
    )


def load_roster_by_player_season() -> dict[tuple[str, str], dict]:
    if not ROSTER_JSON.exists():
        return {}
    data = json.loads(ROSTER_JSON.read_text(encoding="utf-8"))
    best: dict[tuple[str, str], dict] = {}
    for row in data.get("entries", []):
        key = (row["name"], row["season"])
        prev = best.get(key)
        if prev is None or (row.get("minutes") or 0) > (prev.get("minutes") or 0):
            best[key] = row
    return best


def load_form_by_player_season() -> dict[tuple[str, str], dict]:
    if not FORM_JSON.exists():
        return {}
    data = json.loads(FORM_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("entries", [])}


def load_career_by_player_season() -> dict[tuple[str, str], dict]:
    if not CAREER_JSON.exists():
        return {}
    data = json.loads(CAREER_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("players", [])}


def load_competition_by_player_season() -> dict[tuple[str, str], dict]:
    path = COMPETITION_JSON if COMPETITION_JSON.exists() else COMPETITION_JSON_LEGACY
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("players", [])}


def load_pedigree_by_player_season() -> dict[tuple[str, str], dict]:
    """(name, season) -> PED_* row from build_pedigree.py; rows without
    coverage were omitted upstream, so absence here == masked family."""
    if not PEDIGREE_JSON.exists():
        return {}
    data = json.loads(PEDIGREE_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r
            for r in data.get("players", []) if "PED_UNDRAFTED" in r}


def load_playoffs_by_player_season() -> dict[tuple[str, str], dict]:
    """(name, season) -> PO_* row from build_playoffs.py; only postseason
    appearances are present, so absence here == masked playoffs family."""
    if not PLAYOFFS_JSON.exists():
        return {}
    data = json.loads(PLAYOFFS_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("players", [])}


def load_honors_by_player_season() -> dict[tuple[str, str], dict]:
    """(name, season) -> HON_* lagged row from build_honors.py."""
    if not HONORS_JSON.exists():
        return {}
    data = json.loads(HONORS_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("players", [])}


def load_game_ratings_by_player_season() -> dict[tuple[str, str], dict]:
    """(name, season) -> GK_* row from build_game_ratings.py."""
    if not GAME_RATINGS_JSON.exists():
        return {}
    data = json.loads(GAME_RATINGS_JSON.read_text(encoding="utf-8"))
    rows = data.get("players", data.get("rows", []))
    return {(r["name"], r["season"]): r for r in rows}


def load_salary_market_by_player_season() -> dict[tuple[str, str], dict]:
    """(name, season) -> SALARY_* row from build_salary_market.py."""
    if not SALARY_MARKET_JSON.exists():
        return {}
    data = json.loads(SALARY_MARKET_JSON.read_text(encoding="utf-8"))
    return {(r["name"], r["season"]): r for r in data.get("players", [])}


def load_team_season_index() -> dict[tuple[str, int], dict]:
    """(season, TEAM_ID) -> merged team_season row."""
    out: dict[tuple[str, int], dict] = {}
    for path in sorted(DATA_DIR.glob("team_season_*.json")):
        if path.name == "team_season_manifest.json":
            continue
        season = path.stem.replace("team_season_", "")
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            continue
        for row in rows:
            out[(season, int(row["TEAM_ID"]))] = row
    return out


def merge_v4_context(
    Z: np.ndarray,
    M: np.ndarray,
    manifest: dict,
    names: np.ndarray,
    seasons: np.ndarray,
    values_per_row: list[dict[str, float | None]],
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Append missing V4 columns and refresh all V4 values (era-z per season).

    Idempotent: safe to re-run after pedigree/playoffs/roster artifacts land
    without bootstrapping a fresh 14-d matrix first.
    """
    manifest = dict(manifest)
    feats = list(manifest["features"])
    fams = dict(manifest.get("families", {}))

    missing = [f for f in V4_FEATURES if f not in feats]
    if missing:
        Z = np.hstack([Z, np.zeros((len(Z), len(missing)), dtype=np.float32)])
        M = np.hstack([M, np.zeros((len(Z), len(missing)), dtype=np.float32)])
        feats.extend(missing)
        for f in missing:
            fams[f] = V4_FEATURES[f]

    v4_feats = [f for f in V4_FEATURES if f in feats]
    col_idx = {f: feats.index(f) for f in v4_feats}

    n = len(names)
    X = np.full((n, len(v4_feats)), np.nan, dtype=np.float32)
    for i, vals in enumerate(values_per_row):
        for j, f in enumerate(v4_feats):
            v = vals.get(f)
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                X[i, j] = float(v)

    Z_out = Z.copy()
    M_out = M.copy()
    for f in v4_feats:
        j = col_idx[f]
        Z_out[:, j] = 0.0
        M_out[:, j] = 0.0

    season_idx: dict[str, list[int]] = defaultdict(list)
    for i, s in enumerate(seasons):
        season_idx[str(s)].append(i)

    for idxs in season_idx.values():
        for j, f in enumerate(v4_feats):
            col = col_idx[f]
            block = X[idxs, j]
            valid = ~np.isnan(block)
            if not valid.any():
                continue
            mu = float(np.nanmean(block))
            sd = float(np.nanstd(block)) or 1.0
            zb = (block - mu) / sd
            for k, i in enumerate(idxs):
                if valid[k]:
                    Z_out[i, col] = np.clip(zb[k], -4, 4)
                    M_out[i, col] = 1.0

    manifest["features"] = feats
    manifest["families"] = fams
    return Z_out, M_out, manifest


def v4_column_indices(manifest: dict) -> list[int]:
    return [manifest["features"].index(f) for f in V4_FEATURES
            if f in manifest["features"]]


def build_row_values(
    names: np.ndarray,
    seasons: np.ndarray,
    roster: dict,
    career: dict,
    competition: dict,
    salary_market: dict,
    team_index: dict[tuple[str, int], dict],
    form: dict,
    pedigree: dict,
    playoffs: dict,
    honors: dict,
    game_ratings: dict,
) -> list[dict[str, float | None]]:
    rows: list[dict[str, float | None]] = []
    for name, season in zip(names, seasons):
        key = (str(name), str(season))
        r = roster.get(key, {})
        c = career.get(key, {})
        comp = competition.get(key, {})
        form_row = form.get(key, {})
        ped = pedigree.get(key, {})
        po = playoffs.get(key, {})
        hon = honors.get(key, {})
        gk = game_ratings.get(key, {})
        mkt = salary_market.get(key, {})
        team_row = team_index.get((str(season), int(r["teamId"]))) if r.get("teamId") else {}
        rows.append({
            "ROSTER_MIN_RANK": r.get("ROSTER_MIN_RANK"),
            "ROSTER_USAGE_CROWD": r.get("ROSTER_USAGE_CROWD"),
            "ROSTER_COMPLEMENT": r.get("ROSTER_COMPLEMENT"),
            "ROSTER_STAR_GAP": r.get("ROSTER_STAR_GAP"),
            "ROSTER_MATES_N": r.get("ROSTER_MATES_N"),
            "YEAR_IN_LEAGUE": c.get("YEAR_IN_LEAGUE"),
            "LAG1_COSINE": c.get("LAG1_COSINE"),
            "DELTA_NORM": c.get("DELTA_NORM"),
            "GP_RATIO": c.get("GP_RATIO"),
            "DRAFT_SLOT_Z": c.get("DRAFT_SLOT_Z"),
            "B2B_RATE": comp.get("B2B_RATE"),
            "REST_AVG": comp.get("REST_AVG"),
            "SOS_NET_RTG": comp.get("SOS_NET_RTG"),
            "CONF_STRENGTH": comp.get("CONF_STRENGTH"),
            "SALARY_LOG": mkt.get("SALARY_LOG"),
            "SALARY_CAP_PCT": mkt.get("SALARY_CAP_PCT"),
            "SALARY_TEAM_PCT": mkt.get("SALARY_TEAM_PCT"),
            "SALARY_RANK_POS": mkt.get("SALARY_RANK_POS"),
            "TM_PACE": team_row.get("PACE"),
            "TM_OFF_RTG": team_row.get("OFF_RATING"),
            "TM_DEF_RTG": team_row.get("DEF_RATING"),
            "TM_NET_RTG": team_row.get("NET_RATING"),
            "TM_WIN_PCT": team_row.get("WIN_PCT"),
            "FORM_VOL": form_row.get("FORM_VOL"),
            "FORM_CEIL": form_row.get("FORM_CEIL"),
            "FORM_DD_RATE": form_row.get("FORM_DD_RATE"),
            "FORM_TD_RATE": form_row.get("FORM_TD_RATE"),
            "FORM_GP": form_row.get("FORM_GP"),
            "FORM_MIN_AVG": form_row.get("FORM_MIN_AVG"),
            "PED_PICK_QUALITY": ped.get("PED_PICK_QUALITY"),
            "PED_ROUND_ONE": ped.get("PED_ROUND_ONE"),
            "PED_UNDRAFTED": ped.get("PED_UNDRAFTED"),
            "PED_EXPECT_SLOT": ped.get("PED_EXPECT_SLOT"),
            "PED_TEAM_WINPCT": ped.get("PED_TEAM_WINPCT"),
            "PED_YEARS_SINCE": ped.get("PED_YEARS_SINCE"),
            "PED_PICK_DECAY": ped.get("PED_PICK_DECAY"),
            "HON_ALL_NBA_TEAM_LAG": hon.get("HON_ALL_NBA_TEAM_LAG"),
            "HON_ALL_NBA_VOTE_LAG": hon.get("HON_ALL_NBA_VOTE_LAG"),
            "HON_ASG_LAG": hon.get("HON_ASG_LAG"),
            "HON_ASG_CUM": hon.get("HON_ASG_CUM"),
            "HON_VOTE_RECOG": hon.get("HON_VOTE_RECOG"),
            **{f: po.get(f) for f in PO_FEATURES},
            **{f: gk.get(f) for f in GK_FEATURES},
        })
    return rows


def write_bundle(Z, M, manifest, *, player_id, season, name, cluster) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        DATA_DIR / "train_matrix.npz",
        Z=Z, mask=M,
        player_id=player_id, season=season, name=name, cluster=cluster,
    )
    manifest["source"] = "integrate_context.py (v4 context merge)"
    (DATA_DIR / "feature_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    proc = subprocess.run(
        [sys.executable, str(ROOT / "pipeline" / "build_salary_market.py")],
        cwd=ROOT,
    )
    if proc.returncode != 0:
        raise SystemExit("build_salary_market.py failed")

    subprocess.run(
        [sys.executable, str(ROOT / "pipeline" / "build_game_ratings.py")],
        cwd=ROOT,
    )

    Z, M, manifest, pids, seasons, names, clusters = load_train_bundle()
    roster = load_roster_by_player_season()
    career = load_career_by_player_season()
    competition = load_competition_by_player_season()
    salary_market = load_salary_market_by_player_season()
    team_index = load_team_season_index()
    form = load_form_by_player_season()
    pedigree = load_pedigree_by_player_season()
    playoffs = load_playoffs_by_player_season()
    honors = load_honors_by_player_season()
    game_ratings = load_game_ratings_by_player_season()

    print(f"artifacts: roster={len(roster)} career={len(career)} "
          f"competition={len(competition)} salary_market={len(salary_market)} "
          f"team_season={len(team_index)} "
          f"form={len(form)} pedigree={len(pedigree)} playoffs={len(playoffs)} "
          f"honors={len(honors)} game_ratings={len(game_ratings)}")

    row_vals = build_row_values(
        names, seasons, roster, career, competition,
        salary_market, team_index, form, pedigree, playoffs, honors,
        game_ratings)
    Z2, M2, man2 = merge_v4_context(Z, M, manifest, names, seasons, row_vals)
    v4_cols = v4_column_indices(man2)
    covered = int((M2[:, v4_cols] > 0).any(axis=1).sum()) if v4_cols else 0
    ped_col = man2["features"].index("PED_PICK_QUALITY") if "PED_PICK_QUALITY" in man2["features"] else None
    ped_rows = int((M2[:, ped_col] > 0).sum()) if ped_col is not None else 0
    print(f"context merge: {Z.shape[1]} -> {Z2.shape[1]} features; "
          f"{covered}/{len(names)} rows with any v4 context; "
          f"pedigree labeled rows={ped_rows}")

    if args.dry_run:
        print("dry-run; not writing")
        return

    write_bundle(Z2, M2, man2, player_id=pids, season=seasons, name=names, cluster=clusters)
    print("wrote train_matrix.npz + feature_manifest.json (v4 context)")


if __name__ == "__main__":
    main()
