#!/usr/bin/env python3
"""ESPN core API plays -> canonical shot-chart records.

SOURCE
------
Public, no-auth, $0 ESPN core API (sports.core.api.espn.com). Recon verdict:
VIABLE (2026-10-21).

  Slate:    GET /v2/sports/basketball/leagues/nba/events?dates=YYYYMMDD&lang=en&region=us
  Status:   GET .../events/{id}/competitions/{id}/status?lang=en&region=us
  Plays:    GET .../events/{id}/competitions/{id}/plays?limit=1000&lang=en&region=us
            (paginated via pageIndex/pageCount; one page holds a full game)

Per-shot fields: coordinate.{x,y}, shootingPlay (bool), pointsAttempted
(1=FT, 2, 3), scoreValue (0=miss, 2/3=make), participants[].athlete.$ref with
type=="shooter", team.$ref, period.number, clock.{value,displayValue}.
Rate: <=1 req/3s, jittered backoff on transient errors. No 429 seen.

ARCHITECTURE (per SHOTCHART_PIPELINE_STANDARD.md)
------------------------------------------------
ESPN's core API sends `Access-Control-Allow-Origin: *`, so LIVE games are
served client-side by assets/live-nba.js (browser fetch, no pipeline).
THIS pipeline covers HISTORICAL snapshots (completed games only, state=post)
-> versioned JSONL under assets/data/shotcharts/espn_plays/ (+ public/ mirror).

NATIVE COORDINATE SYSTEM (derived empirically 2026-10-21, NOT assumed)
---------------------------------------------------------------------
ESPN charts every shot against the basket being attacked, in FEET:

  x_e in [0, 50]  across the court (court is 50 ft wide; 25 = middle)
  y_e in [-2, 62] up from the attacked basket's BASELINE (hoop ON y=0)

Fit against 415 ESPN-labeled distances ("24-foot three point jumper" etc.)
across 3 completed games (2026-10-20):
  hoop = (25.0, 0.0), scale = 1.0  ->  RMSE 0.75 ft
  (free fit: hoop=(25.0, 0.5), scale=0.99 -> RMSE 0.49 ft; the round
  numbers are adopted — the residual is the label rounding.)

Spot checks:
  "26-ft 3PT" at (39, 23)  -> hypot(14, 23) = 26.9 ft  (~26 ft)
  "3-ft alley oop" at (21, 0) -> hypot(4, 0) = 4.0 ft   (~3 ft)
  "22-ft 3PT" at (2, -1)   -> hypot(23, 1)  = 23.0 ft   (~22 ft, corner 3 = 22 ft)
  "24-ft 3PT" at (50, 2)   -> hypot(25, 2)  = 25.1 ft   (~24 ft; break = 23.75 ft)

CANONICAL TRANSFORM (contract: feet, hoop (0,0), +y toward half-court,
x positive to the shooter's right facing the hoop):

  x_c = 25.0 - x_e        # mirrored vs ESPN's page left-to-right charting:
                          # a shooter facing the hoop (looking -y) has their
                          # right hand toward -x_e, so +x_c = shooter's right
  y_c = y_e               # already feet up-court from the hoop line

EXCLUSIONS (documented, honest)
-------------------------------
  * pointsAttempted == 1 (free throws): not field-goal attempts; ESPN ships
    sentinel coords (-214748340, -214748365) for them anyway.
  * y_e > 47 (beyond half-court heaves, e.g. a 62-ft heave): outside the
    canonical chart bounds (|x|<=30, y<=47) the QA gate enforces.
  * |coord| >= 1000 sentinels.
Free-throw exclusion keeps shot_type in {2PT, 3PT} per the schema gate.

game_id = ESPN event id (== competition id).
"""

from __future__ import annotations

import hashlib
import json
import random
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from common import checkpoints as cp
from common import manifest as manifest_mod
from common import qa as qa_mod

SOURCE = "espn_plays"
GATED = False

BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba"
QS = "lang=en&region=us"
POLITE_S = 3.0  # >=3s between requests
RETRY_ATTEMPTS = 5
BACKOFF_BASE_S = 2.0
BACKOFF_CAP_S = 60.0

_SENTINEL = 1000.0  # |coord| >= this means "no chart data" (INT32 sentinels)
_HALF_COURT_Y = 47.0

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

_last_req = 0.0


# ---------------------------------------------------------------- HTTP -----


def _polite_wait() -> None:
    global _last_req
    dt = time.monotonic() - _last_req
    if dt < POLITE_S:
        time.sleep(POLITE_S - dt)
    _last_req = time.monotonic()


