"""Read /brand's numbers off the screen and recompute them from the file.

The page was 413 characters of jargon headed *"Wins into sponsor ROI • $9.1B top
• GSW 9.14B"*. The figure was stale, and the claim is not in the data it would
have come from: across the 30 teams in `assets/front_office_lite.json`, wins and
valuation correlate at **+0.09**.

It computes that now instead of asserting it, so the thing to check is that what
it prints is what the file says. Everything below is recomputed here in Python
and compared:

  r         the three correlations, to two decimals
  spread    the valuation and win ranges quoted in the reading
  perwin    the three dearest and three cheapest teams by valuation per win
  caveat    the page says these valuations are generated rather than measured,
            because a correlation over synthetic numbers describes the file and
            not the league, and a reader who is not told that will assume the
            other thing
  fail      with the file blocked, the page says so and prints no number

    python scripts/smoke_brand.py
    python scripts/smoke_brand.py --mutate corr    # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
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

MUTATIONS = {
    "corr":   [("return (saa&&sbb) ? sab/Math.sqrt(saa*sbb) : 0;", "return 0.42;")],
    "sort":   [("var dear=vpw.slice().sort(function(a,b){return b.vpw-a.vpw;}).slice(0,3);",
                "var dear=vpw.slice().sort(function(a,b){return a.vpw-b.vpw;}).slice(0,3);")],
    "caveat": [("every valuation in this repo is generated, not measured ", "")],
    "top":    [("var top=T.slice().sort(function(a,b){return b.valuation_m-a.valuation_m;})[0];",
                "var top=T[0];")],
}


def corr(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    saa = sum((x - ma) ** 2 for x in a)
    sbb = sum((y - mb) ** 2 for y in b)
    return sab / (saa * sbb) ** 0.5 if saa and sbb else 0.0


def n2(v):
    # -0.00 is not a sign, it is a rounding artefact. Python prints it and JS
    # prints 0.00 for the same number, and the rating correlation here is close
    # enough to zero to land on that boundary. Normalising is the honest read;
    # asserting the artefact would be asserting Python's formatter.
    s = f"{v:.2f}"
    return "0.00" if s == "-0.00" else s


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    ap.add_argument("--block", action="store_true", help="refuse to serve the team file")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    data = json.loads((SERVE / "assets" / "front_office_lite.json").read_text(encoding="utf-8"))
    T = data["teams"]
    wins = [t["wins"] for t in T]
    val = [t["valuation_m"] for t in T]
    pay = [t["payroll_m"] for t in T]
    rate = [t["for_final"] for t in T]
    want = {"wins": corr(wins, val), "pay": corr(pay, val), "rate": corr(rate, val)}
    per = sorted(T, key=lambda t: -(t["valuation_m"] / max(t["wins"], 1)))
    dear, cheap = per[:3], per[-3:][::-1]
    top = max(T, key=lambda t: t["valuation_m"])

    page = (SERVE / "brand.html").read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — " + f"mutation {args.mutate!r} no longer matches: {find!r}")
                raise SystemExit(2)
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/brand.html", "/brand"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(body)
                return
            if args.block and path.endswith("/assets/front_office_lite.json"):
                self.send_error(503, "blocked by the smoke")
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

    profile = Path(tempfile.gettempdir()) / "vh-brand"
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
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/brand.html"})
        time.sleep(3.0)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        mut += "  [file blocked]" if args.block else ""
        print(f"reading /brand in {browser.name}{mut}\n")

        got = ev(ws, """(function(){
            var g=function(i){var e=document.getElementById(i);return e?(e.innerText||e.textContent||''):'';};
            return JSON.stringify({head:g('brHead'), corr:g('brCorr'), read:g('brRead'),
                                   vpw:g('brVpw'), method:g('brMethod'), season:g('brSeason')});})()""")
        if not isinstance(got, dict):
            sys.exit(f"the page did not render: {got!r}")

        if args.block:
            print(f"  blocked  head {got['head'][:60]!r}")
            # innerText returns what is rendered, and .mono is
            # text-transform:uppercase - so prose comparisons are case-folded
            if "could not be loaded" not in got["head"].lower():
                fails.append(f"the file was unreachable and the head reads {got['head'][:60]!r}")
            if re.search(r"r = [-+]?\d", got["head"]) or got["corr"].strip():
                fails.append("numbers were drawn with no file behind them")
        else:
            flat = " ".join(v for v in got.values())
            print(f"  season   {got['season']!r}")
            print(f"  head     {got['head'][:74]!r}")
            for key, label in (("wins", "wins"), ("pay", "payroll"), ("rate", "rating")):
                v = n2(want[key])
                if v not in got["corr"]:
                    fails.append(f"the {label} correlation is {v} in the file and the table reads "
                                 f"{got['corr'].strip()[:70]!r}")
            print(f"  corr     wins {n2(want['wins'])} · payroll {n2(want['pay'])} · "
                  f"rating {n2(want['rate'])} — all present: "
                  f"{all(n2(want[k]) in got['corr'] for k in want)}")
            if n2(want["wins"]) not in got["head"]:
                fails.append(f"the headline does not quote r = {n2(want['wins'])}")
            if str(len(T)) not in got["head"]:
                fails.append(f"the headline does not say how many teams ({len(T)})")

            for who, label in ((dear, "dearest"), (cheap, "cheapest")):
                for t in who:
                    if t["name"] not in got["vpw"]:
                        fails.append(f"{t['name']} is in the file's three {label} per win and is "
                                     f"not on the page")
            print(f"  perwin   dearest {', '.join(t['abbr'] for t in dear)} · "
                  f"cheapest {', '.join(t['abbr'] for t in cheap)}")

            if top["name"] not in got["read"]:
                fails.append(f"the largest valuation in the file is {top['name']} and the reading "
                             f"names someone else: {got['read'][:80]!r}")
            for v in (n2(min(val) / 1000), n2(max(val) / 1000)):
                if v not in got["read"]:
                    fails.append(f"the reading does not quote the valuation spread value {v}")

            if "generated, not measured" not in got["method"].lower():
                fails.append("the method note does not say the valuations are generated rather "
                             "than measured — a correlation over synthetic numbers describes the "
                             "file, and a reader who is not told that will assume the league")
            print(f"  caveat   {'generated, not measured' in got['method'].lower()}")
            long_dec = re.search(r"\d+\.\d{3,}", flat)
            if long_dec:
                fails.append(f"more than two decimals on screen: {long_dec.group(0)!r}")
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
        print("OK — with the file blocked /brand says so and prints no number" if args.block else
              "OK — every number on /brand is the number the file gives, and it says what kind of "
              "number it is")
        return 0
    print(f"FAIL — {len(fails)} problem(s) on /brand:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
