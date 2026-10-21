#!/usr/bin/env python3
"""Basketball-Reference shot-chart source.

Architecture: SNAPSHOTS ONLY. BBR serves no Access-Control-Allow-Origin, so
no live client-side fetch. Historical backfill is this source's strength.

Recon (verified 2026-10-21, server-side):
  Slate : https://www.basketball-reference.com/boxscores/?month=M&day=D&year=Y
          -> shot-chart links give game ids (YYYYMMDD0 + home abbr).
  Charts: https://www.basketball-reference.com/boxscores/shot-chart/<game_id>.html
          -> one <div id="shots-XXX" class="shot-area"> per team; each shot a div
             style="top:Npx;left:Mpx" tip="<ord> quarter|OT, <clock> remaining
             <br><name> made|missed <2|3>-pointer from <N> ft<br>..." class=
             "tooltip q-<period> p-<bbr_player_id> make|miss".
  robots.txt: /boxscores/ not disallowed. Rate: <=1 req/3s, single-threaded,
  browser UA, no auth, $0.

Native coordinates + conversion (canonical: feet, hoop (0,0), +y half-court,
x+ to the shooter's right facing the hoop):
  The 500px-wide court image (court-nba-bbr.svg, viewBox 910x855) renders at
  500 x 469.8 px. Shot dots are NOT plotted at the drawn rim center
  (svg 455,96 -> px 250.0,52.8). The dot origin was fit empirically against
  BBR's own reported distances (least squares over 111 shots, 8-28 ft):
      HOOP_X_PX = 239.87, HOOP_Y_PX = 30.68, PX_PER_FT = 9.962
  (theory from the svg: 18.2 units/ft * 500/910 = 10.0 px/ft -- 0.4% off).
  Conversion: x_ft = (left - HOOP_X_PX) / PX_PER_FT
              y_ft = (top  - HOOP_Y_PX) / PX_PER_FT   (top grows downward =
              toward half-court on BBR's plot, hoop drawn at the top)
  Verification vs known geometry (202610200DET, BOS@DET, n=171 shots):
      rim shots (reported 0-3 ft): computed radial median 2.93, max 3.42
      reported-22/23/24 ft threes: computed radial median 22.1/23.4/24.1
      |computed radial - reported ft|: median 0.25 ft, p90 0.41 ft
  Validate() re-checks this geometry every run: median |radial-reported|
  must be <= 1.5 ft or the run FAILS loudly (markup change, not bad data).
"""

from __future__ import annotations

import hashlib
import html as html_mod
import json
import re
import shutil
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common import checkpoints, manifest, qa  # noqa: E402

SOURCE = "bbr"
GATED = False
PIPELINE_VERSION = manifest.PIPELINE_VERSION

# Dates short-circuited by fetch() as already complete (same-process only).
_ALREADY_COMPLETE: set = set()

BASE = "https://www.basketball-reference.com"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
RATE_S = 3.1  # <=1 req / 3s, single-threaded (BBR throttle discipline)

# Shot-dot geometry, fit 2026-10-21 (see module docstring).
HOOP_X_PX = 239.87
HOOP_Y_PX = 30.68
PX_PER_FT = 9.962
GEOMETRY_QA_TOL_FT = 1.5

_GAME_RE = re.compile(r"boxscores/shot-chart/(\d{9}[A-Z]{3})\.html")
_CONTAINER_RE = re.compile(r"^shots-([A-Z]{3})$")
_STYLE_RE = re.compile(r"^top:(-?\d+)px;left:(-?\d+)px;$")
_CLASS_RE = re.compile(r"^tooltip q-(\d+) p-([a-z0-9-]+) (make|miss)$")
_TIP_HEAD_RE = re.compile(
    r"^(\d+)(?:st|nd|rd|th) (quarter|OT), (\d{1,2}):(\d{2})(?:\.\d+)? remaining$")
_TIP_SHOT_RE = re.compile(
    r"^(.+?) (made|missed) ([23])-pointer from (\d+) ft$")


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status} for {url}")
            return resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc


def _throttle():
    time.sleep(RATE_S)


