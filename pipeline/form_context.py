"""Form tower features from VH-101 game logs (2015-26).

Volatility, scoring ceiling, double-double rates, durability — offline from
gamelogs_*.jsonl. Joined to charted player-seasons via PLAYER_ID → name.

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


def pid_name_map(season: str) -> dict[int, str]:
    path = DATA / f"gamelogs_{season}.jsonl"
    if not path.exists():
        return {}
    out: dict[int, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        g = json.loads(line)
        if g.get("PLAYER_ID") and g.get("PLAYER_NAME"):
            out[int(g["PLAYER_ID"])] = g["PLAYER_NAME"]
    return out


def main() -> None:
    from build_vectors import compute_form_features

    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    charted = {(p["name"], p["season"]) for p in data["players"]}

    entries: list[dict] = []
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        names = pid_name_map(season)
        form_by_pid = compute_form_features(season)
        for pid, feats in form_by_pid.items():
            name = names.get(int(pid))
            if not name or (name, season) not in charted:
                continue
            row = {"name": name, "season": season}
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
