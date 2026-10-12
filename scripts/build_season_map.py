"""Index the trajectory file by season so /trends can scrub the league through it.

`assets/embedding_map_trajectories.json` already holds every position this site
could ever want for change over time: **1,764 players, 30 seasons, 12,038
player-seasons**, each with `x, y, z` in the map's space and the archetype index
`c`. What it does not hold is a way to ask "where was the whole league in
2003-04" — it is keyed by player, so answering that means walking all 1,764
careers and filtering. A season scrubber would do that on every frame.

So this pivots it once, at build time, and writes the same numbers keyed by
season instead of by player.

    embedding_map_trajectories.json   1,135,755 B   {pid: [{season,x,y,z,c,gp,mpg}]}
    season_map.json                   see below     {season: [[pid,x,y,z,c]]}

Nothing is rounded or resampled. `x`, `y`, `z` and `c` are copied verbatim from
the source, so the scrubbed map and the trajectory overlay cannot disagree about
where a player was. `gp` and `mpg` are dropped because no view reads them; that,
and the array-of-arrays shape, are the whole of the saving.

Archetype **names** are deliberately not in here. The site reads those from
`assets/mtnn_arch.json` (`gameArchetypes`) and shows bare indices when that file
cannot be loaded rather than inventing names — /players and /trends both already
do it that way, and a second copy of the labels is a second thing to drift.

Player names come from `embedding_map_points_limited.json`, which carries one row
per player: the same 1,764 pids, verified rather than assumed.

    python scripts/build_season_map.py            # write
    python scripts/build_season_map.py --check    # fail if stale
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "embedding_map_trajectories.json"
NAMES = ROOT / "assets" / "embedding_map_points_limited.json"
TARGET = ROOT / "assets" / "season_map.json"
PAGE = ROOT / "trends.html"


def patterns(obj: dict, size: int) -> list[tuple[re.Pattern[str], str]]:
    """What /trends says about this file, kept true by the file.

    The button quotes a download size and the prose quotes a span and a count.
    All three were typed once and would have gone quietly wrong the first time
    the asset changed — which is the whole reason the derived check exists.
    """
    kb = round(size / 1024)
    ss = obj["seasons"]
    return [
        (re.compile(r"Draw the seasons — \d+ KB"), f"Draw the seasons — {kb} KB"),
        (re.compile(r"Loading the season map, \d+ kilobytes\."),
         f"Loading the season map, {kb} kilobytes."),
        (re.compile(r"<b>\d+ seasons, \S+ to \S+, [\d,]+ player-seasons</b>"),
         f"<b>{len(ss)} seasons, {ss[0]} to {ss[-1]}, "
         f"{obj['playerSeasons']:,} player-seasons</b>"),
    ]


def stamp(obj: dict, size: int, check: bool) -> tuple[bool, str]:
    if not PAGE.exists():
        return True, "no trends.html under this root"
    with open(PAGE, encoding="utf-8", newline="") as fh:
        original = fh.read()
    text = original
    for rx, want in patterns(obj, size):
        if not rx.search(text):
            return False, f"trends.html no longer carries the pattern {rx.pattern!r}"
        text = rx.sub(want.replace("\\", "\\\\"), text)
    if text == original:
        return True, "trends.html already matches the file"
    if check:
        return False, "trends.html quotes a stale size or count"
    with open(PAGE, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
    return True, "trends.html restamped"


def build() -> dict:
    tj = json.loads(SOURCE.read_text(encoding="utf-8"))["trajectories"]
    named = {str(p["pid"]): p["display_name"]
             for p in json.loads(NAMES.read_text(encoding="utf-8"))["points"]}

    frames: dict[str, list] = defaultdict(list)
    for pid, arr in tj.items():
        for pt in arr:
            frames[pt["season"]].append([int(pid), pt["x"], pt["y"], pt["z"], pt["c"]])

    seasons = sorted(frames)
    # sorted by pid inside each frame: the file has to be byte-identical run to
    # run or --check reports drift that is only dict ordering
    for s in seasons:
        frames[s].sort()

    used = sorted({row[0] for s in seasons for row in frames[s]})
    return {
        "built": "season_map",
        "source": "assets/embedding_map_trajectories.json",
        "namesSource": "assets/embedding_map_points_limited.json",
        "note": ("x, y, z and c are copied verbatim from the source; nothing is "
                 "rounded or resampled. Archetype names come from "
                 "assets/mtnn_arch.json, not from here."),
        "seasons": seasons,
        "counts": {s: len(frames[s]) for s in seasons},
        "players": len(used),
        "playerSeasons": sum(len(frames[s]) for s in seasons),
        # a pid with no row in the limited file would be a name this cannot
        # supply; the page falls back to the pid rather than to a guess
        "names": {str(p): named[str(p)] for p in used if str(p) in named},
        "frames": {s: frames[s] for s in seasons},
    }


def dump(obj: dict) -> str:
    # compact, not indent=1 like the other generators: this one is a payload
    # asset fetched over the wire, and indentation on 12,038 rows is 200 KB of
    # spaces. Still sort_keys, so --check compares like for like.
    return json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    for p in (SOURCE, NAMES):
        if not p.exists():
            sys.exit(f"missing {p}")

    obj = build()
    want = dump(obj)

    if args.check:
        if not TARGET.exists():
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} does not exist")
            return 1
        have = TARGET.read_text(encoding="utf-8")
        if have != want:
            print(f"FAIL {TARGET.relative_to(ROOT).as_posix()} is stale — "
                  f"run: python scripts/build_season_map.py")
            return 1
        ok, why = stamp(obj, len(want.encode("utf-8")), check=True)
        if not ok:
            print(f"FAIL {why} — run: python scripts/build_season_map.py")
            return 1
        print(f"OK season_map.json matches the trajectory file and /trends quotes it "
              f"correctly — {len(obj['seasons'])} seasons, "
              f"{obj['playerSeasons']:,} player-seasons, {len(have):,} bytes")
        return 0

    TARGET.write_text(want, encoding="utf-8", newline="")
    ok, why = stamp(obj, len(want.encode("utf-8")), check=False)
    print(f"  {why}")
    src = SOURCE.stat().st_size
    print(f"wrote {TARGET.relative_to(ROOT).as_posix()} — {len(obj['seasons'])} seasons "
          f"{obj['seasons'][0]}..{obj['seasons'][-1]}, {obj['players']:,} players, "
          f"{obj['playerSeasons']:,} player-seasons, {len(want):,} bytes "
          f"({100 * len(want) / src:.1f}% of the {src:,} it was cut from)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
