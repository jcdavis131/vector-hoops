"""Validate and merge NBA salary history CSV into a join-ready cache.

Reads:  pipeline/cache/salaries_history.csv  (see salaries_history.schema.json)
Writes: pipeline/cache/salaries_merged.json

Keys are ``"<norm_name>|<season>"`` — same convention as salary_bbref_current.json
and build_vectors.load_salary_history() lookups.

Name normalization matches build_vectors.norm_name (lowercase, strip punctuation
and generational suffixes, collapse whitespace).

Run:
  python pipeline/merge_salaries.py
  python pipeline/merge_salaries.py --csv path/to/export.csv --strict
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
DEFAULT_CSV = CACHE / "salaries_history.csv"
DEFAULT_OUT = CACHE / "salaries_merged.json"
SCHEMA_PATH = CACHE / "salaries_history.schema.json"

SEASON_RE = re.compile(r"^[0-9]{4}-[0-9]{2}$")
REQUIRED_COLS = ("name", "season", "salary")
OPTIONAL_COLS = ("team", "cap_pct")


def norm_name(name: str) -> str:
    """Match build_vectors.norm_name — keep in sync when that helper changes."""
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def parse_salary(raw: str | float | int) -> float:
    if isinstance(raw, int | float):
        return float(raw)
    cleaned = re.sub(r"[^0-9.]", "", str(raw).strip())
    if not cleaned:
        raise ValueError(f"unparseable salary: {raw!r}")
    return float(cleaned)


def parse_cap_pct(raw: str | float | int | None) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    if isinstance(raw, int | float):
        v = float(raw)
        return v / 100.0 if v > 1.0 else v
    s = str(raw).strip().rstrip("%")
    v = float(re.sub(r"[^0-9.]", "", s) or 0)
    return v / 100.0 if "%" in str(raw) or v > 1.0 else v


def validate_row(row: dict[str, str], line_no: int, strict: bool) -> dict | None:
    missing = [c for c in REQUIRED_COLS if not (row.get(c) or "").strip()]
    if missing:
        msg = f"line {line_no}: missing required column(s) {missing}"
        if strict:
            raise ValueError(msg)
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    season = row["season"].strip()
    if not SEASON_RE.match(season):
        msg = f"line {line_no}: bad season {season!r} (want YYYY-YY)"
        if strict:
            raise ValueError(msg)
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    name = row["name"].strip()
    if not name:
        msg = f"line {line_no}: empty name"
        if strict:
            raise ValueError(msg)
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    try:
        salary = parse_salary(row["salary"])
    except ValueError as exc:
        msg = f"line {line_no}: {exc}"
        if strict:
            raise ValueError(msg) from exc
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    if salary < 0:
        msg = f"line {line_no}: negative salary {salary}"
        if strict:
            raise ValueError(msg)
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    team = (row.get("team") or "").strip().upper() or None
    try:
        cap_pct = parse_cap_pct(row.get("cap_pct"))
    except ValueError as exc:
        msg = f"line {line_no}: bad cap_pct — {exc}"
        if strict:
            raise ValueError(msg) from exc
        print(f"  skip — {msg}", file=sys.stderr)
        return None

    return {
        "name": name,
        "norm_name": norm_name(name),
        "season": season,
        "salary": salary,
        "team": team,
        "cap_pct": cap_pct,
    }


def merge_csv(csv_path: Path, *, strict: bool = False) -> dict[str, dict]:
    if not csv_path.exists():
        raise FileNotFoundError(
            f"{csv_path} not found — copy salaries_history.example.csv or "
            "run pipeline/fetch_salaries.py --document-only for sourcing notes"
        )

    merged: dict[str, dict] = {}
    dupes = 0
    skipped = 0

    with csv_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError(f"{csv_path}: empty or headerless CSV")
        cols = {c.strip().lower() for c in reader.fieldnames}
        for req in REQUIRED_COLS:
            if req not in cols:
                raise ValueError(f"{csv_path}: missing header {req!r}")

        for line_no, raw in enumerate(reader, start=2):
            row = {k.strip().lower(): (v or "").strip() for k, v in raw.items() if k}
            rec = validate_row(row, line_no, strict)
            if rec is None:
                skipped += 1
                continue
            key = f"{rec['norm_name']}|{rec['season']}"
            if key in merged:
                dupes += 1
            merged[key] = {
                "name": rec["name"],
                "norm_name": rec["norm_name"],
                "season": rec["season"],
                "salary": rec["salary"],
                **({"team": rec["team"]} if rec["team"] else {}),
                **({"cap_pct": rec["cap_pct"]} if rec["cap_pct"] is not None else {}),
            }

    print(
        f"merged {len(merged)} (name,season) rows from {csv_path.name}"
        f" ({dupes} duplicate keys overwritten, {skipped} rows skipped)"
    )
    return merged


def write_merged(merged: dict[str, dict], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "_meta": {
            "schema": str(SCHEMA_PATH.relative_to(ROOT)),
            "rows": len(merged),
            "key_format": "<norm_name>|<season>",
        },
        "salaries": merged,
    }
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    print(f"wrote {out_path.relative_to(ROOT)}")


def load_merged_salaries(cache_dir: Path | None = None) -> dict[tuple[str, str], float]:
    """Flat salary lookup for build_vectors — (norm_name, season) -> USD."""
    p = (cache_dir or CACHE) / "salaries_merged.json"
    if not p.exists():
        return {}
    data = json.loads(p.read_text(encoding="utf-8"))
    salaries = data.get("salaries", data)
    out: dict[tuple[str, str], float] = {}
    for key, val in salaries.items():
        if key.startswith("_"):
            continue
        if isinstance(val, dict):
            nn = val.get("norm_name") or key.split("|", 1)[0]
            season = val.get("season") or key.split("|", 1)[-1]
            out[(nn, season)] = float(val["salary"])
        else:
            parts = key.split("|", 1)
            if len(parts) == 2:
                out[(parts[0], parts[1])] = float(val)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help="input CSV (default: pipeline/cache/salaries_history.csv)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="output JSON (default: pipeline/cache/salaries_merged.json)",
    )
    ap.add_argument(
        "--strict",
        action="store_true",
        help="fail on first invalid row instead of skipping",
    )
    args = ap.parse_args()

    merged = merge_csv(args.csv, strict=args.strict)
    if not merged:
        print("no valid rows — not writing output", file=sys.stderr)
        sys.exit(1)
    write_merged(merged, args.out)


if __name__ == "__main__":
    main()
