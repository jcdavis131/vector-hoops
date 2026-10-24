#!/usr/bin/env python3
"""Build the Map Hunt / Twin Hunt daily puzzle data (Worker B, opening-night overhaul).

Stdlib + numpy. Outputs under assets/map-hunt/:

  candidates.json   compact quiz pool: [index, name, season, twinIndex, twinName, twinSeason, sim]
  index.json        {v, generated, mh_pool, th_pool, days: {dayKey: {mh: mysteryIdx, th: givenIdx, tht: twinIdx}}}
                    (mh_pool / th_pool: how many seasons each mode draws from)
  puzzles/<day>-mh.u8  12,966 uint8 cosine distances TO the mystery player
  puzzles/<day>-th.u8  12,966 uint8 cosine distances TO the twin-hunt target (the twin)

Row order = vectors.json['players'] order (0..12965), index-aligned with
mtnn_embeddings.f32 (64-d, L2-normalized) and mtnn_map.json coords.
Quantization: cosine distance d in [0,2] -> round(d/2*255) as uint8 (~13 KiB/file).

Daily picks are deterministic: sha256("map-hunt-v1|<day>|<mode>") so every
visitor gets the same puzzle and shared links replay identically.
Same-link-same-stars: the URL encodes day+mode+result; stars derive from tap
count alone, so a link always replays the same stars.

Rolling window (feeds plan P4, 2026-10-24). The window used to be fixed
(2026-10-13..2026-11-03), so the game went dark the day after END. The default
run now EXTENDS the committed window: every day already in index.json keeps its
picks and its .u8 files byte for byte (they are never rewritten; a fresh
rebuild is not byte-reproducible across numpy builds), and only the days from
the committed end + 1 through today + --ahead (21) are computed and appended.
Rerunning on the same day changes nothing. --check fails when fewer than
--min-ahead (7) days remain after today, or when a listed day lacks its files.
"Today" is the local date, the same clock map-hunt.js uses.

    python scripts/build_map_hunt.py                 # extend to today + 21 days
    python scripts/build_map_hunt.py --check         # fail if < 7 days remain
    python scripts/build_map_hunt.py --rebuild       # recompute every day (changes bytes)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
OUT = ASSETS / "map-hunt"
VERSION = "map-hunt-v1"

# Puzzle window: starts here (a week before opening night, for shared-link replay)
# and rolls forward. END is the end of the original fixed window, used only when
# there is no committed index.json to extend.
START = dt.date(2026, 10, 13)
END = dt.date(2026, 11, 3)
AHEAD_DAYS = 21  # the default run keeps at least this many days after today
MIN_AHEAD_DAYS = 7  # --check fails below this
N_ROWS = 12966


def day_key(d: dt.date) -> str:
    return d.isoformat()


def pick_index(day: str, mode: str, n: int) -> int:
    h = hashlib.sha256(f"{VERSION}|{day}|{mode}".encode()).digest()
    return int.from_bytes(h[:8], "big") % n


def target_end(committed_end: dt.date | None, today: dt.date, ahead: int = AHEAD_DAYS) -> dt.date:
    """The last day the window should cover: never earlier than what is already published."""
    want = today + dt.timedelta(days=ahead)
    return max(committed_end, want) if committed_end else max(END, want)


def days_between(first: dt.date, last: dt.date) -> list[dt.date]:
    """first..last inclusive; empty when first > last."""
    return [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]


def days_remaining(end: dt.date, today: dt.date) -> int:
    """Whole days of puzzles after today (0 when today is the last day)."""
    return (end - today).days


def check_window(index: dict, today: dt.date, puzzles: Path | None = None,
                 min_ahead: int = MIN_AHEAD_DAYS) -> list[str]:
    """Problems with a published index: too few days left, gaps, missing files. [] when fine."""
    days = sorted(index.get("days") or {})
    if not days:
        return ["index.json lists no days"]
    errs = []
    first, last = dt.date.fromisoformat(days[0]), dt.date.fromisoformat(days[-1])
    left = days_remaining(last, today)
    if left < min_ahead:
        errs.append(f"only {left} day(s) after {today} (window ends {last}); need >= {min_ahead}")
    expect = [d.isoformat() for d in days_between(first, last)]
    if days != expect:
        gaps = sorted(set(expect) - set(days))
        errs.append(f"window has gaps: {gaps[:5]}")
    if puzzles is not None:
        for k in days:
            for mode in ("mh", "th"):
                f = puzzles / f"{k}-{mode}.u8"
                if not f.exists() or f.stat().st_size != N_ROWS:
                    errs.append(f"missing or wrong-size {f.name}")
    return errs


def read_index(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build or extend the Map Hunt / Twin Hunt daily puzzles.")
    ap.add_argument("--check", action="store_true", help="fail if fewer than --min-ahead days remain")
    ap.add_argument("--ahead", type=int, default=AHEAD_DAYS, help="extend to today + this many days (default 21)")
    ap.add_argument("--min-ahead", type=int, default=MIN_AHEAD_DAYS, help="--check threshold (default 7)")
    ap.add_argument("--rebuild", action="store_true",
                    help="recompute every day from START (rewrites existing .u8 files; not byte-stable)")
    ap.add_argument("--today", type=dt.date.fromisoformat, default=None, help="override the local date (tests)")
    a = ap.parse_args(argv)
    today = a.today or dt.date.today()
    committed = read_index(OUT / "index.json")

    if a.check:
        if committed is None:
            print("FAIL assets/map-hunt/index.json missing or unreadable")
            return 1
        errs = check_window(committed, today, OUT / "puzzles", a.min_ahead)
        if errs:
            for e in errs:
                print("FAIL", e)
            return 1
        last = max(committed["days"])
        print(f"OK   map hunt window ends {last}: {days_remaining(dt.date.fromisoformat(last), today)} "
              f"day(s) after {today} (>= {a.min_ahead})")
        return 0

    try:
        import numpy as np
    except ImportError:
        sys.exit("numpy required (available on this VM)")

    vec = json.loads((ASSETS / "vectors.json").read_text())
    players = vec["players"]
    n = len(players)
    assert n == 12966, f"expected 12966 rows, got {n}"

    by_name_season: dict[tuple[str, str], int] = {}
    by_name: dict[str, int] = {}
    for i, p in enumerate(players):
        by_name_season[(p["name"].lower(), p["season"])] = i
        by_name.setdefault(p["name"].lower(), i)

    def resolve(name: str, season: str) -> int | None:
        hit = by_name_season.get((name.lower(), season))
        if hit is not None:
            return hit
        return by_name.get(name.lower())

    era = json.loads((ASSETS / "eratwins.json").read_text())
    candidates: list[list] = []
    unresolved = 0
    for e in era["players"]:
        ci = resolve(e["name"], e["season"])
        tw = e.get("twin") or {}
        ti = resolve(tw.get("name", ""), tw.get("season", "")) if tw else None
        if ci is None or ti is None or ci == ti:
            unresolved += 1
            continue
        candidates.append([ci, e["name"], e["season"], ti, tw["name"], tw["season"],
                           round(float(tw.get("similarity", 0)), 4)])
    print(f"resolved {len(candidates)}/{len(era['players'])} quiz-pool candidates "
          f"({unresolved} dropped: no row match)")

    # Map Hunt mystery pool: recognizable names only (dossier players). Twin Hunt
    # keeps the full pool — variety is fine there because the given player is shown.
    try:
        ei = json.loads((ASSETS / "entity-index.json").read_text())["entities"]
        dossier = {e["name"].lower() for e in ei if e.get("dossier")}
    except (OSError, KeyError):
        dossier = set()
    mh_pool = [c for c in candidates if c[1].lower() in dossier]
    if len(mh_pool) < 20:
        mh_pool = candidates  # honest fallback: thin fame list, use everyone
    print(f"map-hunt mystery pool: {len(mh_pool)} dossier players; "
          f"twin-hunt given pool: {len(candidates)}")

    nc = len(candidates)
    nm = len(mh_pool)
    if nc < 100:
        sys.exit("too few candidates — refusing to ship a thin pool")

    OUT.mkdir(exist_ok=True)
    (OUT / "puzzles").mkdir(exist_ok=True)
    cand_text = json.dumps(candidates, separators=(",", ":"))
    cand_path = OUT / "candidates.json"
    if not cand_path.exists() or cand_path.read_text(encoding="utf-8") != cand_text:
        cand_path.write_text(cand_text, encoding="utf-8", newline="\n")

    keep: dict[str, dict] = {}
    if committed and committed.get("days") and not a.rebuild:
        keep = dict(committed["days"])
        first = dt.date.fromisoformat(max(keep)) + dt.timedelta(days=1)
        last = target_end(dt.date.fromisoformat(max(keep)), today, a.ahead)
    else:
        first, last = START, target_end(None, today, a.ahead)
    todo = days_between(first, last)
    # A listed day whose files went missing is rebuilt from its own committed picks.
    repair = sorted({k for k in keep for m in ("mh", "th") if not (OUT / "puzzles" / f"{k}-{m}.u8").exists()})
    pools_same = bool(committed) and committed.get("mh_pool") == len(mh_pool) and committed.get("th_pool") == len(
        candidates
    )
    if keep and not todo and not repair and pools_same:
        print(f"OK  nothing to do: window already ends {max(keep)} (today {today} + {a.ahead} = "
              f"{today + dt.timedelta(days=a.ahead)})")
        return 0

    E = np.fromfile(str(ASSETS / "mtnn_embeddings.f32"), dtype="<f4").reshape(n, 64)
    norms = np.linalg.norm(E, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-3):
        sys.exit(f"embeddings not L2-normalized (max dev {np.abs(norms-1).max()})")

    days: dict[str, dict] = dict(keep)
    targets: set[int] = set()
    day_list: list[tuple[str, int, int]] = []
    for k in repair:
        targets.add(keep[k]["mh"])
        targets.add(keep[k]["tht"])
        day_list.append((k, keep[k]["mh"], keep[k]["tht"]))
    for d in todo:
        k = day_key(d)
        mh = pick_index(k, "mh", nm)
        th = pick_index(k, "th", nc)
        mi = mh_pool[mh][0]
        gi = candidates[th][0]
        ti = candidates[th][3]
        if gi == mi:
            th = (th + 1) % nc
            gi = candidates[th][0]
            ti = candidates[th][3]
        days[k] = {"mh": mi, "th": gi, "tht": ti}
        targets.add(mi)
        targets.add(ti)
        day_list.append((k, mi, ti))

    # One pass: distance vector per unique target row.
    for t in sorted(targets):
        dot = E @ E[t]
        dist = np.clip(2.0 - 2.0 * dot, 0.0, 2.0)
        q = np.round(dist / 2.0 * 255.0).astype(np.uint8)
        # stash on disk keyed by target; the day loop renames copies.
        q.tofile(str(OUT / "puzzles" / f"_t{t}.u8"))

    for k, mi, ti in day_list:
        for mode, t in (("mh", mi), ("th", ti)):
            dst = OUT / "puzzles" / f"{k}-{mode}.u8"
            if dst.exists() and k in keep:
                continue  # a published day's file is never rewritten
            dst.write_bytes((OUT / "puzzles" / f"_t{t}.u8").read_bytes())
    for f in (OUT / "puzzles").glob("_t*.u8"):
        f.unlink()

    (OUT / "index.json").write_text(json.dumps(
        {"v": 1, "generated": today.isoformat(), "mh_pool": nm, "th_pool": nc, "days": days},
        separators=(",", ":")), encoding="utf-8", newline="\n")

    # Sanity: mystery is its own nearest (dist 0) and twin is near the given.
    if day_list:
        k0, mi0, _ti0 = day_list[0]
        q = np.fromfile(str(OUT / "puzzles" / f"{k0}-mh.u8"), dtype=np.uint8)
        assert len(q) == n and q[mi0] == 0, "self-distance must quantize to 0"
    added = [k for k, _, _ in day_list if k not in keep]
    print(f"OK  window {min(days)}..{max(days)} ({len(days)} days); added {len(added)} "
          f"({added[0] if added else '-'}..{added[-1] if added else '-'}), repaired {len(repair)}, "
          f"{len(targets)} unique targets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