def _backoff(attempt: int) -> None:
    time.sleep(min(BACKOFF_CAP_S, BACKOFF_BASE_S * (2**attempt) * (0.7 + 0.6 * random.random())))


def http_get_json(url: str) -> dict:
    """GET JSON, polite pacing, jittered backoff on transient failures."""
    last: Exception | None = None
    for attempt in range(RETRY_ATTEMPTS):
        _polite_wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (429, 500, 502, 503, 504):
                _backoff(attempt)
                continue
            raise RuntimeError(f"HTTP {exc.code} from {url}") from exc
        except Exception as exc:  # timeouts, resets, DNS: transient
            last = exc
            _backoff(attempt)
    raise RuntimeError(f"GET failed after {RETRY_ATTEMPTS} attempts: {url} ({last})")


# ------------------------------------------------------------- ref cache ---


class RefCache:
    """Athlete/team $ref resolutions, persisted per date in the checkpoint dir."""

    def __init__(self, dirs, date: str):
        self.path = Path(cp.checkpoint_path(dirs, SOURCE, date)).parent / "refcache.json"
        try:
            self._d = json.loads(self.path.read_text())
        except (OSError, json.JSONDecodeError):
            self._d = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._d, indent=1, sort_keys=True))

    @staticmethod
    def _ref_id(ref: str) -> str:
        return ref.split("?")[0].rstrip("/").rsplit("/", 1)[-1]

    def athlete(self, ref: str) -> tuple[str, str]:
        """(athlete_id, display_name) for an athlete $ref."""
        if ref not in self._d:
            d = http_get_json(ref)
            self._d[ref] = {
                "id": str(d.get("id") or self._ref_id(ref)),
                "name": d.get("displayName") or d.get("shortName") or "Unknown",
            }
            self._save()
        e = self._d[ref]
        return e["id"], e["name"]

    def team_abbr(self, ref: str) -> tuple[str, str]:
        """(team_id, abbreviation) for a team $ref."""
        if ref not in self._d:
            d = http_get_json(ref)
            self._d[ref] = {"id": str(d.get("id") or self._ref_id(ref)), "abbr": d.get("abbreviation") or "UNK"}
            self._save()
        e = self._d[ref]
        return e["id"], e["abbr"]


# ------------------------------------------------------------------ fetch ---


def _slate_ids(date: str) -> list[str]:
    yyyymmdd = date.replace("-", "")
    d = http_get_json(f"{BASE}/events?dates={yyyymmdd}&{QS}")
    ids = []
    for item in d.get("items", []):
        ref = item.get("$ref", "")
        ids.append(ref.split("?")[0].rstrip("/").rsplit("/", 1)[-1])
    return sorted(set(ids))


def _game_state(game_id: str) -> str:
    d = http_get_json(f"{BASE}/events/{game_id}/competitions/{game_id}/status?{QS}")
    return (d.get("type") or {}).get("state", "unknown")


def _fetch_plays(game_id: str) -> list[dict]:
    """All plays for a game (follows pagination defensively)."""
    items: list[dict] = []
    page = 1
    while True:
        d = http_get_json(f"{BASE}/events/{game_id}/competitions/{game_id}/plays?limit=1000&page={page}&{QS}")
        items.extend(d.get("items", []))
        if page >= int(d.get("pageCount", 1)):
            break
        page += 1
    return items


def _is_chartable_shot(play: dict) -> bool:
    """A field-goal attempt with real chart coordinates."""
    if not play.get("shootingPlay"):
        return False
    if play.get("pointsAttempted") not in (2, 3):
        return False  # free throws (1) excluded; anything else is unknown
    c = play.get("coordinate") or {}
    x, y = c.get("x"), c.get("y")
    if not isinstance(x, int | float) or not isinstance(y, int | float):
        return False
    if abs(x) >= _SENTINEL or abs(y) >= _SENTINEL:
        return False
    if y > _HALF_COURT_Y:
        return False  # beyond-half-court heave: outside canonical chart bounds
    return True


def fetch(date: str, resume: bool, dirs: dict) -> dict:
    raw_dir = Path(dirs["raw"]) / SOURCE / date
    raw_dir.mkdir(parents=True, exist_ok=True)
    done = cp.load_completed(dirs, SOURCE, date) if resume else set()

    game_ids = _slate_ids(date)
    raw_files: list[str] = []
    skipped: list[dict] = []
    for gid in game_ids:
        if gid in done:
            raw_files.append(str(raw_dir / f"{gid}.json"))
            continue
        state = _game_state(gid)
        if state != "post":
            skipped.append({"game_id": gid, "reason": f"state={state} (not completed)"})
            continue
        plays = _fetch_plays(gid)
        envelope = {
            "game_id": gid,
            "date": date,
            "source": SOURCE,
            "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "plays_url": (f"{BASE}/events/{gid}/competitions/{gid}/plays"),
            "n_plays": len(plays),
            "response": {"items": plays},
        }
        p = raw_dir / f"{gid}.json"
        p.write_text(json.dumps(envelope))
        raw_files.append(str(p))
        cp.mark_complete(dirs, SOURCE, date, gid)
    return {"games": len(raw_files), "raw_files": raw_files, "skipped": skipped}


