"""Form tower features from VH-101 game logs (2015-26).

Volatility, scoring ceiling, double-double rates, durability — offline from
gamelogs_*.jsonl. Joined to charted player-seasons on (PLAYER_ID, season).

The join used to go PLAYER_ID -> the log's raw PLAYER_NAME -> the charted
display name, and the two spell names differently ('Al-Farouq Aminu' /
'AlFarouq Aminu', 'Dennis Schröder' / 'Dennis Schroder', 'Glenn Robinson III'
/ 'Glenn Robinson'): 658 charted gamelog-era rows with 10+ games had no form
row [features#6].

Run:  python pipeline/form_context.py
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"
OUT = DATA / "form_context.json"

FORM_KEYS = (
    "FORM_VOL",
    "FORM_CEIL",
    "FORM_DD_RATE",
    "FORM_TD_RATE",
    "FORM_GP",
    "FORM_MIN_AVG",
)


def main() -> None:
    from build_vectors import compute_form_features

    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    charted = {(int(p["pid"]), p["season"]): p["name"] for p in data["players"] if str(p.get("pid", "")).isdigit()}

    entries: list[dict] = []
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        form_by_pid = compute_form_features(season)
        for pid, feats in form_by_pid.items():
            name = charted.get((int(pid), season))
            if name is None:
                continue
            row = {"name": name, "player_id": int(pid), "season": season}
            for k in FORM_KEYS:
                row[k] = feats.get(k)
            entries.append(row)

    payload = {
        "method": (
            "Form features from game logs (2015-26): scoring CV, 95th-pct "
            "ceiling, DD/TD rates, GP, avg minutes. Mask-honest pre-2015."
        ),
        "entries": entries,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(entries)} player-seasons)")


if __name__ == "__main__":
    main()
