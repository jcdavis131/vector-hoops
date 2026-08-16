"""Tab through the pages and check where focus actually goes.

check_a11y.py prints "focus order still needs a browser and a person" on every
run. Half of that is true — judging whether an order makes *sense* needs a person.
The mechanical half does not, and this checks it by pressing Tab through a real
browser and asking what has focus after each press:

  skip       the first Tab lands on a skip link, and activating it moves focus
             into the main landmark. Level A, WCAG 2.4.1, and easy to ship broken:
             an anchor with no focusable target scrolls the page and leaves focus
             in the navigation, so the next Tab goes straight back there.

             "Is a skip link" is decided by behaviour — an anchor whose fragment
             resolves to an element that is, contains, or sits inside the main
             landmark and can take focus. An earlier version asserted a class
             name instead, and called players.html broken over a perfectly good
             `.pl-skip`, while missing that the page had ended up with *two*
             skip links. Checking the label rather than the behaviour got both
             halves wrong at once.
  order      focus never jumps backwards through the document. WCAG 2.4.3.
  trap       Tab always moves; the same element twice in a row is a trap.
  visible    every focused element computes a real outline or box-shadow, so a
             keyboard user can see where they are. WCAG 2.4.7.

All four follow focus into open shadow roots. `document.activeElement` stops at
the host, and player-animations.html embeds eight `<posecode-player>` elements
that each hide a button and a link in one — 16 controls this never looked at,
while every Tab inside a component reported the same host and read as a trap
that was not there.

Reuses the WebSocket client from check_viewport.py rather than a second copy.

    python scripts/check_focus.py
    python scripts/check_focus.py --tabs 25
"""

from __future__ import annotations

import argparse
import functools
import http.server
import importlib.util
import json
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

_spec = importlib.util.spec_from_file_location("cv", ROOT / "scripts" / "check_viewport.py")
_cv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_cv)
WS, BROWSERS = _cv.WS, _cv.BROWSERS

# Every served page, not a sample. check_viewport.py covered seven and three
# failed; extending it to all eighteen turned up two more. Sampling was the
# mistake there, so it is not repeated here.
PAGES = [
    "/", "/owner.html", "/brand.html", "/dfs.html", "/player.html", "/player-fit.html",
    "/teams.html", "/trends.html", "/model.html", "/play.html", "/players.html",
    "/player-cards.html", "/dictionary.html", "/methods.html", "/inventory.html",
    "/leaderboard.html", "/offline.html", "/player-animations.html",
]

DESCRIBE = """(() => {
  // Focus can live inside a shadow root, and document.activeElement stops at the
  // host. player-animations.html has eight <posecode-player> elements, each with
  // an open shadow root holding a button and a link — 16 controls this could not
  // see. Every Tab inside one component reported the same host, which read as a
  // focus trap that was not there, and the ring was computed on the host instead
  // of on the control that actually had focus.
  let a = document.activeElement;
  if (!a || a === document.body) return JSON.stringify({body: true});
  const path = [];
  while (true) {
    const r = a.getRootNode();
    const scope = r === document ? document.body : r;
    let n = 0, at = -1;
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT);
    while (w.nextNode()) { n++; if (w.currentNode === a) { at = n; break; } }
    path.push(at);
    if (a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    else break;
  }
  const cs = getComputedStyle(a);
  const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
               (cs.boxShadow && cs.boxShadow !== 'none');
  return JSON.stringify({
    tag: a.tagName.toLowerCase(),
    cls: (a.className && a.className.toString ? a.className.toString().trim().split(/\\s+/)[0] : ''),
    id: a.id || '',
    text: (a.textContent || '').trim().slice(0, 28),
    ring: !!ring,
    // is this a skip link, judged by what it does rather than what it is called?
    // an anchor pointing at a fragment that exists, resolves to the main
    // landmark (or the box around it), and can actually take focus.
    skip: (() => {
      if (a.tagName !== 'A') return null;
      const h = a.getAttribute('href') || '';
      if (h.charAt(0) !== '#' || h.length < 2) return null;
      const t = document.getElementById(decodeURIComponent(h.slice(1)));
      if (!t) return {href: h, missing: true};
      const m = document.querySelector('main, [role=main]');
      const nat = /^(a|button|input|select|textarea)$/.test(t.tagName.toLowerCase());
      return {
        href: h,
        target: t.tagName.toLowerCase() + (t.id ? '#' + t.id : ''),
        atMain: !!m && (t === m || t.contains(m) || m.contains(t)),
        focusable: t.hasAttribute('tabindex') || nat
      };
    })(),
    // document order as a path: [position of the host, position inside its
    // shadow root, ...]. Compares lexicographically, so shadow-encapsulated
    // stops get distinct, correctly ordered identities.
    path: path,
    shadow: path.length > 1
  });
})()"""


DUPE_SKIPS = """(() => {
  const seen = {};
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    if (!/^\\s*skip\\b/i.test(a.textContent || '')) continue;
    const t = a.getAttribute('href');
    (seen[t] = seen[t] || []).push((a.textContent || '').trim().slice(0, 30));
  }
  const dupes = Object.keys(seen).filter(t => seen[t].length > 1)
    .map(t => seen[t].length + ' skip links all pointing at ' + t + ': ' + seen[t].join(' / '));
  return JSON.stringify(dupes);
})()"""


def ev_dupe_skips(ws: WS) -> str:
    r = ws.call("Runtime.evaluate", {"expression": DUPE_SKIPS, "returnByValue": True})
    try:
        got = json.loads((r.get("result") or {}).get("value") or "[]")
    except ValueError:
        return ""
    return "; ".join(got)[:150]


