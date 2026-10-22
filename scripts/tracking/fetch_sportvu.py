"""Fetch the public 2015-16 SportVU tracking logs and their play-by-play, once.

    python scripts/tracking/fetch_sportvu.py --out C:/Users/jcdav/datasets/sportvu-linouk23 [--limit N]

Sources (both GitHub mirrors of data stats.nba.com served keyless in 2016; neither carries a
licence file). Cam's decision D9, 2026-10-22: train on it, never re-serve the raw tracking; the
site only shows the model's projected positions, labelled as projected, with the source credited.
  tracking: github.com/linouk23/NBA-Player-Movements  data/2016.NBA.Raw.SportVU.Game.Logs/*.7z
  events:   github.com/sealneaward/nba-movement-data  data/events/<gameId>.csv
Sequential, one file at a time, skipping files already on disk (sizes checked against GitHub).
Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

API = "https://api.github.com/repos/{repo}/contents/{path}"
TRACK = ("linouk23/NBA-Player-Movements", "data/2016.NBA.Raw.SportVU.Game.Logs")
EVENTS = ("sealneaward/nba-movement-data", "data/events")
UA = {"User-Agent": "vector-hoops-tracking-fetch", "Accept": "application/vnd.github+json"}


def listing(repo: str, path: str) -> list[dict]:
    req = urllib.request.Request(API.format(repo=repo, path=path), headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return [x for x in json.load(r) if x.get("type") == "file"]


def fetch(url: str, dest: Path, size: int) -> bool:
    if dest.exists() and dest.stat().st_size == size:
        return False
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
    with urllib.request.urlopen(req, timeout=300) as r, tmp.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    if tmp.stat().st_size != size:
        tmp.unlink()
        raise OSError(f"{dest.name}: size {tmp.stat().st_size if tmp.exists() else '?'} != {size}")
    tmp.replace(dest)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0, help="first N games only (0 = all)")
    a = ap.parse_args()
    out = Path(a.out)
    (out / "raw").mkdir(parents=True, exist_ok=True)
    (out / "events").mkdir(parents=True, exist_ok=True)
    games = sorted(listing(*TRACK), key=lambda x: x["name"])
    events = {x["name"]: x for x in listing(*EVENTS)}
    if a.limit:
        games = games[: a.limit]
    manifest = {"tracking": TRACK, "events": EVENTS, "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": []}
    new = 0
    for i, g in enumerate(games):
        try:
            new += fetch(g["download_url"], out / "raw" / g["name"], g["size"])
            manifest["files"].append({"name": g["name"], "size": g["size"], "sha": g["sha"]})
        except Exception as e:  # keep going; the manifest records what landed
            print(f"FAIL {g['name']}: {e}", flush=True)
        if i % 25 == 0:
            print(f"{i + 1}/{len(games)} tracking files ({new} new)", flush=True)
        time.sleep(0.3)
    for name, ev in sorted(events.items()):
        try:
            fetch(ev["download_url"], out / "events" / name, ev["size"])
        except Exception as e:
            print(f"FAIL {name}: {e}", flush=True)
        time.sleep(0.1)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"done: {len(manifest['files'])} tracking files, {len(list((out / 'events').glob('*.csv')))} event files", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
