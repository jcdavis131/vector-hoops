"""Turn held-out tracking snapshots into Pixel Replay games, so replay.js can be scored on them.

    python scripts/tracking/holdout_replays.py --data <sportvu dir> --report <train out>/report.json --out <dir>

For each holdout game (report.json "holdout_game_ids") this writes <out>/<gameId>.json in the
replay's own format (the fields pipeline/build_replays.py writes), built from the snapshot
events only: each event's type, actor, the real shot spot, and the ten players on the court at
that moment as the lineup. It also writes <out>/<gameId>.truth.json: the real position of every
player at every event. tests/replay_model_eval.mjs runs replay.js over these games with and
without the coordinate model and scores both against the truth.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

TYPES = ["2pt", "3pt", "freethrow", "rebound", "turnover", "steal", "block", "foul", "substitution", "timeout", "jumpball", "violation", "period", "game", "other"]


def convert(z: dict, gid: str) -> tuple[dict, dict]:
    order = sorted(range(len(z["ev"])), key=lambda i: (int(z["per"][i]), -float(z["clock"][i])))
    side_of: dict[int, int] = {}  # pid -> 0/1, grown as teams are seen together
    events, lineups, truth = [], [], []
    for n, i in enumerate(order):
        pids = [int(p) for p in z["pid"][i]]
        off = [p for p, t in zip(pids, z["team"][i]) if t == 1]
        de = [p for p, t in zip(pids, z["team"][i]) if t == 0]
        known = [side_of[p] for p in off if p in side_of] + [1 - side_of[p] for p in de if p in side_of]
        s_off = round(sum(known) / len(known)) if known else 0
        for p in off:
            side_of.setdefault(p, s_off)
        for p in de:
            side_of.setdefault(p, 1 - s_off)
        ln = [off, de] if s_off == 0 else [de, off]
        lineups.append([n, [str(p) for p in ln[0]], [str(p) for p in ln[1]]])
        et = TYPES[int(z["ev"][i])]
        a = int(z["actor"][i])
        actor = pids[a] if a >= 0 else 0
        team = side_of.get(actor, s_off) if actor else s_off  # e[4]: the acting player's side
        x = y = None
        if et in ("2pt", "3pt") and a >= 0:
            x, y = float(z["pos"][i, a, 0]), float(z["pos"][i, a, 1])
        m = int(z["margin"][i])
        away, home = (max(m, 0), max(-m, 0)) if s_off == 0 else (max(-m, 0), max(m, 0))
        right = int(z["right"][i])
        events.append([int(z["per"][i]), round(float(z["clock"][i]), 1), TYPES.index(et), "", team, actor, x, y, away, home,
                       None, et, s_off, right if x is not None else -1])
        truth.append({str(p): [round(float(z["pos"][i, k, 0]), 2), round(float(z["pos"][i, k, 1]), 2)] for k, p in enumerate(pids)})
    players = {str(p): {"n": f"P{p}", "t": s} for p, s in side_of.items()}
    game = {"gameId": gid, "source": "holdout", "final": True, "periods": int(max(z["per"])), "teams": [{"tri": "AWY", "c": "#336699", "alt": "#ffffff", "short": "A", "name": "A"}, {"tri": "HOM", "c": "#993333", "alt": "#ffffff", "short": "H", "name": "H"}],
            "score": [0, 0], "date": "2015-16", "types": TYPES, "players": players, "lineups": lineups, "events": events}
    return game, {"gameId": gid, "truth": truth, "ev": [e[11] for e in events]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--report", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    ids = json.loads(Path(a.report).read_text(encoding="utf-8"))["holdout_game_ids"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for gid in ids:
        z = dict(np.load(Path(a.data) / "snapshots" / f"{gid}.npz"))
        g, t = convert(z, gid)
        (out / f"{gid}.json").write_text(json.dumps(g), encoding="utf-8")
        (out / f"{gid}.truth.json").write_text(json.dumps(t), encoding="utf-8")
    (out / "index.json").write_text(json.dumps({"games": ids}), encoding="utf-8")
    print(f"{len(ids)} holdout games -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