class _ShotHTMLParser(HTMLParser):
    """Parses one BBR shot-chart page. Loud on unexpected markup."""

    def __init__(self, game_id: str):
        super().__init__(convert_charrefs=False)
        self.game_id = game_id
        self.shots: list[dict] = []
        self.malformed: list[str] = []
        self.teams: list[str] = []
        self._team: str | None = None
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        if tag != "div":
            return
        a = dict(attrs)
        m = _CONTAINER_RE.match(a.get("id", ""))
        if m and "shot-area" in (a.get("class") or ""):
            self._team = m.group(1)
            if self._team not in self.teams:
                self.teams.append(self._team)
            self._depth = 1
            return
        if self._team is None:
            return
        self._depth += 1
        style, tip, cls = a.get("style"), a.get("tip"), a.get("class")
        if style is None or tip is None or cls is None:
            return  # structural div inside the shot area, not a shot
        self._parse_shot(style, tip, cls)

    def handle_endtag(self, tag):
        if tag == "div" and self._team is not None:
            self._depth -= 1
            if self._depth <= 0:
                self._team = None

    def _parse_shot(self, style: str, tip: str, cls: str):
        sm = _STYLE_RE.match(style)
        cm = _CLASS_RE.match(cls or "")
        parts = (tip or "").split("<br>")
        tm = _TIP_SHOT_RE.match(parts[1].strip()) if len(parts) >= 2 else None
        hm = _TIP_HEAD_RE.match(parts[0].strip()) if parts else None
        if not (sm and cm and tm and hm):
            self.malformed.append(
                f"style={style!r} class={cls!r} tip={tip[:80]!r}")
            return
        q_num = int(cm.group(1))
        made_cls = cm.group(3) == "make"
        made_tip = tm.group(2) == "made"
        if made_cls != made_tip:
            self.malformed.append(f"make/miss disagree: {tip[:80]!r}")
            return
        n, kind, mm, ss = int(hm.group(1)), hm.group(2), hm.group(3), hm.group(4)
        period = n if kind == "quarter" else 4 + n
        x = (int(sm.group(2)) - HOOP_X_PX) / PX_PER_FT
        y = (int(sm.group(1)) - HOOP_Y_PX) / PX_PER_FT
        self.shots.append({
            "team": self._team,
            "player_id": cm.group(2),
            "player_name": html_mod.unescape(tm.group(1).strip()),
            "period": period,
            "clock": f"{int(mm):02d}:{ss}",
            "x": round(x, 1),
            "y": round(y, 1),
            "made": made_tip,
            "pt": int(tm.group(3)),
            "dist_reported_ft": int(tm.group(4)),
        })


def parse_shot_chart(html_text: str, game_id: str):
    p = _ShotHTMLParser(game_id)
    p.feed(html_text)
    return p


def _season(date: str) -> str:
    y, m, _ = (int(x) for x in date.split("-"))
    return f"{y}-{str(y + 1)[2:]}" if m >= 10 else f"{y - 1}-{str(y)[2:]}"


def _shot_zone(x: float, y: float, pt: int) -> str:
    import math
    r = math.hypot(x, y)
    if pt == 3:
        return "Corner 3" if abs(x) >= 22.0 else "Above the Break 3"
    if r < 4.0:
        return "Restricted Area"
    if abs(x) <= 8.0 and y <= 19.0:
        return "In The Paint (Non-RA)"
    return "Mid-Range"


def _canonical(rec: dict, game_id: str, game_date: str, fetched_at: str) -> dict:
    return {
        "game_id": game_id,
        "game_date": game_date,
        "season": _season(game_date),
        "player_id": rec["player_id"],
        "player_name": rec["player_name"],
        "team_abbr": rec["team"],
        "period": rec["period"],
        "clock": rec["clock"],
        "x": rec["x"],
        "y": rec["y"],
        "made": rec["made"],
        "shot_type": "3PT" if rec["pt"] == 3 else "2PT",
        "shot_zone": _shot_zone(rec["x"], rec["y"], rec["pt"]),
        "source": SOURCE,
        "fetched_at": fetched_at,
        "pipeline_version": PIPELINE_VERSION,
    }


def _raw_dir(dirs, date: str) -> Path:
    p = Path(dirs["raw"]) / SOURCE / date
    p.mkdir(parents=True, exist_ok=True)
    return p


