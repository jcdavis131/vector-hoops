"""Export assets/teams.json for the favorite-team picker.

Joins NBA API team IDs + full names from team_base cache with 3-letter
abbreviations observed in VH-101 game logs.

Run:  python pipeline/build_teams.py
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
DATA = HERE / "data"
ASSETS = HERE.parent / "assets"

# NBA brand colors (primary = offense/Chimera accent, secondary = guess/defense accent).
TEAM_COLORS: dict[str, tuple[str, str]] = {
    "ATL": ("#E03A3E", "#C1D32F"),
    "BOS": ("#007A33", "#BA9653"),
    "BKN": ("#000000", "#808080"),
    "CHA": ("#1D1160", "#00788C"),
    "CHI": ("#CE1141", "#000000"),
    "CLE": ("#860038", "#FDBB30"),
    "DAL": ("#00538C", "#002B5E"),
    "DEN": ("#0E2240", "#FEC524"),
    "DET": ("#C8102E", "#1D42BA"),
    "GSW": ("#1D428A", "#FFC72C"),
    "HOU": ("#CE1141", "#C4CED4"),
    "IND": ("#002D62", "#FDBB30"),
    "LAC": ("#C8102E", "#1D428A"),
    "LAL": ("#552583", "#FDBB27"),
    "MEM": ("#5D76A9", "#12173F"),
    "MIA": ("#98002E", "#F9A01B"),
    "MIL": ("#00471B", "#EEE1C6"),
    "MIN": ("#0C2340", "#236192"),
    "NOP": ("#0C2340", "#C8102E"),
    "NYK": ("#006BB6", "#F58426"),
    "OKC": ("#007AC1", "#EF3B24"),
    "ORL": ("#0077C0", "#C4CED4"),
    "PHI": ("#006BB6", "#ED174C"),
    "PHX": ("#1D1160", "#E56020"),
    "POR": ("#E03A3E", "#000000"),
    "SAC": ("#5A2D81", "#63727A"),
    "SAS": ("#C4CED4", "#000000"),
    "TOR": ("#CE1141", "#000000"),
    "UTA": ("#002B5C", "#F9A01B"),
    "WAS": ("#002B5C", "#E31837"),
}


def abbr_from_gamelogs() -> dict[int, str]:
    """TEAM_ID -> most common TEAM_ABBREVIATION."""
    votes: dict[int, Counter[str]] = defaultdict(Counter)
    for path in sorted(DATA.glob("gamelogs_*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            g = json.loads(line)
            tid = g.get("TEAM_ID")
            abbr = g.get("TEAM_ABBREVIATION")
            if tid is not None and abbr:
                votes[int(tid)][str(abbr)] += 1
    if votes:
        return {tid: c.most_common(1)[0][0] for tid, c in votes.items()}
    # fallback hard-coded NBA TEAM_ID -> ABBR (when gamelogs missing in cache-only env)
    fallback = {
        1610612737: "ATL",
        1610612738: "BOS",
        1610612739: "CLE",
        1610612740: "NOP",
        1610612741: "CHI",
        1610612742: "DAL",
        1610612743: "DEN",
        1610612744: "GSW",
        1610612745: "HOU",
        1610612746: "LAC",
        1610612747: "LAL",
        1610612748: "MIA",
        1610612749: "MIL",
        1610612750: "MIN",
        1610612751: "BKN",
        1610612752: "NYK",
        1610612753: "ORL",
        1610612754: "IND",
        1610612755: "PHI",
        1610612756: "PHX",
        1610612757: "POR",
        1610612758: "SAC",
        1610612759: "SAS",
        1610612760: "OKC",
        1610612761: "TOR",
        1610612762: "UTA",
        1610612763: "MEM",
        1610612764: "WAS",
        1610612765: "DET",
        1610612766: "CHA",
    }
    return fallback


def latest_team_names() -> dict[int, str]:
    """TEAM_ID -> TEAM_NAME (latest season file wins)."""
    names: dict[int, str] = {}
    for path in sorted(CACHE.glob("team_base_*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            continue
        for row in rows:
            names[int(row["TEAM_ID"])] = str(row["TEAM_NAME"])
    return names


def main() -> None:
    abbrs = abbr_from_gamelogs()
    names = latest_team_names()
    teams = []
    for tid in sorted(names):
        abbr = abbrs.get(tid)
        if not abbr:
            continue
        teams.append(
            {
                "id": tid,
                "abbr": abbr,
                "name": names[tid],
                "primary": TEAM_COLORS.get(abbr, ("#eb6834", "#2a78d6"))[0],
                "secondary": TEAM_COLORS.get(abbr, ("#eb6834", "#2a78d6"))[1],
            }
        )
    teams.sort(key=lambda t: t["name"])
    payload = {
        "built": __import__("time").strftime("%Y-%m-%d"),
        "source": "pipeline/cache/team_base_*.json + gamelogs TEAM_ABBREVIATION",
        "teams": teams,
    }
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = ASSETS / "teams.json"
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {out} ({len(teams)} teams)")


if __name__ == "__main__":
    main()
