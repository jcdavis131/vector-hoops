"""What still moves when a visitor has asked for less motion.

`prefers-reduced-motion: reduce` is an accessibility setting, not a preference
about taste: for some people motion causes nausea, migraine or vertigo. This
site's rule is that every animation sits behind that query, and until now nothing
checked it — the rule was enforced by remembering it, which is how a rule stops
being true one page at a time.

Grepping for `animation:` is not the check. It misses `@keyframes` applied
through a longhand property, anything in an external stylesheet, every
`element.animate()` call, and the whole class of motion this site is actually
built from: `requestAnimationFrame` loops painting a canvas. The landing map
spins in a rAF loop, and there is no CSS anywhere that says so.

So this asks the browser instead, with the media feature emulated:

  animations   document.getAnimations() — CSS animations, CSS transitions and
               Web Animations alike, whatever declared them. One still running
               after the page has settled, and set to repeat, is motion that
               never stops.
  canvas       every canvas painted twice, ~900ms apart, compared byte for byte.
               A rAF loop that is still moving the picture shows up here and
               nowhere else.

A canvas that differs is not automatically a fault — a page may legitimately
paint once more after a late fetch — so the two captures are taken well after
the page has settled, and the check is that the picture has come to rest.

    python scripts/check_motion.py
    python scripts/check_motion.py --page index
    python scripts/check_motion.py --mutate spin      # expect FAIL
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

# /trends keeps its map behind a button, so the motion it could make is not
# reachable until something presses it.
DEFER = {"trends": "smLoad"}

# Ignoring the rule on purpose, to prove the check can see it: map-camera.js
# turns its own auto-rotation off when the media query matches. Putting that
# back is exactly the fault this exists to catch.
MUTATIONS = {
    "spin": ("assets/map-camera.js",
             "if (cam.reduce) cam.spin = false;",
             "if (cam.reduce) cam.spin = true;"),
}

ANIMS = """(function(){
  if (!document.getAnimations) return {unsupported:true};
  var out = [];
  document.getAnimations().forEach(function(a){
    if (a.playState !== 'running') return;
    var e = a.effect, t = e && e.getTiming ? e.getTiming() : {};
    var iters = t.iterations;
    var dur = typeof t.duration === 'number' ? t.duration : 0;
    /* a finite animation that is nearly over is a page settling, not motion a
       visitor has to sit through; an infinite one never settles */
    if (iters !== Infinity && iters !== null && dur < 1200) return;
    var tgt = e && e.target;
    out.push({
      name: a.animationName || a.transitionProperty || 'animation',
      el: tgt ? (tgt.tagName || '') + (tgt.id ? '#' + tgt.id : '') : '?',
      iters: iters === Infinity ? 'infinite' : iters,
      dur: dur
    });
  });
  return {list: out.slice(0, 8), n: out.length};
})()"""

SHOOT = """(function(){
  var out = [], cs = document.querySelectorAll('canvas');
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i];
    if (!c.width || !c.height) { out.push(null); continue; }
    var r = c.getBoundingClientRect();
    if (!r.width || !r.height) { out.push(null); continue; }   /* not displayed */
    try { out.push(c.id + '|' + c.toDataURL().length + '|' + c.toDataURL().slice(-96)); }
    catch (e) { out.push(null); }
  }
  return out;
})()"""


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
        src = SERVE / rel
        text = src.read_text(encoding="utf-8")
        if find not in text:
            print(f"MUTATION DID NOT APPLY — {args.mutate!r} no longer matches: {find[:60]!r}")
            return 2
        patched["/" + rel] = text.replace(find, repl, 1).encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in patched:
                body = patched[path]
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
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

    profile = Path(tempfile.gettempdir()) / "vh-motion"
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
        ws.call("Emulation.setDeviceMetricsOverride", {
            "width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        # the whole point: without this the run measures the default, which is
        # 'no-preference', and every page passes for the wrong reason
        ws.call("Emulation.setEmulatedMedia", {
            "features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"prefers-reduced-motion: reduce{mut}\n")
        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}.html"})
            time.sleep(2.2)
            # confirm the emulation reached the page rather than assuming it: a
            # media query that did not apply makes every page below pass
            if not ev("matchMedia('(prefers-reduced-motion: reduce)').matches"):
                fails.append(f"/{name}: the page does not see the reduced-motion "
                             f"media query, so nothing below it was measured")
                continue
            if name in DEFER:
                for _ in range(25):
                    if ev(f"!!document.getElementById('{DEFER[name]}')"):
                        ev(f"document.getElementById('{DEFER[name]}').click()")
                        break
                    time.sleep(0.4)
            ev("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2.6)

            a = ev(ANIMS) or {}
            first = ev(SHOOT) or []
            time.sleep(0.9)
            second = ev(SHOOT) or []

            moving = [i for i, (x, y) in enumerate(zip(first, second))
                      if x and y and x != y]
            n_anim = a.get("n", 0)
            print(f"  /{name:<24} {len(first)} canvas · {n_anim} running animation(s)"
                  + (f" · MOVING: {moving}" if moving else ""))
            if n_anim:
                for it in a.get("list", []):
                    print(f"      {it['name']} on {it['el']} "
                          f"({it['iters']} iterations, {it['dur']}ms)")
                fails.append(f"/{name}: {n_anim} animation(s) still running under "
                             f"reduced motion, e.g. {a['list'][0]['name']} on "
                             f"{a['list'][0]['el']}")
            for i in moving:
                cid = (first[i] or "").split("|")[0] or f"canvas {i}"
                fails.append(f"/{name}: canvas '{cid}' is still repainting a "
                             f"different picture ~0.9s apart after the page settled "
                             f"— a visitor who asked for less motion is getting it")
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
        print(f"OK — with reduced motion asked for, {len(pages)} page(s) come to rest: "
              f"no repeating animation is left running and every canvas holds still")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
