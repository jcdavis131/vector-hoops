"""Tab through the pages and check where focus actually goes.

check_a11y.py prints "focus order still needs a browser and a person" on every
run. Half of that is true — judging whether an order makes *sense* needs a person.
The mechanical half does not, and this checks it by pressing Tab through a real
browser and asking what has focus after each press:

  skip       the first Tab lands on the skip link, and activating it moves focus
             into the main landmark. Level A, WCAG 2.4.1, and easy to ship broken:
             an anchor with no focusable target scrolls the page and leaves focus
             in the navigation, so the next Tab goes straight back there.
  order      focus never jumps backwards through the document. WCAG 2.4.3.
  trap       Tab always moves; the same element twice in a row is a trap.
  visible    every focused element computes a real outline or box-shadow, so a
             keyboard user can see where they are. WCAG 2.4.7.

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

PAGES = ["/", "/owner/", "/teams.html", "/trends.html", "/model.html", "/play.html", "/dictionary.html"]

DESCRIBE = """(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return JSON.stringify({body: true});
  const cs = getComputedStyle(a);
  const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
               (cs.boxShadow && cs.boxShadow !== 'none');
  return JSON.stringify({
    tag: a.tagName.toLowerCase(),
    cls: (a.className && a.className.toString ? a.className.toString().trim().split(/\\s+/)[0] : ''),
    id: a.id || '',
    text: (a.textContent || '').trim().slice(0, 28),
    ring: !!ring,
    pos: (() => { let n = 0, w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                  while (w.nextNode()) { n++; if (w.currentNode === a) return n; } return -1; })()
  });
})()"""


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
            seq, prev_pos, noring, backwards, stuck, last_pos = [], 0, [], 0, 0, None
            for i in range(args.tabs):
                tab(ws)
                r = ws.call("Runtime.evaluate", {"expression": DESCRIBE, "returnByValue": True})
                d = json.loads((r.get("result") or {}).get("value") or "{}")
                if d.get("body"):
                    break
                label = (d.get("id") and "#" + d["id"]) or (d.get("cls") and "." + d["cls"]) or d.get("tag", "?")
                if last_pos is not None and d.get("pos", -1) == last_pos:
                    stuck += 1
                last_pos = d.get("pos", -1)
                if d.get("pos", -1) > 0:
                    if prev_pos and d["pos"] < prev_pos:
                        backwards += 1
                    prev_pos = d["pos"]
                if not d.get("ring"):
                    noring.append(label)
                seq.append((label, d.get("text", "")))
                if i == 0:
                    first = d

            ok = True
            if not seq:
                failures.append(f"{path}: Tab focused nothing at all"); ok = False
            else:
                if "vh-skip" not in (first.get("cls") or ""):
                    failures.append(f"{path}: first Tab went to {seq[0][0]}, not the skip link"); ok = False
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
                  + (f"  backwards={backwards}" if backwards else ""))

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
