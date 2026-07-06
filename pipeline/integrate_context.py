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
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
CACHE_DIR = ROOT / "pipeline" / "cache"

ROSTER_JSON = DATA_DIR / "roster_context.json"
ROLE_JSON = DATA_DIR / "role_context.json"
CAREER_JSON = DATA_DIR / "career_arc.json"
COMPETITION_JSON = DATA_DIR / "competition.json"
COMPETITION_JSON_LEGACY = DATA_DIR / "competition_context.json"
SALARIES_JSON = CACHE_DIR / "salaries_merged.json"

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
  # team env (VH-107) — joined via roster_context teamId
  "TM_PACE": "team",
  "TM_OFF_RTG": "team",
  "TM_DEF_RTG": "team",
  "TM_NET_RTG": "team",
  "TM_WIN_PCT": "team",
  # role standing (feature_lab PASS — game logs 2015-26)
  "ROLE_MIN_SHARE": "role",
  "ROLE_USAGE_SHARE": "role",
  "ROLE_SCORE_RANK": "role",
}


def norm_name(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


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


def load_role_by_player_season() -> dict[tuple[str, str], dict]:
    if not ROLE_JSON.exists():
        return {}
    data = json.loads(ROLE_JSON.read_text(encoding="utf-8"))
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


def load_salary_cap_pct() -> dict[tuple[str, str], float]:
    if not SALARIES_JSON.exists():
        return {}
    data = json.loads(SALARIES_JSON.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], float] = {}
    for row in data.get("salaries", {}).values():
        cap = row.get("cap_pct")
        if cap is not None:
            out[(row.get("norm_name") or norm_name(row["name"]), row["season"])] = float(cap)
    return out


def load_salary_log() -> dict[tuple[str, str], float]:
    """Raw log10(USD) from salaries_merged.json keyed by (norm_name, season)."""
    if not SALARIES_JSON.exists():
        return {}
    data = json.loads(SALARIES_JSON.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], float] = {}
    for row in data.get("salaries", {}).values():
        sal = row.get("salary")
        if sal and float(sal) > 0:
            nn = row.get("norm_name") or norm_name(row["name"])
            out[(nn, row["season"])] = math.log10(float(sal))
    return out


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


def era_z_append(
    Z: np.ndarray,
    M: np.ndarray,
    manifest: dict,
    names: np.ndarray,
    seasons: np.ndarray,
    values_per_row: list[dict[str, float | None]],
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Append V4 feature columns with era z-scoring within season."""
    new_feats = [f for f in V4_FEATURES if f not in manifest["features"]]
    if not new_feats:
        return Z, M, manifest

    n, d0 = Z.shape
    d1 = len(new_feats)
    X = np.full((n, d1), np.nan, dtype=np.float32)
    for i, vals in enumerate(values_per_row):
        for j, f in enumerate(new_feats):
            v = vals.get(f)
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                X[i, j] = float(v)

    Z_out = np.hstack([Z, np.zeros((n, d1), dtype=np.float32)])
    M_out = np.hstack([M, np.zeros((n, d1), dtype=np.float32)])

    season_idx: dict[str, list[int]] = defaultdict(list)
    for i, s in enumerate(seasons):
        season_idx[str(s)].append(i)

    for idxs in season_idx.values():
        block = X[idxs]
        for j in range(d1):
            col = block[:, j]
            valid = ~np.isnan(col)
            if not valid.any():
                continue
            mu = float(np.nanmean(col))
            sd = float(np.nanstd(col)) or 1.0
            zb = (col - mu) / sd
            for k, i in enumerate(idxs):
                if valid[k]:
                    Z_out[i, d0 + j] = np.clip(zb[k], -4, 4)
                    M_out[i, d0 + j] = 1.0

    manifest = dict(manifest)
    manifest["features"] = list(manifest["features"]) + new_feats
    fams = dict(manifest.get("families", {}))
    for f in new_feats:
        fams[f] = V4_FEATURES[f]
    manifest["families"] = fams
    return Z_out, M_out, manifest


def build_row_values(
    names: np.ndarray,
    seasons: np.ndarray,
    roster: dict,
    career: dict,
    competition: dict,
    salary_cap: dict,
    salary_log: dict,
    team_index: dict[tuple[str, int], dict],
    role: dict,
) -> list[dict[str, float | None]]:
    rows: list[dict[str, float | None]] = []
    for name, season in zip(names, seasons):
        key = (str(name), str(season))
        nkey = (norm_name(str(name)), str(season))
        r = roster.get(key, {})
        c = career.get(key, {})
        comp = competition.get(key, {})
        role_row = role.get(key, {})
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
            "SALARY_CAP_PCT": salary_cap.get(nkey),
            "SALARY_LOG": salary_log.get(nkey),
            "TM_PACE": team_row.get("PACE"),
            "TM_OFF_RTG": team_row.get("OFF_RATING"),
            "TM_DEF_RTG": team_row.get("DEF_RATING"),
            "TM_NET_RTG": team_row.get("NET_RATING"),
            "TM_WIN_PCT": team_row.get("WIN_PCT"),
            "ROLE_MIN_SHARE": role_row.get("ROLE_MIN_SHARE"),
            "ROLE_USAGE_SHARE": role_row.get("ROLE_USAGE_SHARE"),
            "ROLE_SCORE_RANK": role_row.get("ROLE_SCORE_RANK"),
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

    Z, M, manifest, pids, seasons, names, clusters = load_train_bundle()
    roster = load_roster_by_player_season()
    career = load_career_by_player_season()
    competition = load_competition_by_player_season()
    salary_cap = load_salary_cap_pct()
    salary_log = load_salary_log()
    team_index = load_team_season_index()
    role = load_role_by_player_season()

    print(f"artifacts: roster={len(roster)} career={len(career)} "
          f"competition={len(competition)} salary_cap={len(salary_cap)} "
          f"salary_log={len(salary_log)} team_season={len(team_index)} "
          f"role={len(role)}")

    row_vals = build_row_values(
        names, seasons, roster, career, competition,
        salary_cap, salary_log, team_index, role)
    Z2, M2, man2 = era_z_append(Z, M, manifest, names, seasons, row_vals)
    covered = int((M2[:, Z.shape[1]:] > 0).any(axis=1).sum()) if Z2.shape[1] > Z.shape[1] else 0
    print(f"context merge: {Z.shape[1]} -> {Z2.shape[1]} features; "
          f"{covered}/{len(names)} rows with any v4 context")

    if args.dry_run:
        print("dry-run; not writing")
        return

    write_bundle(Z2, M2, man2, player_id=pids, season=seasons, name=names, cluster=clusters)
    print("wrote train_matrix.npz + feature_manifest.json (v4 context)")


if __name__ == "__main__":
    main()
