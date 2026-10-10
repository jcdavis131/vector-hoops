"""Press the landing page's map control, including the ways it can fail.

The site's front door has one interactive control that does real work: the "8k"
button, which swaps the 1,764-point map for the full 12,966 by fetching
`assets/vectors.json` — 3,784,565 bytes. Three defects lived in it, all measured
over CDP and all invisible to every gate in the repo, because `smoke_render.py`
asserts the page renders and nothing else:

  busy    the handler set its state AFTER `await loadFull()`. On Fast 3G that was
          20.1 seconds with no label change, no aria-busy and no point count
          moving — the only honest reading being that the press had not landed.
  once    `loadFull()` had no guard, so pressing again while it worked started
          another 3.8 MB download, and pressing after it finished re-fetched the
          whole file.
  atomic  `dots.length = 0` and the repopulate ran BETWEEN the function's two
          awaits, so a failure on the second left 12,966 uncoloured points on
          screen under a button reading not-loaded, while the live region said
          "Still showing the 1,764-point map". Three reports, all disagreeing.

Each of those is one deletion away from coming back and nothing would go red, so:

  1. aria-busy and the label change land within 400ms of the press
  2. two presses mid-flight produce exactly one vectors.json request
  3. a press after success produces no further request
  4. the completion announcement counts the points actually drawn
  5. with the SECOND fetch blocked, the map is untouched, the button is not
     "on", and the announcement says so

Throttled to roughly 6 Mbit/s: fast enough to keep the gate under a minute, slow
enough that the busy window is real rather than a race.

    python scripts/smoke_index.py
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
PAGE = "/index.html"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

# ~6 Mbit/s: 3.78 MB lands in about five seconds, so "did the button react before
# the download finished" is a question with a real answer rather than a coin flip.
THROTTLE = {"offline": False, "latency": 40,
            "downloadThroughput": 6 * 1024 * 1024 / 8,
            "uploadThroughput": 1024 * 1024 / 8}

STATE = """(function(){
  var b=document.getElementById('bFull');
  if(!b) return JSON.stringify({err:'no #bFull'});
  return JSON.stringify({
    label:(b.textContent||'').trim(), hidden:b.hidden, cls:b.className,
    busy:b.getAttribute('aria-busy'),
    dots:(typeof window.dots!=='undefined'&&window.dots)?window.dots.length:-1,
    live:((document.getElementById('ixLive')||{}).textContent||'').trim(),
    said:(window.__said||[]).slice()});
})()"""

# Every value the live region takes, not just the one left in it. The page has a
# second announcer — an interval watching dots.length — which writes after the
# button's own completion line and replaces it. Reading only the final value made
# the "counts what it drew" assertion pass with that line deleted, because the
# other writer happened to contain the same number.
RECORD = """
window.__said=[];
(function(){
  function watch(){
    var el=document.getElementById('ixLive');
    if(!el){ setTimeout(watch,40); return; }
    new MutationObserver(function(){
      var t=(el.textContent||'').trim();
      if(t && window.__said[window.__said.length-1]!==t) window.__said.push(t);
    }).observe(el,{childList:true,characterData:true,subtree:true});
  }
  watch();
})();
"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    hits = {"vectors": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if "vectors.json" in self.path:
                hits["vectors"] += 1
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

    # temp, not the repo — smoke_play.py's convention, and a browser profile left
    # in a shared checkout is 40 MB of untracked noise for the next agent to read
    profile = Path(tempfile.gettempdir()) / "vh-index"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,900",
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

        print(f"pressing the map control on {PAGE} in {browser.name}\n")
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        ws.call("Network.emulateNetworkConditions", THROTTLE)
        ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": RECORD})
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(4.5)

        start = ev(ws, STATE)
        if not isinstance(start, dict) or start.get("err"):
            failures.append(f"the page did not come up: {start}")
            raise SystemExit
        print(f"  before   {start['dots']} points, label {start['label']!r}")
        if start["dots"] < 100:
            failures.append(f"the map opened with {start['dots']} points — the limited "
                            f"cloud never loaded, so nothing below is a fair test")
        base_dots = start["dots"]
        hits["vectors"] = 0

        # 1 + 2. state before the download, and one download for two presses
        ev(ws, "document.getElementById('bFull').click()")
        time.sleep(0.4)
        busy = ev(ws, STATE)
        print(f"  400ms    label {busy['label']!r} aria-busy {busy['busy']!r}")
        print(f"           announced {busy['live'][:62]!r}")
        if busy["busy"] != "true":
            failures.append(
                "400ms after the press the button carries no aria-busy — it fetches "
                "3,784,565 bytes before anything changes, so a visitor on a slow link "
                "reads the press as not having registered")
        if busy["label"] == start["label"]:
            failures.append(f"the button label is still {busy['label']!r} while it loads — "
                            f"nothing visible says the press landed")
        if not busy["live"]:
            failures.append("nothing was announced when the load began")

        ev(ws, "document.getElementById('bFull').click()")
        time.sleep(0.4)
        if hits["vectors"] > 1:
            failures.append(f"two presses started {hits['vectors']} downloads of "
                            f"vectors.json — the handler has no re-entry guard, so an "
                            f"impatient visitor pays 3.8 MB per press")

        # 4. the completion announcement counts what was drawn
        for _ in range(40):
            time.sleep(0.5)
            done = ev(ws, STATE)
            if done["busy"] is None:
                break
        print(f"  done     {done['dots']} points, button hidden={done.get('hidden')}")
        print(f"           announced {done['live'][:62]!r}")
        # the control is one-shot now: it draws the full cloud and takes itself
        # away, because a button that has already done its only job is a button
        # asking to be pressed again for nothing
        if done.get("hidden") is not True or done["dots"] <= base_dots:
            failures.append(f"the full cloud never arrived: button hidden={done.get('hidden')}, "
                            f"{done['dots']} points against {base_dots} before")
        else:
            shown = f"{done['dots']:,}"
            # the button's own completion line, found in the SEQUENCE rather than in
            # whatever is left in the region: a second announcer writes after it and
            # replaces it, and reading only the final value let this pass with the
            # counted line deleted
            mine = [s for s in (done.get("said") or []) if s.startswith("Full cloud drawn")]
            if not mine:
                failures.append(
                    f"the button never announced its own completion — the region ended "
                    f"holding {done['live'][:60]!r}, which is the interval watcher, and "
                    f"that gives up after about 20s, so on a slow link nothing says the "
                    f"load finished")
            elif shown not in mine[-1]:
                failures.append(
                    f"the completion announcement says {mine[-1][:70]!r} while {shown} "
                    f"points were drawn — it is carrying a number rather than counting "
                    f"the one on screen")

        # 3. pressing again, once loaded, must not re-fetch
        before_third = hits["vectors"]
        ev(ws, "document.getElementById('bFull').click()")
        time.sleep(1.0)
        if hits["vectors"] > before_third:
            failures.append("pressing the button after it had already loaded fetched "
                            "vectors.json again — loadFull is not memoised")
        print(f"  requests {hits['vectors']} for three presses")

        # 5. a failure on the SECOND fetch must leave the map alone
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(4.5)
        ws.call("Network.setBlockedURLs", {"urls": ["*embedding_map_points_limited.json*"]})
        pre = ev(ws, STATE)
        ev(ws, "document.getElementById('bFull').click()")
        for _ in range(40):
            time.sleep(0.5)
            post = ev(ws, STATE)
            if post["busy"] is None:
                break
        ws.call("Network.setBlockedURLs", {"urls": []})
        print(f"\n  second fetch blocked: {pre['dots']} -> {post['dots']} points, "
              f"class {post['cls']!r}")
        print(f"           announced {post['live'][:62]!r}")
        if post["dots"] != pre["dots"]:
            failures.append(
                f"a failure partway through left the map at {post['dots']} points "
                f"instead of {pre['dots']} — the swap is not atomic, so a half-loaded "
                f"cloud is on screen while every label denies it")
        if post["cls"] == "on":
            failures.append("the button reads loaded after a failed load")
        if "could not" not in post["live"].lower():
            failures.append(f"a failed load announced {post['live'][:70]!r} — a visitor "
                            f"who cannot see the map is told nothing went wrong")
    except SystemExit:
        pass
    finally:
        if ws:
            ws.close()
        proc.kill()
        httpd.shutdown()

    if failures:
        print(f"\nFAIL — {len(failures)} problem(s) on the landing page:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — the map control says it is working, downloads once, counts what it drew, "
          "and leaves the map alone when it fails")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
