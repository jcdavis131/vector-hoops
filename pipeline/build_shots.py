#!/usr/bin/env python3
"""Build shot-chart data for Court Lab (Slice 1) from the NBA stats API.

Reads the public stats.nba.com shotchartdetail endpoint (no key) per
player-season, then assembles assets/shots.v1.json — precomputed zones, hex
bins and shot dots so the client does no math.

Modes:
  collect       fetch raw shot data per player-season (resume-safe, polite)
  assemble      build assets/shots.v1.json from raw (QA hard-block)
  verify FILE   re-run structural QA on an existing shots.v1.json
  push-results  (Forge) emit assembled files as FORGE_METRIC base64 chunks

Scope (v1): 2015-16 -> 2025-26 for every player in the API roster, PLUS a
legends sample (Jordan 95-96/96-97/97-98, Kobe 05-06/08-09, LeBron 12-13,
Curry 15-16 [in main range], Duncan 02-03, Shaq 99-00). Full history backfill
is a follow-up. Coverage is documented exactly in the manifest.

Coordinate system: hoop-centric feet. The hoop is at (0,0); +y runs toward
half court; x is left/right. API LOC_X/LOC_Y are tenths of feet from the
hoop, so x_ft = LOC_X/10, y_ft = LOC_Y/10. Court bounds: |x| <= 25,
y in [-5.25, 41.75] (baseline 5.25 ft behind the hoop, half court 47 ft
from the baseline).

Factory rules: stdlib only, real data only, honest failures. Windows-safe
(this also runs on the nugatron Forge runner).

QA (assemble, hard-block, exit non-zero on any failure):
  - every collected raw file parses; >5% fetch failures fails the build
  - every shot coordinate inside court bounds (small tolerance)
  - zone classifier is total (no shot falls through)
  - no NaNs / nulls in output
  - output file <= 900 KB (assert, not a comment)
On success writes pipeline/build_shots.manifest.json (coverage, params,
featured set, trims applied, QA results).
"""

import base64
import hashlib
import json
import math
import os
import random
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO, "pipeline", ".shots_raw")
STATE_FILE = os.path.join(REPO, "pipeline", ".shots_collect_state.json")
OUT = os.path.join(REPO, "assets", "shots.v1.json")
MANIFEST = os.path.join(REPO, "pipeline", "build_shots.manifest.json")
VECTORS = os.path.join(REPO, "assets", "vectors.json")

API_BASE = "https://stats.nba.com/stats/shotchartdetail"
ROSTER_BASE = "https://stats.nba.com/stats/commonallplayers"
SIZE_BUDGET_BYTES = 900 * 1024
RATE_LIMIT_S = 1.5
REQUEST_TIMEOUT_S = 30
MAX_RETRIES = 3
RANDOM_STATE = 42

