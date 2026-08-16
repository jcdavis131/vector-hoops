"""Operate the Explorer's All/Current filter and count what it costs.

`loadPts(f)` used to re-fetch `assets/embedding_map_points_limited.json` — 273.5 KB
— on every call, and both filter buttons called it. Measured on Fast 3G:

  * four alternating clicks downloaded the file four times, 1.07 MB for data whose
    contents never change and which the page had already parsed into `allPts`
  * the button class and aria-pressed flip synchronously while the map waits on the
    network, so for about two seconds the button read "Current" while the map still
    said "all • 1764 pts", with nothing on screen saying why

Filtering is a property of data already in memory. One fetch, then a synchronous
redraw — which also means two filter presses cannot land out of order, the shape
that produced three separate defects on this branch.

Two assertions, both of which the old code fails:

  1. after the page has loaded, filter presses cause no further requests
  2. a quarter-second after a press, the map agrees with the button

    python scripts/smoke_players.py
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
PAGE = "/players.html"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

FAST3G = {"offline": False, "latency": 150,
          "downloadThroughput": 1.6 * 1024 * 1024 / 8,
          "uploadThroughput": 750 * 1024 / 8}

# classList.contains, not className.indexOf('on'): both buttons carry "mono", and
# "mono" contains the letters "on", so a substring test reports every state as All.
STATE = """(function(){
  var a=document.getElementById('fAll'), c=document.getElementById('fCur');
  if(!a||!c) return JSON.stringify({err:'no filter buttons'});
  return JSON.stringify({
    button:a.classList.contains('on')?'all':(c.classList.contains('on')?'current':'?'),
    lab:((document.getElementById('lab')||{}).textContent||'').trim(),
    dots:(typeof dots!=='undefined'&&dots)?dots.length:0});
})()"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def main() -> int:
    argparse.ArgumentParser().parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    hits = {"pts": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if "embedding_map_points_limited" in self.path:
                hits["pts"] += 1
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

    profile = Path(tempfile.gettempdir()) / "vh-players"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,1000",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    failures: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(60):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cdp}/json/list", timeout=2) as r:
                    for t in json.load(r):
                        if t.get("type") == "page":
                            target = t["webSocketDebuggerUrl"]; break
                if target:
                    break
            except Exception:
                time.sleep(0.25)
        if not target:
            sys.exit("chrome exposed no devtools target")

        print(f"filtering {PAGE} on Fast 3G in {browser.name}\n")
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        ws.call("Network.emulateNetworkConditions", FAST3G)
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(7)

        start = ev(ws, STATE)
        if not isinstance(start, dict) or start.get("err"):
            failures.append(f"the filter buttons are not on the page: {start}")
            raise SystemExit
        # was `"pts" not in lab` — coupled to the label's wording, so rewording
        # it from "1764 pts • 1814 filtered · mem 86%" to "1764 of 1764 points"
        # made this report a working map as a broken one. Ask the page how many
        # points it drew instead.
        if not start.get("dots"):
            failures.append(f"the map never loaded — label reads {start['lab'][:50]!r}, so "
                            f"nothing below is a fair test")
            raise SystemExit
        hits["pts"] = 0

        for i, which in enumerate(("fCur", "fAll", "fCur", "fAll")):
            ev(ws, f"document.getElementById('{which}').click()")
            time.sleep(0.25)
            st = ev(ws, STATE)
            print(f"  click {i+1} {which:<5} button={st['button']:<8} map says {st['lab'][:30]!r}")
            if not st["lab"].lower().startswith(st["button"]):
                failures.append(
                    f"a quarter-second after pressing {which}, the button reads "
                    f"{st['button']!r} and the map still says {st['lab'][:34]!r} — the "
                    f"class flips synchronously and the redraw waits on the network, so "
                    f"the page contradicts itself for as long as the fetch takes")

        print(f"\n  requests       {hits['pts']} for four filter presses")
        if hits["pts"]:
            failures.append(
                f"filtering re-downloaded the 273.5 KB point file {hits['pts']} time(s) — "
                f"the page already holds every point in allPts, so a filter is a property "
                f"of data in memory and should cost nothing")
    except SystemExit:
        pass
    finally:
        if ws:
            ws.close()
        proc.kill()
        httpd.shutdown()

    if failures:
        print(f"\nFAIL — {len(failures)} problem(s) in the Explorer filter:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — filtering redraws from memory: no requests, and the map agrees with the "
          "button straight away")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