def tab(ws: WS):
    for t in ("rawKeyDown", "keyUp"):
        ws.call("Input.dispatchKeyEvent", {"type": t, "key": "Tab", "code": "Tab",
                                           "windowsVirtualKeyCode": 9, "nativeVirtualKeyCode": 9})


def enter(ws: WS):
    for t in ("rawKeyDown", "char", "keyUp"):
        p = {"type": t, "key": "Enter", "code": "Enter",
             "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
        if t == "char":
            p["text"] = "\r"
        ws.call("Input.dispatchKeyEvent", p)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tabs", type=int, default=18, help="how many Tab presses per page")
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

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", site), functools.partial(Quiet, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
         f"--user-data-dir={Path(tempfile.gettempdir()) / 'vh-focus'}",
         f"--remote-debugging-port={cdp}", "about:blank"],
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
        print(f"tabbing through {len(PAGES)} pages in {browser.name}\n")

        for path in PAGES:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{path}"})
            time.sleep(2.0)
            ws.call("Runtime.evaluate", {"expression": "document.body.focus&&document.body.focus()"})

            # identity is the element's document position, not its class. A first
            # version compared the class name and called every page a focus trap,
            # because a nav is a row of twelve consecutive .pill links.
            seq, prev_pos, noring, backwards, stuck, last_pos, shadowed = [], (), [], 0, 0, None, 0
            for i in range(args.tabs):
                tab(ws)
                r = ws.call("Runtime.evaluate", {"expression": DESCRIBE, "returnByValue": True})
                d = json.loads((r.get("result") or {}).get("value") or "{}")
                if d.get("body"):
                    break
                label = (d.get("id") and "#" + d["id"]) or (d.get("cls") and "." + d["cls"]) or d.get("tag", "?")
                if d.get("shadow"):
                    label += " (shadow)"
                    shadowed += 1
                pos = tuple(d.get("path") or ())
                if last_pos is not None and pos == last_pos:
                    stuck += 1
                last_pos = pos
                if pos and pos[0] > 0:
                    if prev_pos and pos < prev_pos:
                        backwards += 1
                    prev_pos = pos
                if not d.get("ring"):
                    noring.append(label)
                seq.append((label, d.get("text", "")))
                if i == 0:
                    first = d

            ok = True
            if not seq:
                failures.append(f"{path}: Tab focused nothing at all"); ok = False
            else:
                # a skip link is what it does, not what it is called. Asserting
                # class="vh-skip" here called players.html broken over a
                # perfectly good .pl-skip — while missing that the page had
                # ended up with two skip links, which was the actual bug.
                s = first.get("skip")
                # two skip links to the same place is a defect; two to different
                # places is not. teams.html offers "Skip to the content" and
                # "Skip to all 30 teams" and that is correct bypass-blocks
                # practice, while index.html had two links both pointing at
                # #main and play.html injected a second one at body.firstChild,
                # ahead of the static one it already had.
                dupes = ev_dupe_skips(ws)
                if dupes:
                    failures.append(f"{path}: {dupes} — a keyboard visitor meets the same "
                                    f"destination twice before reaching anything")
                if not s:
                    failures.append(f"{path}: first Tab went to {seq[0][0]}, which is not a "
                                    f"same-page link — no way past the nav (WCAG 2.4.1)"); ok = False
                elif s.get("missing"):
                    failures.append(f"{path}: first Tab went to a link to {s['href']}, and no "
                                    f"element has that id — the skip link goes nowhere"); ok = False
                elif not s.get("atMain"):
                    failures.append(f"{path}: first Tab targets {s['target']}, which is not the "
                                    f"main landmark"); ok = False
                elif not s.get("focusable"):
                    failures.append(f"{path}: skip link targets {s['target']}, which has no "
                                    f"tabindex — it scrolls but focus stays in the nav"); ok = False
                if backwards:
                    failures.append(f"{path}: focus jumped backwards {backwards} time(s)"); ok = False
                if stuck:
                    failures.append(f"{path}: focus did not move on {stuck} press(es) — a trap"); ok = False
                if noring:
                    failures.append(f"{path}: {len(noring)} focused element(s) show no focus indicator: "
                                    f"{', '.join(dict.fromkeys(noring))[:80]}"); ok = False

            print(f"  {'ok  ' if ok else 'FAIL'} {path:<18} {len(seq):>2} stops"
                  + (f"  first={seq[0][0]}" if seq else "")
                  + (f"  no-ring={len(noring)}" if noring else "")
                  + (f"  backwards={backwards}" if backwards else "")
                  + (f"  in-shadow={shadowed}" if shadowed else ""))

        # the skip link has to actually move focus, not just scroll
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/teams.html"})
        time.sleep(2.0)
        tab(ws); enter(ws); time.sleep(0.4)
        r = ws.call("Runtime.evaluate", {"expression": DESCRIBE, "returnByValue": True})
        d = json.loads((r.get("result") or {}).get("value") or "{}")
        landed = d.get("id") or d.get("tag")
        if d.get("body") or landed != "main":
            failures.append(f"activating the skip link left focus on {landed!r}, not the main landmark")
        print(f"\n  skip link on /teams.html moves focus to: {landed!r}")
    finally:
        if ws:
            ws.close()
        proc.terminate(); httpd.shutdown(); httpd.server_close()

    print()
    if failures:
        print(f"FAIL — {len(failures)} focus problem(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — focus order is sane on {len(PAGES)} pages: skip link first, no traps, "
          f"no backward jumps, every stop visibly focused")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