# --------------------------------------------------------------- normalize ---


def _shooter_ref(play: dict) -> str | None:
    for pt in play.get("participants", []) or []:
        if pt.get("type") == "shooter":
            a = (pt.get("athlete") or {}).get("$ref")
            if a:
                return a
    return None


def _to_canonical(x_e: float, y_e: float) -> tuple[float, float]:
    """ESPN native (feet, hoop at (25,0)) -> canonical (feet, hoop (0,0)).

    +y toward half-court; +x toward the shooter's right facing the hoop
    (mirrored vs ESPN's page left-to-right charting — see module docstring).
    """
    return (round(25.0 - x_e, 3), round(y_e, 3))


def _shot_zone(x: float, y: float, shot_type: str) -> str:
    import math

    d = math.hypot(x, y)
    ax = abs(x)
    if y > _HALF_COURT_Y:
        return "Backcourt"
    if shot_type == "3PT":
        # corner 3: 22 ft line runs parallel to the sideline (|x|=22) for y<14
        return "Corner 3" if (ax >= 21.5 and y <= 14.0) else "Above the Break 3"
    if d < 4.0:
        return "Restricted Area"
    if ax < 8.5 and y < 19.0:
        return "In The Paint (Non-RA)"
    return "Mid-Range"


def _season_for(date: str) -> str:
    y, m = int(date[:4]), int(date[5:7])
    return f"{y}-{str(y + 1)[-2:]}" if m >= 10 else f"{y - 1}-{str(y)[-2:]}"


def _normalize_play(play: dict, game_id: str, date: str, season: str, refs: RefCache) -> dict | None:
    if not _is_chartable_shot(play):
        return None
    c = play["coordinate"]
    x, y = _to_canonical(c["x"], c["y"])
    made = bool(play.get("scoreValue", 0) > 0)
    shot_type = "3PT" if play.get("pointsAttempted") == 3 else "2PT"
    shooter_ref = _shooter_ref(play)
    player_id, player_name = refs.athlete(shooter_ref) if shooter_ref else ("0", "Unknown")
    _, team_abbr = refs.team_abbr((play.get("team") or {}).get("$ref", ""))
    clock = play.get("clock") or {}
    period = (play.get("period") or {}).get("number", 0)
    return {
        "game_id": game_id,
        "game_date": date,
        "season": season,
        "player_id": str(player_id),
        "player_name": player_name,
        "team_abbr": team_abbr,
        "period": int(period),
        "clock": str(clock.get("displayValue", "")),
        "_clock_s": float(clock.get("value", 0.0) or 0.0),
        "x": x,
        "y": y,
        "made": made,
        "shot_type": shot_type,
        "shot_zone": _shot_zone(x, y, shot_type),
        "source": SOURCE,
        "fetched_at": "",  # filled from the raw envelope below
        "pipeline_version": manifest_mod.PIPELINE_VERSION,
    }


def normalize(date: str, dirs: dict) -> list:
    raw_dir = Path(dirs["raw"]) / SOURCE / date
    refs = RefCache(dirs, date)
    season = _season_for(date)
    records: list[dict] = []
    for p in sorted(raw_dir.glob("*.json")):
        env = json.loads(p.read_text())
        gid = env.get("game_id") or p.stem
        fetched_at = env.get("fetched_at", "")
        for play in (env.get("response") or {}).get("items", []):
            r = _normalize_play(play, gid, date, season, refs)
            if r:
                r["fetched_at"] = fetched_at
                records.append(r)
    return records


# --------------------------------------------------------------- validate ---


def _record_key(rec: dict) -> tuple:
    return (rec["period"], rec["clock"], rec["player_id"], rec["x"], rec["y"], rec["made"], rec["shot_type"])


def _raw_key(play: dict, refs: RefCache) -> tuple:
    x, y = _to_canonical(play["coordinate"]["x"], play["coordinate"]["y"])
    sref = _shooter_ref(play)
    pid = sref.split("?")[0].rstrip("/").rsplit("/", 1)[-1] if sref else "0"
    made = bool(play.get("scoreValue", 0) > 0)
    st = "3PT" if play.get("pointsAttempted") == 3 else "2PT"
    return (
        (play.get("period") or {}).get("number", 0),
        str((play.get("clock") or {}).get("displayValue", "")),
        pid,
        x,
        y,
        made,
        st,
    )