def _game_links(index_html: str) -> list[str]:
    return sorted(set(_GAME_RE.findall(index_html)))


def _parse_all(date: str, dirs):
    """-> (records, errors). errors non-empty => markup changed, fail loudly."""
    fetched_at = _utcnow()
    records, errors = [], []
    for f in sorted(_raw_dir(dirs, date).glob("*.html")):
        game_id = f.stem
        p = parse_shot_chart(f.read_text(), game_id)
        if p.malformed:
            errors.append(f"{game_id}: {len(p.malformed)} malformed shot divs "
                          f"(e.g. {p.malformed[0]})")
        if not p.teams:
            errors.append(f"{game_id}: no shots-XXX containers found")
        for s in p.shots:
            records.append(_canonical(s, game_id, date, fetched_at))
    return records, errors


def _is_complete(date: str, dirs, games: list[str]) -> bool:
    """True iff a verified snapshot+manifest already cover every game."""
    stamp = date.replace("-", "")
    snap = Path(dirs["snapshots"]) / SOURCE / f"shotcharts-{stamp}.jsonl"
    man = Path(dirs["manifests"]) / SOURCE / f"shotcharts-{stamp}.manifest.json"
    if not (snap.exists() and man.exists()):
        return False
    if not manifest.verify_manifest(man, snap):
        return False
    m = manifest.read_manifest(man)
    done = checkpoints.load_completed(dirs, SOURCE, date)
    return set(games) <= done and m.get("games") == len(set(games))


def fetch(date: str, resume: bool, dirs) -> dict:
    y, m, d = (int(x) for x in date.split("-"))
    index_url = f"{BASE}/boxscores/?month={m}&day={d}&year={y}"
    games = _game_links(_get(index_url))
    _throttle()
    if _is_complete(date, dirs, games):
        _ALREADY_COMPLETE.add(date)
        raw_dir = _raw_dir(dirs, date)
        print(f"[{SOURCE}] already complete for {date} "
              f"(snapshot sha verified) -- no-op")
        return {"games": len(games),
                "raw_files": [str(p) for p in sorted(raw_dir.glob("*.html"))],
                "already_complete": True}
    done = checkpoints.load_completed(dirs, SOURCE, date) if resume else set()
    raw_dir = _raw_dir(dirs, date)
    raw_files = []
    for gid in games:
        dest = raw_dir / f"{gid}.html"
        if gid in done and dest.exists():
            raw_files.append(str(dest))
            continue
        dest.write_text(_get(f"{BASE}/boxscores/shot-chart/{gid}.html"))
        checkpoints.mark_complete(dirs, SOURCE, date, gid)
        raw_files.append(str(dest))
        _throttle()
    return {"games": len(games), "raw_files": raw_files}


def _refetch_one(date: str, dirs):
    games = sorted(f.stem for f in _raw_dir(dirs, date).glob("*.html"))
    if not games:
        raise RuntimeError("no raw games to spot-sample")
    gid = games[0]  # deterministic, not random
    _throttle()
    p = parse_shot_chart(_get(f"{BASE}/boxscores/shot-chart/{gid}.html"), gid)
    if p.malformed:
        raise RuntimeError(f"refetch parse: {len(p.malformed)} malformed divs")
    keys = sorted("|".join((gid, s["player_id"], str(s["period"]),
                            s["clock"], str(s["x"]), str(s["y"])))
                  for s in p.shots)
    return gid, len(keys), hashlib.sha256("\n".join(keys).encode()).hexdigest()


