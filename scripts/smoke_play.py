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
  suggest   every name the game will accept is in the datalist the guess box
            advertises. It shipped pointing at an empty one, so the only control
            in the game offered no help against 1,305 names.
  miss      a deliberately bad guess. This path had never run under any gate,
            and it is the one that touches `pulseRing2()` and `#play-a-101`.
  hit       the best guess available, which has to advance the pack
  chips     what the win actually drew. Advancing is not the same as telling the
            truth — a trajectory that misses the cache falls through to invented
            seasons, which must either match the guess's era or say they are
            illustrative.
  numbers   cos within [-1,1], dist within [0,2], no "NaN" on screen, and no
            more than two decimals shown to a user
  console   no page error at any point in the session

The canvas reading waits for two equal consecutive measurements. The cloud
arrives from a fetch and repaints when it lands, so a single read is a race: the
same page measured 10,117 non-background pixels on one run and 5,182 on the next.

What this cannot reach: the datalist popup is browser chrome, not DOM. That every
name is an `<option>` is checkable and checked; that the suggestions render while
typing, and that arrow-selecting one and pressing Enter scores the selected name
rather than the partial, needs a person. This test types the full exact name, so
that path is genuinely unexercised.

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

        # 1b. is anything painted ON TOP of the map?
        #     The ink count above reads the backing store, and a canvas can be
        #     fully painted and still invisible. play.html had a bare `canvas{}`
        #     rule giving every canvas an opaque background, and #trajOver is
        #     position:absolute;inset:0 over #c — so the overlay covered the map
        #     completely. The cloud, the pool layer, the crosshair, the guess ring
        #     and the line to the target were all drawn where nobody could see
        #     them, and getImageData reported every one of them as present.
        covers = ev(ws, """(() => {
          const base = document.getElementById('c');
          if (!base) return JSON.stringify({err: 'no #c'});
          const bad = [];
          for (const o of document.querySelectorAll('canvas, div, section')) {
            if (o === base || o.contains(base)) continue;
            const cs = getComputedStyle(o);
            if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
            const a = base.getBoundingClientRect(), b = o.getBoundingClientRect();
            // a zero-area target is "half covered" by everything, since the
            // threshold is also zero. The site's hidden share canvases are 0x0
            // and reported every sibling as covering them.
            if (a.width * a.height < 1) continue;
            const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (overlap < a.width * a.height * 0.5) continue;
            const opaqueColour = cs.backgroundColor &&
              !/rgba\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\)|transparent/.test(cs.backgroundColor);
            const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
            if (opaqueColour || hasImage)
              bad.push((o.id ? '#' + o.id : o.tagName.toLowerCase()) + ' bg=' +
                       cs.backgroundColor + (hasImage ? ' +image' : ''));
          }
          return JSON.stringify({bad: bad});
        })()""")
        if isinstance(covers, dict) and covers.get("bad"):
            failures.append(
                f"something opaque is layered over the map, so whatever is painted on "
                f"#c cannot be seen: {'; '.join(covers['bad'])[:160]}")

        # 1c. the map paints eight archetype colours, so eight names have to be
        #     readable somewhere. Colour-alone encoding is the thing this guards.
        key = ev(ws, """(() => {
          const k = document.getElementById('mapKey');
          if (!k) return JSON.stringify({missing: true});
          const items = [...k.querySelectorAll('li')].map(li => (li.textContent || '').trim());
          return JSON.stringify({n: items.length, blank: items.filter(t => !t).length,
                                 first: items[0] || ''});
        })()""")
        if not isinstance(key, dict) or key.get("missing"):
            failures.append("the map has no colour key — eight archetype colours are drawn "
                            "and nothing on the page says what any of them mean")
        else:
            print(f"  key      {key['n']} archetypes named, first {key['first']!r}")
            if key["n"] < 8 or key["blank"]:
                failures.append(f"the colour key has {key['n']} entries and {key['blank']} of them "
                                f"are blank — every colour drawn needs a name beside it")

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

        # 3b. picking a guess off the map. The pool is drawn as its own layer so
        #     that every hoverable mark is a season you can actually guess; this
        #     clicks one at its computed screen position and requires the guess
        #     box to end up holding that exact name.
        spot = ev(ws, """(() => {
          const m = vhMapXY(), r = c.getBoundingClientRect();
          const p = MODERN.find(q => typeof q.x === 'number');
          if (!p) return JSON.stringify({err: 'no modern row has coordinates'});
          return JSON.stringify({n: p.n, x: r.left + m.sx(p.x), y: r.top + m.sy(p.y)});
        })()""")
        if not isinstance(spot, dict) or "err" in spot:
            failures.append(f"map picker: {spot.get('err') if isinstance(spot, dict) else spot}")
        else:
            ws.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": spot["x"], "y": spot["y"]})
            for t in ("mousePressed", "mouseReleased"):
                ws.call("Input.dispatchMouseEvent", {"type": t, "x": spot["x"], "y": spot["y"],
                                                     "button": "left", "clickCount": 1})
            time.sleep(0.3)
            picked = ev(ws, "document.getElementById('guess').value")
            print(f"  pick     clicked {spot['n']!r} -> box holds {str(picked)!r}")
            if picked != spot["n"]:
                failures.append(
                    f"clicking {spot['n']!r} on the map left the guess box holding "
                    f"{str(picked)!r} — the hit-test and the draw disagree about where "
                    f"that player is, or the click is not wired")
            ws.call("Runtime.evaluate", {"expression":
                "(() => { const g = document.getElementById('guess'); g.value=''; return true })()"})

        # 3c. an ambiguous fragment has to admit it was ambiguous. pickModern
        #     breaks a substring tie by position in MODERN, which is array order
        #     rather than relevance — "curry" scores you against Seth, not
        #     Stephen. The pick stands; the alternatives are named so it reads as
        #     a pick. The season suffix is stripped first, so other seasons of the
        #     player already chosen are not counted as other people — a regex that
        #     silently failed to strip reported "giannis also matches 2 other
        #     players", all of them Giannis.
        amb = ev(ws, """(() => {
          const g = document.getElementById('guess');
          g.focus(); g.value = 'curry';
          return 1; })()""")
        press_enter(ws)
        time.sleep(0.5)
        shown = str(ev(ws, "document.getElementById('dist').textContent") or "")
        # What matters is that the fragment admits it was ambiguous and says who
        # else it could have meant. This used to assert the exact sentence
        # "also matches N other players", and when the copy was rewritten to
        # name them instead — "Also matches Seth Curry · … — type more to pick" —
        # the check went red on a page that had got BETTER. Naming beats
        # counting. So it asks the page which names the fragment matches, and
        # requires the message to carry one it did not score.
        amb_pool = ev(ws, """(() => {
            const seen = {}, out = [];
            // the datalist the page fills is the pool a player can actually type
            [].slice.call(document.querySelectorAll('#guessList option')).forEach(o => {
              const n = (o.value || '').replace(/\s+\d{4}-\d{2}$/, '');
              if (/curry/i.test(n) && !seen[n]) { seen[n] = 1; out.push(n); }
            });
            const b = document.querySelector('#dist b');
            return JSON.stringify({names: out,
                                   scored: b ? b.textContent.trim() : ''});})()""")
        names = (amb_pool or {}).get("names", []) if isinstance(amb_pool, dict) else []
        scored = (amb_pool or {}).get("scored", "") if isinstance(amb_pool, dict) else ""
        others = [n for n in names if n and n != scored]
        named = [n for n in others if n and n in shown]
        print(f"  ambiguous 'curry' -> scored {scored!r}, pool {names}, "
              f"message names {named}")
        if len(names) < 2:
            failures.append(f"'curry' matches {names} in this pool, so the ambiguity this "
                            f"checks for does not exist and the check proves nothing")
        elif not named:
            failures.append(f"typing 'curry' scored {scored!r} and never says it could have "
                            f"meant {others} — an ambiguous fragment must name what else it "
                            f"matched. The message read: {shown.strip()[:90]!r}")
        ws.call("Runtime.evaluate", {"expression":
            "(() => { const g=document.getElementById('guess'); g.value=''; return 1 })()"})

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

        # 4b. the miss has to reach a screen reader, and this is the only place
        #     that can prove it. #log is not a live region: measured over the
        #     accessibility tree, #vh-live was '' before a guess and '' after one
        #     while #log carried 'guess → AJ Griffin 2022-23 cos -0.67 ◐ • row
        #     11029'. A miss draws no result box, so nothing else writes to the
        #     region here — checking it after the WIN proves nothing, because the
        #     resultBox observer fills it either way. That version of this check
        #     passed with the per-guess announcement deleted.
        spoken_miss = str(ev(ws, "(document.getElementById('vh-live')||{}).textContent") or "")
        print(f"  spoken   miss {spoken_miss.strip()[:60]!r}")
        if not spoken_miss.strip():
            failures.append(
                "#vh-live is empty after a missed guess — the guess a player just made is "
                "announced nowhere. With six guesses and no result box until the end, a "
                "non-visual player has no way to hear whether they got warmer")
        else:
            worst_first = str(p["worst"]["n"]).split()[0]
            if worst_first and worst_first.lower() not in spoken_miss.lower():
                failures.append(
                    f"the live region says {spoken_miss.strip()[:60]!r} after guessing "
                    f"{p['worst']['n']!r} — the announcement does not name the guess it is "
                    f"about, so it cannot be the feedback for this guess")

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

        # 5a2. the round has to reach a screen reader. Everything checked above is
        #      what a sighted player sees. #log is not a live region, so before
        #      this the status node stayed empty through an entire round: measured
        #      over the accessibility tree, #vh-live was '' before a guess and ''
        #      after one, while #log carried
        #      'guess → AJ Griffin 2022-23 cos -0.67 ◐ • row 11029'.
        #
        #      Two writers feed that one node now — the per-guess log line and the
        #      result box — and say() assigns textContent, so the last write wins.
        #      The result has to be the one left standing: it is the payoff. Before
        #      the guard, the result was announced at 9,197 ms and replaced 4 ms
        #      later by 'Trajectory done … confetti 12 … karaoke-grade 1.24s', so a
        #      polite region would have read out the telemetry instead of the answer.
        wait_for(ws, "/^result/i.test((((document.getElementById('vh-live')||{})"
                     ".textContent)||'').trim())", 8)
        said = str(ev(ws, "(document.getElementById('vh-live')||{}).textContent") or "")
        print(f"  spoken   {said.strip()[:66]!r}")
        if not said.strip():
            failures.append(
                "#vh-live is empty after a scoring guess — the round is silent to a screen "
                "reader. #log carries the result and #log is not a live region, so nothing "
                "the player did or scored is announced")
        elif not said.strip().lower().startswith("result"):
            failures.append(
                f"the live region ends the win holding {said.strip()[:70]!r} rather than the "
                f"Result — the payoff was announced and then overwritten by a later log line, "
                f"which is the one announcement a non-visual player most needs")

        # 5b. the share overlay is the page's one modal, and a modal is a second
        #     state no static check ever sees. Measured before the fix: opening it
        #     left focus on the button behind it, Tab walked two live controls the
        #     visitor could no longer see — the second being "Next Q →", which
        #     moves the game on underneath the card they are looking at — Escape
        #     did nothing, and closing dropped focus to <body> so the next Tab
        #     restarted at the skip link. Driven here with real key events,
        #     because a synthetic .click() cannot show where the keyboard goes.
        def key(code, name):
            for t in ("rawKeyDown", "keyUp"):
                ws.call("Input.dispatchKeyEvent", {
                    "type": t, "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code,
                    "key": name, "code": name})
            time.sleep(0.2)

        DLG = """(function(){
          var p=document.getElementById('sharePop'), a=document.activeElement;
          var d=p?p.querySelector('[role="dialog"]'):null;
          return JSON.stringify({
            open:!!(p&&p.classList.contains('on')),
            inside:!!(p&&a&&p.contains(a)),
            active:a?((a.tagName||'')+(a.id?'#'+a.id:'')):'(none)',
            name:d?(d.getAttribute('aria-label')||d.getAttribute('aria-labelledby')||''):'',
            modal:d?(d.getAttribute('aria-modal')||''):''});
        })()"""

        ev(ws, "document.getElementById('btnShareCard').focus()")
        ev(ws, "document.getElementById('btnShareCard').click()")
        time.sleep(0.4)
        opened = ev(ws, DLG)
        if isinstance(opened, dict) and opened.get("open"):
            print(f"  dialog   opened focus={opened['active']} inside={opened['inside']} "
                  f"role=dialog name={opened['name']!r}")
            if not opened.get("inside"):
                failures.append(f"opening the share card left focus on {opened['active']} — "
                                f"a control now behind a blurred backdrop, so a keyboard "
                                f"player is operating a page they cannot see")
            if not opened.get("name"):
                failures.append("the share overlay has no role=dialog with a name, so a "
                                "screen reader is given no way to know one opened")
            if opened.get("modal") != "true":
                failures.append("the share overlay is not aria-modal, so the page behind it "
                                "is still offered to a screen reader")
            # Tab must not leave, and it has to be checked at every press rather
            # than at the end: a trap with only its wrap branch removed still has
            # a catch-all that hauls focus back on the *next* Tab, so reading the
            # final state alone passed with the trap broken. What the visitor
            # experiences is each keystroke, not the last one.
            walk = []
            for _ in range(4):
                key(9, "Tab")
                st = ev(ws, DLG)
                walk.append((st.get("active"), bool(st.get("inside"))))
            print("  dialog   tab walk " +
                  " → ".join(f"{a}{'' if ins else ' (OUTSIDE)'}" for a, ins in walk))
            stray = [a for a, ins in walk if not ins]
            if stray:
                failures.append(f"tabbing inside the share card reached {stray[0]}, which is "
                                f"behind the overlay — one of those controls advances the game "
                                f"under a card the player is still looking at")
            key(27, "Escape")
            escaped = ev(ws, DLG)
            print(f"  dialog   Escape open={escaped['open']} focus={escaped['active']}")
            if escaped.get("open"):
                failures.append("Escape does not close the share card — the one key every "
                                "visitor tries on a dialog")
            elif escaped.get("active") != "BUTTON#btnShareCard":
                failures.append(f"closing the share card left focus on {escaped['active']} "
                                f"rather than the button that opened it, so the next Tab "
                                f"restarts from wherever that is")
        else:
            failures.append("the share card button did not open the overlay after a win")

        # 5c. the end of the daily. The seed sets one question, so winning it ends
        #     the pack — and nextQ() used to return before touching the question
        #     line, leaving the old puzzle on screen with an empty box. Winning
        #     and pressing Next looked exactly like being stuck.
        before_q = str(ev(ws, "document.getElementById('q').textContent") or "")
        ev(ws, "(() => { const b=document.getElementById('btnNext')||"
               "document.getElementById('btnNext2'); if(b) b.click(); return 1 })()")
        time.sleep(1.2)
        after_q = str(ev(ws, "document.getElementById('q').textContent") or "")
        print(f"  done     {after_q.strip()[:66]!r}")
        if after_q.strip() == before_q.strip():
            failures.append("winning the daily and pressing Next left the question line "
                            "unchanged — the pack is over and the page still shows the "
                            "puzzle it just finished")

        # 5d. the share card's link has to reproduce the game the card shows. It
        #     fell back to the literal '672-123-456' whenever the page had no
        #     ?pack= — which is every daily game — so the one artefact built to be
        #     posted publicly advertised the demo pack, a different puzzle from
        #     the one pictured on it.
        link = str(ev(ws, """(() => {
          const p = new URL(location.href).searchParams.get('pack');
          let q = p; if (!q && typeof seq !== 'undefined' && seq && seq.length) q = seq.join('-');
          return 'play' + (q ? '?pack=' + q : ''); })()""") or "")
        seq_now = ev(ws, "JSON.stringify(seq)")
        print(f"  share    link {link!r} for seq {seq_now}")
        if "672-123-456" in link:
            failures.append("the share card advertises the demo pack 672-123-456 rather than "
                            "the game it depicts — anyone following it gets a different puzzle")
        elif seq_now and seq_now != "[]" and "?pack=" not in link:
            failures.append(f"the share card link carries no pack for seq {seq_now}, so it "
                            f"cannot reproduce the puzzle it shows")

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

        # 6b. a streak has to break when a day is missed. updateWW used to add 1
        #     whenever the day was new, with no check on when the last one was, so
        #     it counted days played ever while the page called it a streak and
        #     drew a seven-dot "Week Warrior". Exercised here by seeding a stale
        #     record and moving the clock forward nine days, rather than by
        #     playing four rounds.
        streak = ev(ws, """(() => {
          const KEY = 'vh_weekStreak', saved = localStorage.getItem(KEY);
          const RealDate = Date;
          const shim = iso => { function F(...a){ return a.length ? new RealDate(...a)
              : new RealDate(iso + 'T12:00:00.000Z'); }
            F.prototype = RealDate.prototype; F.now = () => new RealDate(iso).getTime();
            F.parse = RealDate.parse; F.UTC = RealDate.UTC; window.Date = F; };
          const run = (days, streak, today) => {
            localStorage.setItem(KEY, JSON.stringify({days, streak}));
            shim(today); updateWW(false, true);
            return JSON.parse(localStorage.getItem(KEY) || '{}');
          };
          const gap  = run(['2026-08-10','2026-08-11','2026-08-12'], 3, '2026-08-21');
          const next = run(['2026-08-10','2026-08-11','2026-08-12'], 3, '2026-08-13');
          window.Date = RealDate;
          if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
          return JSON.stringify({afterGap: gap.streak, afterGapDays: gap.days.length,
                                 consecutive: next.streak});
        })()""")
        if isinstance(streak, dict):
            print(f"  streak   after a 9-day gap {streak['afterGap']}, "
                  f"next day {streak['consecutive']}")
            if streak["afterGap"] != 1:
                failures.append(f"a nine-day gap left the streak at {streak['afterGap']} — "
                                f"a streak that survives a missed day is a count of days "
                                f"played, not a streak")
            if streak["afterGapDays"] != 1:
                failures.append(f"after the gap the dots still show {streak['afterGapDays']} "
                                f"days, so they disagree with the streak beside them")
            if streak["consecutive"] != 4:
                failures.append(f"playing the next day gave {streak['consecutive']} rather "
                                f"than 4 — consecutive days must still count up")

        # 6c. asking for less motion has to reach the JavaScript. The page's
        #     @media (prefers-reduced-motion:reduce) block stops CSS animation and
        #     nothing else: the trajectory draw, the ring pulse and the spike are
        #     all JS, and measured over CDP they used to run identically either
        #     way — 112 rAF frames with no preference, 114 with reduce.
        #     Checked here through the ring, which is the cheapest observable: it
        #     is shown for 1240ms normally and must not appear at all under reduce.
        ws.call("Emulation.setEmulatedMedia", {"features": [
            {"name": "prefers-reduced-motion", "value": "reduce"}]})
        motion = ev(ws, """(() => {
          const r = document.getElementById('ring');
          if (!r) return JSON.stringify({err: 'no #ring'});
          r.style.display = 'none';
          const asked = typeof reducedMotion === 'function' ? reducedMotion() : null;
          pulseRing2();
          return JSON.stringify({asked: asked, ring: getComputedStyle(r).display});
        })()""")
        ws.call("Emulation.setEmulatedMedia", {"features": []})
        if isinstance(motion, dict) and not motion.get("err"):
            print(f"  motion   reduce honoured={motion.get('asked')}, ring={motion.get('ring')!r}")
            if motion.get("asked") is not True:
                failures.append("with prefers-reduced-motion: reduce emulated, the page's own "
                                "check does not report it — the JS animations cannot be gated "
                                "on something they never read")
            elif motion.get("ring") != "none":
                failures.append(f"the ring pulse still ran under reduced motion (display "
                                f"{motion.get('ring')!r}) — the CSS block does not stop JS")

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
