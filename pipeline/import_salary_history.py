"""One-shot: build pipeline/cache/salaries_history.csv from public sources.

Sources:
  - jerrytigerxu/NBA-Salary-Prediction 1990_to_2018.csv (HoopsHype-derived)
  - pipeline/cache/salary_bbref_current.json (recent seasons overlay)

Run: python pipeline/import_salary_history.py
"""

from __future__ import annotations

import csv
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "pipeline" / "cache"
OUT = CACHE / "salaries_history.csv"
HIST_URL = (
    "https://raw.githubusercontent.com/jerrytigerxu/"
    "NBA-Salary-Prediction/master/data/1990_to_2018.csv"
)


def norm_name(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def season_label(start: str | int, end: str | int) -> str:
    return f"{int(start)}-{str(int(end))[-2:]}"


def load_historical() -> dict[tuple[str, str], dict]:
    raw = urllib.request.urlopen(HIST_URL, timeout=90).read().decode("utf-8")
    rows: dict[tuple[str, str], dict] = {}
    for r in csv.DictReader(raw.splitlines()):
        name = r["player"].strip()
        season = season_label(r["season_start"], r["season_end"])
        key = (norm_name(name), season)
        rows[key] = {
            "name": name,
            "season": season,
            "salary": int(float(r["salary"])),
            "team": (r.get("team") or "").strip().upper(),
        }
    return rows


def overlay_bbref(rows: dict[tuple[str, str], dict]) -> None:
    bbref_path = CACHE / "salary_bbref_current.json"
    if not bbref_path.exists():
        print(f"skip bbref overlay — {bbref_path.name} missing")
        return
    bbref = json.loads(bbref_path.read_text(encoding="utf-8"))
    for key, sal in bbref.items():
        nn, season = key.split("|", 1)
        prior = rows.get((nn, season), {})
        display = prior.get("name") or " ".join(w.capitalize() for w in nn.split())
        rows[(nn, season)] = {
            "name": display,
            "season": season,
            "salary": int(sal),
            "team": prior.get("team", ""),
        }
    print(f"bbref overlay: {len(bbref)} keys")


def write_csv(rows: dict[tuple[str, str], dict]) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "season", "salary", "team"])
        w.writeheader()
        for rec in sorted(rows.values(), key=lambda x: (x["season"], x["name"])):
            row = {k: rec[k] for k in ("name", "season", "salary")}
            if rec.get("team"):
                row["team"] = rec["team"]
            w.writerow(row)
    print(f"wrote {len(rows)} rows -> {OUT.relative_to(ROOT)}")


def main() -> None:
    rows = load_historical()
    print(f"historical: {len(rows)} rows")
    overlay_bbref(rows)
    write_csv(rows)


if __name__ == "__main__":
    main()
