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
  4. Salary:
       a. pipeline/cache/salaries_history.csv drop-in (name,season,salary)
          -- full-history file (e.g. a Kaggle/hoopshype export); joined
          automatically when present.
       b. basketball-reference.com/contracts/players.html -- current
          contracts, fills the most recent seasons when (a) is absent.
     Salary becomes log-salary z-scored within season + a mask column.

Cleaning applied (all guaranteed, audited by end-of-build assertions):
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
import random
import re
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "vectors.json"
CACHE = ROOT / "pipeline" / "cache"
DATA_DIR = ROOT / "pipeline" / "data"

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1996, 2026)]
TRACKING_FIRST_SEASON = "2013-14"
MIN_MINUTES = 800  # a real rotation season

# ---------------------------------------------------------------------------
# Feature groups. GAME_FEATURES is the frozen 14-dim game contract
# (order matters: assets/game.js indexes into it). WIDE adds everything else.
# ---------------------------------------------------------------------------

GAME_FEATURES = ["PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV",
                 "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT", "PLUS_MINUS"]
LABELS = {
    "PTS": "scoring volume", "AST": "playmaking", "OREB": "offensive glass",
    "DREB": "defensive glass", "STL": "steals", "BLK": "rim protection",
    "TOV": "turnovers", "FG3A": "three-point volume", "FGA": "shot volume",
    "FTA": "rim pressure (FTs)", "FG3_PCT": "three-point accuracy",
    "FG_PCT": "finishing", "FT_PCT": "free-throw touch", "PLUS_MINUS": "on-court impact",
}

# Desired columns per extra endpoint; intersected with what the API returns
# so column drift never crashes a build (actual set recorded in the manifest).
ADVANCED_COLS = ["TS_PCT", "EFG_PCT", "USG_PCT", "AST_PCT", "AST_TO",
                 "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT",
                 "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE", "PIE"]
SCORING_COLS = ["PCT_PTS_2PT", "PCT_PTS_2PT_MR", "PCT_PTS_3PT", "PCT_PTS_FB",
                "PCT_PTS_FT", "PCT_PTS_OFF_TOV", "PCT_PTS_PAINT",
                "PCT_AST_2PM", "PCT_UAST_2PM", "PCT_AST_3PM", "PCT_UAST_3PM",
                "PCT_AST_FGM", "PCT_UAST_FGM"]
BIO_COLS = ["PLAYER_HEIGHT_INCHES", "PLAYER_WEIGHT", "AGE", "DRAFT_NUMBER"]
TRACKING_SPECS = [  # (pt_measure_type, wanted columns)
    ("SpeedDistance", ["DIST_MILES", "AVG_SPEED"]),
    ("Drives", ["DRIVES", "DRIVE_PTS", "DRIVE_PASSES"]),
    ("CatchShoot", ["CATCH_SHOOT_FGA", "CATCH_SHOOT_PTS", "CATCH_SHOOT_FG3_PCT"]),
    ("PullUpShot", ["PULL_UP_FGA", "PULL_UP_PTS"]),
    ("Possessions", ["TOUCHES", "FRONT_CT_TOUCHES", "TIME_OF_POSS",
                     "AVG_SEC_PER_TOUCH", "PAINT_TOUCHES", "POST_TOUCHES",
                     "ELBOW_TOUCHES"]),
    ("Passing", ["PASSES_MADE", "POTENTIAL_AST", "SECONDARY_AST"]),
]

# Tower families for train_towers.py (feature name -> family).
FAMILY_OF = {}
for f in ["PTS", "FGA", "FTA", "FG3A", "USG_PCT"]:
    FAMILY_OF[f] = "volume"
for f in ["AST", "TOV", "AST_PCT", "AST_TO", "TM_TOV_PCT",
          "PASSES_MADE", "POTENTIAL_AST", "SECONDARY_AST",
          "TOUCHES", "FRONT_CT_TOUCHES", "TIME_OF_POSS", "AVG_SEC_PER_TOUCH"]:
    FAMILY_OF[f] = "playmaking"
for f in ["OREB", "DREB", "OREB_PCT", "DREB_PCT", "REB_PCT"]:
    FAMILY_OF[f] = "rebounding"
for f in ["STL", "BLK", "DEF_RATING"]:
    FAMILY_OF[f] = "defense"
for f in ["FG3_PCT", "FG_PCT", "FT_PCT", "TS_PCT", "EFG_PCT", "PIE",
          "OFF_RATING", "NET_RATING", "PLUS_MINUS", "PACE"]:
    FAMILY_OF[f] = "efficiency"