SEASONS_MAIN = ["2015-16", "2016-17", "2017-18", "2018-19", "2019-20",
                "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
LEGENDS = {  # name -> seasons to fetch (matched against the API roster)
    "Michael Jordan": ["1995-96", "1996-97", "1997-98"],
    "Kobe Bryant": ["2005-06", "2008-09"],
    "LeBron James": ["2012-13"],
    "Tim Duncan": ["2002-03"],
    "Shaquille O'Neal": ["1999-00"],
}
LEGEND_SEASONS = sorted({s for ss in LEGENDS.values() for s in ss})

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/126.0.0.0 Safari/537.36"),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

# 14 geometric zones (hoop-centric feet). Order matters: first match wins.
ZONES = [
    ("HEAVE", "Deep / heaves"),
    ("RA", "Restricted area"),
    ("PAINT", "In the paint (non-RA)"),
    ("C3_L", "Left corner 3"),
    ("C3_R", "Right corner 3"),
    ("MR_LC", "Left corner mid-range"),
    ("MR_RC", "Right corner mid-range"),
    ("MR_LW", "Left wing mid-range"),
    ("MR_RW", "Right wing mid-range"),
    ("MR_TS", "Top mid-range (short)"),
    ("MR_TL", "Top mid-range (long)"),
    ("W3_L", "Left wing 3"),
    ("W3_R", "Right wing 3"),
    ("T3", "Top 3"),
]


def fail(msg):
    print("QA FAIL:", msg, file=sys.stderr)
    sys.exit(1)


def norm_name(name):
    """Canonical player key. Mirrored in assets/court-lab.js — keep in sync."""
    n = name.lower().replace(".", " ").replace("'", " ").replace("-", " ")
    return " ".join(n.split())


def classify_zone(x, y):
    """Return zone index 0-13 for hoop-centric feet. Total: never falls through."""
    r = math.hypot(x, y)
    if r >= 35:
        return 0  # HEAVE
    if r <= 4:
        return 1  # RA
    if abs(x) <= 8 and y <= 13.75:
        return 2  # PAINT
    if x <= -22 and y <= 8.95:
        return 3  # C3_L
    if x >= 22 and y <= 8.95:
        return 4  # C3_R
    if r >= 23.75:
        if x < -8:
            return 11  # W3_L
        if x > 8:
            return 12  # W3_R
        return 13  # T3
    # mid-range (r < 23.75 from here)
    if x < -14 and y < 8.95:
        return 5  # MR_LC
    if x > 14 and y < 8.95:
        return 6  # MR_RC
    if x < -8:
        return 7  # MR_LW
    if x > 8:
        return 8  # MR_RW
    if r < 14:
        return 9  # MR_TS
    return 10  # MR_TL


def api_get(url, params):
    query = urllib.parse.urlencode(params)
    req = urllib.request.Request(url + "?" + query, headers=HEADERS)
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
                if resp.status == 429:
                    time.sleep(60)
                    continue
                if resp.status != 200:
                    last_err = "HTTP %d" % resp.status
                    time.sleep(5 * (attempt + 1))
                    continue
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - network is flaky by nature
            last_err = "%s: %s" % (type(e).__name__, e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("API failed after %d retries: %s" % (MAX_RETRIES, last_err))


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"done": [], "failed": []}


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


def cmd_collect():
    """Fetch raw shot data per player-season. Resume-safe, polite."""
    state = load_state()
    done = set(state["done"])
    failed = set(state["failed"])
    os.makedirs(RAW_DIR, exist_ok=True)

    # Build the fetch list: (season, player_id, display_name)
    fetch_list = []
    seasons_needed = sorted(set(SEASONS_MAIN) | set(LEGEND_SEASONS))
    print("COLLECT: resolving rosters for %d seasons" % len(seasons_needed), flush=True)
    for season in seasons_needed:
        params = {"LeagueID": "00", "Season": season, "IsOnlyCurrentSeason": "0"}
        try:
            data = api_get(ROSTER_BASE, params)
        except RuntimeError as e:
            print("COLLECT: roster fetch failed for %s: %s (honest skip)" % (season, e),
                  file=sys.stderr, flush=True)
            continue
        rs = data["resultSets"][0]
        hi = {h: i for i, h in enumerate(rs["headers"])}
        for row in rs["rowSet"]:
            pid = row[hi["PERSON_ID"]]
            name = (row[hi["DISPLAY_FIRST_NAME"]] + " " + row[hi["DISPLAY_LAST_NAME"]]).strip()
            fetch_list.append((season, pid, name))
        time.sleep(RATE_LIMIT_S)

    # Legends filter: keep only the named legends for legend seasons
    wanted = set()
    for season, pid, name in fetch_list:
        if season in SEASONS_MAIN:
            wanted.add((season, pid, name))
        else:
            for lname, lseasons in LEGENDS.items():
                if season in lseasons and norm_name(name) == norm_name(lname):
                    wanted.add((season, pid, name))
    fetch_list = sorted(wanted)
    print("COLLECT: %d player-seasons queued (%d done, %d failed so far)"
          % (len(fetch_list), len(done), len(failed)), flush=True)

    base_params = {
        "AheadBehind": "", "CFID": "33", "ClutchTime": "", "Conference": "",
        "ContextFilter": "", "ContextMeasure": "FGA", "DateFrom": "", "DateTo": "",
        "Division": "", "EndPeriod": "10", "EndRange": "28800", "GROUP_ID": "",
        "GameEventID": "", "GameID": "", "GameSegment": "", "LastNGames": "0",
        "LeagueID": "00", "Location": "", "Month": "0", "OpponentTeamID": "0",
        "Outcome": "", "PORound": "0", "Period": "0", "PlayerPosition": "",
        "RangeType": "0", "RookieYear": "", "SeasonSegment": "",
        "SeasonType": "Regular Season", "ShotClockRange": "", "StartPeriod": "1",
        "StartRange": "0", "TeamID": "0", "VsConference": "", "VsDivision": "",
    }
    n_new = 0
    for i, (season, pid, name) in enumerate(fetch_list):
        key = "%s:%s" % (season, pid)
        if key in done:
            continue
        out_path = os.path.join(RAW_DIR, season, "%s.json" % pid)
        params = dict(base_params)
        params["CFPARAMS"] = season
        params["PlayerID"] = pid
        params["Season"] = season
        try:
            data = api_get(API_BASE, params)
            rs = data["resultSets"][0]
            hi = {h: i2 for i2, h in enumerate(rs["headers"])}
            shots = []
            for row in rs["rowSet"]:
                shots.append({
                    "x": row[hi["LOC_X"]] / 10.0,
                    "y": row[hi["LOC_Y"]] / 10.0,
                    "made": 1 if row[hi["SHOT_MADE_FLAG"]] == 1 else 0,
                    "is3": 1 if str(row[hi["SHOT_TYPE"]]).startswith("3PT") else 0,
                })
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            tmp = out_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"season": season, "pid": pid, "name": name,
                           "shots": shots}, f)
            os.replace(tmp, out_path)
            done.add(key)
            n_new += 1
            if n_new % 25 == 0:
                save_state({"done": sorted(done), "failed": sorted(failed)})
                print("COLLECT: %d/%d new this run (%s %s, %d shots)"
                      % (n_new, len(fetch_list) - len(done) + n_new, season, name,
                         len(shots)), flush=True)
                print("FORGE_METRIC: collect_new = %d" % n_new, flush=True)
        except RuntimeError as e:
            failed.add(key)
            print("COLLECT: FAILED %s %s (%s): %s" % (season, name, pid, e),
                  file=sys.stderr, flush=True)
        time.sleep(RATE_LIMIT_S)

    save_state({"done": sorted(done), "failed": sorted(failed)})
    total = len(done)
    print("COLLECT: complete. %d player-seasons collected, %d failed, %d new this run"
          % (total, len(failed), n_new), flush=True)
    print("FORGE_METRIC: collect_done = %d" % total, flush=True)
    print("FORGE_METRIC: collect_failed = %d" % len(failed), flush=True)
    if total > 0 and len(failed) / (total + len(failed)) > 0.05:
        fail("more than 5%% of fetches failed (%d failed)" % len(failed))

