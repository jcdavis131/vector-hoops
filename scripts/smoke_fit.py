"""The fit calculator returns the cosine, and says so when it cannot.

/player-fit was titled "Fit calc" and had no calculator: a text box and a
"Find fit →" button had been removed because nothing was wired to them, which
was the right call and left the page promising a tool it did not have. This
drives the tool that replaced them.

The number is checked against one computed here in Python from the same file, so
the assertion cannot agree with the page by construction — a normalisation bug
in either implementation shows up as disagreement rather than as a plausible
number. Both pairs are committed seasons:

    Karl Malone 2001-02    vs Domantas Sabonis 2024-25   cosine 0.4525
    Michael Jordan 1997-98 vs LeBron James 2025-26       cosine 0.6271

    python scripts/smoke_fit.py
    python scripts/smoke_fit.py --mutate nonorm    # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import math
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

PAIRS = [("Karl Malone 2001-02", "Domantas Sabonis 2024-25"),
         ("Michael Jordan 1997-98", "LeBron James 2025-26")]

# Take the /‖v‖ out of unit() and every cosine becomes a raw dot product. The
# page still prints a confident two-decimal number, which is the failure this
# has to be able to see.
MUTATIONS = {
    "nonorm": ("player-fit.html", "n=Math.sqrt(n)||1;", "n=1;"),
}


def expected() -> dict[tuple[str, str], float]:
    d = json.loads((SERVE / "assets" / "game_vectors.json").read_text(encoding="utf-8"))
    by = {(p["n"] + " " + p["s"]).lower(): p for p in d["past"] + d["modern"]}
    out = {}
    for a, b in PAIRS:
        pa, pb = by[a.lower()], by[b.lower()]
        s = sum(x * y for x, y in zip(pa["v"], pb["v"]))
        na = math.sqrt(sum(x * x for x in pa["v"]))
        nb = math.sqrt(sum(y * y for y in pb["v"]))
        out[(a, b)] = s / (na * nb)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    want = expected()

    patched: dict[str, bytes] = {}
    if args.mutate:
        rel, find, repl = MUTATIONS[args.mutate]
        text = (SERVE / rel).read_text(encoding="utf-8")
        if text.count(find) != 1:
            print(f"MUTATION DID NOT APPLY — {args.mutate!r} matches {text.count(find)} "
                  f"times, needs exactly 1: {find!r}")
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
                self.send_header("Content-Type", "text/html; charset=utf-8")
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

    profile = Path(tempfile.gettempdir()) / "vh-fit"
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

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return {"err": str(r["exceptionDetails"])[:140]}
            return (r.get("result") or {}).get("value")

        def run(a, b):
            ev(f"(function(){{var A=document.getElementById('fitA'),"
               f"B=document.getElementById('fitB');A.value={json.dumps(a)};"
               f"B.value={json.dumps(b)};document.getElementById('fitGo').click();}})()")
            time.sleep(0.5)
            return ev("(document.getElementById('fitOut')||{}).innerText||''") or ""

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"driving /player-fit{mut}\n")
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player-fit.html"})
        for _ in range(30):
            time.sleep(0.4)
            if ev("!!document.getElementById('fitGo') && "
                  "!document.getElementById('fitGo').disabled"):
                break
        pool = ev("(document.getElementById('fitPool')||{}).innerText||''") or ""
        print(f"  pool      {pool!r}")
        if "2,273" not in pool.replace(" ", " "):
            fails.append(f"the pool label reads {pool!r}; the file holds 2,273 seasons")

        for a, b in PAIRS:
            got = run(a, b)
            c = want[(a, b)]
            print(f"  {a} vs {b}\n      -> {got[:96]!r}")
            for token in (f"{c:.2f}", f"{round(c * 100)}%"):
                if token not in got:
                    fails.append(f"{a} vs {b}: the page says {got[:80]!r}; computing the "
                                 f"cosine here from game_vectors.json gives {c:.4f}, so it "
                                 f"should contain {token!r}")

        miss = run("Zzzz Notaplayer 1999-00", "LeBron James 2025-26")
        print(f"  absent    {miss[:100]!r}")
        if "not in this pool" not in miss:
            fails.append(f"an unknown season answered {miss[:80]!r} rather than saying it "
                         f"is not in the pool")
        if "All-Star" not in miss:
            fails.append(f"the miss did not quote the pool's own criteria from the file: "
                         f"{miss[:90]!r}")

        same = run("LeBron James 2025-26", "LeBron James 2025-26")
        print(f"  identity  {same[:80]!r}")
        if "1.00" not in same:
            fails.append(f"a season against itself answered {same[:70]!r}; that is 1.00")
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
        print("OK — the fit calc returns the cosine this file computes, names the pool it "
              "searched, and says so when a season is not in it")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