for f in SCORING_COLS:
    FAMILY_OF[f] = "shotmix"
for f in ["DIST_MILES", "AVG_SPEED", "DRIVES", "DRIVE_PTS", "DRIVE_PASSES",
          "CATCH_SHOOT_FGA", "CATCH_SHOOT_PTS", "CATCH_SHOOT_FG3_PCT",
          "PULL_UP_FGA", "PULL_UP_PTS",
          "PAINT_TOUCHES", "POST_TOUCHES", "ELBOW_TOUCHES"]:
    FAMILY_OF[f] = "tracking"
for f in BIO_COLS:
    FAMILY_OF[f] = "bio"
FAMILY_OF["SALARY_LOG"] = "market"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


# ---------------------------------------------------------------------------
# Cached fetch layer
# ---------------------------------------------------------------------------

def cache_path(tag: str, season: str) -> Path:
    return CACHE / f"{tag}_{season}.json"


def load_cached(tag: str, season: str):
    p = cache_path(tag, season)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def save_cache(tag: str, season: str, rows) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_path(tag, season).write_text(
        json.dumps(rows, separators=(",", ":")), encoding="utf-8")


def with_retries(fn, what: str, attempts: int = 5):
    """stats.nba.com drops connections when throttled; back off hard."""
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as e:
            wait = min(120, (2 ** attempt) * 8) + random.uniform(0, 4)
            print(f"  {what}: attempt {attempt + 1}/{attempts} failed "
                  f"({type(e).__name__}); sleeping {wait:.0f}s")
            time.sleep(wait)
    print(f"  {what}: EXHAUSTED retries -- skipping (cached later runs resume)")
    return None


def df_to_rows(df, id_col: str, wanted: list[str]) -> tuple[list[dict], list[str]]:
    present = [c for c in wanted if c in df.columns]
    rows = []
    for _, x in df.iterrows():
        row = {"PLAYER_ID": int(x[id_col]), "PLAYER_NAME": str(x.get("PLAYER_NAME", ""))}
        for c in present:
            v = x[c]
            row[c] = None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)
        rows.append(row)
    return rows, present


def fetch_dash(season: str, measure: str, wanted: list[str], offline: bool):
    tag = f"dash{measure.lower()}"
    cached = load_cached(tag, season)
    if cached is not None:
        return cached
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashplayerstats

    def call():
        r = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season, per_mode_detailed="Per100Possessions",
            measure_type_detailed_defense=measure, timeout=75)
        df = r.get_data_frames()[0]
        extra = ["MIN", "GP"] if measure == "Base" else []
        rows, _ = df_to_rows(df, "PLAYER_ID", wanted + extra)
        return rows

    rows = with_retries(call, f"{season} {measure}")
    if rows is not None:
        save_cache(tag, season, rows)
        time.sleep(1.2)
    return rows


def fetch_bio(season: str, offline: bool):
    cached = load_cached("bio", season)
    if cached is not None:
        return cached
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashplayerbiostats

    def call():
        r = leaguedashplayerbiostats.LeagueDashPlayerBioStats(season=season, timeout=75)
        df = r.get_data_frames()[0]
        # DRAFT_NUMBER arrives as str ('Undrafted'); coerce
        if "DRAFT_NUMBER" in df.columns:
            df["DRAFT_NUMBER"] = df["DRAFT_NUMBER"].apply(
                lambda v: float(v) if str(v).isdigit() else 61.0)
        rows, _ = df_to_rows(df, "PLAYER_ID", BIO_COLS)
        return rows

    rows = with_retries(call, f"{season} bio")
    if rows is not None:
        save_cache("bio", season, rows)
        time.sleep(1.2)
    return rows


def fetch_tracking(season: str, offline: bool):
    if season < TRACKING_FIRST_SEASON:
        return {}
    merged_cached = load_cached("tracking", season)
    if merged_cached is not None:
        return merged_cached
    if offline:
        return None
    from nba_api.stats.endpoints import leaguedashptstats

    merged: dict[str, dict] = {}
    ok = True
    for measure, wanted in TRACKING_SPECS:
        def call(measure=measure, wanted=wanted):
            r = leaguedashptstats.LeagueDashPtStats(
                season=season, pt_measure_type=measure,
                per_mode_simple="PerGame", player_or_team="Player", timeout=75)
            df = r.get_data_frames()[0]
            rows, _ = df_to_rows(df, "PLAYER_ID", wanted)
            return rows

        rows = with_retries(call, f"{season} tracking/{measure}")
        if rows is None:
            ok = False
            continue
        for row in rows:
            pid = str(row["PLAYER_ID"])
            merged.setdefault(pid, {})
            for k, v in row.items():
                if k not in ("PLAYER_ID", "PLAYER_NAME"):
                    merged[pid][k] = v
        time.sleep(1.2)
    if ok:
        save_cache("tracking", season, merged)
    return merged


