"""Play a round of the game. Nothing on this site has ever done that.

The brief puts gameplay first, and it was the least tested thing here. Eight
checkers covered structure, contrast, focus order, phone widths, weight and
console cleanliness; `smoke_render.py` visits /play.html and asserts the string
"DUMB MODEL" appears. That is the page rendering, not the game working. A guess
that scored NaN, a target that never drew, a miss path that threw — all of it
would have sailed through every gate on the repo.

So this one plays:

  map       the point cloud actually painted, counted in pixels on the canvas
            rather than inferred from the fetch. `installRealMap` guards its
            draw with `typeof poolObj.x === 'number'` and skips silently, so
            "play on the map" can degrade to "cloud with no target" — or to no
            cloud at all — without a single error in the console.
  question  a past player is being asked about, and it carries map coordinates
  miss      a deliberately bad guess. This path had never run under any gate,
            and it is the one that touches `pulseRing2()` and `#play-a-101`.
  hit       the best guess available, which has to advance the pack
  numbers   cos within [-1,1], dist within [0,2], no "NaN" on screen, and no
            more than two decimals shown to a user
  console   no page error at any point in the session

Nothing here is hardcoded to a player or a score. The pack is date-seeded — a
fixture guess would rot by tomorrow — so both guesses are derived in-page from
the pool that is actually loaded: argmax cosine for the hit, argmin for the miss.

Both wirings get exercised: Enter on the input for one guess, the Go button for
the other, dispatched as real key and mouse events through CDP. Calling `guess()`
directly would pass with the listeners unhooked.

    python scripts/smoke_play.py
    python scripts/smoke_play.py --keep     (leave the browser open on failure)
"""

from __future__ import annotations

import argparse
import functools
import http.server
import importlib.util
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
PAGE = "/play.html"

# the readout this prints contains the game's own glyphs, and a Windows console
# defaults to cp1252 — without this the test dies on the lock symbol it is
# supposed to be reporting
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_spec = importlib.util.spec_from_file_location("cv", ROOT / "scripts" / "check_viewport.py")
_cv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cv)
WS, BROWSERS = _cv.WS, _cv.BROWSERS

# Installed before any page script runs, so nothing is missed during load.
# WS.call() drops frames it did not ask for, which means CDP console events go
# on the floor — collecting in-page is both simpler and more complete.
COLLECT = """
window.__vhErr = [];
addEventListener('error', function (e) {
  __vhErr.push('error: ' + (e.message || (e.error && e.error.message) || e.type));
});
addEventListener('unhandledrejection', function (e) {
  __vhErr.push('rejection: ' + ((e.reason && e.reason.message) || e.reason));
});
(function () {
  var ce = console.error;
  console.error = function () {
    __vhErr.push('console.error: ' + Array.prototype.join.call(arguments, ' '));
    return ce.apply(console, arguments);
  };
})();
"""

# The background installRealMap paints before anything else. Pixels that differ
# from it are cloud points, rings and the guess line — the map actually drawn.
CANVAS_INK = """(() => {
  const c = document.getElementById('c');
  if (!c) return JSON.stringify({err: 'no #c canvas'});
  const w = c.width, h = c.height;
  if (!w || !h) return JSON.stringify({err: 'canvas has zero backing size'});
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - 10) > 6 || Math.abs(d[i+1] - 12) > 6 || Math.abs(d[i+2] - 16) > 6) ink++;
  }
  return JSON.stringify({w: w, h: h, ink: ink, px: (w * h)});
})()"""

