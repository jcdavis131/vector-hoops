"""Pinch and tilt the embedding map with two fingers, and check both.

Zoom had four ways in — ctrl+wheel, plus, minus, and 0 to reset — and every one
of them wants hardware a phone does not have. A touch visitor could turn the map
and pick points on it and could never get closer to one, on the control this
whole site is built around. `check_viewport` said the page fits 320px and
`check_target_size` said the controls are big enough to hit; neither of them can
say whether a gesture does anything, so nothing here could see it.

This drives real touch points through CDP rather than calling the handler:
`Input.dispatchTouchEvent` with two contacts — moved apart, brought together,
and slid up as a pair — against the camera the page actually attached. What it reads back is
`window.VHMapCamera.cams[0].zoom`, which is the number the projection uses.

  spread     80px -> 146px is a ratio of 1.83, and zoom must move by it
  squeeze    146px -> 80px puts it back
  clamp      a gesture far past either bound lands exactly on 3 or on 0.55
  no-scroll  a pinch drifting 120px down still zooms, and scrollY does not move
  tilt       two fingers slid 100px up move pitch 0.50 and leave zoom alone
  rotate     a pure spread is not a drag: yaw comes back unchanged

    python scripts/smoke_pinch.py
    python scripts/smoke_pinch.py --page players     # or trends, which loads on request
    python scripts/smoke_pinch.py --mutate deaf      # expect FAIL

Three things went wrong writing this, all the same shape: a gesture aimed at
900px on a 390px viewport lands nowhere; a centre read before a scroll is not
the centre after it; and a canvas 52px below an 844px viewport is not touched at
all. Each time the zoom simply sat where it was, which reads exactly like a
gesture that was received and ignored. Anything here that dispatches a touch
should re-read getBoundingClientRect immediately before doing it.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import socket
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVE = ROOT / "public"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

CAMERA = SERVE / "assets" / "map-camera.js"

# each one takes away a piece of the gesture
MUTATIONS = {
    # stop listening for the second finger moving
    "deaf": [("if (!pinch || e.touches.length !== 2) return;\n      e.preventDefault();",
              "if (!pinch || e.touches.length !== 2) return;\n      return;")],
    # There was a third here, "bubble", which took the preventDefault out of
    # touchstart. It never failed. Measured: with it gone, a pinch carrying
    # 120px of vertical drift still zooms to 1.875 and still leaves scrollY
    # untouched, because the preventDefault in touchmove is already enough
    # under this emulation.
    #
    # The line stays in map-camera.js anyway — on real hardware Chrome can
    # begin a scroll on the compositor thread before touchmove reaches the main
    # thread, and a non-passive touchstart that preventDefaults is what makes it
    # wait. Headless touch emulation cannot show that difference.
    #
    # But a mutation that cannot fail is the hole this whole matrix exists to
    # close, and keeping one because its subject sounds important is how
    # smoke_wiki's demote-bare passed for want of an input. Better to say
    # plainly that this line is not covered than to imply it is.
    # treat the pinch as a drag as well, which is what it was before
    "rotate": [("cam.drag = null; cam.moved = 99; cv.classList.remove('grabbing');",
                "cv.classList.remove('grabbing');")],
    # take away the two-finger tilt, which is the only way to tilt on a phone
    "flat": [("cam.pitch = clamp(pinch.p0 - (midY(e.touches) - pinch.m0) * 0.005, "
              "-0.85, 0.85);", "")],
}


def ev(ws, expr, awaitp=False):
    r = ws.call("Runtime.evaluate",
                {"expression": expr, "returnByValue": True, "awaitPromise": awaitp})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def touch(ws, kind, pts):
    ws.call("Input.dispatchTouchEvent", {
        "type": kind,
        "touchPoints": [{"x": float(x), "y": float(y), "id": i}
                        for i, (x, y) in enumerate(pts)],
    })


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", default="index", help="page stem carrying a map")
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    cam_src = CAMERA.read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in cam_src:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — "
                      f"mutation {args.mutate!r} no longer matches: {find[:60]!r}")
                raise SystemExit(2)
            cam_src = cam_src.replace(find, repl, 1)
    body = cam_src.encode("utf-8")

    import functools, http.server, socketserver, threading  # noqa: E401

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if args.mutate and self.path.split("?")[0] == "/assets/map-camera.js":
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
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

    profile = Path(tempfile.gettempdir()) / "vh-pinch"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=430,900",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(80):
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
        # a phone, so the touch listeners are the ones that run
        ws.call("Emulation.setDeviceMetricsOverride", {
            "width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})
        ws.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{args.page}.html"})
        time.sleep(4.0)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"pinching /{args.page} at 390x844 with two fingers{mut}\n")

        FIND = """(function(){
            var c=(window.VHMapCamera&&VHMapCamera.cams&&VHMapCamera.cams[0]||{}).canvas;
            if(!c) return 'no camera attached';
            c.scrollIntoView({block:'center'});
            var r=c.getBoundingClientRect();
            return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2,
                                   w:r.width, h:r.height});})()"""
        # /trends does not fetch its 406 KB season map until someone asks: the
        # canvas sits behind a "Draw the seasons" button and the label beside it
        # says "press Draw the seasons to load". So no camera at four seconds is
        # the page working, not the page broken. Press it, the way a visitor
        # does, rather than reporting a map that was never meant to be there yet.
        box = ev(ws, FIND)
        if not isinstance(box, dict):
            pressed = ev(ws, """(function(){
                var b=document.getElementById('smLoad');
                if(!b) b=[].slice.call(document.querySelectorAll('button'))
                          .filter(function(x){return /draw the seasons|load the map/i
                                                     .test(x.textContent||'');})[0];
                if(!b) return '';
                b.scrollIntoView({block:'center'}); b.click();
                return (b.textContent||'').trim().slice(0,34);})()""")
            if pressed:
                print(f"  (pressed {pressed!r} — this map loads on request)")
                time.sleep(4.5)
                box = ev(ws, FIND)
        if not isinstance(box, dict):
            for frac in (0.35, 0.6, 0.85, 1.0):
                ev(ws, f"window.scrollTo(0, document.body.scrollHeight*{frac})")
                time.sleep(1.1)
                box = ev(ws, FIND)
                if isinstance(box, dict):
                    print(f"  (camera appeared after scrolling to {frac:.0%} of the page)")
                    break
        if not isinstance(box, dict):
            sys.exit(f"could not find a map on /{args.page}: {box!r}")
        time.sleep(0.6)
        box = ev(ws, FIND)   # scrollIntoView moved it; the rect above is stale
        if not isinstance(box, dict):
            sys.exit(f"the map on /{args.page} went away between reads: {box!r}")
        cx, cy = box["x"], box["y"]
        print(f"  canvas   {box['w']:.0f}x{box['h']:.0f} at ({cx:.0f}, {cy:.0f})")

        def zoom():
            return ev(ws, "VHMapCamera.cams[0].zoom")

        def ori():
            return ev(ws, "JSON.stringify([VHMapCamera.cams[0].yaw,VHMapCamera.cams[0].pitch])")

        # reset() restores the fitted zoom, which on a phone is ~1.65 — high
        # enough that a 1.83x spread hits the 3.0 clamp and the proportionality
        # check below compares two ceilings and proves nothing. Start this case
        # from 1.0 explicitly so the ratio is measurable.
        ev(ws, "VHMapCamera.cams[0].reset(false); VHMapCamera.cams[0].setSpin(false,false);"
               "VHMapCamera.cams[0].setZoom(1,false)")
        time.sleep(0.2)
        start, ori0 = zoom(), ori()

        def pinch(gap0, gap1, steps=6, drift=0.0):
            """drift slides both contacts down together, which under
            `touch-action: pan-y` is exactly the gesture the browser wants to
            turn into a page scroll."""
            touch(ws, "touchStart", [(cx - gap0 / 2, cy), (cx + gap0 / 2, cy)])
            for i in range(1, steps + 1):
                g = gap0 + (gap1 - gap0) * i / steps
                y = cy + drift * i / steps
                touch(ws, "touchMove", [(cx - g / 2, y), (cx + g / 2, y)])
                time.sleep(0.05)
            touch(ws, "touchEnd", [])
            time.sleep(0.25)

        # Every gap has to keep both fingers on the canvas. The first version of
        # this reached for 900px on a 390px viewport, which puts the contacts at
        # x=-255 and x=645: no touch lands, no handler runs, and the zoom left
        # over from the previous step sits there looking like a result. It
        # "passed" while measuring nothing.
        span = min(box["w"], box["h"])
        wide, narrow = span * 0.9, span * 0.06
        assert cx - wide / 2 >= box["x"] - box["w"] / 2, "gesture leaves the canvas"

        # a gentle spread, checked against the ratio rather than the ceiling
        pinch(80, 146)
        out = zoom()
        want = start * 146 / 80
        print(f"  spread   zoom {start} -> {out}   (80px -> 146px, so about {want:.2f})")
        if not isinstance(out, int | float) or abs(out - want) > 0.12:
            fails.append(f"two fingers moved 80px -> 146px apart, a ratio of 1.83, and zoom "
                         f"went from {start} to {out} — {want:.2f} is what that gesture means")

        mid = out
        pinch(146, 80)
        back = zoom()
        print(f"  squeeze  zoom {mid} -> {back}")
        if not isinstance(back, int | float) or back >= mid - 0.05:
            fails.append(f"two fingers moved 146px -> 80px apart and zoom went from "
                         f"{mid} to {back}; the map did not zoom out")

        # the camera clamps to 0.55-3, and the clamp is the assertion: a gesture
        # far past either bound must land exactly on it, not merely inside it
        pinch(narrow, wide, steps=8)
        hi = zoom()
        pinch(wide, narrow, steps=8)
        lo = zoom()
        print(f"  clamp    {narrow:.0f}px<->{wide:.0f}px on a {span:.0f}px canvas "
              f"-> {hi} / {lo}   (bounds 0.55-3)")
        if not isinstance(hi, int | float) or round(hi, 4) != 3:
            fails.append(f"spreading from {narrow:.0f}px to {wide:.0f}px should hit the "
                         f"camera's upper bound of 3 exactly; zoom is {hi}")
        if not isinstance(lo, int | float) or round(lo, 4) != 0.55:
            fails.append(f"squeezing from {wide:.0f}px to {narrow:.0f}px should hit the "
                         f"camera's lower bound of 0.55 exactly; zoom is {lo}")

        # read the orientation before anything resets it, so this is a statement
        # about the pinches above rather than about a fresh camera
        ori_after_pinches = ori()

        # `touch-action: pan-y` already forbids the browser's own pinch-zoom, so
        # the preventDefault in touchstart is not there to stop that — under
        # pan-y what it stops is the page scrolling away while you pinch. The
        # first version of this mutated that line away and nothing failed,
        # because every gesture here moved along x only and no scroll was ever
        # on offer. This one drifts both contacts down 90px while spreading.
        # getBoundingClientRect is in viewport coordinates, so it is only true
        # until the page scrolls. Setting a scroll position and then reusing the
        # centre read before it put every contact off the canvas — twice on the
        # page background, where pan-y scrolls exactly as it should, and once
        # 52px below an 844px viewport where nothing was touched at all. Each
        # time the zoom sat unchanged and read as a lost gesture. Scroll first,
        # settle, then read.
        ev(ws, "VHMapCamera.cams[0].reset(false);"
               "VHMapCamera.cams[0].canvas.scrollIntoView({block:'center'})")
        time.sleep(0.9)
        b2 = ev(ws, """(function(){var r=VHMapCamera.cams[0].canvas.getBoundingClientRect();
            return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2});})()""")
        cx, cy = b2["x"], b2["y"]
        sy0 = ev(ws, "Math.round(window.scrollY)")
        # the map opens fitted to its data now, so the baseline is whatever
        # reset() restored, not 1.0
        z_before = zoom()
        pinch(80, 150, steps=8, drift=120)
        sy1 = ev(ws, "Math.round(window.scrollY)")
        zd = zoom()
        print(f"  no-scroll  scrollY {sy0} -> {sy1} while pinching 120px down, zoom {zd}")
        if sy0 != sy1:
            fails.append(f"pinching with both fingers drifting down scrolled the page from "
                         f"{sy0} to {sy1}; the map moved out from under the gesture")
        want_zd = min(3.0, z_before * 150 / 80)
        if not isinstance(zd, int | float) or abs(zd - want_zd) > 0.12:
            fails.append(f"a pinch with 120px of vertical drift left zoom at {zd}; from "
                         f"{z_before:.3f} a 80px -> 150px spread means {want_zd:.2f} "
                         f"(the camera clamps at 3). The browser took the gesture as a scroll.")

        # Two fingers sliding together tilt it. Measured before that existed: a
        # one-finger upward drag moved pitch 0.15 while the page took 105px, and
        # a diagonal drag yawed 0.079 where a mouse yaws 0.63. Tilt was not
        # reachable by touch.
        ev(ws, "VHMapCamera.cams[0].reset(false);"
               "VHMapCamera.cams[0].canvas.scrollIntoView({block:'center'})")
        time.sleep(0.9)
        b3 = ev(ws, """(function(){var r=VHMapCamera.cams[0].canvas.getBoundingClientRect();
            return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2});})()""")
        cx, cy = b3["x"], b3["y"]
        sy2 = ev(ws, "Math.round(window.scrollY)")
        z_slide = zoom()
        pinch(120, 120, steps=8, drift=-100)          # same gap: a slide, not a pinch
        tilt = ev(ws, "+VHMapCamera.cams[0].pitch.toFixed(3)")
        tz = zoom()
        sy3 = ev(ws, "Math.round(window.scrollY)")
        want_p = 100 * 0.005
        print(f"  tilt     two fingers slid 100px up -> pitch {tilt} (want {want_p:.2f}), "
              f"zoom {tz}, scrollY {sy2} -> {sy3}")
        if not isinstance(tilt, int | float) or abs(tilt - want_p) > 0.08:
            fails.append(f"two fingers slid 100px up left pitch at {tilt}; the camera moves "
                         f"0.005 per pixel, so {want_p:.2f} is what that gesture means")
        if not isinstance(tz, int | float) or abs(tz - z_slide) > 0.05:
            fails.append(f"a slide with the fingers a constant 120px apart moved zoom from "
                         f"{z_slide} to {tz}; sliding is not pinching and must not zoom")
        if sy2 != sy3:
            fails.append(f"sliding two fingers up scrolled the page {sy2} -> {sy3}")

        ori1 = ori_after_pinches
        print(f"  rotate   yaw/pitch {ori0} -> {ori1}   (pure spread must not turn it)")
        if ori0 != ori1:
            fails.append(f"the pinches also turned the map: yaw and pitch went from "
                         f"{ori0} to {ori1}. A pinch is not a drag.")
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
        print("OK — two fingers zoom the map in and out and tilt it, stay inside the "
              "camera's bounds, and a pure spread does not turn it")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