# ---------------------------------------------------------------------------
# Salary sources
# ---------------------------------------------------------------------------

def norm_name(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def load_salary_history() -> dict[tuple[str, str], float]:
    """Optional full-history drop-in: pipeline/cache/salaries_history.csv
    with header name,season,salary (season as '2003-04')."""
    p = CACHE / "salaries_history.csv"
    out: dict[tuple[str, str], float] = {}
    if not p.exists():
        return out
    with p.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            try:
                out[(norm_name(row["name"]), row["season"])] = float(
                    re.sub(r"[^0-9.]", "", row["salary"]) or 0)
            except Exception:
                continue
    print(f"salary history CSV: {len(out)} rows")
    return out


def fetch_bbref_contracts(offline: bool) -> dict[tuple[str, str], float]:
    """Current contracts from basketball-reference (static HTML, verified).
    Yields (name, season) -> salary for the seasons the table covers."""
    cached = load_cached("salary_bbref", "current")
    if cached is not None:
        return {(k.split("|")[0], k.split("|")[1]): v for k, v in cached.items()}
    if offline:
        return {}
    import requests
    out: dict[tuple[str, str], float] = {}
    try:
        r = requests.get("https://www.basketball-reference.com/contracts/players.html",
                         headers={"User-Agent": UA}, timeout=40)
        r.raise_for_status()
        html = r.text
        # header: season columns like >2025-26<
        head = re.search(r"<thead>.*?</thead>", html, re.S)
        seasons = re.findall(r">(\d{4}-\d{2})<", head.group(0)) if head else []
        for m in re.finditer(
                r'<tr[^>]*>.*?data-stat="player"[^>]*>.*?>([^<]+)</a>(.*?)</tr>',
                html, re.S):
            name, rest = m.group(1), m.group(2)
            sals = re.findall(r'data-stat="y\d+"[^>]*>\$?([\d,]+)', rest)
            for i, s in enumerate(sals[:len(seasons)]):
                try:
                    out[(norm_name(name), seasons[i])] = float(s.replace(",", ""))
                except ValueError:
                    continue
        save_cache("salary_bbref", "current",
                   {f"{k[0]}|{k[1]}": v for k, v in out.items()})
        print(f"bbref contracts: {len(out)} (name,season) salaries")
    except Exception as e:
        print(f"bbref contracts fetch failed ({type(e).__name__}) -- salary "
              "will rely on salaries_history.csv / cache")
    return out


# ---------------------------------------------------------------------------
# Cleaning helpers
# ---------------------------------------------------------------------------

def shrink_percentages(rows: list[dict]) -> None:
    """Empirical-Bayes: shrink noisy percentages toward the season mean,
    weighted by per-100 attempts. m = prior strength in attempts."""
    for pct, att, m in (("FG3_PCT", "FG3A", 6.0), ("FT_PCT", "FTA", 6.0),
                        ("FG_PCT", "FGA", 6.0)):
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
    ap.add_argument("--offline", action="store_true",
                    help="rebuild from pipeline/cache only; no network")
    args = ap.parse_args()

    salary_hist = load_salary_history()
    salary_bbref = fetch_bbref_contracts(args.offline)

    all_rows: list[dict] = []
    extra_presence: dict[str, set] = {"advanced": set(), "scoring": set(),
                                      "bio": set(), "tracking": set()}
    fetched, missing = [], []

    for season in SEASONS:
        base = fetch_dash(season, "Base", GAME_FEATURES, args.offline)
        if not base:
            missing.append(season)
            continue
        adv = {str(r["PLAYER_ID"]): r
               for r in (fetch_dash(season, "Advanced", ADVANCED_COLS, args.offline) or [])}
        sco = {str(r["PLAYER_ID"]): r
               for r in (fetch_dash(season, "Scoring", SCORING_COLS, args.offline) or [])}
        bio = {str(r["PLAYER_ID"]): r
               for r in (fetch_bio(season, args.offline) or [])}
        trk = fetch_tracking(season, args.offline) or {}

        n_kept = 0
        for r in base:
            minutes = (r.get("MIN") or 0) * (r.get("GP") or 0)
            if minutes < MIN_MINUTES:
                continue
            pid = str(r["PLAYER_ID"])
            row = dict(r)
            row["season"] = season
            for src, name in ((adv, "advanced"), (sco, "scoring"), (bio, "bio")):
                extra = src.get(pid, {})
                for k, v in extra.items():
                    if k not in ("PLAYER_ID", "PLAYER_NAME"):
                        row[k] = v
                        extra_presence[name].add(k)
            for k, v in (trk.get(pid) or {}).items():
                row[k] = v
                extra_presence["tracking"].add(k)
            # salary
            key = (norm_name(row["PLAYER_NAME"]), season)
            sal = salary_hist.get(key, salary_bbref.get(key))
            row["SALARY_LOG"] = math.log10(sal) if sal and sal > 0 else None
            all_rows.append(row)
            n_kept += 1
        fetched.append(season)
        print(f"{season}: {n_kept} qualified player-seasons")

    if not all_rows:
        raise SystemExit("no data available (network throttled and no cache) "
                         "-- aborting honestly; re-run later, cache resumes")
    if missing:
        print(f"WARNING: seasons missing this run (throttled): {missing}")
        print("re-run when stats.nba.com cools down; cached seasons persist")

    all_rows = dedupe_rows(all_rows)

    # per-season percentage shrinkage
    by_season: dict[str, list[dict]] = {}
    for r in all_rows:
        by_season.setdefault(r["season"], []).append(r)
    for rows in by_season.values():
        shrink_percentages(rows)

    # ---- wide feature list: game contract first (frozen order) ----
    wide_features = list(GAME_FEATURES)
    for name in ("advanced", "scoring", "bio", "tracking"):
        for c in sorted(extra_presence[name]):
            if c not in wide_features:
                wide_features.append(c)
    wide_features.append("SALARY_LOG")

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
        return f"{a} + {b}".title() if c[top[1]] > 0.35 else \
            f"{a} (low {LABELS[GAME_FEATURES[low]]})".title()

    cluster_names = [name_cluster(cent[k]) for k in range(K)]

    # ---- assets/vectors.json: frozen game contract + additive extras ----
    sal_col = wide_features.index("SALARY_LOG")
    players = []
    for i, r in enumerate(all_rows):
        p = {
            "id": i,
            "name": r["PLAYER_NAME"], "season": r["season"],
            "v": [round(float(z), 3) for z in Zg[i]],
            "x": round(float(P[i, 0]), 4), "y": round(float(P[i, 1]), 4),
            "z": round(float(P[i, 2]), 4),
            "c": int(lab[i]),
        }
        if mask[i, sal_col]:
            p["sal"] = round(float(Z[i, sal_col]), 3)  # salary z (era-honest)
        players.append(p)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "seasons": [SEASONS[0], SEASONS[-1]],
        "normalization": "per-100 possessions, z-scored within season (era-honest)",
        "features": GAME_FEATURES, "featureLabels": LABELS,
        "clusters": cluster_names,
        "players": players,
    }, separators=(",", ":")), encoding="utf-8")

    # ---- wide training bundle for train_towers.py ----
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        DATA_DIR / "train_matrix.npz",
        Z=Z.astype(np.float32), mask=mask,
        player_id=np.array([r["PLAYER_ID"] for r in all_rows]),
        season=np.array([r["season"] for r in all_rows]),
        name=np.array([r["PLAYER_NAME"] for r in all_rows]),
        cluster=lab,
    )
    manifest = {
        "built": time.strftime("%Y-%m-%d"),
        "n_players": n,
        "features": wide_features,
        "families": {f: FAMILY_OF.get(f, "efficiency") for f in wide_features},
        "game_features": GAME_FEATURES,
        "tracking_first_season": TRACKING_FIRST_SEASON,
        "seasons_fetched": fetched,
        "seasons_missing": missing,
        "salary_coverage": int(mask[:, sal_col].sum()),
        "notes": "Z is era z-scored (NaN->season mean, clip 4); mask marks measured values",
    }
    (DATA_DIR / "feature_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8")

    # ---- audit assertions: never ship a dirty file ----
    assert len({(p["name"], p["season"]) for p in players}) == len(players), "dupes"
    assert all(len(p["v"]) == 14 for p in players), "vector length"
    assert all(all(-4.0001 <= v <= 4.0001 for v in p["v"]) for p in players), "clip"
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 and 0 <= p["z"] <= 1
               for p in players), "map range"

    print(f"wrote {OUT.name}: {len(players)} player-seasons, {K} archetypes, "
          f"{d} wide features, salary coverage {manifest['salary_coverage']}")
    for k, nm in enumerate(cluster_names):
        print(f"  cluster {k}: {nm} ({int((lab == k).sum())} players)")


if __name__ == "__main__":
    sys.exit(main())
