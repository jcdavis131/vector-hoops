"""Build the hoops multi-target benchmark dataset (real data, forward-shifted labels).

Row = one eligible player-season (entity = player, time = season). Sources are
all REAL, committed or cache-fetched:

  * assets/vectors.json — the shipped model matrix: 12,966 eligibility-gated
    player-seasons 1996-97..2025-26 with the 14 era-z per-100-possession game
    features the MTNN trains on, plus gp / mpg / salary / birth year.
  * pipeline/cache/bbref_advanced_{season}.json — Basketball-Reference advanced
    stats (PER, WS, BPM, ...) fetched by bench/fetch_bbref.py.
  * pipeline/cache/bbref_per_game_{season}.json — Basketball-Reference per-game
    stats (PTS/G, TRB/G, AST/G) fetched by bench/fetch_bbref.py.

FEATURES for row (player, season t) use ONLY season-t information:
  14 era-z game features + gp + mpg + salary_log(+ indicator) + age(+ indicator)
  + raw current-season per, ws, bpm, pts/g, trb/g, ast/g (+ one bbref-join
  indicator each family). Raw current-stat columns are kept in ORIGINAL units
  (not scaled) so a persistence baseline can read them directly; missing values
  are stored as NaN — downstream consumers must impute using TRAIN rows only.

LABELS for row (player, season t) are strictly forward-shifted:
  y_next_season_<stat> = that player's <stat> in season t+1, defined ONLY when
  (a) the player has a season-t+1 row in assets/vectors.json (the repo's
  eligibility gate — players who fell out of the league / below the minutes
  gate are masked, never imputed), and (b) the stat joins from the season-t+1
  Basketball-Reference table. Everything else is masked (label_mask_*=0).

TIME KEY: target season end-year (t+1), matching the vector-bench registry
construction ("temporal split on the *target* season year"). The canonical
split committed here: train target-year <= 2023, val 2024..2025, test 2026.

Join discipline: bbref rows are joined to NBA player-seasons by normalized name
(pipeline/fetch_bbref_advanced.py::norm_name). Within a season, names that are
ambiguous on either side (two players -> one key) are dropped from the join,
never guessed; counts are recorded in the datasheet.

Run (after bench/fetch_bbref.py has populated the caches):
  python bench/build_dataset.py
Writes bench/data/hoops_nextseason.npz + bench/data/datasheet.json.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
OUT_DIR = ROOT / "bench" / "data"

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]  # 1996-97..2025-26

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

# (target name, cache family, cache stat key)
TARGETS = [
    ("next_season_per", "advanced", "per"),
    ("next_season_win_shares", "advanced", "ws"),
    ("next_season_bpm", "advanced", "bpm"),
    ("next_season_pts", "per_game", "pts_per_g"),
    ("next_season_reb", "per_game", "trb_per_g"),
    ("next_season_ast", "per_game", "ast_per_g"),
]

TRAIN_MAX_TARGET_YEAR = 2023  # train: target season year <= 2023
VAL_TARGET_YEARS = (2024, 2025)  # val: 2024..2025
TEST_TARGET_YEAR = 2026  # test: 2026 (features from 2024-25, labels 2025-26)


def norm_name(name: str) -> str:
    """Same normalization as bench/fetch_bbref.py / pipeline/fetch_bbref_advanced.py."""
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    for suffix in (" jr", " sr", " ii", " iii", " iv", " v"):
        if s.replace(".", "").rstrip().endswith(suffix):
            s = s.replace(".", "").rstrip()
            s = s[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]", "", s)


def season_end_year(season: str) -> int:
    return int(season[:4]) + 1


def load_bbref(family: str) -> dict[int, dict[str, dict[str, float]]]:
    """season end-year -> norm_name -> stats. Missing season files -> absent key."""
    out: dict[int, dict[str, dict[str, float]]] = {}
    prefix = "bbref_advanced_" if family == "advanced" else "bbref_per_game_"
    for season in SEASONS:
        p = CACHE / f"{prefix}{season}.json"
        if p.exists():
            out[season_end_year(season)] = json.loads(p.read_text())
    return out


def main() -> None:
    vec = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))
    players = vec["players"]
    bbref = {fam: load_bbref(fam) for fam in ("advanced", "per_game")}
    for fam, seasons in bbref.items():
        missing = [s for s in SEASONS if season_end_year(s) not in seasons]
        if missing:
            print(f"[warn] {fam}: missing cached seasons {missing}", file=sys.stderr)

    # --- per-season NBA-side name ambiguity (two pids -> one norm name) ------
    per_season_names: dict[int, Counter] = {}
    for p in players:
        per_season_names.setdefault(season_end_year(p["season"]), Counter())[norm_name(p["name"])] += 1
    ambiguous: dict[int, set[str]] = {yr: {n for n, c in cnt.items() if c > 1} for yr, cnt in per_season_names.items()}
    n_ambiguous_rows = sum(1 for p in players if norm_name(p["name"]) in ambiguous[season_end_year(p["season"])])

    # --- rows sorted (player, season) for reproducibility --------------------
    players = sorted(players, key=lambda p: (int(p["pid"]), p["season"]))
    n = len(players)
    # which (pid -> set of season end-years) exist in the eligibility-gated matrix
    pid_years: dict[int, set[int]] = {}
    for p in players:
        pid_years.setdefault(int(p["pid"]), set()).add(season_end_year(p["season"]))

    feature_names = (
        [f"eraz_{f}" for f in GAME_FEATURES]
        + ["gp", "mpg", "salary_log", "has_salary", "age", "has_age"]
        + ["cur_per", "cur_ws", "cur_bpm", "cur_pts", "cur_reb", "cur_ast", "has_bbref_adv", "has_bbref_pg"]
    )
    d = len(feature_names)
    X = np.full((n, d), np.nan, dtype=np.float32)
    entity_id = np.zeros(n, dtype=np.int64)
    time_id = np.zeros(n, dtype=np.int64)  # feature season end-year (t)
    target_year = np.zeros(n, dtype=np.int64)  # t + 1 (the split key)
    names = np.array([p["name"] for p in players])
    seasons_arr = np.array([p["season"] for p in players])

    y = {t: np.full(n, np.nan, dtype=np.float32) for t, _, _ in TARGETS}
    mask = {t: np.zeros(n, dtype=bool) for t, _, _ in TARGETS}

    join_hits = {"advanced": 0, "per_game": 0}
    label_counts = Counter()

    for i, p in enumerate(players):
        t_year = season_end_year(p["season"])
        pid = int(p["pid"])
        entity_id[i] = pid
        time_id[i] = t_year
        target_year[i] = t_year + 1
        key = norm_name(p["name"])
        is_amb = key in ambiguous[t_year]

        # 14 era-z game features (season-t only, z-scored within season cohort)
        X[i, :14] = np.asarray(p["v"], dtype=np.float32)
        X[i, 14] = float(p.get("gp", np.nan))
        X[i, 15] = float(p.get("mpg", np.nan))
        sal = p.get("sal")
        X[i, 16] = float(sal) if sal is not None else np.nan
        X[i, 17] = 1.0 if sal is not None else 0.0
        by = p.get("birthYear")
        X[i, 18] = (t_year - float(by)) if by else np.nan
        X[i, 19] = 1.0 if by else 0.0

        # current-season raw bbref stats (season t; join by normalized name)
        adv = None if is_amb else bbref["advanced"].get(t_year, {}).get(key)
        pg = None if is_amb else bbref["per_game"].get(t_year, {}).get(key)
        if adv:
            X[i, 20] = adv.get("per", np.nan)
            X[i, 21] = adv.get("ws", np.nan)
            X[i, 22] = adv.get("bpm", np.nan)
            join_hits["advanced"] += 1
        X[i, 26] = 1.0 if adv else 0.0
        if pg:
            X[i, 23] = pg.get("pts_per_g", np.nan)
            X[i, 24] = pg.get("trb_per_g", np.nan)
            X[i, 25] = pg.get("ast_per_g", np.nan)
            join_hits["per_game"] += 1
        X[i, 27] = 1.0 if pg else 0.0

        # ---- forward-shifted labels (season t+1 ONLY) -----------------------
        next_year = t_year + 1
        has_next_row = next_year in pid_years.get(pid, ())
        if not has_next_row or is_amb or key in ambiguous.get(next_year, set()):
            continue  # masked: player not in eligibility-gated matrix at t+1
        for tname, fam, statkey in TARGETS:
            rec = bbref[fam].get(next_year, {}).get(key)
            if rec is None:
                continue
            v = rec.get(statkey)
            if v is None or (isinstance(v, float) and v != v):
                continue
            y[tname][i] = np.float32(v)
            mask[tname][i] = True
            label_counts[tname] += 1

    # --- canonical 3-way split on TARGET season year -------------------------
    split_train = np.where(target_year <= TRAIN_MAX_TARGET_YEAR)[0]
    split_val = np.where((target_year >= VAL_TARGET_YEARS[0]) & (target_year <= VAL_TARGET_YEARS[-1]))[0]
    split_test = np.where(target_year == TEST_TARGET_YEAR)[0]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    arrays: dict[str, np.ndarray] = dict(
        X=X,
        feature_names=np.array(feature_names),
        entity_id=entity_id,
        time_id=time_id,
        target_year=target_year,
        name=names,
        season=seasons_arr,
        split_train=split_train,
        split_val=split_val,
        split_test=split_test,
    )
    for tname, _, _ in TARGETS:
        arrays[f"y_{tname}"] = y[tname]
        arrays[f"label_mask_{tname}"] = mask[tname]
    np.savez_compressed(OUT_DIR / "hoops_nextseason.npz", **arrays)

    datasheet = {
        "built": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "rows": int(n),
        "entities": int(len(pid_years)),
        "time_range": {
            "feature_seasons": [SEASONS[0], SEASONS[-1]],
            "feature_year_min": int(time_id.min()),
            "feature_year_max": int(time_id.max()),
        },
        "features": {
            "count": d,
            "names": feature_names,
            "description": (
                "Per row (player, season t): 14 per-100-possession game features "
                "z-scored within season cohort (assets/vectors.json 'v'; uses only "
                "season-t data), gp, mpg, log-salary (+indicator), age (+indicator), "
                "and raw season-t Basketball-Reference PER/WS/BPM/PTSpg/TRBpg/ASTpg "
                "(+join indicators) kept in original units for the persistence "
                "baseline. Missing values are NaN; consumers must impute from TRAIN "
                "rows only."
            ),
        },
        "labels": {
            tname: {
                "construction": (
                    f"y = player's {statkey} ({fam} table, Basketball-Reference) in "
                    "season t+1; defined only when the player has a season-t+1 row "
                    "in the eligibility-gated assets/vectors.json matrix AND joins "
                    "the season-t+1 bbref table by normalized name; else masked."
                ),
                "observed": int(label_counts[tname]),
            }
            for tname, fam, statkey in TARGETS
        },
        "split": {
            "key": "target_year (= feature season end-year + 1)",
            "train": f"target_year <= {TRAIN_MAX_TARGET_YEAR} ({len(split_train)} rows)",
            "val": f"target_year in {list(VAL_TARGET_YEARS)} ({len(split_val)} rows)",
            "test": f"target_year == {TEST_TARGET_YEAR} ({len(split_test)} rows)",
            "note": (
                "Strictly temporal: every train row's label season precedes every "
                "val label season, which precedes the test label season (2025-26)."
            ),
        },
        "join": {
            "method": "normalized name (accent-strip, suffix-strip, alnum only)",
            "bbref_advanced_rows_joined": join_hits["advanced"],
            "bbref_per_game_rows_joined": join_hits["per_game"],
            "nba_rows_with_ambiguous_name_dropped_from_join": int(n_ambiguous_rows),
        },
        "sources": {
            "features": "assets/vectors.json (committed; built by pipeline/build_vectors.py from stats.nba.com caches)",
            "bbref": "basketball-reference.com season tables fetched by bench/fetch_bbref.py into pipeline/cache/",
        },
    }
    (OUT_DIR / "datasheet.json").write_text(json.dumps(datasheet, indent=2) + "\n")
    print(f"wrote {OUT_DIR / 'hoops_nextseason.npz'} ({n} rows x {d} features)")
    for tname, _, _ in TARGETS:
        print(f"  {tname}: {label_counts[tname]} labeled rows")
    print(f"splits: train={len(split_train)} val={len(split_val)} test={len(split_test)}")


if __name__ == "__main__":
    main()
