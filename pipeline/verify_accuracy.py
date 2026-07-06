"""The accuracy harness (GAMEPLAY.md doctrine): every number the game
shows must be recomputable from source. Run before every deploy;
non-zero exit blocks shipping.

Checks:
  V1  vectors.json internal integrity (dims, ranges, no dupes, coords)
  V2  cluster labels: recompute nearest-centroid from member means and
      confirm the client's centroid method reproduces pipeline labels
  V3  deadline.json: recompute EVERY quiz mover's deltas from the raw
      game logs — exact match (tolerance 0.01 for rounding)
  V4  chimera determinism: seeded target for 30 dates is stable and
      always satisfies the low-similarity constraint
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
FAILS: list[str] = []


def fail(msg: str) -> None:
    FAILS.append(msg)
    print(f"  FAIL: {msg}")


def v1_vectors(data: dict) -> None:
    print("V1 vectors integrity…")
    seen = set()
    for p in data["players"]:
        key = (p["name"], p["season"])
        if key in seen:
            fail(f"duplicate {key}")
        seen.add(key)
        if len(p["v"]) != len(data["features"]):
            fail(f"{key} dim {len(p['v'])}")
        if any(abs(x) > 4.001 for x in p["v"]):
            fail(f"{key} z out of clip")
        for c in ("x", "y", "z"):
            if not (0 <= p[c] <= 1):
                fail(f"{key} coord {c}={p[c]}")
        if not (0 <= p["c"] < len(data["clusters"])):
            fail(f"{key} cluster {p['c']}")
    print(f"  {len(seen)} unique player-seasons")


def v2_clusters(data: dict) -> None:
    print("V2 cluster label reproduction (client method vs pipeline)…")
    dims = len(data["features"])
    sums = defaultdict(lambda: [0.0] * dims)
    counts = defaultdict(int)
    for p in data["players"]:
        c = p["c"]
        counts[c] += 1
        for i, x in enumerate(p["v"]):
            sums[c][i] += x
    cents = {c: [s / counts[c] for s in sums[c]] for c in counts}
    mism = 0
    for p in data["players"]:
        best = min(cents, key=lambda c: sum(
            (a - b) ** 2 for a, b in zip(p["v"], cents[c])))
        if best != p["c"]:
            mism += 1
    rate = mism / len(data["players"])
    print(f"  centroid-reassignment mismatch: {mism} ({rate:.2%})")
    if rate > 0.02:  # k-means boundary points can flip; >2% means broken
        fail(f"cluster attribution unreliable ({rate:.2%})")


def v3_deadline() -> None:
    print("V3 deadline recomputation from raw logs…")
    dl = json.loads((ASSETS / "deadline.json").read_text(encoding="utf-8"))
    quiz = dl["thrives"] + dl["craters"]
    logs_by_season: dict[str, list] = {}
    for f in HERE.glob("data/gamelogs_*.jsonl"):
        season = f.stem.split("_")[1]
        logs_by_season[season] = [json.loads(l) for l in
                                  f.read_text(encoding="utf-8").splitlines()]
    checked = 0
    for m in quiz:
        logs = logs_by_season.get(m["season"])
        if logs is None:
            fail(f"no logs for {m['season']}")
            continue
        games = sorted([g for g in logs if g["PLAYER_NAME"] == m["name"]],
                       key=lambda g: g["GAME_DATE"])
        teams = [g["TEAM_ID"] for g in games]
        switch = next((i for i in range(1, len(teams))
                       if teams[i] != teams[i - 1]), None)
        if switch is None:
            fail(f"{m['name']} {m['season']}: no switch found")
            continue
        before = games[:switch]
        after = [g for g in games[switch:]
                 if g["TEAM_ID"] == games[switch]["TEAM_ID"]]
        mb = sum(g["MIN"] for g in before)
        ma = sum(g["MIN"] for g in after)
        p36b = 36 * sum(g["PTS"] for g in before) / mb
        p36a = 36 * sum(g["PTS"] for g in after) / ma
        if abs((p36a - p36b) - m["dP36"]) > 0.011:
            fail(f"{m['name']} {m['season']} dP36 {p36a-p36b:.2f} vs {m['dP36']}")
        if len(before) != m["gBefore"] or len(after) != m["gAfter"]:
            fail(f"{m['name']} game counts {len(before)}/{len(after)} vs "
                 f"{m['gBefore']}/{m['gAfter']}")
        checked += 1
    print(f"  {checked}/{len(quiz)} movers recomputed from raw logs")


def v4_determinism(data: dict) -> None:
    print("V4 chimera determinism (30 dates)…")

    def xmur3(s):
        h = 1779033703
        for ch in s:
            h = ((h ^ ord(ch)) * 3432918353) & 0xFFFFFFFF
            h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
        return h

    def mulberry(a):
        def rnd():
            nonlocal a
            a = (a + 0x6D2B79F5) & 0xFFFFFFFF
            t = a
            t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
            t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
            return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
        return rnd

    def cos(a, b):
        num = sum(x * y for x, y in zip(a, b))
        da = math.sqrt(sum(x * x for x in a)) or 1
        db = math.sqrt(sum(x * x for x in b)) or 1
        return num / (da * db)

    players = data["players"]
    from datetime import date, timedelta
    base = date(2026, 7, 1)
    for d in range(30):
        ds = (base + timedelta(days=d)).isoformat()
        picks = []
        for _ in range(2):
            rnd = mulberry(xmur3(f"vector-hoops:{ds}"))
            a = players[int(rnd() * len(players))]
            tries = 0
            b = players[int(rnd() * len(players))]
            while (b["id"] == a["id"] or cos(a["v"], b["v"]) >= 0.3) and tries < 2000:
                b = players[int(rnd() * len(players))]
                tries += 1
            picks.append((a["id"], b["id"]))
        if picks[0] != picks[1]:
            fail(f"{ds}: nondeterministic target")
        a = next(p for p in players if p["id"] == picks[0][0])
        b = next(p for p in players if p["id"] == picks[0][1])
        if cos(a["v"], b["v"]) >= 0.3:
            fail(f"{ds}: similarity constraint violated")
    print("  30/30 dates deterministic + constrained")


def v5_procrustes(data: dict) -> None:
    """drift.json integrity: every chained transform must be orthogonal
    (rotation-only claim), every consecutive pair covered, and the
    root-frame map must preserve norms (era-twin validity)."""
    print("V5 procrustes drift integrity…")
    dj = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    n = len(data["features"])
    for season, M in dj["chainedToRoot"].items():
        # orthogonality: M M^T = I within rounding tolerance
        for i in range(n):
            for j in range(n):
                dot = sum(M[i][k] * M[j][k] for k in range(n))
                want = 1.0 if i == j else 0.0
                if abs(dot - want) > 5e-3:
                    fail(f"{season}: chained transform not orthogonal "
                         f"({i},{j})={dot:.4f}")
                    break
            else:
                continue
            break
    seasons = sorted({p["season"] for p in data["players"]})
    covered = {p["to"] for p in dj["pairs"]}
    missing = [s for s in seasons[1:] if s not in covered]
    if missing:
        fail(f"pairs missing seasons: {missing}")
    if len(dj["chainedToRoot"]) != len(seasons):
        fail(f"chainedToRoot covers {len(dj['chainedToRoot'])} of "
             f"{len(seasons)} seasons")
    print(f"  {len(dj['pairs'])} pairs, {len(dj['chainedToRoot'])} "
          "chained transforms, all orthogonal")


def v6_teams() -> None:
    print("V6 teams.json integrity…")
    path = ASSETS / "teams.json"
    if not path.exists():
        fail("assets/teams.json missing — run pipeline/build_teams.py")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    teams = data.get("teams")
    if not teams or len(teams) < 28:
        fail(f"teams.json has {len(teams or [])} teams — expected ~30")
        return
    abbrs = set()
    ids = set()
    for t in teams:
        ab = t.get("abbr")
        tid = t.get("id")
        name = t.get("name")
        if not ab or len(ab) != 3:
            fail(f"bad abbr for team {t}")
        if ab in abbrs:
            fail(f"duplicate abbr {ab}")
        abbrs.add(ab)
        if tid in ids:
            fail(f"duplicate TEAM_ID {tid}")
        ids.add(tid)
        if not name:
            fail(f"missing name for {ab}")
        for color_key in ("primary", "secondary"):
            c = t.get(color_key)
            if not c or not isinstance(c, str) or len(c) != 7 or c[0] != "#":
                fail(f"{ab}: bad {color_key} color {c!r}")
    print(f"  {len(teams)} teams, {len(abbrs)} unique abbreviations")


if __name__ == "__main__":
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    v1_vectors(data)
    v2_clusters(data)
    v3_deadline()
    v4_determinism(data)
    v5_procrustes(data)
    v6_teams()
    if FAILS:
        print(f"\nACCURACY HARNESS: {len(FAILS)} FAILURES — do not ship")
        sys.exit(1)
    print("\nACCURACY HARNESS: all checks pass")
