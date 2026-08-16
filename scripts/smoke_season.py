"""Scrub /trends through thirty seasons and check the page agrees with the file.

The brief's second phase is change over time, and the page had no way to see it:
`archMap` draws every charted season at once, which is where the archetypes sit,
not how the league moved through them. `assets/season_map.json` is the trajectory
file pivoted by year — 30 seasons, 1996-97 to 2025-26, 12,038 player-seasons —
and the new section draws one season at a time.

Everything below is driven with real input and read back against the file on
disk, because the interesting failures here are the quiet ones:

  once      406 KB on an explicit press, and one download however many presses.
            /index shipped this bug twice already. Two guards carry it here — the
            button disables itself and the handler holds the promise. Measured:
            with either one removed the page still calls fetch exactly once, so
            the mutation has to remove both to prove the assertion is real
  counts    the season label, the pill on the map and the file must agree.
            A page printing `dots.length` beside a frozen 1814 is on record here
  mix       the archetype percentages are counted from the points drawn, not read
            from a prevalence table in a different clustering. So they have to
            change when the season changes, and they have to sum to 100
  pick      clicking a point announces that player's charted span, and the span
            is the one the file gives for that pid
  camera    a real drag turns this map too
  fail      with the file unreachable, the page says so and draws nothing rather
            than a made-up cloud

Mutations are served, never written.

    python scripts/smoke_season.py
    python scripts/smoke_season.py --mutate once      # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVE = ROOT / "public"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

# Each entry is a list of edits, because one of these needs two. `once` removes
# BOTH guards on the download — measured: with either one left in place the page
# still calls fetch exactly once.
#
# Its first two versions both ran green for reasons that had nothing to do with
# the page being right. The first removed only the `pending` check, and the
# button's own `disabled` carried it. The second removed both and STILL saw one
# request, because the count was of HTTP requests and Chrome served the repeats
# from its own cache — as production would, since the asset is immutable for a
# year. So the count is of fetch() calls now: the network cannot tell you whether
# the page asked twice, and what the page does is the thing under test.
MUTATIONS = {
    "once":   [("if(pending || SM) return;", ""),
               ("btn.disabled=true; btn.setAttribute('aria-busy','true');", "")],
    "counts": [("lab.textContent = s + ' · ' + frame.length + ' of ' +",
                "lab.textContent = s + ' · ' + 0 + ' of ' +")],
    "mix":    [("for(i=0;i<tot;i++){ c=frame[i].c; if(c>=0 && c<8) n[c]++; }",
                "for(i=0;i<tot;i++){ c=0; if(c>=0 && c<8) n[c]++; }")],
    "pick":   [("trace = traceFor(d.pid);", "trace = traceFor(d.pid).slice(0,1);")],
    "fail":   [("state.textContent='could not load ('+e.message+')';",
                "state.textContent='fetching assets/season_map.json';")],
}


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def press(ws, sel):
    ev(ws, f"document.getElementById('{sel}').click()")
    time.sleep(0.25)


def slide(ws, i):
    ev(ws, f"(function(){{var y=document.getElementById('smYear');y.value={i};"
           f"y.dispatchEvent(new Event('input',{{bubbles:true}}));}})()")
    time.sleep(0.3)


def mouse(ws, kind, x, y, buttons=0):
    ws.call("Input.dispatchMouseEvent", {"type": kind, "x": round(x, 1), "y": round(y, 1),
                                         "button": "left", "buttons": buttons, "clickCount": 1})
    time.sleep(0.04)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    ap.add_argument("--block", action="store_true",
                    help="refuse to serve season_map.json (the failure path)")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    data = json.loads((SERVE / "assets" / "season_map.json").read_text(encoding="utf-8"))
    seasons, counts = data["seasons"], data["counts"]

    page = (SERVE / "trends.html").read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — " + f"mutation {args.mutate!r} no longer matches the page: {find!r}")
                raise SystemExit(2)
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")
    hits = {"map": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/trends.html", "/trends"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(body)
                return
            if path.endswith("/assets/season_map.json"):
                hits["map"] += 1
                if args.block:
                    self.send_error(503, "blocked by the smoke")
                    return
            super().do_GET()

        def handle_one_request(self):
            try:
                super().handle_one_request()
            except (ConnectionResetError, BrokenPipeError):
                self.close_connection = True

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); site = s.getsockname()[1]
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); cdp = s.getsockname()[1]
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", site), functools.partial(Quiet, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    profile = Path(tempfile.gettempdir()) / "vh-season"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,900",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(60):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cdp}/json/list", timeout=2) as r:
                    for x in json.load(r):
                        if x.get("type") == "page":
                            target = x["webSocketDebuggerUrl"]; break
                if target:
                    break
            except Exception:
                time.sleep(0.25)
        if not target:
            sys.exit("chrome exposed no devtools target")

        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/trends.html"})
        time.sleep(3.2)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        mut += "  [file blocked]" if args.block else ""
        print(f"scrubbing /trends through {len(seasons)} seasons in {browser.name}{mut}\n")

        ev(ws, "document.getElementById('smLoad').scrollIntoView({block:'center'})")
        time.sleep(0.2)
        before = ev(ws, "JSON.stringify([document.getElementById('smBox').hidden,"
                        "document.getElementById('smYear').disabled])")
        print(f"  before   box hidden={before[0]}, slider disabled={before[1]}")
        if before != [True, True]:
            fails.append(f"the section starts at {before}, not hidden-and-disabled — a control "
                         f"that looks ready before its data is a control that lies")

        # Count fetch() CALLS, not HTTP requests. Both guards can be stripped and
        # the server still sees one request, because Chrome serves the repeats
        # from its own cache — and in production it would too, since the asset is
        # immutable for a year. So the network layer cannot tell whether the page
        # asked twice. What the page does is the thing under test.
        ev(ws, """(function(){window.__smFetch=0;var f=window.fetch;
            window.fetch=function(u){ if((''+u).indexOf('season_map')>=0) window.__smFetch++;
              return f.apply(this,arguments); };})()""")
        for _ in range(3):
            press(ws, "smLoad")
        time.sleep(2.6)
        asked = ev(ws, "window.__smFetch")

        if args.block:
            st = ev(ws, "document.getElementById('smState').textContent") or ""
            meth = ev(ws, "document.getElementById('smMethod').textContent") or ""
            btn = ev(ws, "document.getElementById('smLoad').textContent") or ""
            drawn = ev(ws, "document.getElementById('smBox').hidden")
            print(f"  blocked  state {st[:44]!r}, button {btn!r}, box hidden={drawn}")
            if "could not load" not in st:
                fails.append(f"the file was unreachable and the page says {st[:50]!r}")
            if "rather than a made-up cloud" not in meth:
                fails.append("the method line does not say that nothing was drawn")
            if drawn is not True:
                fails.append("the map box was revealed with no data behind it")
            if btn != "Try again":
                fails.append(f"the button reads {btn!r} after a failure, offering no way back")
        else:
            print(f"  load     {asked} fetch call(s) for three presses "
                  f"({hits['map']} reached the server; the rest would be cache)")
            if asked != 1:
                fails.append(f"three presses called fetch {asked} times for a 406 KB file")

            shown = ev(ws, "JSON.stringify([document.getElementById('smBox').hidden,"
                           "document.getElementById('smYear').disabled,"
                           "document.getElementById('smYear').max])")
            print(f"  after    box hidden={shown[0]}, slider disabled={shown[1]}, "
                  f"max={shown[2]}")
            if shown[0] is not False or shown[1] is not False:
                fails.append(f"after loading, the section is still {shown}")
            if shown[2] != str(len(seasons) - 1):
                fails.append(f"the slider tops out at {shown[2]}, not {len(seasons) - 1}")

            # ── every season the page can show must match the file ────────────
            probe = [0, 7, 15, 23, len(seasons) - 1]
            seen = []
            for i in probe:
                slide(ws, i)
                got = ev(ws, "JSON.stringify([document.getElementById('smLab').textContent,"
                             "document.getElementById('smSeason').textContent,"
                             "document.getElementById('smMix').textContent])")
                seen.append((i, got))
                s = seasons[i]
                want = counts[s]
                if s not in got[0] or f"· {want} of" not in got[0]:
                    fails.append(f"season {s} has {want} rows in the file and the label reads "
                                 f"{got[0]!r}")
                if f"{want} player-seasons" not in got[1]:
                    fails.append(f"the pill on the map reads {got[1]!r} for {s}")
            print(f"  seasons  {seasons[probe[0]]} {counts[seasons[probe[0]]]} pts … "
                  f"{seasons[probe[-1]]} {counts[seasons[probe[-1]]]} pts, "
                  f"{len(probe)} probed, all matching the file")

            # ── the mix is counted from the points, so it must move ───────────
            slide(ws, 0)
            mix96 = ev(ws, "document.getElementById('smMix').textContent") or ""
            slide(ws, len(seasons) - 1)
            mix26 = ev(ws, "document.getElementById('smMix').textContent") or ""
            pct = ev(ws, "(function(){var t=document.getElementById('smMix').textContent||'';"
                         "var m=t.match(/\\d+(?=%)/g)||[];var s=0;"
                         "for(var i=0;i<m.length;i++)s+=+m[i];return s;})()")
            print(f"  mix      1996-97 {mix96[:38]!r}")
            print(f"           2025-26 {mix26[:38]!r}  sums to {pct}%")
            if not mix96 or mix96 == mix26:
                fails.append("the archetype mix is identical in 1996-97 and 2025-26, or empty — "
                             "it is not being counted from the points on screen")
            if not 96 <= pct <= 104:
                fails.append(f"the archetype percentages sum to {pct}%, which is not a mix")

            # ── a real drag turns this map too ────────────────────────────────
            box = ev(ws, "(function(){var c=document.getElementById('smCv');"
                         "c.scrollIntoView({block:'center'});var r=c.getBoundingClientRect();"
                         "return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()")
            cx, cy = box["l"] + box["w"] / 2, box["t"] + box["h"] / 2
            cam = "VHMapCamera.cams[VHMapCamera.cams.length-1]"
            ev(ws, cam + ".spin=false")
            y0 = ev(ws, cam + ".yaw")
            mouse(ws, "mousePressed", cx - 110, cy, buttons=1)
            for k in range(1, 6):
                mouse(ws, "mouseMoved", cx - 110 + k * 30, cy, buttons=1)
            mouse(ws, "mouseReleased", cx + 40, cy)
            y1 = ev(ws, cam + ".yaw")
            print(f"  camera   drag moved yaw {y0:+.3f} -> {y1:+.3f}")
            if abs(y1 - y0) < 0.4:
                fails.append(f"a drag on the season map moved yaw by {y1 - y0:+.3f}")

            # ── clicking a point traces that career ──────────────────────────
            ev(ws, "document.getElementById('live').textContent=''")
            # ask for the pick the way a keyboard user would — Enter on the
            # focused map — and read what it announced
            ev(ws, "document.getElementById('smCv').focus()")
            for t in ("rawKeyDown", "keyUp"):
                ws.call("Input.dispatchKeyEvent", {"type": t, "key": "Enter", "code": "Enter",
                                                   "windowsVirtualKeyCode": 13,
                                                   "nativeVirtualKeyCode": 13})
            time.sleep(0.4)
            said = ev(ws, "document.getElementById('live').textContent") or ""
            print(f"  pick     {said[:66]!r}")
            if "charted season" not in said:
                fails.append(f"Enter on the season map announced {said[:60]!r}, not a career span")
            else:
                import re as _re
                m = _re.search(r"— (\d+) charted season", said)
                nm = said.split(" — ")[0]
                pid = next((p for p, v in data["names"].items() if v == nm), None)
                if m and pid:
                    real = sum(1 for s in seasons
                               if any(row[0] == int(pid) for row in data["frames"][s]))
                    if int(m.group(1)) != real:
                        fails.append(f"{nm} is in {real} seasons in the file and the page said "
                                     f"{m.group(1)}")
                    else:
                        print(f"           {nm} is in {real} seasons in the file — agrees")

            # ── play advances and the button reports itself ──────────────────
            i0 = ev(ws, "+document.getElementById('smYear').value")
            press(ws, "smPlay")
            pressed = ev(ws, "document.getElementById('smPlay').getAttribute('aria-pressed')")
            time.sleep(2.2)
            i1 = ev(ws, "+document.getElementById('smYear').value")
            press(ws, "smPlay")
            after = ev(ws, "document.getElementById('smPlay').getAttribute('aria-pressed')")
            time.sleep(1.4)
            i2 = ev(ws, "+document.getElementById('smYear').value")
            print(f"  play     season index {i0} -> {i1} while playing, "
                  f"{i1} -> {i2} after stopping; aria-pressed {pressed} then {after}")
            if i1 == i0:
                fails.append("Play did not advance the season")
            if pressed != "true" or after != "false":
                fails.append(f"the play button reported {pressed!r} then {after!r}")
            if i2 != i1:
                fails.append("Stop did not stop it")

            # A traced career you can send to somebody — and the 406 KB opt-in
            # has to survive it. A ?pid= link presses the button for a visitor
            # who has already asked for that career; a bare visit must not.
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/trends.html"})
            time.sleep(4.5)
            bare = ev(ws, "performance.getEntriesByType('resource')"
                          ".filter(function(e){return e.name.indexOf('season_map')>-1}).length")
            print(f"  no link  season_map fetches={bare}")
            if bare:
                fails.append(f"a visit with no ?pid= fetched season_map {bare} time(s) — the "
                             f"406 KB is meant to stay behind its button")

            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/trends.html?pid=2544"})
            time.sleep(9.0)
            got = ev(ws, "performance.getEntriesByType('resource')"
                         ".filter(function(e){return e.name.indexOf('season_map')>-1}).length")
            said = (ev(ws, "(document.getElementById('smState')||{}).textContent||''") or "")
            print(f"  ?pid=    fetches={got} state={said[:52]!r}")
            if not got:
                fails.append("a ?pid= link did not load the season map, so the career it names "
                             "cannot be drawn")
            if "traced from the link" not in said:
                fails.append(f"a ?pid= link left the state line reading {said[:60]!r}; it should "
                             f"name the career it traced")

            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/trends.html?pid=99999999"})
            time.sleep(9.0)
            miss = (ev(ws, "(document.getElementById('smState')||{}).textContent||''") or "")
            print(f"  bad pid  state={miss[:52]!r}")
            if "99999999" not in miss:
                fails.append(f"a pid the file does not carry answered {miss[:60]!r} rather than "
                             f"naming the pid it could not find")
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    if not fails:
        print("OK — with the file unreachable the page says so and draws nothing"
              if args.block else
              "OK — the season map loads once on request, and every season it draws matches "
              "the file it was cut from")
        return 0
    print(f"FAIL — {len(fails)} problem(s) scrubbing /trends:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
