#!/usr/bin/env python3
"""Validate a 120-feature training matrix before any training use. DRAFT.

Lane 2 (cleaning + curation) for MLOps v2. Rules live in CURATION_RULES.md
in this directory; this script implements its Section 7 checks (V-01..V-16).

Fail-loud contract:
  * Exit 0 only when every hard check (V-01..V-15) passes.
  * On failure, print EVERY failing check with offending keys/counts,
    then exit 1. It never stops at the first failure and never rewrites
    the input. It writes nothing at all; it only reads and reports.
  * It performs no training, no splitting, no eval, no pairing, and no
    imputation. It never fills a missing person_id, never drops a
    duplicate, and never clips a value.

Expected inputs (contract Section 2b interface):
  * --matrix: .npz with arrays Z (n x 120 float), mask (n x 120, values
    in {0, 1}), season (n strings "YYYY-YY"), person_id (n strings).
    An optional name array is used only for check V-07. A matrix that
    carries names but no person_id FAILS V-06: a name is not identity.
  * --manifest: JSON feature manifest. Either
        {"features": [...120 names...],
         "families": {feature_name: family_name, ...}}
    or {"families": {family_name: [feature_name, ...], ...}} with the
    feature order implied by the contract family order. Family counts
    and order must match the contract; individual feature names are
    not pinned (see CURATION_RULES.md Section 0).
  * --vectors (optional): assets/vectors.json, used ONLY to cross-check
    the set of (person_id, season) keys and its own row count. Its 14
    feature values are never compared with the 120-feature matrix.
  * --min-gp-file (optional): JSON {"players": [{"season": ...,
    "GP": ...}, ...]} or a mapping, used for check V-15 when GP is not
    carried in the matrix. Without it, V-15 is skipped and reported
    (not passed silently).

Season-start-year: first four digits of the season key.
Schedule-aware GP floors (CURATION_RULES.md Section 2.1):
  82-game seasons -> 12, 72-game (2019-20, 2020-21) -> 11,
  66-game (2011-12) -> 10, 50-game (1998-99) -> 10.

The minutes floor (450) is deliberately NOT re-checked from
vectors.json: its mpg/total_min fields are per-100-possession
arithmetic, not real minutes (CURATION_RULES.md Section 2.4).

Usage:
  python3 validate_inputs.py --matrix train_matrix.npz \\
      --manifest feature_manifest.json [--vectors vectors.json]
  python3 validate_inputs.py --matrix train_matrix.npz \\
      --manifest feature_manifest.json --warn-only-zscore   # diagnostic only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict

EXPECTED_ROWS = 12966
EXPECTED_FEATURES = 120

# Contract Section 0: family order and counts. Sum must be 120.
FAMILY_ORDER = [
    ("volume", 10),
    ("playmaking", 10),
    ("rebounding", 8),
    ("defense", 8),
    ("efficiency", 8),
    ("shotmix", 10),
    ("bio", 5),
    ("tracking", 12),
    ("form", 6),
    ("market", 4),
    ("roster", 5),
    ("career", 6),
    ("competition", 6),
    ("team", 8),
    ("pedigree", 4),
    ("playoffs", 5),
    ("honors", 5),
]
assert sum(n for _, n in FAMILY_ORDER) == EXPECTED_FEATURES

RECENT_SEASON_COUNTS = {
    "2022-23": 464,
    "2023-24": 484,
    "2024-25": 500,
    "2025-26": 491,
}

SEASON_GAMES = {"1998-99": 50, "2011-12": 66, "2019-20": 72, "2020-21": 72}
DEFAULT_SEASON_GAMES = 82


def min_gp_for_season(season: str) -> int:
    """Schedule-aware GP floor: clamp(round(0.15 * schedule), 10, 15)."""
    games = SEASON_GAMES.get(season, DEFAULT_SEASON_GAMES)
    return max(10, min(15, round(0.15 * games)))


def expected_seasons() -> list[str]:
    """The 30 seasons 1996-97 through 2025-26, in order."""
    out = []
    for start in range(1996, 2026):
        out.append(f"{start}-{((start + 1) % 100):02d}")
    return out


SEASON_RE = re.compile(r"^(\d{4})-(\d{2})$")


def season_ok(season: str) -> bool:
    """YYYY-YY with YY == (YYYY + 1) mod 100, start-year 1996..2025."""
    m = SEASON_RE.match(str(season))
    if not m:
        return False
    start = int(m.group(1))
    return 1996 <= start <= 2025 and int(m.group(2)) == (start + 1) % 100


def start_year(season: str) -> int:
    return int(str(season)[:4])


class Report:
    """Collects pass/fail/info lines; failure count decides the exit code."""

    def __init__(self) -> None:
        self.failures: list[str] = []
        self.infos: list[str] = []

    def check(self, check_id: str, ok: bool, detail: str) -> None:
        print(f"{'PASS' if ok else 'FAIL'} {check_id}: {detail}")
        if not ok:
            self.failures.append(f"{check_id}: {detail}")

    def info(self, detail: str) -> None:
        print(f"INFO: {detail}")
        self.infos.append(detail)

    def failed(self) -> bool:
        return bool(self.failures)


def load_manifest(path: str) -> tuple[list[str], dict[str, str]]:
    """Return (features in order, {feature: family}) from either shape."""
    with open(path, encoding="utf-8") as fh:
        man = json.load(fh)
    if "features" in man and "families" in man:
        features = list(man["features"])
        fam_of = dict(man["families"])
        # families mapping may itself be {family: [features]}; normalise.
        if fam_of and isinstance(next(iter(fam_of.values())), list):
            inv: dict[str, str] = {}
            for fam, feats in fam_of.items():
                for f in feats:
                    inv[f] = fam
            fam_of = inv
        return features, fam_of
    if "families" in man and isinstance(man["families"], dict):
        # Order families by contract order; unknown families go last and
        # will fail V-02 on counts/order, which is the honest outcome.
        features: list[str] = []
        fam_of = {}
        fam_map = man["families"]
        for fam, _n in FAMILY_ORDER:
            for f in fam_map.get(fam, []):
                features.append(f)
                fam_of[f] = fam
        for fam, feats in fam_map.items():
            if fam not in dict(FAMILY_ORDER):
                for f in feats:
                    features.append(f)
                    fam_of[f] = fam
        return features, fam_of
    raise ValueError(
        "manifest must carry 'features' + 'families' or 'families' mapping"
    )


def family_columns(features: list[str], fam_of: dict[str, str]) -> dict[str, list[int]]:
    cols: dict[str, list[int]] = defaultdict(list)
    for j, feat in enumerate(features):
        cols[fam_of.get(feat, "?")].append(j)
    return cols


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--matrix", required=True, help=".npz with Z, mask, season, person_id")
    ap.add_argument("--manifest", required=True, help="JSON feature manifest")
    ap.add_argument("--vectors", default=None, help="optional assets/vectors.json cross-check")
    ap.add_argument("--min-gp-file", default=None, help="optional GP source for V-15")
    ap.add_argument(
        "--warn-only-zscore",
        action="store_true",
        help="DIAGNOSTIC ONLY: report V-12 without failing. "
        "Must never be used to claim a pass.",
    )
    args = ap.parse_args(argv)

    try:
        import numpy as np
    except ImportError:
        print("FAIL SETUP: numpy is required to read the .npz matrix "
              "(the pipeline already depends on it).", file=sys.stderr)
        return 1

    rep = Report()

    # ---- Load matrix -------------------------------------------------
    try:
        data = np.load(args.matrix, allow_pickle=False)
    except Exception as exc:  # fail loud, name the file
        print(f"FAIL SETUP: cannot load matrix {args.matrix}: {exc}", file=sys.stderr)
        return 1
    for key in ("Z", "mask", "season"):
        if key not in data:
            print(f"FAIL SETUP: matrix {args.matrix} lacks required array '{key}'",
                  file=sys.stderr)
            return 1
    Z = np.asarray(data["Z"], dtype=float)
    mask = np.asarray(data["mask"], dtype=float)
    seasons = [str(s) for s in np.asarray(data["season"]).tolist()]
    if "person_id" in data:
        person_ids = [str(p) for p in np.asarray(data["person_id"]).tolist()]
    else:
        # Names are not identity. A matrix without person_id cannot pass.
        person_ids = [""] * len(seasons)
        rep.info("matrix carries no 'person_id' array; V-06 will fail "
                 "(a name array, if present, is not a substitute)")
    names = None
    if "name" in data:
        names = [str(n) for n in np.asarray(data["name"]).tolist()]

    n_rows = int(Z.shape[0]) if Z.ndim else 0

    # ---- V-01 row count ----------------------------------------------
    rep.check("V-01", n_rows == EXPECTED_ROWS,
              f"rows={n_rows} expected={EXPECTED_ROWS}")

    # ---- V-02 feature count and family order --------------------------
    try:
        features, fam_of = load_manifest(args.manifest)
    except Exception as exc:
        print(f"FAIL SETUP: cannot load manifest {args.manifest}: {exc}", file=sys.stderr)
        return 1
    fam_cols = family_columns(features, fam_of)
    order_ok = True
    order_detail = []
    pos = 0
    for fam, count in FAMILY_ORDER:
        cols = fam_cols.get(fam, [])
        # Order: this family's columns must form one contiguous block
        # starting at pos, in manifest order.
        if len(cols) != count or cols != list(range(pos, pos + count)):
            order_ok = False
        order_detail.append(f"{fam}={len(cols)}/{count}")
        pos += count
    extra_fams = sorted(set(fam_cols) - set(dict(FAMILY_ORDER)))
    if extra_fams:
        order_ok = False
        order_detail.append(f"unexpected families: {extra_fams}")
    rep.check(
        "V-02",
        len(features) == EXPECTED_FEATURES
        and Z.shape[1] == EXPECTED_FEATURES
        and order_ok,
        f"manifest features={len(features)} matrix cols={Z.shape[1]} "
        f"expected={EXPECTED_FEATURES}; " + ", ".join(order_detail),
    )

    # Shape guard: without a rectangular matrix the remaining checks are
    # meaningless; fail loud rather than broadcasting silently.
    if Z.ndim != 2 or mask.shape != Z.shape or len(seasons) != n_rows \
            or len(person_ids) != n_rows:
        rep.check("V-SHAPE", False,
                  f"Z shape={Z.shape} mask shape={mask.shape} "
                  f"seasons={len(seasons)} person_ids={len(person_ids)} "
                  f"rows={n_rows}; all must agree")
        print(f"\nVALIDATION FAILED: {len(rep.failures)} check(s) failed.")
        return 1

    # ---- V-03 mask domain ---------------------------------------------
    uniq = sorted(set(np.unique(mask).tolist()))
    rep.check("V-03", set(uniq) <= {0.0, 1.0},
              f"mask unique values={uniq} (allowed: 0, 1)")

    # ---- V-04 finite values -------------------------------------------
    rep.check("V-04", bool(np.isfinite(Z).all() and np.isfinite(mask).all()),
              f"Z finite={bool(np.isfinite(Z).all())} "
              f"mask finite={bool(np.isfinite(mask).all())}")

    # ---- V-05 masked value convention ----------------------------------
    bad_masked = int(((mask == 0) & (Z != 0.0)).sum())
    rep.check("V-05", bad_masked == 0,
              f"rows*features with mask=0 but value != 0.0: {bad_masked}")

    # ---- V-06 identity presence ----------------------------------------
    missing_pid = [i for i, p in enumerate(person_ids) if not p.strip()]
    rep.check("V-06", not missing_pid,
              f"rows missing/empty person_id: {len(missing_pid)}"
              + (f" (first rows: {missing_pid[:10]})" if missing_pid else "")
              + " — a display name does not rescue a missing person_id")

    # ---- V-07 identity consistency --------------------------------------
    if names is not None and len(names) == n_rows:
        pid_to_names: dict[str, set] = defaultdict(set)
        for pid, nm in zip(person_ids, names):
            if pid.strip():
                pid_to_names[pid].add(nm)
        merged = {p: sorted(ns) for p, ns in pid_to_names.items() if len(ns) > 1}
        shared_names: dict[str, set] = defaultdict(set)
        for pid, nm in zip(person_ids, names):
            if pid.strip():
                shared_names[nm].add(pid)
        n_shared = sum(1 for ns in shared_names.values() if len(ns) > 1)
        rep.check("V-07", not merged,
                  f"person_ids mapping to >1 display name: {len(merged)}"
                  + (f" e.g. {list(merged.items())[:5]}" if merged else "")
                  + f"; shared display names across persons (allowed, §4.2): {n_shared}")
    else:
        rep.info("V-07 skipped: no usable name array in matrix; "
                 "merged-career check needs names alongside person_id")

    # ---- V-08 grain / dedup ----------------------------------------------
    keys = list(zip(person_ids, seasons))
    dup_keys = [k for k, c in Counter(keys).items() if c > 1]
    rep.check("V-08", not dup_keys,
              f"duplicated (person_id, season) keys: {len(dup_keys)}"
              + (f" e.g. {dup_keys[:10]}" if dup_keys else ""))

    # ---- V-09 vectors cross-check -----------------------------------------
    if args.vectors:
        try:
            with open(args.vectors, encoding="utf-8") as fh:
                vec = json.load(fh)
            vplayers = vec["players"]
            vkeys = {(str(p.get("person_id", "")), str(p["season"]))
                     for p in vplayers}
            rep.check("V-09",
                      len(vplayers) == EXPECTED_ROWS and set(keys) == vkeys,
                      f"vectors.json rows={len(vplayers)} expected={EXPECTED_ROWS}; "
                      f"matrix keys={len(set(keys))} vectors keys={len(vkeys)} "
                      f"symmetric difference={len(set(keys) ^ vkeys)}")
        except Exception as exc:
            rep.check("V-09", False, f"cannot cross-check vectors file: {exc}")
    else:
        rep.info("V-09 skipped: --vectors not supplied")

    # ---- V-10 season reconciliation ----------------------------------------
    per_season = Counter(seasons)
    recent_bad = {s: (per_season.get(s, 0), want)
                  for s, want in RECENT_SEASON_COUNTS.items()
                  if per_season.get(s, 0) != want}
    rep.check("V-10", sum(per_season.values()) == EXPECTED_ROWS and not recent_bad,
              f"sum of per-season counts={sum(per_season.values())}; "
              f"recent-season mismatches={recent_bad or 'none'}")

    # ---- V-13 season format (checked before V-11/V-14 use of years) --------
    bad_format = sorted({s for s in set(seasons) if not season_ok(s)})
    rep.check("V-13", not bad_format,
              f"season keys failing YYYY-YY arithmetic: {bad_format or 'none'}")

    # ---- V-14 season coverage ----------------------------------------------
    season_set = set(seasons)
    want_set = set(expected_seasons())
    rep.check("V-14", season_set == want_set,
              f"seasons present={len(season_set)} expected=30; "
              f"missing={sorted(want_set - season_set)[:5]} "
              f"extra={sorted(season_set - want_set)[:5]}")

    # ---- V-11 structural masks ----------------------------------------------
    tracking_cols = fam_cols.get("tracking", [])
    form_cols = fam_cols.get("form", [])
    pre_tracking_bad = 0
    pre_form_bad = 0
    post_gap: list[str] = []
    if tracking_cols and form_cols:
        start_years = np.array([start_year(s) if season_ok(s) else -1
                                for s in seasons])
        pre_tr = start_years < 2013
        pre_fm = start_years < 2015
        pre_tracking_bad = int(mask[pre_tr][:, tracking_cols].sum()) \
            if pre_tr.any() else 0
        pre_form_bad = int(mask[pre_fm][:, form_cols].sum()) \
            if pre_fm.any() else 0
        for s in sorted(season_set):
            if not season_ok(s):
                continue
            rows = np.array([x == s for x in seasons])
            if start_year(s) >= 2013 and int(mask[rows][:, tracking_cols].sum()) == 0:
                post_gap.append(f"{s}: tracking coverage 0")
            if start_year(s) >= 2015 and int(mask[rows][:, form_cols].sum()) == 0:
                post_gap.append(f"{s}: form coverage 0")
    rep.check("V-11", pre_tracking_bad == 0 and pre_form_bad == 0 and not post_gap,
              f"pre-2013 tracking mask sum={pre_tracking_bad} (must be 0); "
              f"pre-2015 form mask sum={pre_form_bad} (must be 0); "
              f"post-era zero-coverage seasons={post_gap or 'none'}")

    # ---- V-12 within-season z-scores ------------------------------------------
    z_bad: list[str] = []
    z_skipped = 0
    for s in sorted(season_set):
        if not season_ok(s):
            continue
        rows = np.array([x == s for x in seasons])
        Zs, Ms = Z[rows], mask[rows]
        for j, feat in enumerate(features):
            obs = Ms[:, j] > 0
            n_obs = int(obs.sum())
            if n_obs < 30:
                z_skipped += 1
                continue
            vals = Zs[obs, j]
            mean = float(vals.mean())
            std = float(vals.std())
            if abs(mean) > 0.05 or not (0.95 <= std <= 1.05):
                z_bad.append(f"{s}/{feat}: n={n_obs} mean={mean:+.3f} std={std:.3f}")
    if args.warn_only_zscore:
        rep.info(f"V-12 DIAGNOSTIC ONLY (warn-only flag): {len(z_bad)} "
                 f"out-of-tolerance season-feature cells; "
                 f"{z_skipped} cells skipped (n < 30)"
                 + (f"; worst: {z_bad[:5]}" if z_bad else ""))
    else:
        rep.check("V-12", not z_bad,
                  f"out-of-tolerance season-feature cells (|mean|>0.05 or "
                  f"std outside [0.95, 1.05], n>=30): {len(z_bad)}; "
                  f"{z_skipped} cells skipped (n < 30)"
                  + (f"; e.g. {z_bad[:5]}" if z_bad else ""))

    # ---- V-15 qualifying GP floor ----------------------------------------------
    gp_by_key: dict[tuple[str, str], int] = {}
    if args.min_gp_file:
        try:
            with open(args.min_gp_file, encoding="utf-8") as fh:
                gp_doc = json.load(fh)
            entries = gp_doc["players"] if isinstance(gp_doc, dict) else gp_doc
            for e in entries:
                pid = str(e.get("person_id", e.get("player_id", "")))
                gp_by_key[(pid, str(e["season"]))] = int(e["GP"])
        except Exception as exc:
            rep.check("V-15", False, f"cannot read GP file: {exc}")
            gp_by_key = {}
    if args.min_gp_file and gp_by_key:
        below = [(pid, s, gp_by_key[(pid, s)], min_gp_for_season(s))
                 for (pid, s) in keys
                 if (pid, s) in gp_by_key
                 and gp_by_key[(pid, s)] < min_gp_for_season(s)]
        missing_gp = sum(1 for k in keys if k not in gp_by_key)
        rep.check("V-15", not below,
                  f"rows below the schedule-aware GP floor: {len(below)}"
                  + (f" e.g. {below[:5]}" if below else "")
                  + f"; keys absent from GP file: {missing_gp} "
                  "(absent keys are not counted as failures; the GP file "
                  "must cover the matrix for a full V-15)")
    elif args.min_gp_file:
        pass  # error already recorded above
    else:
        rep.info("V-15 skipped: no --min-gp-file supplied; the minutes "
                 "floor is never re-checked from vectors.json (§2.4)")

    # ---- V-16 first-season career mask rate (informational only) --------------
    career_cols = fam_cols.get("career", [])
    if career_cols:
        first_season: dict[str, str] = {}
        for pid, s in keys:
            if pid and (pid not in first_season or s < first_season[pid]):
                first_season[pid] = s
        first_rows = [i for i, (pid, s) in enumerate(keys)
                      if pid and first_season.get(pid) == s]
        if first_rows:
            rates = mask[first_rows][:, career_cols].mean()
            rep.info(f"V-16 (informational): {len(first_rows)} first-season "
                     f"rows; mean career mask rate on those rows = "
                     f"{float(rates):.3f} (prior-seasons-only rule, §3.4; "
                     "review, not a pass/fail)")
        else:
            rep.info("V-16 (informational): no first-season rows identified")

    # ---- Verdict -----------------------------------------------------------
    if rep.failed():
        print(f"\nVALIDATION FAILED: {len(rep.failures)} check(s) failed.")
        for f in rep.failures:
            print(f"  - {f}")
        print("Do not train on this matrix. Fix the named cause and re-run.")
        return 1
    print("\nVALIDATION PASSED: all hard checks V-01..V-15 passed "
          "(skipped checks are listed as INFO above).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
