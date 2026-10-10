"""Is the cloud in the middle of its own canvas, or only near it?

`cam.fit` frames the data by measuring `|P - centre|` and taking the 99.5th
percentile. That answers how far the cloud reaches and cannot answer whether it
reaches equally far both ways, because the absolute value folds the two tails
together before anything looks at them. A cloud whose left tail is 60px and
whose right tail is 200px measures exactly like one that is 200px both ways: the
fit sees 200, sets a zoom that keeps 200 on screen, and leaves 140px of dead
canvas down one side that nothing in the code has any way to notice.

`cam.ctr` centres the **median** point, which is the point the map turns about
and is why the cloud spins in place instead of orbiting. The median is not the
middle of the extent. Those are different questions and the second one was never
asked.

This asks it. `cam.fit` now records the signed union bounding box over a full
turn — `sx`, `sy`, and their midpoints `offx`, `offy` — from the same pass, the
same points and the same projection that set the zoom. Reading it out of
`lastFit` rather than re-projecting here means the number cannot disagree with
the number the framing was decided from.

Three things are checked, per page:

  centred   the union bbox midpoint sits within 2% of the canvas of the middle
  framed    the union bbox spans at least 70% of the room available to it
  whole     neither end of it is outside the canvas

Read the units before trusting a number: everything in `lastFit` is device px at
zoom `z`, the zoom in force while the fit's loops ran, and the view ships at `k`.
This scales by `k/z`. A check that skipped that step would be measuring a view
no visitor is looking at.

    python scripts/smoke_framing.py
    python scripts/smoke_framing.py --page players
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

PAGES = ("index", "players", "trends", "player")
DEFER = {"trends": "smLoad"}   # maps that wait for a click before they exist

OFF_MAX = 0.02      # bbox midpoint, as a fraction of the canvas
FILL_MIN = 0.70     # bbox span, as a fraction of the room it could use

READ = """(function(){
  var C = window.VHMapCamera && window.VHMapCamera.cams;
  if (!C || !C.length) return {err:'no camera attached'};
  for (var i=0;i<C.length;i++){
    if (C[i].lastFit) return {f:C[i].lastFit, mid:C[i].mid, pan:C[i].pan,
                              zoom:C[i].zoom, home:C[i].home};
  }
  return {err:'camera attached but fit() has not run'};
})()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", choices=PAGES, help="default: all three")
    # the fit budgets against half the canvas height, so the aspect ratio it is
    # handed changes what it decides; a phone hands it a very different one
    ap.add_argument("--mobile", action="store_true", help="390x844 at DPR 2")
    args = ap.parse_args()
    pages = (args.page,) if args.page else PAGES

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

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

    profile = Path(tempfile.gettempdir()) / "vh-framing"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(80):
            try:
                with urllib.request.urlopen(
                        f"http://127.0.0.1:{cdp}/json/list", timeout=2) as r:
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
        ws.call("Emulation.setDeviceMetricsOverride",
                {"width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True}
                if args.mobile else
                {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        print("viewport " + ("390x844 @2 (phone)" if args.mobile else "1280x900 @1 (desktop)"))

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}.html"})
            # /trends keeps its 406 KB season file behind a button that names the
            # size — an opt-in, not a defect, but it means no camera exists until
            # something presses it. A run that skipped this would report the map
            # as unmeasurable rather than measuring it.
            if name in DEFER:
                for _ in range(30):
                    time.sleep(0.4)
                    if ev(f"!!document.getElementById('{DEFER[name]}')"):
                        ev(f"document.getElementById('{DEFER[name]}').click()")
                        break
            got = None
            for _ in range(40):
                time.sleep(0.4)
                got = ev(READ)
                if isinstance(got, dict) and isinstance(got.get("f"), dict):
                    break
            print(f"\n  /{name}")
            if not isinstance(got, dict) or not isinstance(got.get("f"), dict):
                why = (got or {}).get("err", "no reply") if isinstance(got, dict) else "no reply"
                print(f"    {why}")
                fails.append(f"/{name}: {why} — the framing cannot be measured, "
                             f"which is not the same as it being right")
                continue

            f, mid, pan = got["f"], got["mid"], got["pan"]
            W, H = f["W"], f["H"]

            # Everything in lastFit is device px at zoom z, measured against the
            # anchor as it stood then; the view ships at k with whatever mid and
            # pan the fit went on to set. Resolve to absolute canvas px through
            # the live values rather than assuming what the fit decided — an
            # assertion that hard-codes the fix cannot fail when the fix breaks.
            # `k` is what the fit asked for; `home` is what setZoom granted after
            # the 0.55-3 clamp, and it is the zoom the view rests at. They agree
            # today because every k lands inside the clamp — measure through the
            # granted one anyway, or the day a k exceeds 3 this reports a view
            # nobody is looking at.
            shipped = got["home"] or f["k"]
            if abs(shipped - f["k"]) > 1e-6:
                print(f"    fit asked for zoom {f['k']:.3f}, clamp granted {shipped:.3f}")
            scale = shipped / f["z"] if f["z"] else 1.0
            upk = min(W, H) * f["sc"] * shipped       # sc at the shipped zoom
            ax = [W * mid[0] + v * scale + pan[0] * upk for v in f["sx"]]
            ay = [H * mid[1] + v * scale + pan[1] * upk for v in f["sy"]]
            (lox, hix), (loy, hiy) = ax, ay

            offx, offy = (lox + hix) / 2 - W * 0.5, (loy + hiy) / 2 - H * 0.5
            fillx, filly = (hix - lox) / W, (hiy - loy) / H

            print(f"    canvas {W}x{H}   zoom {f['z']:.2f} -> {shipped:.2f}   "
                  f"n {f['n']:,}   mid {mid[0]:.2f},{mid[1]:.2f}")
            print(f"    x  {lox:7.1f} .. {hix:7.1f}   off centre {offx:+7.1f} "
                  f"({offx / W:+.1%} of width)    fills {fillx:.0%}")
            print(f"    y  {loy:7.1f} .. {hiy:7.1f}   off centre {offy:+7.1f} "
                  f"({offy / H:+.1%} of height)   fills {filly:.0%}")

            if abs(offx) / W > OFF_MAX:
                fails.append(f"/{name}: the cloud's horizontal middle sits "
                             f"{offx:+.0f}px off the canvas centre "
                             f"({offx / W:+.1%} of {W}px) — one side runs to the "
                             f"edge while the other is dead canvas")
            if abs(offy) / H > OFF_MAX:
                fails.append(f"/{name}: the cloud's vertical middle sits "
                             f"{offy:+.0f}px off the canvas centre "
                             f"({offy / H:+.1%} of {H}px)")
            if fillx < FILL_MIN and filly < FILL_MIN:
                fails.append(f"/{name}: the cloud fills {fillx:.0%} of the width "
                             f"and {filly:.0%} of the height; the map is the "
                             f"control this site is built around and it is mostly "
                             f"empty rectangle")
            if lox < 0 or hix > W:
                fails.append(f"/{name}: the cloud spans {lox:.0f}..{hix:.0f} across a "
                             f"{W}px canvas — it is clipped, and a clipped cloud "
                             f"reads as a full one to anything counting pixels")
            if loy < 0 or hiy > H:
                fails.append(f"/{name}: the cloud spans {loy:.0f}..{hiy:.0f} down a "
                             f"{H}px canvas — clipped")
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
        print("OK — every map's cloud is centred on its canvas, fills it, and is "
              "not clipped at any angle the rotation passes through")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