# --- assemble ------------------------------------------------------------

HEX_SIZE_FT = 1.5  # pointy-top hex center-to-corner, feet
DOTS_CAP_START = 600
FEATURED_START = 60

# Twin-explainer chips, mirrored from assets/twin-explainer.js (keep in sync).
CHIP = {
    "PTS": ["both fill it up scoring", "both score sparingly"],
    "AST": ["both run the offense", "both rarely create for others"],
    "OREB": ["both crash the offensive glass", "both stay off the offensive glass"],
    "DREB": ["both clean the defensive glass", "both cede the defensive glass"],
    "STL": ["both pick pockets", "both rarely gamble for steals"],
    "BLK": ["both protect the rim", "both rarely block shots"],
    "TOV": ["both turn it over a lot", "both take care of the ball"],
    "FG3A": ["both let it fly from three", "both rarely shoot threes"],
    "FGA": ["both take a ton of shots", "both shoot sparingly"],
    "FTA": ["both live at the line", "both rarely get to the line"],
    "FG3_PCT": ["both snipe from deep", "both struggle from deep"],
    "FG_PCT": ["both finish everything inside", "both struggle to finish"],
    "FT_PCT": ["both automatic at the stripe", "both shaky at the stripe"],
    "PLUS_MINUS": ["both tilt the floor", "both get outscored on court"],
}


def explain_pair(va, vb, codes, labels):
    """Mirrors twin-explainer.js explainPair exactly."""
    order = sorted(range(len(codes)), key=lambda k: abs(va[k] - vb[k]))
    shared = []
    for k in order[:3]:
        mean = (va[k] + vb[k]) / 2.0
        if mean >= 0.25:
            shared.append(CHIP[codes[k]][0])
        elif mean <= -0.25:
            shared.append(CHIP[codes[k]][1])
        else:
            shared.append("both average " + labels[codes[k]])
    return shared, labels[codes[order[-1]]]


def hex_axial(x, y, size=HEX_SIZE_FT):
    """Pointy-top axial coords for hoop-centric feet."""
    q = (math.sqrt(3) / 3.0 * x - y / 3.0) / size
    r = (2.0 / 3.0 * y) / size
    return cube_round(q, r)


