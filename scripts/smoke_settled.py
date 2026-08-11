"""Scroll every page to the bottom and check nothing is still saying "Loading".

Half the sections on this site ship a placeholder — `Loading assets/…json …` —
and swap it for content when the fetch lands. Several of them are behind an
IntersectionObserver, so they do not even start until you scroll to them. Nothing
had ever checked that any of those placeholders actually goes away.

A section stuck on "Loading" is the worst failure this site has, because it looks
like a slow network rather than a broken page: there is no error, no console
warning a visitor would see, and the copy actively tells them to wait. It survives
every static gate — the markup is correct, the asset resolves on disk, the script
parses — and it survives a render smoke that only asserts the page painted.

So: load each page, scroll it to the bottom in steps so every observer fires,
scroll back, wait, and then read what is on screen. Anything still announcing a
load, and any error the page's own queue caught, is a failure.

    python scripts/smoke_settled.py
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

# Anything visible whose own text says it is loading. Read from leaf elements so
# a parent does not report its child's words as its own.
# r""" — this block is JavaScript, and in a plain Python string `\b` is a
# backspace character, not a word boundary. The regex below shipped as
# /\x08loading\x08|please wait/i, which matches nothing: the check ran on all 22
# pages, passed, and could not have failed. Measured by mutating a page to leave
# #foSub reading "Loading …" and watching it stay green.
STUCK = r"""(function(){
  var out=[];
  var all=document.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){
    var e=all[i];
    /* An element's OWN text, not its descendants'. Reading leaves only —
       which is what this did first, to stop a parent reporting its child's
       words — made it blind to the very placeholders it is for: they read
       `Loading assets/<code>front_office_lite.json</code> …`, so the <p> was
       skipped for having a child and the <code> leaf says only a filename.
       Measured: a mutation that left #foSub on its placeholder went
       uncaught. */
    var own='';
    for(var k=0;k<e.childNodes.length;k++){
      var n=e.childNodes[k];
      if(n.nodeType===3) own+=n.nodeValue;
    }
    own=own.replace(/\s+/g,' ').trim();
    if(!own || own.length>160) continue;
    /* The word boundary matters: the offline page says "status: online —
       reloading", and a bare /loading/ matched the tail of "reloading". */
    if(!/\bloading\b|please wait/i.test(own)) continue;
    /* SVGElement has no getClientRects — <defs>, <title>, <linearGradient>
       and friends threw, and every page with an inline chart reported only
       "Uncaught". */
    if(typeof e.getClientRects!=='function') continue;
    if(!e.getClientRects().length) continue;        // on screen only
    /* A closed <details> is not a stuck section. player-animations.html puts a
       `loading…` in eight collapsed "View .posecode source" panels, which fill
       when they are opened — and Chrome now hides that content with
       content-visibility rather than display:none, so it still reports client
       rects. Eight correct panels were reported as eight broken ones. */
    if(typeof e.closest==='function'){
      var d=e.closest('details:not([open])');
      if(d && !(e.closest('summary'))) continue;
    }
    out.push(own.slice(0,90));
  }
  return JSON.stringify({stuck:out.slice(0,8),
    errs:(window.__settledErr||[]).slice(0,4)});
})()"""


# The page's own early-error queue cannot be read after load: assets/error-
# boundary.js drains it and replaces window.__vhErr with `{ push: function(){} }`,
# a sink. Reading it reported `TypeError: (window.__vhErr || []).map is not a
# function` on 21 of 22 pages — a probe failing on every page it was meant to
# measure, which reads as 21 broken pages. This collector belongs to the test.
COLLECT = """
window.__settledErr = [];
addEventListener('error', function (e) {
  var t = e.target, r = t && (t.src || t.href);
  __settledErr.push(String(e.message || ('failed to load ' + (r || ''))).slice(0, 90));
}, true);
addEventListener('unhandledrejection', function (e) {
  __settledErr.push(String('rejection: ' + ((e.reason && e.reason.message) || e.reason)).slice(0, 90));
});
"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        d = r["exceptionDetails"]
        ex = (d.get("exception") or {}).get("description") or d.get("text") or "exception"
        return {"err": " ".join(str(ex).split())[:160]}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def page_list() -> list[str]:
    out = [f"/{p.name}" for p in sorted(SERVE.glob("*.html"))]
    for sub in sorted(SERVE.glob("*/index.html")):
        if sub.parent.name not in {"assets", "knowledge", "node_modules"}:
            out.append(f"/{sub.parent.name}/index.html")
    return out


def main() -> int:
    argparse.ArgumentParser().parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

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

    profile = Path(tempfile.gettempdir()) / "vh-settled"
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
        ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": COLLECT})
        pages = page_list()
        print(f"settling {len(pages)} page(s) in {browser.name}\n")
        for page in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{page}"})
            time.sleep(2.2)
            # every observer on the page gets a chance to fire
            for _ in range(6):
                ev(ws, "window.scrollBy(0, window.innerHeight*0.9)")
                time.sleep(0.45)
            ev(ws, "window.scrollTo(0,0)")
            time.sleep(3.0)
            s = ev(ws, STUCK)
            if isinstance(s, dict) and "err" in s:
                failures.append(f"{page}: the page could not be read — {s['err'][:70]}")
                continue
            mark = "ok" if not s["stuck"] and not s["errs"] else "SEE BELOW"
            print(f"  {page:<28} {mark}")
            if s["stuck"]:
                failures.append(
                    f"{page} is still showing {s['stuck'][0]!r}"
                    + (f" and {len(s['stuck']) - 1} more" if len(s["stuck"]) > 1 else "")
                    + " after the page was scrolled to the bottom and given three seconds "
                      "— a section stuck on a placeholder reads as a slow network, not a "
                      "broken page, so nobody reports it")
            if s["errs"]:
                failures.append(f"{page} caught {s['errs']!r} in its own error queue")

    except SystemExit:
        pass
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s) after the page settled:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — every page settles: scrolled to the bottom and given three seconds, "
          "no section is left telling a visitor to wait, and no page caught an error")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
