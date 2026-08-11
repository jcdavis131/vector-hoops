"""Pull the plug and see whether the game still plays.

`/play.html` prints "offline capable" on the Daily Q card. Nothing on this repo
had ever taken it offline, so the claim had never been true or false, only
printed. It was false:

    title    'Vector Hoops — Offline'
    question NO #q

The shell was three entries — `/`, `/offline`, `/manifest.json` — and `/play` was
not one of them, so the one page advertising offline play served the offline
notice instead.

Two things had to be right before that measurement meant anything.

  the server   `Network.emulateNetworkConditions {offline:true}` is per-target,
               and a service worker is its own target. The page went offline and
               the worker's own `fetch()` did not, so the first run reported a
               perfectly playable game — the worker was still talking to the
               server. Stopping the server is the only version of "the network is
               gone" that is true for every target at once.
  the headers  a bare SimpleHTTPRequestHandler sends no Cache-Control, so Chrome
               heuristically cached the HTML and served it offline on its own.
               Production sends `max-age=0, must-revalidate` on every .html,
               which forbids exactly that, and `immutable` on /assets/*, which
               genuinely does survive. Both are mirrored here from vercel.json:
               a server that serves a different site than production makes every
               offline measurement meaningless.

What this asserts:

  playable   offline, /play still has its question, its 1,305 suggestions, a
             loaded pool and a painted map
  fallback   a page the visitor has never opened still lands on /offline rather
             than the browser's error page
  data       no .json, .f32 or .bin is ever in the worker's cache — a stale model
             asset must never be served, and that exemption is the reason the
             fill is safe at all

    python scripts/smoke_offline.py
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

IMMUTABLE = ("json", "js", "css", "png", "webp", "svg", "woff2", "f32", "bin")

STATE = """(function(){
  var q=document.getElementById('q'), dl=document.getElementById('guessList');
  var c=document.getElementById('c'), ink=0;
  try{ var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    for(var i=0;i<d.length;i+=4){
      if(Math.abs(d[i]-10)>6||Math.abs(d[i+1]-12)>6||Math.abs(d[i+2]-16)>6) ink++; } }catch(e){}
  return JSON.stringify({
    title:document.title.slice(0,40),
    question:(q?(q.textContent||'').trim():'').slice(0,52),
    names:dl?dl.querySelectorAll('option').length:-1,
    pool:(typeof MODERN!=='undefined')?MODERN.length:-1,
    ink:ink,
    controlled:!!(navigator.serviceWorker&&navigator.serviceWorker.controller)});
})()"""

HELD = """(async () => {
  const ks = await caches.keys();
  const out = [];
  for (const k of ks) {
    const c = await caches.open(k);
    for (const r of await c.keys()) {
      const u = new URL(r.url);
      out.push(u.pathname + u.search);
    }
  }
  return JSON.stringify({names: ks, paths: out.sort()});
})()"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                     "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


class Prod(http.server.SimpleHTTPRequestHandler):
    """vercel.json's cleanUrls and Cache-Control, both."""

    def log_message(self, *a):
        pass

    def do_GET(self):
        # cleanUrls redirects the .html form, and the redirect is the point: this
        # cache is keyed on the request URL, so a link written /model.html asks
        # for a URL the worker has never held even when /model is sitting in it.
        # Measured: /model.html cost two document requests online and landed on
        # the offline notice offline. Serving both forms with a 200 here would
        # hide that whole class of bug from every assertion below.
        p = self.path.split("?")[0]
        if p.endswith(".html") and (SERVE / p.lstrip("/")).exists():
            self.send_response(308)
            self.send_header("Location", p[: -len(".html")])
            self.send_header("Cache-Control", "public, max-age=0, must-revalidate")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        p = self.path.split("?")[0]
        if p.startswith("/assets/") and p.rsplit(".", 1)[-1] in IMMUTABLE:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        elif p == "/manifest.json":
            self.send_header("Cache-Control", "public, max-age=3600")
        else:
            self.send_header("Cache-Control", "public, max-age=0, must-revalidate")
        super().end_headers()

    def translate_path(self, path):
        p = super().translate_path(path)
        if not Path(p).exists() and not path.endswith("/"):
            alt = Path(p + ".html")
            if alt.exists():
                return str(alt)
        return p

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            self.close_connection = True


