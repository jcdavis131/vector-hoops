"""What each page shows when its data is refused.

Every other gate here reads a page whose files arrived. smoke_mapload is the one
exception and it covers two pages. So this refuses every .json, .f32 and .bin at
the server and loads all nineteen — the state a visitor gets on a flaky link, a
bad deploy, or a CDN that has not caught up.

Run for the first time, two pages printed the word `undefined` to the reader:

  /players seeded its placeholder cloud — coordinates and nothing else, no name,
  no season, no pid — and then listed it: eighty rows of "undefined • pid
  undefined" under a line reading "80 of 1,764 shown". The map's own label
  already guarded on mapState and called them placeholders; the list did not.

  /lab printed "SHAP undefined · CV seed42." Optional chaining returns undefined
  when the file is missing and a template literal prints that word.

The rule is the objective half of this site's own standard: a page may say it
failed, may say nothing, may show less — it may not render a value it does not
have. `undefined`, `NaN`, `null`, `[object Object]` and `Infinity` are what a
missing value looks like once it reaches the DOM.

It reads innerText, never the text nodes. A TreeWalker sees <script> contents,
and script text is full of the word `undefined` for entirely good reasons; that
difference is what separated /lab's real defect from /players' false one in the
same output on the first run.

    python scripts/check_degraded.py
    python scripts/check_degraded.py --page players
    python scripts/check_degraded.py --mutate listghosts   # expect FAIL
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

# .json/.f32/.bin are what the service worker itself refuses to cache, so this is
# the same set the site already treats as "data, never stale". manifest.json is a
# PWA descriptor rather than model data and blocking it proves nothing.
DATA = re.compile(r"\.(json|f32|bin)$")

# Take the guard back out of /players' list and it renders the placeholder cloud
# as players again — the exact defect the first run found.
MUTATIONS = {
    "listghosts": ("players.html", "  if(mapState!=='real'){", "  if(false){"),
}

# What a missing value looks like once it has been written into the page.
GHOSTS = re.compile(r"\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]|\bInfinity\b")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page")
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    pages = sorted(p.stem for p in SERVE.glob("*.html"))
    if args.page:
        if args.page not in pages:
            sys.exit(f"no such page: {args.page}")
        pages = [args.page]

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    patched: dict[str, bytes] = {}
    if args.mutate:
        rel, find, repl = MUTATIONS[args.mutate]
        text = (SERVE / rel).read_text(encoding="utf-8")
        if text.count(find) != 1:
            print(f"MUTATION DID NOT APPLY — {args.mutate!r} matches {text.count(find)} "
                  f"times, needs exactly 1: {find!r}")
            return 2
        patched["/" + rel] = text.replace(find, repl, 1).encode("utf-8")

    blocked = {"n": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in patched:
                body = patched[path]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if DATA.search(path) and "manifest" not in path:
                blocked["n"] += 1
                self.send_error(503, "refused by check_degraded")
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

    profile = Path(tempfile.gettempdir()) / "vh-degraded"
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
        ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.enable")
        # the worker and the HTTP cache both sit between "the server refused it"
        # and "the page did not get it" — smoke_mapload learned this the hard way
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"every .json, .f32 and .bin refused{mut}\n")
        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}.html"})
            time.sleep(3.6)
            ev("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1.4)
            # innerText, never the text nodes: script contents are not read by
            # anyone and are full of these words for good reasons
            txt = ev("document.body.innerText || ''") or ""
            found = sorted(set(GHOSTS.findall(txt)))
            print(f"  /{name:<22} {len(txt):>6} chars rendered"
                  + (f"   shows {', '.join(found)}" if found else ""))
            # innerText is newline-heavy and `.` does not cross one, so the
            # excerpt collapsed to the bare word and said nothing about where it
            # is. Flatten first: a finding you cannot locate is half a finding.
            flat = " ".join(txt.split())
            for g in found:
                m = re.search(r".{0,70}" + re.escape(g) + r".{0,60}", flat)
                fails.append(f"/{name} renders {g!r} to the reader with its data refused: "
                             f"…{(m.group(0) if m else g).strip()}…")
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
        print(f"OK — {len(pages)} page(s) with {blocked['n']} data request(s) refused; "
              f"none renders a value it does not have")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