# argmax and argmin cosine against the player actually being asked about
PICK = """(() => {
  if (typeof cur === 'undefined' || !cur) return JSON.stringify({err: 'no current question'});
  if (typeof MODERN === 'undefined' || !MODERN.length) return JSON.stringify({err: 'MODERN pool empty'});
  // explicit nulls: JSON.stringify drops keys whose value is undefined, and a
  // missing coordinate is exactly what this is looking for — it must survive
  // the round trip as a value, not vanish into a KeyError
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const at = (o, s) => ({n: o.n, s: s, x: num(o.x), y: num(o.y)});
  let best = null, worst = null;
  for (const m of MODERN) {
    const s = cos(cur.v, m.v);
    if (!best || s > best.s) best = at(m, s);
    if (!worst || s < worst.s) worst = at(m, s);
  }
  return JSON.stringify({
    target: {n: cur.n, x: num(cur.x), y: num(cur.y), dims: (cur.v && cur.v.length) || 0,
             keys: Object.keys(cur).join(',')},
    best: best, worst: worst, pool: MODERN.length, idx: idx, seqLen: seq.length
  });
})()"""


def ev(ws, expr, by_value=True):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": by_value,
                                     "awaitPromise": False})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def type_guess(ws, name: str):
    """Put a name in the box the way a person would leave it there."""
    ws.call("Runtime.evaluate", {"expression":
        f"(() => {{ const g = document.getElementById('guess');"
        f" g.focus(); g.value = {json.dumps(name)};"
        f" g.dispatchEvent(new Event('input', {{bubbles: true}})); return true; }})()"})


