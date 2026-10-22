"""Write assets/replay_roles.json: each player's role descriptor for the coordinate model.

    python scripts/tracking/build_roles.py [--check]

The model was trained with each player-season's descriptor from assets/vectors.json (the three
projected MTNN axes, archetype cluster, position). The replay shows tonight's players, so each
NBA person id gets the descriptor of his latest season in the atlas. ESPN's athlete ids are not
NBA ids, so a name index (lower-cased, accents and punctuation stripped) maps ESPN players in.
Players with no atlas season (most rookies) have no entry; the model was trained to work
without one. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "replay_roles.json"


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"[^a-z]", "", s)


def build() -> dict:
    d = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))
    latest: dict[int, dict] = {}
    for p in d["players"]:
        pid = p.get("pid")
        if pid and (pid not in latest or p["season"] > latest[pid]["season"]):
            latest[pid] = p
    keep = {pid: p for pid, p in latest.items() if p["season"] >= "2021-22"}  # players who could be on a court tonight
    roles = {str(pid): [round(p["x"], 3), round(p["y"], 3), round(p["z"], 3), p.get("c", -1), p.get("p", -1)] for pid, p in sorted(keep.items())}
    names: dict[str, int] = {}
    dup = set()
    for pid, p in keep.items():
        k = norm(p["name"])
        if k in names and names[k] != pid:
            dup.add(k)
        names[k] = pid
    for k in dup:  # two players, one name: no guess
        names.pop(k, None)
    return {
        "note": "Role descriptors for the Pixel Replay coordinate model: [pc1, pc2, pc3, cluster, position] from each player's latest atlas season (assets/vectors.json), 2021-22 on.",
        "fields": ["x", "y", "z", "c", "p"],
        "roles": roles,
        "names": dict(sorted(names.items())),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = json.dumps(build(), separators=(",", ":")) + "\n"
    if a.check:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("OK" if ok else "stale: run python scripts/tracking/build_roles.py")
        return 0 if ok else 1
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"{OUT.name}: {len(json.loads(text)['roles'])} players, {len(text) // 1024} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
