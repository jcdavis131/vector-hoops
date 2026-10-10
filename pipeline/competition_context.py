"""Competition / schedule context per player-season (MTNN v4 competition tower).

SOS_NET_RTG, B2B_RATE, REST_AVG, CONF_STRENGTH.
Output: pipeline/data/competition.json

Run:  python pipeline/competition_context.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from seasons import is_regular_season  # noqa: E402

OUT = HERE / "data" / "competition.json"
EAST = {
    1610612737,
    1610612738,
    1610612751,
    1610612766,
    1610612741,
    1610612739,
    1610612765,
    1610612754,
    1610612748,
    1610612749,
    1610612752,
    1610612753,
    1610612755,
    1610612761,
    1610612764,
    1610612740,
}


def team_net(season: str) -> dict[int, float]:
    p = HERE / "data" / f"team_season_{season}.json"
    if not p.exists():
        return {}
    return {
        int(t["TEAM_ID"]): float(t["NET_RATING"])
        for t in json.loads(p.read_text(encoding="utf-8"))
        if t.get("NET_RATING") is not None
    }


def conf_avg(tid: int, nets: dict[int, float]) -> float | None:
    side = tid in EAST
    vals = [v for t, v in nets.items() if (t in EAST) == side]
    return round(sum(vals) / len(vals), 4) if vals else None


def from_logs() -> dict[tuple[int, str], dict]:
    """(PLAYER_ID, season) -> schedule features.

    Keyed by the log's PLAYER_ID. It was keyed by the raw PLAYER_NAME and met
    the charted display name only when the two were spelled alike, so 658
    gamelog-era rows with 10+ games had no competition row [features#6].
    """
    out: dict[tuple[int, str], dict] = {}
    for path in sorted(HERE.glob("data/gamelogs_*.jsonl")):
        season = path.stem.split("_", 1)[1]
        nets = team_net(season)
        if not nets:
            continue
        game_teams: dict[str, set[int]] = defaultdict(set)
        by_pid: dict[int, list[dict]] = defaultdict(list)
        for line in path.read_text(encoding="utf-8").splitlines():
            g = json.loads(line)
            # Regular season only: schedule strength, rest and back-to-backs
            # describe the 82-game schedule, and the logs also hold preseason,
            # All-Star, playoff, play-in and Cup-final games [ingest#0].
            if not g.get("MIN") or not is_regular_season(g.get("GAME_ID")):
                continue
            game_teams[str(g["GAME_ID"])].add(int(g["TEAM_ID"]))
            if g.get("PLAYER_ID") is not None:
                by_pid[int(g["PLAYER_ID"])].append(g)
        for pid, games in by_pid.items():
            opp, dates, tgp = [], [], defaultdict(int)
            for g in games:
                tid = int(g["TEAM_ID"])
                others = [t for t in game_teams[str(g["GAME_ID"])] if t != tid]
                if len(others) == 1 and others[0] in nets:
                    opp.append(nets[others[0]])
                if g.get("GAME_DATE"):
                    dates.append(datetime.fromisoformat(g["GAME_DATE"][:19]))
                tgp[tid] += 1
            feats: dict = {}
            if opp:
                feats["SOS_NET_RTG"] = round(sum(opp) / len(opp), 4)
            ds = sorted(dates)
            if len(ds) >= 2:
                gaps = [(ds[i] - ds[i - 1]).days for i in range(1, len(ds))]
                feats["REST_AVG"] = round(sum(gaps) / len(gaps), 4)
                feats["B2B_RATE"] = round(sum(d <= 1 for d in gaps) / len(gaps), 4)
            if tgp:
                ca = conf_avg(max(tgp, key=tgp.get), nets)
                if ca is not None:
                    feats["CONF_STRENGTH"] = ca
            if feats:
                out[(pid, season)] = feats
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Build competition context")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    players = json.loads((HERE.parent / "assets" / "vectors.json").read_text(encoding="utf-8"))["players"]
    comp = from_logs()

    def pid_of(p: dict) -> int | None:
        return int(p["pid"]) if str(p.get("pid", "")).isdigit() else None

    rows = sorted(
        [
            {
                "id": p["id"],
                "name": p["name"],
                "player_id": pid_of(p),
                "season": p["season"],
                **comp.get((pid_of(p), p["season"]), {}),
            }
            for p in players
        ],
        key=lambda r: (int(r["season"][:4]), r["name"]),
    )
    n = sum("SOS_NET_RTG" in r for r in rows)
    print(f"{len(rows)} rows | schedule features: {n}")
    if args.dry_run:
        print("sample:", next(r for r in rows if "SOS_NET_RTG" in r))
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "method": (
                    "opponent NET_RATING via shared GAME_ID; B2B/REST from game dates; "
                    "CONF_STRENGTH = conference avg NET (static TEAM_ID map)"
                ),
                "source": "gamelogs_*.jsonl + team_season_{season}.json",
                "gamelogSeasons": sorted({s for _, s in comp}),
                "players": rows,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