SITE = """(function(){
  var b=document.body;
  return JSON.stringify({
    title: document.title,
    dom:   document.documentElement.outerHTML.length,
    text:  b ? (b.innerText||'').replace(/\\s+/g,' ').trim().length : 0,
    nodes: document.getElementsByTagName('*').length});
})()"""


def walk(ws, base, pages, label):
    """Visit every page and report what it actually put on screen."""
    out = {}
    for name in pages:
        ws.call("Page.navigate", {"url": f"{base}/{name}"})
        # Scroll, then settle - neither is optional. A fixed 2.4s wait reported
        # /model at 69% of its own online DOM on one run and 100% on the next
        # two: 3,571 nodes, simply not finished. And /teams boots its lower
        # cards on an IntersectionObserver, so without a scroll they render or
        # not depending on timing rather than on the network - which is what
        # this is supposed to be measuring. smoke_settled already scrolls for
        # the same reason.
        time.sleep(0.3)
        ev(ws, "window.scrollTo(0, document.body.scrollHeight)")
        stable, prev, d = 0, -1, None
        for _ in range(40):
            time.sleep(0.3)
            d = ev(ws, SITE)
            now = d["dom"] if isinstance(d, dict) else -1
            stable = stable + 1 if (now == prev and now) else 0
            prev = now
            if stable >= 3:          # unchanged for ~0.9s
                break
        if not isinstance(d, dict):
            d = {"title": "", "dom": 0, "text": 0, "nodes": 0}
        out[name] = d
        print(f"  {label:<7} {('/' + name) or '/':<24} {d['dom']:>8,} b  {d['text']:>6,} chars  "
              f"{d['title'][:30]!r}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", action="store_true",
                    help="warm every page, pull the plug, then revisit every page")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); site = s.getsockname()[1]
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); cdp = s.getsockname()[1]
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(
        ("127.0.0.1", site), functools.partial(Prod, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    stopped = False

    profile = Path(tempfile.gettempdir()) / "vh-offline-smoke"
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

        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable")
        base = f"http://127.0.0.1:{site}"

        if args.site:
            # the CLEAN form, which is the only form the site ever links. The
            # first version of this walked brand.html and friends and reported
            # 17 of 18 pages dead offline - because vercel.json's cleanUrls 308s
            # the .html form and the worker refuses to cache a redirect, exactly
            # as it should. The test was asking for URLs no visitor ever asks
            # for. That the failure looked total is what made it obvious.
            pages = []
            for q in sorted(SERVE.glob("*.html")):
                pages.append("" if q.stem == "index" else q.stem)
            print(f"warming {len(pages)} page(s), then pulling the plug\n")
            # twice: the first visit installs the worker, and only from the
            # second is it controlling the page it is meant to be caching
            walk(ws, base, pages, "warm")
            on = walk(ws, base, pages, "online")

            httpd.shutdown(); httpd.server_close(); stopped = True
            time.sleep(0.6)
            print()
            off = walk(ws, base, pages, "offline")

            print()
            for name in pages:
                a, b = on[name], off[name]
                if not a["dom"]:
                    failures.append(f"{name} rendered nothing even online — the plug was never "
                                    f"the problem")
                    continue
                if "offline" in b["title"].lower() and name != "offline":
                    failures.append(f"offline, {name} serves the offline notice "
                                    f"({b['title']!r}) — the worker cached it under a URL this "
                                    f"link never asks for, or did not cache it at all")
                    continue
                # each page against ITSELF online, so there is no threshold to
                # go stale as the pages grow
                share = b["dom"] / a["dom"] if a["dom"] else 0
                if share < 0.9:
                    failures.append(f"offline, {name} renders {b['dom']:,} bytes of DOM against "
                                    f"{a['dom']:,} online ({share:.0%}) — something it needs is "
                                    f"not in any cache")
                elif b["text"] < a["text"] * 0.9:
                    failures.append(f"offline, {name} shows {b['text']:,} characters against "
                                    f"{a['text']:,} online — the shell came back and the content "
                                    f"did not")
            worst = min(((off[n]["dom"] / on[n]["dom"]) if on[n]["dom"] else 0) for n in pages)
            print(f"  every page came back at {worst:.0%} of its online DOM or better")
            if failures:
                print()
                print(f"FAIL — {len(failures)} page(s) do not survive the plug:")
                for f in failures:
                    print(f"  - {f}")
                return 1
            print()
            print(f"OK — all {len(pages)} pages come back with the network gone, each within "
                  f"10% of the DOM it rendered online")
            return 0

        print("pulling the plug on /play\n")

        # first visit installs the worker; the second is the first one it controls
        ws.call("Page.navigate", {"url": f"{base}/play"})
        time.sleep(6)
        ws.call("Page.navigate", {"url": f"{base}/play"})
        time.sleep(6)
        online = ev(ws, STATE)
        print(f"  online   controlled={online['controlled']} "
              f"question={online['question'][:34]!r} names={online['names']} "
              f"pool={online['pool']} ink={online['ink']}")
        if not online.get("controlled"):
            failures.append("no service worker is controlling /play after two visits, so "
                            "nothing below is a test of anything")
        if not online.get("question"):
            failures.append("/play has no question even online — the plug was never the problem")

        held = ev(ws, HELD)
        data = [p for p in held["paths"] if p.split("?")[0].endswith((".json", ".f32", ".bin"))]
        data = [p for p in data if p.split("?")[0] != "/manifest.json"]
        print(f"  cache    {held['names']} holds {len(held['paths'])} entries, "
              f"{len(data)} of them data files")
        if data:
            failures.append(f"the worker cached {data[:3]} — .json, .f32 and .bin are exempt "
                            f"precisely so a stale model asset can never be served, and a "
                            f"network-first worker that holds data can serve it when the "
                            f"network is merely slow")

        # the only version of offline that is true for every target at once
        httpd.shutdown(); httpd.server_close(); stopped = True
        time.sleep(0.5)

        ws.call("Page.navigate", {"url": f"{base}/play"})
        time.sleep(6)
        off = ev(ws, STATE)
        print(f"  offline  title={off['title'][:30]!r} question={off['question'][:34]!r} "
              f"names={off['names']} pool={off['pool']} ink={off['ink']}")
        if not off.get("question"):
            failures.append(f"offline, /play serves {off['title']!r} with no question — the "
                            f"Daily Q card advertises offline play and there is no game "
                            f"behind it")
        else:
            if off.get("names", 0) < 1:
                failures.append("offline, the guess box offers no suggestions at all — the "
                                "only control in the game, against a pool of names nobody "
                                "can be expected to type blind")
            if off.get("pool", 0) < 1:
                failures.append("offline, the player pool is empty, so there is nothing to "
                                "score a guess against")
            if off.get("ink", 0) < 1:
                failures.append("offline, the map canvas is blank — the brief centres this "
                                "game on the embedding map")

        # a page never visited has nothing cached under its own URL, and has to
        # land somewhere deliberate rather than on the browser's error page
        ws.call("Page.navigate", {"url": f"{base}/teams"})
        time.sleep(3)
        land = ev(ws, "JSON.stringify({t:document.title.slice(0,40),"
                      "b:(document.body?document.body.innerText:'').trim().slice(0,40)})")
        print(f"  unseen   /teams offline lands on {land['t']!r}")
        if not land.get("t") or "offline" not in (land["t"] + land["b"]).lower():
            failures.append(f"a page the visitor has never opened lands offline on "
                            f"{land.get('t')!r} rather than the offline notice — the "
                            f"fallback chain in sw.js is what that page is for")

    except SystemExit:
        pass
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        if not stopped:
            try:
                httpd.shutdown(); httpd.server_close()
            except Exception:
                pass

    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s) with the link down:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — with the server stopped the game still plays: the question, the "
          "suggestions, the pool and the map all survive, an unvisited page lands on "
          "the offline notice, and no data file is in the worker's cache")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