def press_enter(ws):
    for t in ("rawKeyDown", "char", "keyUp"):
        p = {"type": t, "key": "Enter", "code": "Enter",
             "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
        if t == "char":
            p["text"] = "\r"
        ws.call("Input.dispatchKeyEvent", p)


def click_go(ws):
    box = ev(ws, """(() => { const b = document.getElementById('go');
      if (!b) return JSON.stringify({err: 'no #go button'});
      const r = b.getBoundingClientRect();
      return JSON.stringify({x: r.left + r.width / 2, y: r.top + r.height / 2}); })()""")
    if not isinstance(box, dict) or "err" in box:
        return box if isinstance(box, dict) else {"err": "bad #go box"}
    for t in ("mousePressed", "mouseReleased"):
        ws.call("Input.dispatchMouseEvent", {"type": t, "x": box["x"], "y": box["y"],
                                             "button": "left", "clickCount": 1})
    return {}


def errs_of(ws) -> list[str]:
    """Whatever the page collected, as strings — an entry can be an object."""
    got = ev(ws, "JSON.stringify(window.__vhErr || [])")
    if isinstance(got, dict):
        got = [got]
    if not isinstance(got, list):
        got = [got] if got else []
    return [e if isinstance(e, str) else json.dumps(e, default=str) for e in got]


def stable_ink(ws, deadline=15.0, poll=0.4):
    """Read the canvas once it has stopped changing.

    The cloud arrives from a fetch and repaints when it lands, so reading once
    after load is a race: the same page measured 10,117 non-background pixels on
    one run and 5,182 on the next, with only an unrelated edit in between. A
    number that moves like that cannot be asserted on. This waits for two equal
    consecutive reads instead of guessing a sleep long enough.
    """
    end, last, seen = time.time() + deadline, None, None
    while time.time() < end:
        got = ev(ws, CANVAS_INK)
        if not isinstance(got, dict) or "err" in got:
            return got
        if last is not None and got.get("ink") == last:
            return got
        last, seen = got.get("ink"), got
        time.sleep(poll)
    return seen or {"err": "canvas never settled"}


def wait_for(ws, expr, deadline=10.0, poll=0.25):
    end = time.time() + deadline
    while time.time() < end:
        if ev(ws, expr) is True:
            return True
        time.sleep(poll)
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="leave the browser running on failure")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def handle_one_request(self):
            try:
                super().handle_one_request()
            except ConnectionResetError:
                self.close_connection = True

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); site = s.getsockname()[1]
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); cdp = s.getsockname()[1]

    # a fresh profile every run: vh_weekStreak lives in localStorage and would
    # otherwise carry yesterday's streak into today's assertions
    profile = Path(tempfile.gettempdir()) / "vh-play"
    shutil.rmtree(profile, ignore_errors=True)

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", site), functools.partial(Quiet, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
         "--no-default-browser-check", "--window-size=1280,1400",
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
        ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": COLLECT})
        print(f"playing {PAGE} in {browser.name}\n")

        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})

        # the pack is set up asynchronously; wait for a question rather than sleep
        if not wait_for(ws, "typeof cur !== 'undefined' && !!cur && !!cur.n", 15):
            failures.append("no question was ever asked — `cur` never got a player")
            raise SystemExit  # nothing below can mean anything

        # 1. the map
        ink = stable_ink(ws)
        if not isinstance(ink, dict) or "err" in ink:
            failures.append(f"canvas: {ink.get('err') if isinstance(ink, dict) else ink}")
        else:
            print(f"  canvas   {ink['w']}x{ink['h']}, {ink['ink']} non-background pixels")
            if ink["ink"] < 1000:
                failures.append(
                    f"the map did not paint — only {ink['ink']} non-background pixels on a "
                    f"{ink['w']}x{ink['h']} canvas. A cloud of a few thousand points cannot "
                    f"be that faint, so either the fetch failed or the draw was skipped")

        # 2. the question, and whether it can be placed on the map at all
        p = ev(ws, PICK)
        if not isinstance(p, dict) or "err" in p:
            failures.append(f"pool: {p.get('err') if isinstance(p, dict) else p}")
            raise SystemExit
        t = p["target"]
        print(f"  question {t['n']!r} - {t['dims']}d vector, map coords "
              f"({t['x']}, {t['y']}) | pool {p['pool']} modern seasons")
        print(f"  fields   {t['keys']}")
        for label, o in (("the past player being asked about", t),
                         ("the best modern match", p["best"]),
                         ("the worst modern match", p["worst"])):
            if not isinstance(o.get("x"), (int, float)) or not isinstance(o.get("y"), (int, float)):
                failures.append(
                    f"{label} ({o['n']!r}) has no map coordinates - drawBase guards on "
                    f"typeof x === 'number' and skips silently, so it is never drawn on "
                    f"the map the game is supposed to be played on")

        print(f"  best     {p['best']['n']!r} cos {p['best']['s']:.2f}")
        print(f"  worst    {p['worst']['n']!r} cos {p['worst']['s']:.2f}")
        if p["best"]["s"] <= 0.76:
            failures.append(
                f"no guess in the pool can score a hit — the best available is "
                f"{p['best']['n']!r} at cos {p['best']['s']:.2f} and the threshold is 0.76, "
                f"so this round is unwinnable")

        # 3. the suggestions. #guess is <input list=guessList>, so a player is
        #    told the box will help them. It shipped pointing at an empty
        #    <datalist> that nothing ever filled — 1,305 names in the pool and
        #    no way to see any of them, while pickModern's substring fallback
        #    quietly resolves a half-remembered name to the wrong player.
        opts = ev(ws, "document.querySelectorAll('#guessList option').length")
        print(f"  suggest  {opts} of {p['pool']} modern names offered")
        if not isinstance(opts, int) or opts < p["pool"]:
            failures.append(
                f"the guess box advertises a datalist but only {opts} of {p['pool']} "
                f"modern names are in it — every name the game will accept has to be "
                f"suggestable, or a player is typing blind")

        # 4. the miss path, which nothing has ever run
        ws.call("Runtime.evaluate", {"expression": "window.__vhErr = []"})
        idx_before = ev(ws, "idx")
        type_guess(ws, p["worst"]["n"])
        press_enter(ws)
        time.sleep(0.6)
        errs = errs_of(ws)
        if errs:
            failures.append(f"a missed guess threw: {'; '.join(errs)[:200]}")
        dist_miss = ev(ws, "document.getElementById('dist').textContent")
        print(f"  miss     {str(dist_miss)[:74]!r}")
        if not dist_miss:
            failures.append("a missed guess produced no feedback in #dist — "
                            "the Enter listener may not be wired")
        elif "No modern player matches" in str(dist_miss):
            failures.append(f"the game did not recognise {p['worst']['n']!r}, a name taken "
                            f"straight out of its own MODERN pool")
        if ev(ws, "idx") != idx_before:
            failures.append("a missed guess advanced the pack — a miss must not score")

        # 4. the hit path, through the other wiring
        ws.call("Runtime.evaluate", {"expression": "window.__vhErr = []"})
        type_guess(ws, p["best"]["n"])
        err = click_go(ws)
        if err:
            failures.append(f"#go button: {err.get('err')}")
        advanced = wait_for(ws, f"idx > {idx_before}", 12)
        dist_hit = ev(ws, "document.getElementById('dist').textContent")
        print(f"  hit      {str(dist_hit)[:74]!r}")
        errs = errs_of(ws)
        if errs:
            failures.append(f"a scoring guess threw: {'; '.join(errs)[:200]}")
        if not advanced:
            failures.append(
                f"the best guess in the pool ({p['best']['n']!r}, cos {p['best']['s']:.2f}) "
                f"did not advance the pack within 12s — either the Go button is unwired or "
                f"the trajectory animation never resolves")

        # 5. what the win actually drew. Advancing the pack is not the same as
        #    telling the truth: the trajectory cache is keyed by NBA player_id,
        #    and a pool row carrying the wrong id misses it and falls through to
        #    synthTraj, which invents seasons from 1996-97 and teams 'SA0'..'SA6'.
        #    Printed beside a 2024-25 player those chips assert a career that did
        #    not happen, so either they match the guess's era or they say plainly
        #    that the path is illustrative.
        chips = str(ev(ws, "document.getElementById('trajChips').textContent") or "")
        import re as _re
        # chips render with no separator between them, so the text arrives as
        # "2008-092009-102010-11..." and a \b-anchored year pattern only ever
        # matches the first one. Match the season shape instead.
        years = [int(y) for y in _re.findall(r"(\d{4})-\d{2}", chips)]
        print(f"  chips    {len(years)} seasons"
              + (f", {min(years)}-{max(years)}" if years else f" {chips[:60]!r}"))
        guess_year = next((int(y) for y in _re.findall(r"(\d{4})-\d{2}", p["best"]["n"])), None)
        if not chips.strip():
            failures.append("the win drew no season chips at all")
        elif "illustrative" not in chips.lower():
            if not years:
                failures.append(f"season chips carry no seasons and are not labelled "
                                f"illustrative: {chips[:80]!r}")
            elif guess_year and max(years) < guess_year - 6:
                failures.append(
                    f"the win on {p['best']['n']!r} drew season chips ending in {max(years)} "
                    f"— a fabricated career printed as a real one. Either resolve the real "
                    f"trajectory or label the path illustrative")

        # 6. the numbers a player is shown
        for label, s in (("miss", str(dist_miss or "")), ("hit", str(dist_hit or ""))):
            if "NaN" in s:
                failures.append(f"the {label} readout shows NaN: {s[:90]!r}")
            import re as _re
            for m in _re.finditer(r"(dist|cos)\s+(-?\d+\.?(\d*))", s):
                val, decimals = float(m.group(2)), len(m.group(3))
                lo, hi = (0.0, 2.0) if m.group(1) == "dist" else (-1.0, 1.0)
                if not lo - 1e-9 <= val <= hi + 1e-9:
                    failures.append(f"{label}: {m.group(1)} {val} is outside [{lo}, {hi}]")
                if decimals > 2:
                    failures.append(f"{label}: {m.group(1)} {m.group(2)} shows {decimals} "
                                    f"decimals — a player is never shown more than two")

        # 7. the whole session
        errs = errs_of(ws)
        if errs:
            failures.append(f"page errors during play: {'; '.join(errs)[:200]}")

    except SystemExit:
        pass
    finally:
        if ws and not (failures and args.keep):
            ws.close()
        if not (failures and args.keep):
            proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s) playing the game:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — the game plays: the map paints, a miss is refused without throwing, "
          "the best guess scores and advances the pack, and every number shown is in range")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