def validate(date: str, dirs) -> dict:
    records, errors = _parse_all(date, dirs)
    if errors:
        return {"verdict": "FAIL",
                "checks": {"schema": "FAIL", "row_counts": "FAIL",
                           "spot_sample": "FAIL", "geometry": "FAIL"},
                "detail": {"markup_errors": errors}}
    import math
    # geometry: median |computed radial - BBR reported ft| over raw shots
    raw = []
    for f in sorted(_raw_dir(dirs, date).glob("*.html")):
        raw.extend(parse_shot_chart(f.read_text(), f.stem).shots)
    geo = ([abs(math.hypot(s["x"], s["y"]) - s["dist_reported_ft"])
            for s in raw])
    geo_med = statistics.median(geo) if geo else float("inf")
    geometry = {"verdict": "PASS" if geo_med <= GEOMETRY_QA_TOL_FT else "FAIL",
                "median_abs_err_ft": round(geo_med, 2),
                "tol_ft": GEOMETRY_QA_TOL_FT, "shots": len(geo)}
    q = qa.run_qa(records, lambda: _refetch_one(date, dirs))
    verdict = "PASS" if q["verdict"] == "PASS" and \
        geometry["verdict"] == "PASS" else "FAIL"
    return {"verdict": verdict,
            "checks": {**q["checks"], "geometry": geometry["verdict"]},
            "detail": {**q["detail"], "geometry": geometry}}


def normalize(date: str, dirs) -> list:
    records, errors = _parse_all(date, dirs)
    if errors:
        raise ValueError("markup changed, refusing to emit: "
                         + "; ".join(errors))
    return records


def snapshot(date: str, dirs, records: list, q: dict):
    def sort_key(r):
        mm, ss = r["clock"].split(":")
        return (r["game_id"], r["period"], int(mm) * 60 + int(ss),
                r["player_id"], r["x"], r["y"])
    records = sorted(records, key=sort_key)
    stamp = date.replace("-", "")
    man_dir = Path(dirs["manifests"]) / SOURCE
    man_dir.mkdir(parents=True, exist_ok=True)
    man_path = man_dir / f"shotcharts-{stamp}.manifest.json"
    if date in _ALREADY_COMPLETE and man_path.exists():
        # true no-op: keep the original fetched_at so the bytes are identical
        fetched_at = manifest.read_manifest(man_path)["fetched_at"]
        for r in records:
            r["fetched_at"] = fetched_at
    else:
        fetched_at = _utcnow()
    snap_dir = Path(dirs["snapshots"]) / SOURCE
    snap_dir.mkdir(parents=True, exist_ok=True)
    snap_path = snap_dir / f"shotcharts-{stamp}.jsonl"
    with open(snap_path, "w") as f:
        for r in records:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    m = manifest.write_manifest(
        man_path, source=SOURCE, date=date, fetched_at=fetched_at,
        snapshot_path=snap_path, records=len(records),
        games=len({r["game_id"] for r in records}),
        players=len({r["player_id"] for r in records}),
        qa={"verdict": q["verdict"], "checks": q["checks"]})
    return snap_path, m


def publish(date: str, dirs) -> dict:
    stamp = date.replace("-", "")
    snap_path = Path(dirs["snapshots"]) / SOURCE / f"shotcharts-{stamp}.jsonl"
    man_path = Path(dirs["manifests"]) / SOURCE / f"shotcharts-{stamp}.manifest.json"
    if not snap_path.exists() or not man_path.exists():
        return {"published": False, "reason": "no snapshot/manifest for date"}
    m = manifest.read_manifest(man_path)
    if m.get("qa", {}).get("verdict") != "PASS":
        return {"published": False, "reason": "QA verdict != PASS"}
    if not manifest.verify_manifest(man_path, snap_path):
        return {"published": False, "reason": "manifest sha mismatch"}
    served_bytes = snap_path.stat().st_size
    budget_note = ("OVER 500KB served budget -- allowlist note required in PR"
                   if served_bytes > 500 * 1024 else None)
    for served in (Path(dirs["served"]) / SOURCE,
                   Path(dirs["served_public"]) / SOURCE):
        served.mkdir(parents=True, exist_ok=True)
        shutil.copy2(snap_path, served / snap_path.name)
        latest = {
            "source": SOURCE,
            "date": date,
            "snapshot": snap_path.name,
            "manifest": man_path.name,
            "sha256": m["sha256"],
            "records": m["records"],
            "games": m["games"],
            "served_bytes": served_bytes,
            "budget_note": budget_note,
            "fetched_at": m["fetched_at"],
        }
        (served / "LATEST.json").write_text(json.dumps(latest, indent=2) + "\n")
    return {"published": True, "served_bytes": served_bytes,
            "reason": budget_note or "ok"}
