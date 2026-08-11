"""What the landing map shows before its 273 KB has arrived.

The grey placeholder cloud lived inside `loadLimited()`'s `catch`, so it
appeared only when the fetch **failed**. On the normal path `dots` stayed empty
and the map was a blank rectangle until the file landed. Measured on a slow-3G
first visit before this: 0 painted pixels at 2.5s, 0 at 5.0s, first paint
somewhere between 5s and 9s — several seconds of nothing on the control the
whole site is built around.

The canvas `aria-label` had been telling assistive tech that the map "opens on a
placeholder cloud and is replaced when the full vector file finishes loading".
That described the failure path as though it were the normal one.

And the status line read `dots.length + ' players'` off whatever was in the
array. Over the placeholder that is **4,000 invented positions called players**,
which is the one thing this site says it does not do.

Nothing could see any of this. `check_viewport` measures layout, `smoke_offline`
measures a warm cache, and both read a page that has finished loading. This one
throttles the first visit and looks while it is still happening.

  loading   something is painted, and the status says it is loading
  arrived   the real cloud replaces it and the count becomes real
  blocked   with the file refused, the page says so and calls them a placeholder

    python scripts/smoke_mapload.py
    python scripts/smoke_mapload.py --mutate late-seed   # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
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

PAGE = SERVE / "index.html"
MAP = "/assets/embedding_map_points_limited.json"

MUTATIONS = {
    # put the placeholder back where it was: only reachable on failure
    "late-seed": [("seedPlaceholder();\nloadLimited();", "loadLimited();")],
    # call the placeholder's invented positions players again
    "count-lie": [("sL.textContent = mapState==='real'", "sL.textContent = true")],
}

PAINT = """(function(){
  var c=document.querySelector('canvas'); if(!c) return -1;
  try{ var x=c.getContext('2d'); if(!x) return -2;
    var d=x.getImageData(0,0,c.width,c.height).data, n=0;
    for(var i=3;i<d.length;i+=4){ if(d[i]!==0) n++; }
    return n; }catch(e){ return -3; }
})()"""
STATUS = "((document.getElementById('statusLab')||{}).innerText||'')"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    page = PAGE.read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — "
                      f"mutation {args.mutate!r} no longer matches: {find[:60]!r}")
                raise SystemExit(2)
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")
    blocked = {"on": False}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if blocked["on"] and path == MAP:
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

    profile = Path(tempfile.gettempdir()) / "vh-mapload"
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
        ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.enable")
        ws.call("Emulation.setDeviceMetricsOverride", {
            "width": 390, "height": 844, "deviceScaleFactor": 2, "mobile": True})

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        def throttle(kbps):
            ws.call("Network.emulateNetworkConditions", {
                "offline": False, "latency": 400,
                "downloadThroughput": kbps * 1024 / 8, "uploadThroughput": kbps * 1024 / 8})

        url = f"http://127.0.0.1:{site}/index.html"
        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"loading / on a throttled first visit{mut}\n")

        # ── while it is still arriving ────────────────────────────────────
        throttle(400)
        ws.call("Page.navigate", {"url": url}); time.sleep(3.2)
        px, st = ev(PAINT), (ev(STATUS) or "")
        print(f"  loading   {px} painted px   status {st[:44]!r}")
        if not isinstance(px, int) or px < 500:
            fails.append(f"3.2s into a slow first visit the map has {px} painted pixels. "
                         f"A blank rectangle is what a visitor waits on.")
        if re.search(r"\d[\d,]*\s+players", st, re.I):
            fails.append(f"the status line reads {st[:60]!r} before the file has arrived — "
                         f"those are placeholder positions, not players")
        if "loading" not in st.lower():
            fails.append(f"the status line reads {st[:60]!r} while loading; it does not say "
                         f"that anything is on its way")

        # ── once it lands ─────────────────────────────────────────────────
        throttle(20000)
        for _ in range(20):
            time.sleep(0.6)
            st = ev(STATUS) or ""
            if re.search(r"\d[\d,]*\s+players", st, re.I):
                break
        px = ev(PAINT)
        real = json.loads((SERVE / "assets" /
                           "embedding_map_points_limited.json").read_text(encoding="utf-8"))
        want = f"{len(real['points']):,}"
        print(f"  arrived   {px} painted px   status {st[:44]!r}   (file holds {want})")
        if want not in st:
            fails.append(f"once loaded the status reads {st[:60]!r}; the file holds {want} "
                         f"points")

        # ── with the file refused ─────────────────────────────────────────
        # Refusing it at the server is not enough: by now the service worker has
        # the file cached and answers from there without ever asking. The first
        # run of this reported the blocked page showing "1,764 PLAYERS" and it
        # was right — the file had not been blocked at all, only the origin had.
        blocked["on"] = True
        ev("""(async function(){
            var ks = await caches.keys();
            await Promise.all(ks.map(function(k){ return caches.delete(k); }));
            var rs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(rs.map(function(r){ return r.unregister(); }));
            return ks.length;
        })()""")
        # and not enough on its own either: with the service worker gone the
        # browser's own HTTP cache still had it, and the page loaded a file the
        # server was refusing. Two caches sit between "the server said no" and
        # "the page did not get it".
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        time.sleep(1.2)
        ws.call("Page.navigate", {"url": url}); time.sleep(4.5)
        px, st = ev(PAINT), (ev(STATUS) or "")
        print(f"  blocked   {px} painted px   status {st[:60]!r}")
        if re.search(r"\d[\d,]*\s+players", st, re.I):
            fails.append(f"with the map file refused the status still reads {st[:60]!r} — "
                         f"that is the placeholder being called players")
        if "placeholder" not in st.lower() and "did not load" not in st.lower():
            fails.append(f"with the map file refused the status reads {st[:60]!r}; it does "
                         f"not say the file failed")
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
        print("OK — the map is drawn from the first frame, says it is loading, becomes the "
              "real count when the file lands, and admits it when the file does not")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