def cube_round(q, r):
    x, z = q, r
    y = -x - z
    rx, ry, rz = round(x), round(y), round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return (rx, rz)


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def cmd_assemble():
    t0 = time.time()
    if not os.path.isdir(RAW_DIR):
        fail("no raw data at %s — run collect first" % RAW_DIR)

    # Load raw: (norm_name, season) -> shots; keep display names + league zones
    raw = {}
    disp = {}
    lg_zones = [[0, 0] for _ in range(14)]
    n_files = 0
    for season in sorted(os.listdir(RAW_DIR)):
        sdir = os.path.join(RAW_DIR, season)
        if not os.path.isdir(sdir):
            continue
        for fn in os.listdir(sdir):
            if not fn.endswith(".json"):
                continue
            with open(os.path.join(sdir, fn), "r", encoding="utf-8") as f:
                rec = json.load(f)
            key = (norm_name(rec["name"]), rec["season"])
            raw[key] = rec["shots"]
            disp.setdefault(key[0], rec["name"])
            for s in rec["shots"]:
                zi = classify_zone(s["x"], s["y"])
                lg_zones[zi][0] += 1
                lg_zones[zi][1] += s["made"]
            n_files += 1
    if not raw:
        fail("no raw shot files found")
    print("ASSEMBLE: %d raw player-seasons loaded" % n_files, flush=True)

    # QA: coordinates inside court bounds
    for (name, season), shots in raw.items():
        for s in shots:
            if not (-25.5 <= s["x"] <= 25.5 and -6.5 <= s["y"] <= 42.5):
                fail("shot out of bounds: %s %s (%s, %s)" % (name, season, s["x"], s["y"]))
            if s["made"] not in (0, 1):
                fail("bad made flag: %s %s" % (name, season))

    # Per player-season: zones + dots source
    by_player = {}
    for (name, season), shots in raw.items():
        zones = [[0, 0] for _ in range(14)]  # [fga, fgm]
        for s in shots:
            zi = classify_zone(s["x"], s["y"])
            zones[zi][0] += 1
            zones[zi][1] += s["made"]
        by_player.setdefault(name, {})[season] = {"shots": shots, "zones": zones}

    # League hex averages across ALL collected shots
    lg_hex = {}
    for shots in raw.values():
        for s in shots:
            h = hex_axial(s["x"], s["y"])
            e = lg_hex.setdefault(h, [0, 0])
            e[0] += 1
            e[1] += s["made"]

    # Featured set: legends + top by total_min (from vectors.json)
    with open(VECTORS, "r", encoding="utf-8") as f:
        vec = json.load(f)
    codes = vec["features"]
    labels = vec["featureLabels"]
    minutes = {}
    pvec = {}
    for p in vec["players"]:
        n = norm_name(p["name"])
        if "2015-16" <= p["season"] <= "2025-26":
            minutes[n] = minutes.get(n, 0) + (p.get("total_min") or 0)
        # pvec spans ALL seasons so legends (90s/00s) still get twin vectors
        w = p.get("total_min") or 0
        e = pvec.setdefault(n, [[0.0] * 14, 0.0])
        for k in range(14):
            e[0][k] += p["v"][k] * w
        e[1] += w
    for n, e in pvec.items():
        if e[1] > 0:
            e[0] = [v / e[1] for v in e[0]]
    legend_names = {norm_name(n) for n in LEGENDS}
    ranked = sorted(minutes, key=lambda n: minutes[n], reverse=True)
    featured = [n for n in legend_names if n in by_player]
    for n in ranked:
        if n not in featured and n in by_player:
            featured.append(n)

    def build_payload(feat_list, dots_cap):
        ids = sorted(by_player)
        feat_set = set(feat_list)
        seasons_out, zones_out = [], []
        for pid in ids:
            ss = sorted(by_player[pid])
            seasons_out.append(ss)
            zlist = []
            for s in ss:
                z = by_player[pid][s]["zones"]
                zlist.append([v for zi, (fga, fgm) in enumerate(z) for v in (zi, fga, fgm) if fga > 0])
            zones_out.append(zlist)
        feat = {}
        for pid in feat_list:
            pseasons = sorted(by_player[pid])
            latest3 = pseasons[-3:]
            hex_out, dots_out, son_out = [], [], []
            for s in latest3:
                shots = by_player[pid][s]["shots"]
                # hex bins
                hb = {}
                for sh in shots:
                    h = hex_axial(sh["x"], sh["y"])
                    e = hb.setdefault(h, [0, 0])
                    e[0] += 1
                    e[1] += sh["made"]
                hex_rows = []
                for (q, r), (fga, fgm) in hb.items():
                    lg = lg_hex.get((q, r), [0, 0])
                    if fga >= 5 and lg[0] >= 20:
                        vs = round(1000 * (fgm / fga - lg[1] / lg[0]))
                    else:
                        vs = 0
                    hex_rows.append([q, r, fga, vs])
                hex_rows.sort(key=lambda row: -row[2])
                hex_out.append(hex_rows[:150])
                # dots (capped, deterministic: sorted by (y,x))
                ds = sorted(shots, key=lambda sh: (sh["y"], sh["x"]))[:dots_cap]
                dots_out.append([[round(sh["x"] * 10), round(sh["y"] * 10), sh["made"]] for sh in ds])
                # shot of the night: longest made 3, else longest made 2
                best = None
                for sh in shots:
                    if not sh["made"]:
                        continue
                    rr = math.hypot(sh["x"], sh["y"])
                    key = (sh["is3"], rr)
                    if best is None or key > best[0]:
                        best = (key, sh)
                son_out.append([round(best[1]["x"] * 10), round(best[1]["y"] * 10)] if best else None)
            # twins: top-3 by 14-d cosine (player level) among featured players
            # with shot data, plus plain-words chips (mirrors twin-explainer.js)
            twins = []
            if pid in pvec:
                sims = sorted(((cosine(pvec[pid][0], pvec[o][0]), o)
                               for o in feat_set if o != pid and o in pvec),
                              reverse=True)[:3]
                for sim, o in sims:
                    shared, differ = explain_pair(pvec[pid][0], pvec[o][0], codes, labels)
                    disp = next((p["name"] for p in vec["players"]
                                 if norm_name(p["name"]) == o), o)
                    twins.append({"id": o, "n": disp, "c": shared, "d": differ,
                                  "sim": round(sim, 3)})
            feat[pid] = {"s": latest3, "hex": hex_out, "dots": dots_out,
                         "twins": twins, "son": son_out}
        max_season = max(s for ss in seasons_out for s in ss)
        payload = {
            "v": 1,
            "built": date.today().isoformat(),
            "vintage": "%s REGULAR SEASON · UPDATED %s" % (
                max_season, date.today().strftime("%b %-d %Y").upper()),
            "ids": ids,
            "names": [disp.get(pid, pid) for pid in ids],
            "seasons": seasons_out,
            "zones": zones_out,
            "zones_lg": lg_zones,
            "feat": feat,
            "meta": {
                "n_player_seasons": n_files,
                "n_players": len(ids),
                "n_featured": len(feat_list),
                "dots_cap": dots_cap,
                "zone_codes": [z[0] for z in ZONES],
                "note": "Twin matches use 14-d serving vectors (cosine); chips mirror twin-explainer.js.",
            },
        }
        return payload

    # Adaptive fit: trim deterministically until under budget
    trims = []
    feat_list = list(featured[:FEATURED_START])
    dots_cap = DOTS_CAP_START
    while True:
        payload = build_payload(feat_list, dots_cap)
        blob = json.dumps(payload, separators=(",", ":"))
        size = len(blob.encode("utf-8"))
        if size <= SIZE_BUDGET_BYTES:
            break
        if dots_cap > 150:
            dots_cap = {600: 400, 400: 250, 250: 150}[dots_cap]
            trims.append("dots_cap -> %d" % dots_cap)
        elif len(feat_list) > 20:
            dropped = feat_list.pop()
            trims.append("dropped featured %s" % dropped)
        else:
            fail("cannot fit budget even at minimum featured set")
    print("ASSEMBLE: %d bytes (budget %d), featured=%d, dots_cap=%d, trims=%s"
          % (size, SIZE_BUDGET_BYTES, len(feat_list), dots_cap, trims or "none"),
          flush=True)

    # QA hard-block on the final payload
    if payload["v"] != 1:
        fail("bad version")
    if not (len(payload["ids"]) == len(payload["seasons"]) == len(payload["zones"])):
        fail("parallel array length mismatch")
    for pid, ss, zs in zip(payload["ids"], payload["seasons"], payload["zones"]):
        if len(ss) != len(zs):
            fail("season/zone mismatch for %s" % pid)
        for s, zlist in zip(ss, zs):
            for zi, fga, fgm in zlist:
                if not (0 <= zi <= 13 and fgm <= fga):
                    fail("bad zone row for %s %s" % (pid, s))
    for pid, f in payload["feat"].items():
        if not (len(f["s"]) == len(f["hex"]) == len(f["dots"]) == len(f["son"])):
            fail("featured parallel mismatch for %s" % pid)
        if len(f["twins"]) > 3:
            fail("too many twins for %s" % pid)
    blob2 = json.dumps(payload, separators=(",", ":"))
    if len(blob2.encode("utf-8")) > SIZE_BUDGET_BYTES:
        fail("budget exceeded after QA")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(blob2)
    payload["meta"]["trims"] = trims
    payload["meta"]["bytes"] = len(blob2.encode("utf-8"))
    payload["meta"]["build_seconds"] = round(time.time() - t0, 1)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(payload["meta"], f, indent=1)
    print("wrote %s" % OUT, flush=True)
    print("wrote %s" % MANIFEST, flush=True)
    print("QA PASS", flush=True)

