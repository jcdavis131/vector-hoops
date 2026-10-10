"""Data contract for the training matrix: what the matrix stage hands train_mtnn.

Why. integrate_context's only check on its own output was a 1% family-coverage
floor (MIN_FAMILY_COVERAGE = 0.01), and write_bundle then overwrote
train_matrix.npz and feature_manifest.json with whatever came out [critic#5].
Nothing compared a new matrix with the last one anyone trained on. Measured
2026-10-09: the promoted matrix on the training box has the honors family at
0.969 observed, and the matrix HEAD's prepare chain builds has it at 0.087
[features#2]. 0.087 clears a 1% floor, so every climb arm since has trained on
the second matrix and no step said so.

What is checked. A stats manifest of pipeline/data/train_matrix.npz +
feature_manifest.json is compared with the committed
pipeline/contracts/train_matrix.contract.json. Every violation is printed and
the exit code is 2 when:

  rows      the row count moved by more than 1%
  columns   the column list or its order changed, or a column moved to
            another family (that decides which tower it feeds). Order
            matters: the checkpoint and every exporter index columns by
            position, so the same features in a different order are different
            inputs.
  coverage  any family's coverage fell by more than 5 points
  zeros     any column's zero fraction rose by more than 10 points
  keys      the ordered player_id|season keys changed (--allow-key-change
            lets this one through, for a deliberate identity fix)
  constant  an observed column (mask 1) holds one value over the
            MIN_CONSTANT_OBSERVED or more observed rows of a season, unless
            CONSTANT_ALLOWED (here, in code) names that column and season
            with the reason. Era z-scoring turns such a block into zeros
            marked observed. The whole-column gate in test_feature_hygiene
            passed 3,181 of these cells on the 90ef66a4 matrix: HUSTLE_BOX_OUTS
            2015-16/2016-17 (an untracked stat written as 0), the career
            counts in 1996-97 (left-censored), HON_ASG_LAG 1999-00 (no game)
            [features#9]. --accept-drift cannot accept one: it is a defect in
            the matrix, not drift from the contract.

Warnings (printed, exit code unchanged): an input column whose masked
correlation with a durability target (injury family) reaches PROXY_WARN_R.
REST_AVG and GP_RATIO measure availability partly (missed games stretch
the rest between games played; GP over the team's mean GP is nearly the
target's GP over team games): |r| 0.79 with INJ_GP_PCT on the 90ef66a4
matrix [features#9]. No ablation has ruled on them; the warning keeps them
in view until one does.

Definitions. They are not the same as integrate_context's, so they are spelled
out here and in the contract file:

  family coverage   matrix_fingerprint's: the mean of mask over the family's
                    columns, i.e. a share of CELLS. integrate_context's gate
                    instead counts a ROW as covered when any one of the
                    family's features is observed.
  zero fraction     the share of ALL rows where Z == 0.0 in that column,
                    masked rows included. Masked cells are stored as 0 (0 of
                    659,786 masked cells were nonzero on 2026-10-09), so this
                    one number rises both when a column loses coverage and
                    when it is filled with a constant 0 under mask=1. A
                    single column collapsing inside a 13-column family moves
                    the family's coverage by only a few points; it moves this
                    by the whole loss. The observed fraction is recorded next
                    to it so a reader can tell which of the two happened.
  values_sha256     recorded, never compared. A refreshed cache legitimately
                    changes values under the same rows and columns.

--accept-drift rewrites the contract from the current matrix (after printing
what it is accepting), so an intended change lands as a reviewed diff of the
committed file. The contract's notes carry over.

Run:  python pipeline/stage_contract.py
      python pipeline/stage_contract.py --accept-drift
      python pipeline/stage_contract.py --stats-out pipeline/data/runs/<id>/train_matrix.stats.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from artifact_io import atomic_write_bytes, git_state, matrix_fingerprint  # noqa: E402

DATA_DIR = ROOT / "pipeline" / "data"
MATRIX = DATA_DIR / "train_matrix.npz"
MANIFEST = DATA_DIR / "feature_manifest.json"
CONTRACT = ROOT / "pipeline" / "contracts" / "train_matrix.contract.json"

# Thresholds, as the package spec set them. A season of new rows is ~450 of
# 12,966 (3.5%), so adding one fails `rows` and needs --accept-drift; an
# identity fix that merges a handful of duplicate rows does not.
MAX_ROW_CHANGE = 0.01
MAX_COVERAGE_DROP_POINTS = 5.0
MAX_ZERO_RISE_POINTS = 10.0

EXIT_VIOLATION = 2
DIGITS = 6

MIN_CONSTANT_OBSERVED = 5
TARGET_FAMILIES = ("injury",)
PROXY_WARN_R = 0.7
MIN_PROXY_OVERLAP = 400

# (column, season) -> (observed rows, why one value over them is the truth,
# not a defect). The count is pinned: the same column and season with more
# rows is a different block (the 1996-97 career counts were one value over
# all 398 rows while they were left-censored) and fails until someone writes
# down why. Measured on the P11 matrix; anything else fails.
CONSTANT_ALLOWED = {
    ("YEAR_IN_LEAGUE", "1996-97"): (38, "every career the caches see from its start is in its first season"),
    ("CAREER_EXP_YEARS", "1996-97"): (38, "every career the caches see from its start is in its first season"),
    ("CAREER_ACTIVE_FRAC", "1996-97"): (38, "every career the caches see from its start is in its first season"),
    ("CAREER_ACTIVE_FRAC", "1997-98"): (92, "a career seen from its start has played every season since its debut"),
    ("CAREER_GAP_YEARS", "1997-98"): (319, "the only earlier charted season is 1996-97, so every observed gap is 0"),
    ("HON_ASG_CUM", "1997-98"): (92, "no 1996-or-later draftee was a 1997 All-Star: the count through 1996-97 is 0"),
}


def _r(x: float) -> float:
    return round(float(x), DIGITS)


def compute_stats(
    Z: np.ndarray,
    mask: np.ndarray,
    player_id: Sequence[Any] | np.ndarray,
    season: Sequence[Any] | np.ndarray,
    columns: Sequence[str],
    families: Mapping[str, str],
) -> dict[str, Any]:
    """The stats manifest of one matrix. Pure: arrays in, dict out."""
    fp = matrix_fingerprint(Z, mask, player_id, season, columns, families)
    Z = np.asarray(Z)
    observed = np.asarray(mask) > 0
    n = Z.shape[0]
    column_stats = {}
    for j, col in enumerate(columns):
        column_stats[str(col)] = {
            "observed": _r(observed[:, j].mean()) if n else 0.0,
            "zero": _r((Z[:, j] == 0).mean()) if n else 0.0,
        }
    seasons = np.asarray([str(s) for s in season])
    constants = []
    for s in sorted(set(seasons.tolist())):
        in_season = seasons == s
        for j, col in enumerate(columns):
            obs = in_season & observed[:, j]
            k = int(obs.sum())
            if k >= MIN_CONSTANT_OBSERVED and float(np.ptp(Z[obs, j])) == 0.0:
                constants.append({"column": str(col), "season": s, "observed": k})
    proxies = []
    targets = [j for j, c in enumerate(columns) if families.get(c) in TARGET_FAMILIES]
    for k, col in enumerate(columns):
        if families.get(col) in TARGET_FAMILIES:
            continue
        for j in targets:
            both = observed[:, j] & observed[:, k]
            if int(both.sum()) < MIN_PROXY_OVERLAP:
                continue
            x, y = Z[both, k].astype(np.float64), Z[both, j].astype(np.float64)
            if x.std() < 1e-9 or y.std() < 1e-9:
                continue
            r = float(np.corrcoef(x, y)[0, 1])
            if abs(r) >= PROXY_WARN_R:
                proxies.append({"column": str(col), "target": str(columns[j]), "r": _r(r), "n": int(both.sum())})
    return {
        "rows": fp["rows"],
        "cols": fp["cols"],
        "keys_sha256": fp["keys_sha256"],
        "columns_sha256": fp["columns_sha256"],
        "values_sha256": fp["values_sha256"],
        "columns": [str(c) for c in columns],
        "families": {str(c): str(families[c]) for c in columns},
        "family_coverage": fp["family_coverage"],
        "column_stats": column_stats,
        # Not part of the contract (CONTRACT_KEYS): checked against code.
        "season_constants": constants,
        "proxy_warnings": proxies,
    }


def load_stats(matrix: Path = MATRIX, manifest: Path = MANIFEST) -> dict[str, Any]:
    for path in (matrix, manifest):
        if not path.exists():
            raise SystemExit(f"stage contract: missing {path}; run the matrix stage first")
    man = json.loads(manifest.read_text(encoding="utf-8"))
    with np.load(matrix, allow_pickle=False) as z:
        Z, mask, pid, season = z["Z"], z["mask"], z["player_id"], z["season"]
    stats = compute_stats(Z, mask, pid, season, man["features"], man.get("families", {}))
    stats["manifest_source"] = man.get("source")
    return stats


def _describe_column_change(old: list[str], new: list[str]) -> str:
    added = [c for c in new if c not in set(old)]
    removed = [c for c in old if c not in set(new)]
    common = [c for c in old if c in set(new)]
    moved = [(c, old.index(c), new.index(c)) for c in common if old.index(c) != new.index(c)]
    parts = [f"{len(old)} -> {len(new)} columns"]
    if added:
        parts.append(f"{len(added)} added {added[:6]}")
    if removed:
        parts.append(f"{len(removed)} removed {removed[:6]}")
    if moved:
        c, i, j = moved[0]
        parts.append(f"{len(moved)} moved (first: {c} {i}->{j})")
    return "; ".join(parts)


def compare(contract: Mapping[str, Any], stats: Mapping[str, Any], *, allow_key_change: bool = False) -> list[str]:
    """Every way `stats` breaks `contract`, one line each. Empty means it passes."""
    out: list[str] = []

    old_rows, new_rows = int(contract["rows"]), int(stats["rows"])
    if old_rows != new_rows:
        rel = abs(new_rows - old_rows) / old_rows if old_rows else float("inf")
        if rel > MAX_ROW_CHANGE:
            out.append(f"rows: {old_rows} -> {new_rows} ({rel:+.2%} change, limit {MAX_ROW_CHANGE:.0%})")

    old_cols, new_cols = list(contract["columns"]), list(stats["columns"])
    if old_cols != new_cols:
        out.append(f"columns: {_describe_column_change(old_cols, new_cols)}")
    # The family of a column decides which tower it feeds, so a reassignment
    # is a different input layout even when the column list is unchanged.
    old_fam, new_fam = contract.get("families", {}), stats.get("families", {})
    refam = [
        (c, old_fam[c], new_fam[c]) for c in old_cols if c in old_fam and c in new_fam and old_fam[c] != new_fam[c]
    ]
    if refam:
        c, a, b = refam[0]
        out.append(f"columns: {len(refam)} column(s) changed family (first: {c} {a} -> {b})")

    new_cov = stats["family_coverage"]
    for fam, old in sorted(contract["family_coverage"].items()):
        new = new_cov.get(fam)
        drop = (float(old) - float(new if new is not None else 0.0)) * 100
        if drop > MAX_COVERAGE_DROP_POINTS:
            shown = "family gone" if new is None else f"{float(new):.4f}"
            out.append(
                f"coverage: family '{fam}' {float(old):.4f} -> {shown} "
                f"(-{drop:.1f} points, limit {MAX_COVERAGE_DROP_POINTS:g})"
            )

    new_cs = stats["column_stats"]
    for col, old in contract["column_stats"].items():
        if col not in new_cs:
            continue  # already reported under `columns`
        rise = (float(new_cs[col]["zero"]) - float(old["zero"])) * 100
        if rise > MAX_ZERO_RISE_POINTS:
            out.append(
                f"zeros: column '{col}' zero fraction {float(old['zero']):.4f} -> {float(new_cs[col]['zero']):.4f} "
                f"(+{rise:.1f} points, limit {MAX_ZERO_RISE_POINTS:g}); "
                f"observed {float(old['observed']):.4f} -> {float(new_cs[col]['observed']):.4f}"
            )

    out.extend(constant_violations(stats))

    if contract["keys_sha256"] != stats["keys_sha256"] and not allow_key_change:
        out.append(
            f"keys: ordered player_id|season keys changed "
            f"({contract['keys_sha256'][:16]} -> {stats['keys_sha256'][:16]}); "
            "pass --allow-key-change if that is the point of the change"
        )
    return out


def constant_violations(stats: Mapping[str, Any]) -> list[str]:
    """Per-season constants CONSTANT_ALLOWED does not explain, one line each."""
    return [
        f"constant: column '{c['column']}' is one value over its {c['observed']} observed rows in {c['season']}"
        for c in stats.get("season_constants", [])
        if CONSTANT_ALLOWED.get((c["column"], c["season"]), (None,))[0] != c["observed"]
    ]


CONTRACT_KEYS = (
    "rows",
    "cols",
    "keys_sha256",
    "columns_sha256",
    "values_sha256",
    "columns",
    "families",
    "family_coverage",
    "column_stats",
)

DEFINITIONS = {
    "family_coverage": "mean of mask over the family's columns (a share of cells, not of rows)",
    "zero": "share of all rows where Z == 0.0 in the column, masked rows included (masked cells are stored as 0)",
    "observed": "share of rows where mask > 0 in the column",
    "values_sha256": "recorded for audit, never compared",
    "constant": (
        f"an observed column with one value over >= {MIN_CONSTANT_OBSERVED} observed rows of a season fails, "
        "unless stage_contract.CONSTANT_ALLOWED names it (checked against code, not this file)"
    ),
    "limits": (
        f"rows +-{MAX_ROW_CHANGE:.0%}; columns and their families exact, in order; family coverage drop <= "
        f"{MAX_COVERAGE_DROP_POINTS:g} points; column zero rise <= {MAX_ZERO_RISE_POINTS:g} points; "
        "keys exact unless --allow-key-change"
    ),
}


def build_contract(stats: Mapping[str, Any], notes: Sequence[str], generated: Mapping[str, Any]) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "contract": "pipeline/data/train_matrix.npz + feature_manifest.json",
        "checked_by": "pipeline/stage_contract.py",
        "notes": list(notes),
        "definitions": DEFINITIONS,
        "generated": dict(generated),
    }
    doc.update({k: stats[k] for k in CONTRACT_KEYS})
    return doc


def write_json(path: Path, obj: Any) -> None:
    # LF bytes, not text mode: text mode would write CRLF on Windows, and the
    # committed contract should have the same bytes on every checkout.
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(path, (json.dumps(obj, indent=2) + "\n").encode("utf-8"))


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--matrix", type=Path, default=MATRIX)
    ap.add_argument("--manifest", type=Path, default=MANIFEST)
    ap.add_argument("--contract", type=Path, default=CONTRACT)
    ap.add_argument(
        "--allow-key-change",
        action="store_true",
        help="do not fail when the ordered player_id|season keys change",
    )
    ap.add_argument(
        "--accept-drift",
        action="store_true",
        help="rewrite the contract from the current matrix (commit the diff)",
    )
    ap.add_argument("--stats-out", type=Path, default=None, help="also write the computed stats manifest here")
    args = ap.parse_args(argv)

    stats = load_stats(args.matrix, args.manifest)
    if args.stats_out is not None:
        write_json(args.stats_out, stats)

    contract = json.loads(args.contract.read_text(encoding="utf-8")) if args.contract.exists() else None
    violations = (
        compare(contract, stats, allow_key_change=args.allow_key_change)
        if contract is not None
        else [f"no contract at {args.contract}"]
    )
    summary = f"{stats['rows']} rows, {stats['cols']} columns, {len(stats['family_coverage'])} families"
    for w in stats.get("proxy_warnings", []):
        print(
            f"warning: {w['column']} reads like the durability target {w['target']} (r={w['r']:+.4f}, n={w['n']}); "
            "an availability proxy in an input tower [features#9]"
        )

    if args.accept_drift:
        hygiene = constant_violations(stats)
        if hygiene:
            print(f"stage contract: --accept-drift refuses {len(hygiene)} per-season constant(s); fix the matrix:")
            for v in hygiene:
                print(f"  - {v}")
            return EXIT_VIOLATION
        for v in violations:
            print(f"  accepting: {v}")
        gs = git_state(ROOT)
        generated = {
            "by": "pipeline/stage_contract.py --accept-drift",
            "git": gs["short"],
            "git_dirty": gs["dirty"],
            "manifest_source": stats.get("manifest_source"),
        }
        notes = contract.get("notes", []) if contract else []
        write_json(args.contract, build_contract(stats, notes, generated))
        print(f"stage contract: wrote {args.contract} ({summary})")
        return 0

    if contract is None:
        print(f"stage contract: no contract at {args.contract}; create it with --accept-drift and commit it")
        return EXIT_VIOLATION
    if violations:
        print(f"stage contract: {len(violations)} violation(s) of {args.contract}:")
        for v in violations:
            print(f"  - {v}")
        print("If the change is intended, re-run with --accept-drift and commit the contract diff.")
        return EXIT_VIOLATION
    print(f"stage contract: {args.matrix.name} matches {args.contract.name} ({summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
