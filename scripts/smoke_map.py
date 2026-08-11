"""Drive the landing map with real mouse and key events and read the camera back.

Every page on this site describes a map you can turn. Neither version of the
landing page bound a single gesture to it: this branch's spun on a timer and took
one click, and the version on master — whose commit message says "drag rotate
yaw/pitch, wheel zoom 0.55-2.8, dblclick recenter, touch pinch" — binds
**zero** `addEventListener` calls and seven `onclick=` attributes. A commit
message is not an interaction.

So this drives the real thing. `Input.dispatchMouseEvent` and
`Input.dispatchKeyEvent`, then `VHMapCamera.cams[0].yaw` / `.pitch` / `.zoom`
read back over CDP. A synthetic `element.dispatchEvent` would prove nothing here
for exactly the reason `element.focus()` proved nothing about focus rings: it is
a state the page only truly enters one way.

The camera is `assets/map-camera.js`, shared by every map on the site, so most
of the mutation matrix now lands in the module rather than in one page — one
matrix protects every map that attaches to it.

Checked:

  drag      a left-drag across the canvas moves yaw and pitch, and does NOT
            select — a rotate that also picks a player is not a rotate
  click     a click on a dot's projected position announces one short sentence
  keys      ArrowRight rotates, +/- zoom, 0 and Home reset, Space starts and
            stops the rotation and the button follows, H speaks the controls —
            all with the page not scrolling underneath
  clamp     zoom stops at 0.55x and 3x however many times you press
  wheel     ctrl+wheel zooms; a plain wheel does not, so the page still scrolls
  hover     the auto-spin yields under the pointer and resumes when it leaves
  reduce    under prefers-reduced-motion the spin starts off AND the button says so

Mutations are served, never written: the HTTP handler rewrites index.html and
assets/map-camera.js in flight, so a killed run cannot leave a mutated page in the checkout the way the
audit harness once left a 2,400px div in leaderboard.html.

    python scripts/smoke_map.py
    python scripts/smoke_map.py --mutate drag      # expect FAIL
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

# Each mutation deletes exactly one thing this smoke claims to prove. If a
# mutation runs green, the assertion behind it is decoration. Most of them now
# land in the shared camera, which is the point of extracting it: one matrix
# protects every map that attaches to it.
CAMERA, PAGE = "camera", "page"
MUTATIONS = {
    "drag":       (CAMERA, "cam.yaw += dx * 0.007", "cam.yaw += dx * 0"),
    "pitch":      (CAMERA, "cam.pitch = clamp(cam.pitch - dy * 0.005, -0.85, 0.85)",
                           "cam.pitch = clamp(cam.pitch - dy * 0, -0.85, 0.85)"),
    "clamp":      (CAMERA, "cam.zoom = clamp(v, 0.55, 3)", "cam.zoom = v"),
    "keys":       (CAMERA, "else if (k === 'ArrowRight') cam.yaw += step;",
                           "else if (k === 'ArrowRight') cam.yaw += 0;"),
    "hover":      (CAMERA, "!cam.hoverPause &&", ""),
    "wheel":      (CAMERA, "if (!(e.ctrlKey || e.metaKey)) return;",
                           "if (e.ctrlKey || e.metaKey) return;"),
    "reduce":     (CAMERA, "if (cam.reduce) cam.spin = false;", ";"),
    "drag-picks": (CAMERA, "if (cam.moved > 6) { cam.moved = 0; return; }", "if (false) {}"),
    "spin-key":   (CAMERA, "cam.spin = !!on;", ""),
    "help-key":   (CAMERA, "{ steer = false; cam.say(HELP); }", "{ steer = false; String(HELP); }"),
    "announce":   (PAGE,   "cam.say('Selected '", "String('Selected '"),
    "spin-glyph": (PAGE,   "b.textContent='rot '+(on?'◐':'□')", "b.textContent='rot ◐'"),
}

CAM = "VHMapCamera.cams[0]"
CTRL = 2


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                     "awaitPromise": False})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def key(ws, k, code=None, vk=0, text=None):
    base = {"key": k, "code": code or k, "windowsVirtualKeyCode": vk,
            "nativeVirtualKeyCode": vk}
    down = dict(base, type="keyDown" if text else "rawKeyDown")
    if text:
        down["text"] = text
    ws.call("Input.dispatchKeyEvent", down)
    ws.call("Input.dispatchKeyEvent", dict(base, type="keyUp"))
    time.sleep(0.045)


def mouse(ws, kind, x, y, buttons=0, mods=0, dy=0.0):
    p = {"type": kind, "x": round(x, 1), "y": round(y, 1), "button": "left",
         "buttons": buttons, "modifiers": mods, "clickCount": 1}
    if kind == "mouseWheel":
        p.update({"deltaX": 0, "deltaY": dy, "button": "none", "clickCount": 0})
    ws.call("Input.dispatchMouseEvent", p)
    time.sleep(0.035)


def canvas_box(ws):
    return ev(ws, """(function(){var c=document.getElementById('c');
        c.scrollIntoView({block:'center'});var r=c.getBoundingClientRect();
        return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height,W:window.W,H:window.H});})()""")


def dot_point(ws, box):
    """Viewport coords of a real dot, projected by the camera the page draws with."""
    return ev(ws, """(function(){
        if(!window.dots||!window.dots.length) return JSON.stringify({miss:true});
        var cam=VHMapCamera.cams[0];
        var best=null,bd=1e9,cx=window.W*0.5,cy=window.H*0.53;
        for(var i=0;i<window.dots.length;i++){var d=window.dots[i];var P=cam.proj(d.x,d.y,d.z);
          var q=(P[0]-cx)*(P[0]-cx)+(P[1]-cy)*(P[1]-cy);
          if(q<bd){bd=q;best={d:d,P:P};}}
        var r=document.getElementById('c').getBoundingClientRect();
        return JSON.stringify({x:r.left+best.P[0]*r.width/window.W,
                               y:r.top +best.P[1]*r.height/window.H, nm:best.d.nm});})()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS), help="serve one broken page")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    srcs = {"page": (SERVE / "index.html").read_text(encoding="utf-8"),
            "camera": (SERVE / "assets" / "map-camera.js").read_text(encoding="utf-8")}
    if args.mutate:
        where, find, repl = MUTATIONS[args.mutate]
        if find not in srcs[where]:
            sys.exit(f"mutation {args.mutate!r} no longer matches the {where}: {find!r}")
        srcs[where] = srcs[where].replace(find, repl, 1)
    BODIES = {"page": (srcs["page"].encode("utf-8"), "text/html; charset=utf-8"),
              "camera": (srcs["camera"].encode("utf-8"), "text/javascript; charset=utf-8")}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            which = ("page" if path in ("/", "/index.html", "/index")
                     else "camera" if path.endswith("/assets/map-camera.js") else None)
            if which:
                blob, ctype = BODIES[which]
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(blob)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(blob)
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

    profile = Path(tempfile.gettempdir()) / "vh-map"
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
        url = f"http://127.0.0.1:{site}/index.html"
        ws.call("Page.navigate", {"url": url})
        time.sleep(3.0)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"driving the landing map with real input in {browser.name}{mut}\n")

        box = canvas_box(ws)
        if not isinstance(box, dict) or not box.get("w"):
            sys.exit(f"could not measure the canvas: {box!r}")
        cx, cy = box["l"] + box["w"] / 2, box["t"] + box["h"] / 2

        # ── drag ──────────────────────────────────────────────────────────────
        ev(ws, CAM + ".spin=false")          # isolate the drag from the spin
        ev(ws, "document.getElementById('ixLive').textContent=''")
        # Counted, not assumed: releasing a drag on the same element still fires a
        # click, and "a drag must not select" is only a real assertion if that
        # click actually arrived and was turned away.
        ev(ws, "window.__mapClicks=0;document.getElementById('c')"
               ".addEventListener('click',function(){window.__mapClicks++;})")
        y0, p0 = ev(ws, CAM + ".yaw"), ev(ws, CAM + ".pitch")
        mouse(ws, "mousePressed", cx - 120, cy, buttons=1)
        for i in range(1, 7):
            mouse(ws, "mouseMoved", cx - 120 + i * 30, cy - i * 9, buttons=1)
        mouse(ws, "mouseReleased", cx + 60, cy - 54, buttons=0)
        time.sleep(0.15)
        y1, p1 = ev(ws, CAM + ".yaw"), ev(ws, CAM + ".pitch")
        clicks = ev(ws, "window.__mapClicks")
        live = ev(ws, "document.getElementById('ixLive').textContent") or ""
        print(f"  drag     yaw {y0:+.3f} -> {y1:+.3f}   pitch {p0:+.3f} -> {p1:+.3f}   "
              f"{clicks} click event(s) fired")
        if abs(y1 - y0) < 0.5:
            fails.append(f"a 180px left-drag moved yaw by {y1 - y0:+.3f} — the map does not rotate")
        if abs(p1 - p0) < 0.15:
            fails.append(f"the same drag moved pitch by {p1 - p0:+.3f} — vertical drag does nothing")
        if not clicks:
            fails.append("releasing the drag fired no click event, so 'a drag does not select' "
                         "is asserted against a state this run never entered")
        elif live.startswith("Selected"):
            fails.append(f"a drag selected a player ({live[:40]!r}) — a rotate is not a click")
        print(f"           after the drag the live region says {live[:44]!r}")

        # ── click selects ─────────────────────────────────────────────────────
        ev(ws, "document.getElementById('ixLive').textContent=''")
        hit = dot_point(ws, box)
        if isinstance(hit, dict) and not hit.get("miss"):
            mouse(ws, "mousePressed", hit["x"], hit["y"], buttons=1)
            mouse(ws, "mouseReleased", hit["x"], hit["y"], buttons=0)
            time.sleep(0.25)
            said = ev(ws, "document.getElementById('ixLive').textContent") or ""
            print(f"  click    {said[:60]!r}")
            if not said.startswith("Selected "):
                fails.append(f"clicking the dot nearest the centre announced {said[:60]!r}, "
                             f"not a selection")
            elif len(said) > 90:
                fails.append(f"the selection announcement is {len(said)} characters — a live "
                             f"region is one sentence, not a card")
        else:
            fails.append("the page exposed no dots to click")

        # ── keys ──────────────────────────────────────────────────────────────
        ev(ws, "document.getElementById('c').focus()")
        scroll0 = ev(ws, "window.scrollY")
        y0 = ev(ws, CAM + ".yaw")
        for _ in range(3):
            key(ws, "ArrowRight", "ArrowRight", 39)
        y1 = ev(ws, CAM + ".yaw")
        p0 = ev(ws, CAM + ".pitch")
        key(ws, "ArrowUp", "ArrowUp", 38)
        p1 = ev(ws, CAM + ".pitch")
        scroll1 = ev(ws, "window.scrollY")
        print(f"  keys     3x ArrowRight yaw {y0:+.3f} -> {y1:+.3f}, "
              f"ArrowUp pitch {p0:+.3f} -> {p1:+.3f}, scrollY {scroll0} -> {scroll1}")
        if y1 - y0 < 0.25:
            fails.append(f"three ArrowRight presses moved yaw by {y1 - y0:+.3f} — "
                         f"the keyboard path does not rotate")
        if p1 - p0 < 0.03:
            fails.append(f"ArrowUp moved pitch by {p1 - p0:+.3f}")
        if scroll1 != scroll0:
            fails.append("an arrow key on the focused map scrolled the page underneath it")

        # ── zoom, and its clamp ───────────────────────────────────────────────
        for _ in range(24):
            key(ws, "+", "Equal", 187, text="+")
        zmax = ev(ws, CAM + ".zoom")
        for _ in range(40):
            key(ws, "-", "Minus", 189, text="-")
        zmin = ev(ws, CAM + ".zoom")
        print(f"  clamp    24x '+' -> {zmax}x, then 40x '-' -> {zmin}x")
        if not 2.99 < zmax < 3.01:
            fails.append(f"zoom ran to {zmax} instead of stopping at 3")
        if not 0.54 < zmin < 0.56:
            fails.append(f"zoom ran down to {zmin} instead of stopping at 0.55")

        key(ws, "0", "Digit0", 48, text="0")
        rst = ev(ws, "JSON.stringify([" + CAM + ".yaw," + CAM + ".pitch," + CAM + ".zoom])")
        print(f"  reset    '0' -> yaw/pitch/zoom {rst}")
        if [round(v, 4) for v in rst] != [0, 0, 1]:
            fails.append(f"'0' left the camera at {rst}, not at rest")

        # ── Home resets too, Space toggles the spin, H speaks ────────────────
        ev(ws, CAM + ".yaw=1.4;" + CAM + ".zoom=2")
        key(ws, "Home", "Home", 36)
        home = ev(ws, "JSON.stringify([" + CAM + ".yaw," + CAM + ".zoom])")
        spin0 = ev(ws, CAM + ".spin")
        key(ws, " ", "Space", 32, text=" ")
        spin1 = ev(ws, CAM + ".spin")
        glyph = ev(ws, "document.getElementById('bRot').textContent")
        ev(ws, "document.getElementById('ixLive').textContent=''")
        key(ws, "h", "KeyH", 72, text="h")
        time.sleep(0.15)
        helped = ev(ws, "document.getElementById('ixLive').textContent") or ""
        print(f"  contract Home -> {home}, Space {spin0} -> {spin1} "
              f"(button {glyph!r}), H says {helped[:34]!r}")
        if [round(v, 4) for v in home] != [0, 1]:
            fails.append(f"Home left the camera at {home}, not at rest")
        if spin1 == spin0:
            fails.append("Space did not start or stop the automatic rotation")
        if glyph != ("rot ◐" if spin1 else "rot □"):
            fails.append(f"the spin is {spin1} but its button reads {glyph!r} — the control "
                         f"is lying about its own state")
        if "Map keys" not in helped:
            fails.append(f"H announced {helped[:40]!r} instead of the list of controls")
        key(ws, " ", "Space", 32, text=" ")     # put the spin back as it was

        # ── wheel: ctrl zooms, plain scrolls the page ────────────────────────
        z0, s0 = ev(ws, CAM + ".zoom"), ev(ws, "window.scrollY")
        mouse(ws, "mouseWheel", cx, cy, dy=240)
        time.sleep(0.2)
        zplain, s1 = ev(ws, CAM + ".zoom"), ev(ws, "window.scrollY")
        # that scroll moved the canvas out from under the cursor, which is the
        # point of it — re-measure before the ctrl wheel rather than aiming at
        # coordinates the page has already invalidated
        box = canvas_box(ws)
        cx, cy = box["l"] + box["w"] / 2, box["t"] + box["h"] / 2
        mouse(ws, "mouseWheel", cx, cy, dy=-240, mods=CTRL)
        time.sleep(0.15)
        zctrl = ev(ws, CAM + ".zoom")
        print(f"  wheel    plain {z0}x -> {zplain}x, scrollY {s0} -> {s1}   "
              f"ctrl+wheel -> {round(zctrl, 3)}x")
        if abs(zplain - z0) > 1e-9:
            fails.append("a plain wheel zoomed the map — that traps the page scroll")
        if s1 == s0:
            fails.append("a plain wheel over the map did not scroll the page")
        if zctrl - zplain < 0.15:
            fails.append(f"ctrl+wheel moved zoom by {zctrl - zplain:+.3f} — it does not zoom")

        # ── the spin yields to the pointer ────────────────────────────────────
        ev(ws, CAM + ".spin=true;" + CAM + ".userAt=-1e9")
        mouse(ws, "mouseMoved", box["l"] + box["w"] + 60, box["t"] - 60)   # leave first,
        time.sleep(0.1)
        mouse(ws, "mouseMoved", cx, cy)                                    # then enter
        time.sleep(0.1)
        a = ev(ws, CAM + ".yaw"); time.sleep(0.6); b = ev(ws, CAM + ".yaw")
        mouse(ws, "mouseMoved", box["l"] + box["w"] + 60, box["t"] - 60)
        time.sleep(0.1)
        c = ev(ws, CAM + ".yaw"); time.sleep(0.6); d = ev(ws, CAM + ".yaw")
        print(f"  hover    under the pointer {b - a:+.4f} rad in 0.6s, "
              f"off it {d - c:+.4f} rad")
        if abs(b - a) > 1e-6:
            fails.append(f"the map kept spinning under the pointer ({b - a:+.4f} rad) — "
                         f"hover naming flickers a new player every few frames")
        if abs(d - c) < 0.01:
            fails.append(f"the spin did not resume after the pointer left ({d - c:+.4f} rad)")

        # ── prefers-reduced-motion ────────────────────────────────────────────
        ws.call("Emulation.setEmulatedMedia",
                {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
        ws.call("Page.navigate", {"url": url + "?rm=1"})
        time.sleep(2.6)
        rf = ev(ws, CAM + ".spin")
        glyph = ev(ws, "document.getElementById('bRot').textContent")
        yA = ev(ws, CAM + ".yaw"); time.sleep(0.6); yB = ev(ws, CAM + ".yaw")
        print(f"  reduce   rotFlag {rf}, button says {glyph!r}, "
              f"yaw moved {yB - yA:+.4f} rad in 0.6s")
        if rf is not False:
            fails.append("prefers-reduced-motion: reduce and the map still auto-spins")
        if glyph != "rot □":
            fails.append(f"the spin is off but its button reads {glyph!r} — the control "
                         f"is lying about its own state")
        if abs(yB - yA) > 1e-6:
            fails.append(f"yaw advanced {yB - yA:+.4f} rad under reduced motion")
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
        print("OK — the map rotates under a real drag and real arrow keys, zooms within its "
              "clamp, picks without hijacking the page scroll, and holds still when asked")
        return 0
    print(f"FAIL — {len(fails)} problem(s) driving the landing map:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
