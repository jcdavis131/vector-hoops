"""The install banner, in the three states a visitor can actually be in.

`'standalone' in navigator` is a feature test. This file read it as an
is-installed test, and on iOS Safari the property always exists — so the guard
was false there, every iOS visitor with two visits fell through to the banner
with an **Install** button, and `showIOS()`, the branch written for exactly
those people, was unreachable.

iOS has no `beforeinstallprompt` at all. There was never anything for that
button to do: measured, pressing it returned "banner removed, nothing
installed". It is the same defect as the dead Find fit button taken off
/player-fit, on the one platform where a custom prompt is the only prompt there
is.

Nothing here could see it. It lives in a JS file, so `sourced` and `free` never
read it; it needs two recorded visits, so a first load never draws it; and it
needs `navigator.standalone` to exist, which a CDP user-agent override does not
provide — a UA string that says iPhone is not an iPhone, and the first run of
this smoke tested a browser that does not exist. The property is injected with
`Page.addScriptToEvaluateOnNewDocument` so it is there before the page script.

  ios-first-visit  a first visit is offered nothing at all
  ios-fresh      iOS, not installed: the Share instructions, and no Install button
  ios-installed  iOS, already installed: nothing at all
  desktop-fresh  no beforeinstallprompt: nothing, because no button could work

    python scripts/smoke_install.py
    python scripts/smoke_install.py --mutate feature-test   # expect FAIL
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

SCRIPT = SERVE / "assets" / "pwa-install.js"

IOS_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
          "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
DESKTOP_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

MUTATIONS = {
    # put back the feature test standing in for an is-installed test
    "feature-test": [("var installed = navigator.standalone === true ||",
                      "var installed = !('standalone' in navigator) &&")],
    # stop counting visits, which is the state the whole feature was in
    "no-count": [("    recordVisit();\n", "")],
    # offer the Install button with no prompt behind it, as it used to
    "dead-button": [("    if(!deferredPrompt){\n"
                     "      /* no prompt to defer means no Install button can work */\n"
                     "      if(/iphone|ipad|ipod/i.test(navigator.userAgent)) showIOS();\n"
                     "      return;\n"
                     "    }\n", "")],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    src = SCRIPT.read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in src:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — "
                      f"mutation {args.mutate!r} no longer matches: {find[:60]!r}")
                raise SystemExit(2)
            src = src.replace(find, repl, 1)
    body = src.encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if args.mutate and self.path.split("?")[0] == "/assets/pwa-install.js":
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
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

    fails: list[str] = []
    ws = proc = None
    try:
        for label, ua, standalone, want in (
            ("ios-first-visit", IOS_UA, "false", "nothing"),
            ("ios-fresh", IOS_UA, "false", "ios"),
            ("ios-installed", IOS_UA, "true", "nothing"),
            ("desktop-fresh", DESKTOP_UA, None, "nothing"),
        ):
            profile = Path(tempfile.gettempdir()) / f"vh-install-{label}"
            shutil.rmtree(profile, ignore_errors=True)
            proc = subprocess.Popen(
                [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
                 "--disable-extensions", "--no-default-browser-check",
                 f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            ws.call("Network.setUserAgentOverride", {"userAgent": ua})
            if standalone is not None:
                ws.call("Page.addScriptToEvaluateOnNewDocument", {"source":
                    "Object.defineProperty(navigator,'standalone',"
                    f"{{value:{standalone},configurable:true}});"})

            def ev(expr):
                r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
                if "exceptionDetails" in r:
                    return None
                return (r.get("result") or {}).get("value")

            url = f"http://127.0.0.1:{site}/index.html"
            ws.call("Page.navigate", {"url": url}); time.sleep(1.3)
            # One seeded visit, not two: the second has to come from recordVisit,
            # so this exercises the counter rather than stepping around it.
            if label != "ios-first-visit":
                ev("localStorage.setItem('vectorHoops.visits', JSON.stringify([1000]));"
                   "localStorage.removeItem('vectorHoops.installPromptDismissedAt')")
            ws.call("Page.navigate", {"url": url}); time.sleep(5.2)

            got = ev("JSON.stringify({banner:!!document.getElementById('pwa-install-banner'),"
                     "install:!!document.getElementById('pwa-install-go'),"
                     "dismiss:!!document.getElementById('pwa-install-no'),"
                     "share:/Share/.test((document.getElementById('pwa-install-banner')||{})"
                     ".innerText||'')})")
            try:
                got = json.loads(got) if isinstance(got, str) else {}
            except ValueError:
                got = {}
            print(f"  {label:<15}{got}")

            if want == "nothing":
                if got.get("banner"):
                    fails.append(f"{label}: a banner was drawn. Nothing here can install "
                                 f"anything in that state, so nothing should be offered.")
            else:
                if not got.get("banner"):
                    fails.append(f"{label}: no banner at all — iOS has no "
                                 f"beforeinstallprompt, so this is the only prompt it gets")
                if got.get("install"):
                    fails.append(f"{label}: the Install button is there. iOS has no "
                                 f"beforeinstallprompt, so pressing it can only dismiss the "
                                 f"banner — a control that does nothing.")
                if not got.get("share"):
                    fails.append(f"{label}: the banner does not tell an iOS visitor to tap "
                                 f"Share, which is the only way to add it")
            try:
                ws.close()
            except Exception:
                pass
            proc.terminate(); time.sleep(0.4)
    finally:
        if proc:
            proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    if not fails:
        print("OK — iOS gets the Share instructions and no dead Install button, an installed "
              "visitor is left alone, and no button is offered without a prompt behind it")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