def _keyset_hash(keys: list[tuple]) -> str:
    h = hashlib.sha256()
    for k in sorted(keys):
        h.update(repr(k).encode())
    return h.hexdigest()


def validate(date: str, dirs: dict) -> dict:
    records = normalize(date, dirs)
    refs = RefCache(dirs, date)

    def refetch_one():
        # deterministic "random" game for the spot-sample
        games = sorted({r["game_id"] for r in records})
        if not games:
            raise RuntimeError("no games to sample")
        idx = int(hashlib.sha256(date.encode()).hexdigest(), 16) % len(games)
        gid = games[idx]
        plays = _fetch_plays(gid)  # fresh pull from ESPN
        fresh = [p for p in plays if _is_chartable_shot(p)]
        local = [r for r in records if r["game_id"] == gid]
        khash = (
            "match"
            if _keyset_hash([_raw_key(p, refs) for p in fresh]) == _keyset_hash([_record_key(r) for r in local])
            else "MISMATCH"
        )
        return (gid, len(fresh), khash)

    return qa_mod.run_qa(records, refetch_one)


# --------------------------------------------------------------- snapshot ---


def _sort_key(rec: dict) -> tuple:
    # chronological within a period: clock counts down, so -seconds
    return (rec["game_id"], rec["period"], -rec["_clock_s"], rec["player_id"], rec["x"], rec["y"])


def snapshot(date: str, dirs: dict, records: list, qa: dict) -> tuple:
    stamp = date.replace("-", "")
    snap_dir = Path(dirs["snapshots"]) / SOURCE
    man_dir = Path(dirs["manifests"]) / SOURCE
    snap_dir.mkdir(parents=True, exist_ok=True)
    man_dir.mkdir(parents=True, exist_ok=True)
    snap_path = snap_dir / f"shotcharts-{stamp}.jsonl"

    ordered = sorted(records, key=_sort_key)
    with open(snap_path, "w") as f:
        for r in ordered:
            slim = {k: v for k, v in r.items() if not k.startswith("_")}
            f.write(json.dumps(slim, sort_keys=True) + "\n")

    manifest = manifest_mod.write_manifest(
        man_dir / f"shotcharts-{stamp}.manifest.json",
        source=SOURCE,
        date=date,
        fetched_at=datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        snapshot_path=snap_path,
        records=len(ordered),
        games=len({r["game_id"] for r in ordered}),
        players=len({r["player_id"] for r in ordered}),
        qa={"verdict": qa["verdict"], "checks": qa["checks"]},
    )
    return (str(snap_path), manifest)


# ---------------------------------------------------------------- publish ---


def _served_paths(dirs: dict) -> tuple[Path, Path]:
    return (Path(dirs["served"]) / SOURCE, Path(dirs["served_public"]) / SOURCE)


def publish(date: str, dirs: dict) -> dict:
    stamp = date.replace("-", "")
    snap_path = Path(dirs["snapshots"]) / SOURCE / f"shotcharts-{stamp}.jsonl"
    man_path = Path(dirs["manifests"]) / SOURCE / f"shotcharts-{stamp}.manifest.json"
    if not snap_path.exists() or not man_path.exists():
        return {"published": False, "reason": "no snapshot/manifest for date"}
    manifest = manifest_mod.read_manifest(man_path)
    qa = manifest.get("qa") or {}
    if qa.get("verdict") != "PASS":
        return {"published": False, "reason": f"QA verdict {qa.get('verdict')} — publish hard-blocked"}
    if not manifest_mod.verify_manifest(man_path, snap_path):
        return {"published": False, "reason": "manifest sha256 mismatch — snapshot changed after write"}

    import shutil

    files: list[str] = []
    for served in _served_paths(dirs):
        served.mkdir(parents=True, exist_ok=True)
        for src in (snap_path, man_path):
            dst = served / src.name
            shutil.copy2(src, dst)
            files.append(str(dst))
        latest = {
            "source": SOURCE,
            "date": date,
            "snapshot": snap_path.name,
            "manifest": man_path.name,
            "sha256": manifest["sha256"],
            "records": manifest["records"],
            "games": manifest["games"],
            "players": manifest["players"],
            "qa_verdict": qa.get("verdict"),
            "fetched_at": manifest["fetched_at"],
        }
        (served / "LATEST.json").write_text(json.dumps(latest, indent=2) + "\n")
        files.append(str(served / "LATEST.json"))
    return {"published": True, "files": files}
