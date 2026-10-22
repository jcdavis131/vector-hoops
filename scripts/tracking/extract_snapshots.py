"""Pair each 2015-16 play-by-play event with the tracking frame where it happened.

    python scripts/tracking/extract_snapshots.py --data C:/Users/jcdav/datasets/sportvu-linouk23 [--games N] [--jobs 1]

For every event the replay feeds carry (shots, free throws, rebounds, turnovers, steals,
blocks, fouls, jump balls) this finds the SportVU moment inside that event's clock second
where the acting player is nearest the ball, and records all ten players' real positions
there. Those snapshots are the training targets for the coordinate model: the question it
learns is "given what the play-by-play says, where was everybody?".

Writes <data>/snapshots/<gameId>.npz, one row per event:
  pos    (n,10,2) float32  full-court feet (x 0-94 along the court, y 0-50)
  pid    (n,10)   int64    NBA person id per slot
  team   (n,10)   int8     1 = the offense (team with the ball after the event), 0 = defense
  ball   (n,3)    float32
  ev     (n,)     int8     index into the replay's TYPES
  actor  (n,)     int8     slot of the acting player, -1 if none
  right  (n,)     int8     1 if the offense attacks the right rim (x = 88.75)
  per, clock, margin (offense minus defense), shotx/shoty (this event's or the last shot's
  spot, NaN when none), shotlast (1 when the spot is the previous shot's: rebounds, blocks)
No values are filled in: an event whose moment, actor or ten players cannot be found is dropped
and counted. Stdlib + ijson + numpy + py7zr (scripts/tracking venv).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import ijson
import numpy as np
import py7zr

TYPES = ["2pt", "3pt", "freethrow", "rebound", "turnover", "steal", "block", "foul", "substitution", "timeout", "jumpball", "violation", "period", "game", "other"]
T = {t: i for i, t in enumerate(TYPES)}
L, CW, HOOP = 94.0, 50.0, 5.25


def clock_s(s: str) -> float:
    m, _, sec = (s or "0:0").partition(":")
    return int(m) * 60 + float(sec or 0)


def load_moments(path7z: Path, tmp: Path) -> tuple[str, dict[int, list]]:
    """(game id, period -> list of (clock, ball[3], [(team, pid, x, y)]*10)), deduplicated, clock descending.

    The archive is unpacked to tmp and streamed, so a 100 MB game never sits in memory whole."""
    seen, per = set(), {}
    tmp.mkdir(parents=True, exist_ok=True)
    with py7zr.SevenZipFile(path7z) as z:
        name = z.getnames()[0]
        z.extractall(tmp)
    js = tmp / name
    try:
        with js.open("rb") as fh:
            evs = list(_moments(fh, seen, per))
    finally:
        js.unlink(missing_ok=True)
    del evs
    for p in per:
        per[p].sort(key=lambda r: -r[0])
    return name.split(".")[0], per


def _moments(fh, seen: set, per: dict):
    for ev in ijson.items(fh, "events.item.moments", use_float=True):
        for m in ev:
            p, clock, rows = int(m[0]), m[2], m[5]
            if clock is None or len(rows) != 11:
                continue
            k = (p, round(clock * 100))
            if k in seen:
                continue
            seen.add(k)
            ball = rows[0][2:5]
            pl = [(int(r[0]), int(r[1]), r[2], r[3]) for r in rows[1:]]
            per.setdefault(p, []).append((clock, ball, pl))
        yield None


def window(moms: list, t: float, lo: float = 0.6, hi: float = 1.6) -> list:
    return [m for m in moms if t - lo <= m[0] <= t + hi]


# Where an event's moment sits relative to its play-by-play clock second, measured on
# 0021500492 (share of events whose actor is within 4 ft of the ball, by 1-s offset): a shot
# is logged when it reaches the rim, 2-4 s after release (0.85 at +3 s vs 0.15 at 0 s);
# turnovers ~2 s after (0.75); rebounds and fouls at the logged second (0.72, 0.68).
# (lo, hi) is the window in clock seconds after the logged time; "last" picks the final moment
# the actor still has the ball (a shot's release), "near" the moment he is closest to it.
WIN = {"2pt": (0.0, 5.0, "last"), "3pt": (0.0, 5.0, "last"), "block": (0.0, 5.0, "near"), "freethrow": (-0.6, 1.6, "near"),
       "rebound": (-1.0, 2.0, "near"), "turnover": (0.0, 4.0, "near"), "steal": (0.0, 4.0, "near"), "foul": (-0.5, 2.5, "near"),
       "jumpball": (0.0, 3.0, "near")}
HOLD = 3.5  # ft, actor to ball, to count as having it


def pick(moms: list, t: float, et: str, actor: int) -> tuple | None:
    lo, hi, mode = WIN[et]
    best, bd = None, 1e9
    for m in moms:
        if not (t + lo <= m[0] <= t + hi):
            continue
        for tm, pid, x, y in m[2]:
            if pid == actor:
                d = math.hypot(x - m[1][0], y - m[1][1])
                if mode == "last":
                    if d < HOLD and (best is None or m[0] < best[0]):
                        best, bd = m, d
                elif d < bd:
                    best, bd = m, d
    return best if best is not None and bd < (HOLD if mode == "last" else 6) else None


def game_rows(csv_path: Path) -> list[dict]:
    with csv_path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def ival(s: str) -> int:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def extract(path7z: Path, events_dir: Path, out_dir: Path) -> dict:
    gid, moms = load_moments(path7z, out_dir.parent / "_tmp" / path7z.stem)
    ev_csv = events_dir / f"{gid}.csv"
    stat = {"game": gid, "rows": 0, "kept": 0, "drop_nomoment": 0, "drop_noactor": 0, "drop_shotdist": 0, "shot_err_ft": []}
    if not ev_csv.exists():
        stat["error"] = "no events csv"
        return stat
    rows = game_rows(ev_csv)
    # which rim each team attacks, per period, from where its shots were taken
    votes: dict[tuple, float] = {}
    recs = []
    margin = {}  # running home margin
    hm = 0
    last_shot = None
    for r in rows:
        typ, act, per = ival(r["EVENTMSGTYPE"]), ival(r["EVENTMSGACTIONTYPE"]), ival(r["PERIOD"])
        if r.get("SCOREMARGIN") not in (None, "", "TIE"):
            hm = ival(r["SCOREMARGIN"])
        elif r.get("SCOREMARGIN") == "TIE":
            hm = 0
        if per not in moms or typ not in (1, 2, 3, 4, 5, 6, 10):
            continue
        stat["rows"] += 1
        t = clock_s(r["PCTIMESTRING"])
        p1, p1t = ival(r["PLAYER1_ID"]), ival(r["PLAYER1_TEAM_ID"])
        p2, p2t = ival(r["PLAYER2_ID"]), ival(r["PLAYER2_TEAM_ID"])
        p3, p3t = ival(r["PLAYER3_ID"]), ival(r["PLAYER3_TEAM_ID"])
        text = " ".join(filter(None, [r.get("HOMEDESCRIPTION"), r.get("VISITORDESCRIPTION")]))
        home_desc = bool(r.get("HOMEDESCRIPTION"))
        out = []  # (type, actor pid, offense team id)
        if typ in (1, 2):
            out.append(("3pt" if "3PT" in text else "2pt", p1, p1t))
            if typ == 2 and p3 and p3t:
                out.append(("block", p3, p1t))
        elif typ == 3:
            out.append(("freethrow", p1, p1t))
        elif typ == 4:
            if p1 and p1t:  # player rebounds only; team rebounds have no actor to place
                out.append(("rebound", p1, p1t))
        elif typ == 5:
            if p1 and p1t:
                out.append(("turnover", p1, p1t))
                if p2 and p2t and "STEAL" in text.upper():
                    out.append(("steal", p2, p2t))
        elif typ == 6:
            if p1 and p1t:
                out.append(("foul", p1, None))
        elif typ == 10:
            if p3 and p3t:
                out.append(("jumpball", p3, p3t))
        for k, (et, actor, off) in enumerate(out):
            m = pick(moms[per], t, et, actor)
            if m is None:
                if not window(moms[per], t, -WIN[et][0], WIN[et][1]):
                    stat["drop_nomoment"] += 1
                else:
                    stat["drop_noactor"] += 1
                continue
            teams = sorted({tm for tm, *_ in m[2]})
            if len(teams) != 2 or len(m[2]) != 10:
                stat["drop_nomoment"] += 1
                continue
            if off is None:  # a foul: the fouler is (almost always) on defense
                mine = next(tm for tm, pid, *_ in m[2] if pid == actor)
                off = teams[0] if teams[1] == mine else teams[1]
            ax, ay = next(((x, y) for tm, pid, x, y in m[2] if pid == actor), (None, None))
            if et in ("2pt", "3pt"):  # the text's shot distance is a check on the moment we picked
                said = re.search(r"(\d+)'", text)
                if said:
                    dd = min(math.hypot(ax - HOOP, ay - CW / 2), math.hypot(ax - (L - HOOP), ay - CW / 2))
                    err = abs(dd - int(said.group(1)))
                    if err > 5:
                        stat["drop_shotdist"] += 1
                        continue
                    stat["shot_err_ft"].append(round(err, 2))
                votes[(per, off)] = votes.get((per, off), 0) + (1 if ax > L / 2 else -1)
            recs.append({"per": per, "clock": m[0], "ev": T[et], "actor": actor, "off": off, "m": m, "home_desc": home_desc, "hm": hm, "shot": (et in ("2pt", "3pt")), "row": r})
    if not recs:
        stat.pop("shot_err_ft", None)
        return stat
    home_team = None
    for r in rows:
        if r.get("HOMEDESCRIPTION") and ival(r["PLAYER1_TEAM_ID"]):
            home_team = ival(r["PLAYER1_TEAM_ID"])
            break
    n = len(recs)
    pos = np.zeros((n, 10, 2), np.float32)
    pid = np.zeros((n, 10), np.int64)
    team = np.zeros((n, 10), np.int8)
    ball = np.zeros((n, 3), np.float32)
    ev = np.zeros(n, np.int8)
    actor = np.full(n, -1, np.int8)
    right = np.zeros(n, np.int8)
    per_a = np.zeros(n, np.int8)
    clock = np.zeros(n, np.float32)
    marg = np.zeros(n, np.int16)
    shotx = np.full(n, np.nan, np.float32)
    shoty = np.full(n, np.nan, np.float32)
    shotlast = np.zeros(n, np.int8)
    last = None
    for i, rc in enumerate(recs):
        m, off = rc["m"], rc["off"]
        v = votes.get((rc["per"], off))
        if v is None:  # no shots for this team this period: mirror the other team, else the half rule
            o = [vv for (p, t2), vv in votes.items() if p == rc["per"] and t2 != off]
            v = -o[0] if o else 0
        right[i] = 1 if v > 0 else 0
        slots = sorted(m[2], key=lambda r: (r[0] != off, r[1]))
        for k, (tm, p, x, y) in enumerate(slots):
            pos[i, k] = (x, y)
            pid[i, k] = p
            team[i, k] = 1 if tm == off else 0
            if p == rc["actor"]:
                actor[i] = k
        ball[i] = m[1]
        ev[i] = rc["ev"]
        per_a[i] = rc["per"]
        clock[i] = rc["clock"]
        marg[i] = (rc["hm"] if off == home_team else -rc["hm"]) if home_team else 0
        if rc["shot"] and actor[i] >= 0:
            last = tuple(pos[i, actor[i]])
            shotx[i], shoty[i] = last
        elif TYPES[rc["ev"]] in ("rebound", "block") and last is not None:
            shotx[i], shoty[i] = last
            shotlast[i] = 1
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_dir / f"{gid}.npz", pos=pos, pid=pid, team=team, ball=ball, ev=ev, actor=actor, right=right, per=per_a, clock=clock, margin=marg, shotx=shotx, shoty=shoty, shotlast=shotlast)
    stat["kept"] = n
    e = sorted(stat.pop("shot_err_ft"))
    stat["shot_err_median_ft"] = e[len(e) // 2] if e else None
    return stat


def run(args: tuple) -> dict:
    p, ev_dir, out_dir = args
    try:
        with py7zr.SevenZipFile(p) as z:  # resume: a game already written is not redone
            gid = z.getnames()[0].split(".")[0]
        if (Path(out_dir) / f"{gid}.npz").exists():
            return {"game": gid, "skipped": True}
        return extract(Path(p), Path(ev_dir), Path(out_dir))
    except Exception as e:  # one bad archive must not stop the batch
        return {"game": Path(p).name, "error": f"{type(e).__name__}: {e}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--games", type=int, default=0)
    ap.add_argument("--jobs", type=int, default=1)
    a = ap.parse_args()
    d = Path(a.data)
    raws = sorted((d / "raw").glob("*.7z"))
    if a.games:
        raws = raws[: a.games]
    out = d / "snapshots"
    todo = [(str(p), str(d / "events"), str(out)) for p in raws]
    log = (d / "extract_log.jsonl").open("a", encoding="utf-8")
    with ProcessPoolExecutor(max_workers=a.jobs) as ex:
        for i, st in enumerate(ex.map(run, todo)):
            log.write(json.dumps(st) + "\n")
            log.flush()
            print(i + 1, len(todo), json.dumps(st), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