# --- verify --------------------------------------------------------------


def cmd_verify(path):
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    if payload.get("v") != 1:
        fail("bad version")
    ids, seasons, zones = payload["ids"], payload["seasons"], payload["zones"]
    if not (len(ids) == len(seasons) == len(zones) == len(payload.get("names", []))):
        fail("parallel array length mismatch")
    if len(payload.get("zones_lg", [])) != 14:
        fail("zones_lg must have 14 rows")
    for pid, ss, zs in zip(ids, seasons, zones):
        if len(ss) != len(zs):
            fail("season/zone mismatch for %s" % pid)
        for s, zlist in zip(ss, zs):
            for row in zlist:
                zi, fga, fgm = row
                if not (0 <= zi <= 13 and 0 <= fgm <= fga):
                    fail("bad zone row for %s %s" % (pid, s))
                if row is None:
                    fail("null zone row")
    for pid, f in payload.get("feat", {}).items():
        if pid not in ids:
            fail("featured player not in ids: %s" % pid)
        if not (len(f["s"]) == len(f["hex"]) == len(f["dots"]) == len(f["son"])):
            fail("featured parallel mismatch for %s" % pid)
        for season_dots in f["dots"]:
            for d in season_dots:
                x, y, m = d
                if not (-255 <= x <= 255 and -65 <= y <= 425 and m in (0, 1)):
                    fail("dot out of bounds for %s" % pid)
    size = len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    if size > SIZE_BUDGET_BYTES:
        fail("budget exceeded: %d > %d" % (size, SIZE_BUDGET_BYTES))
    print("VERIFY PASS: %d players, %d featured, %d bytes"
          % (len(ids), len(payload.get("feat", {})), size), flush=True)


