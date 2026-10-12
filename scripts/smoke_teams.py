"""Read the glass-box card on /teams and check it against the file below it.

The card was written down, and it was wrong. It headed itself *"Why San Antonio
rates above Oklahoma City"* over the line *"Why SAS 94.8 > OKC 85.8"* — but 94.8
and 85.8 are `weighted_wins`, and on `for_final`, the column the 30-team table on
the same page sorts by:

    OKC  for_final 70.7  rank 3
    SAS  for_final 69.3  rank 4

The page argued for the opposite of what its own table showed, and a 460×120
canvas repeated the claim as an animation for as long as the page was open.

The question was good; only the answer was typed. **72 pairs in this file
disagree** between weighted wins and the rating, so the card now picks the widest
one and reads both numbers from the same fetch the table uses.

This checks that what it says is what the file says — the two teams it names, the
four numbers it quotes, and that the team it says rates higher does.

    python scripts/smoke_teams.py
    python scripts/smoke_teams.py --mutate pair   # expect FAIL
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
    # pick the narrowest inversion instead of the widest: still a true pair, but
    # not the one the card claims to have found
    "pair":  [("if(!best||gap>best.gap)", "if(!best||gap<best.gap)")],
    # swap which team is called the higher-rated one
    "which": [("var title='Why '+esc(lo.name)+' rates above '+esc(hi.name);",
               "var title='Why '+esc(hi.name)+' rates above '+esc(lo.name);")],
    # quote the rating where the payroll belongs
    "money": [("n2(hi.payroll_m)+'M for those wins and '",
               "n2(hi.for_final)+'M for those wins and '")],
}


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


def widest(teams):
    best = None
    for i in range(len(teams)):
        for k in range(i + 1, len(teams)):
            a, b = teams[i], teams[k]
            if (a["weighted_wins"] - b["weighted_wins"]) * (a["for_final"] - b["for_final"]) >= 0:
                continue
            gap = abs(a["weighted_wins"] - b["weighted_wins"])
            hi, lo = (a, b) if a["weighted_wins"] > b["weighted_wins"] else (b, a)
            if best is None or gap > best[0]:
                best = (gap, hi, lo)
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    data = json.loads((SERVE / "assets" / "front_office_lite.json").read_text(encoding="utf-8"))
    teams = data["teams"]
    inversions = sum(
        1 for i in range(len(teams)) for k in range(i + 1, len(teams))
        if (teams[i]["weighted_wins"] - teams[k]["weighted_wins"])
        * (teams[i]["for_final"] - teams[k]["for_final"]) < 0)
    best = widest(teams)
    if not best:
        sys.exit("no inversion in the file, so this smoke has nothing to check")
    gap, hi, lo = best

    page = (SERVE / "teams.html").read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                sys.exit(f"mutation {args.mutate!r} no longer matches: {find!r}")
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path.split("?")[0] in ("/", "/teams.html", "/teams"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
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

    profile = Path(tempfile.gettempdir()) / "vh-teams"
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
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/teams.html"})
        time.sleep(3.2)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"reading the glass-box card on /teams in {browser.name}{mut}\n")
        print(f"  file     {len(teams)} teams, {inversions} pair(s) where weighted wins and the "
              f"rating disagree")
        print(f"  widest   {hi['abbr']} {hi['weighted_wins']}w rank {hi['for_rank']} vs "
              f"{lo['abbr']} {lo['weighted_wins']}w rank {lo['for_rank']}  (gap {gap:.1f})")

        card = ev(ws, """(function(){
            return JSON.stringify({h:(document.getElementById('whyH')||{}).textContent||'',
                                   hd:(document.getElementById('whyHd')||{}).textContent||'',
                                   body:(document.getElementById('whyBody')||{}).textContent||''});})()""")
        if not isinstance(card, dict):
            sys.exit(f"the card did not render: {card!r}")
        text = card["body"]
        print(f"  heading  {card['h']!r}")
        print(f"  body     {text[:96]!r}")

        if "Reading the two teams" in text or not text.strip():
            fails.append("the card never filled in — it is still showing its loading line")
        for want, what in ((hi["abbr"], "the higher-weighted team"),
                           (lo["abbr"], "the higher-rated team")):
            if want not in text:
                fails.append(f"the card never names {want}, {what} in the widest inversion")
        if lo["name"] not in card["h"] or hi["name"] not in card["h"]:
            fails.append(f"the heading reads {card['h']!r} and the pair is "
                         f"{lo['name']} over {hi['name']}")
        # the heading has to name the higher-RATED team as the one rating above
        m = re.match(r"Why (.+?) rates above (.+)$", card["h"].strip())
        if not m:
            fails.append(f"the heading is not a comparison: {card['h']!r}")
        elif m.group(1) != lo["name"] or m.group(2) != hi["name"]:
            fails.append(f"the heading says {m.group(1)!r} rates above {m.group(2)!r}; "
                         f"on for_final it is {lo['name']} {lo['for_final']} over "
                         f"{hi['name']} {hi['for_final']}")
        for val, label in ((f"{hi['weighted_wins']:.1f}", f"{hi['abbr']} weighted wins"),
                           (f"{lo['weighted_wins']:.1f}", f"{lo['abbr']} weighted wins"),
                           (f"{hi['for_final']:.1f}", f"{hi['abbr']} FOR"),
                           (f"{lo['for_final']:.1f}", f"{lo['abbr']} FOR"),
                           (f"{hi['payroll_m']:.2f}", f"{hi['abbr']} payroll"),
                           (f"{lo['payroll_m']:.2f}", f"{lo['abbr']} payroll")):
            if val not in text:
                fails.append(f"the card does not quote {label} as {val}, which is what the "
                             f"file says")
        long_dec = re.search(r"[\w.]*\d+\.\d{3,}", text)
        if long_dec:
            fails.append(f"the card prints more than two decimals: {long_dec.group(0)!r}")

        gone = ev(ws, "document.querySelectorAll('#mapCv').length")
        print(f"  canvas   {gone} decorative canvas element(s) left")
        if gone:
            fails.append("the pulse-ring canvas is back; it painted a claim the table contradicts")
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
        print("OK — the glass-box card names the widest disagreement in the file and quotes "
              "every number the file gives for it")
        return 0
    print(f"FAIL — {len(fails)} problem(s) on /teams:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
