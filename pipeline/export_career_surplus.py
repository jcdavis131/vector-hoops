"""Export research buy-low / sell-high board from salary vs production.

Uses train_matrix volume/efficiency z (not vectors.json mpg — that field
has out-of-range values up to ~57). Surplus = production_z − SALARY_LOG z.

Not calibrated trade advice. Contract years/options still missing.

Run:  python pipeline/export_career_surplus.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
OUT = ASSETS / "career_surplus.json"

PROD_FEATURES = ("PTS", "AST", "REB", "STL", "BLK", "PLUS_MINUS")


def main() -> None:
    npz = np.load(DATA / "train_matrix.npz", allow_pickle=False)
    man = json.loads((DATA / "feature_manifest.json").read_text(encoding="utf-8"))
    feats = man["features"]
    Z = npz["Z"].astype(np.float32)
    M = npz["mask"].astype(np.float32)
    names = [str(n) for n in npz["name"]]
    seasons = [str(s) for s in npz["season"]]

    if "SALARY_LOG" not in feats:
        raise SystemExit("SALARY_LOG missing from matrix")
    sj = feats.index("SALARY_LOG")
    prod_cols = [feats.index(f) for f in PROD_FEATURES if f in feats]
    if not prod_cols:
        raise SystemExit("no production features found")

    rows = []
    for i in range(len(names)):
        if M[i, sj] <= 0:
            continue
        w = M[i, prod_cols]
        if w.sum() <= 0:
            continue
        prod = float((Z[i, prod_cols] * w).sum() / w.sum())
        sal = float(Z[i, sj])
        rows.append({
            "name": names[i],
            "season": seasons[i],
            "production_z": round(prod, 3),
            "salary_z": round(sal, 3),
            "surplus": round(prod - sal, 3),
        })

    # Latest season per player, prefer 2022+
    latest: dict[str, dict] = {}
    for r in rows:
        prev = latest.get(r["name"])
        if prev is None or r["season"] > prev["season"]:
            latest[r["name"]] = r
    board = sorted(latest.values(), key=lambda r: -r["surplus"])
    recent = [r for r in board if r["season"] >= "2022-23"] or board

    payload = {
        "method": (
            "Research surplus = mean z(PTS,AST,REB,STL,BLK,PLUS_MINUS) − "
            "SALARY_LOG z on charted player-seasons. Transparent residual, "
            "not a GRU forecast. Not calibrated buy/sell advice; "
            "contract years/options missing. vectors.json mpg is unreliable "
            "(max>48) — do not use for next-box until rebuilt."
        ),
        "n": len(recent),
        "buy_low_top": recent[:40],
        "sell_high_top": list(reversed(recent[-40:])),
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {OUT} n={len(recent)} "
          f"top={recent[0]['name']} surplus={recent[0]['surplus']}")


if __name__ == "__main__":
    main()