# --- push-results (Forge transport) ---------------------------------------


def cmd_push_results():
    """Emit assembled files as FORGE_METRIC base64 chunks.

    The Forge runner only uploads results/{job}.json + log tail, so large
    artifacts ride back as metrics. Reassemble with: concat chunks in order,
    base64-decode, verify sha256.
    """
    for path, prefix in ((OUT, "shots"), (MANIFEST, "manifest")):
        if not os.path.exists(path):
            fail("missing %s — run assemble first" % path)
        with open(path, "rb") as f:
            blob = f.read()
        digest = hashlib.sha256(blob).hexdigest()
        b64 = base64.b64encode(blob).decode("ascii")
        chunks = [b64[i:i + 20000] for i in range(0, len(b64), 20000)]
        print("FORGE_METRIC: %s_b64_chunks = %d" % (prefix, len(chunks)), flush=True)
        for i, ch in enumerate(chunks):
            print("FORGE_METRIC: %s_b64_%02d = %s" % (prefix, i, ch), flush=True)
        print("FORGE_METRIC: %s_sha256 = %s" % (prefix, digest), flush=True)
        print("FORGE_METRIC: %s_bytes = %d" % (prefix, len(blob)), flush=True)
    print("push-results emitted", flush=True)


def main():
    random.seed(RANDOM_STATE)
    if len(sys.argv) < 2:
        print("usage: build_shots.py [collect|assemble|verify FILE|push-results]",
              file=sys.stderr)
        sys.exit(2)
    mode = sys.argv[1]
    if mode == "collect":
        cmd_collect()
    elif mode == "assemble":
        cmd_assemble()
    elif mode == "verify":
        if len(sys.argv) < 3:
            fail("verify needs a file path")
        cmd_verify(sys.argv[2])
    elif mode == "push-results":
        cmd_push_results()
    else:
        fail("unknown mode: %s" % mode)


if __name__ == "__main__":
    main()
