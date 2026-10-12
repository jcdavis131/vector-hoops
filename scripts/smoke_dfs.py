"""Read /dfs's error bars off the screen and recompute them from the file.

The page offered "locks / fades", "minute-lock safety" and an optimizer. The file
those would have come from, `assets/projections.json`, ends its own method line
with:

    "Not a minutes or pace forecast — treat as geometry-implied next-year
     profile pending held-out eval."

The eval exists. `assets/next_profile_eval.json` scores 10,108 player-seasons
where the prediction can be compared with what actually happened, and its summary
gives `meanAbsErrPrimary` 0.459 — a number no reader can judge without knowing
what doing nothing would score. `build_projection_eval.py` computes that baseline
alongside it, per feature, and the page draws the ratio.

The honest headline that falls out is the answer to what the page used to
promise: **shape is predictable, impact is not.** So this checks that the page
says what the file says, and specifically that it has not quietly turned back
into advice.

  bars      every feature's ratio on screen equals the file's, to two decimals
  order     best first, worst last, as the file is sorted
  headline  names the best and worst feature and quotes both ratios
  aggregate the primary MAE and its baseline, both quoted
  refuse    the words the page must not carry: lock, fade, optimizer, minute-lock
  fail      with the file blocked, the page says so and prints no number

    python scripts/smoke_dfs.py
    python scripts/smoke_dfs.py --mutate ratio   # expect FAIL
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
    "ratio":  [("'<span class=\"dp-num\">'+n2(f.ratio)+'</span></div>'",
                "'<span class=\"dp-num\">'+n2(f.ratio*0.5)+'</span></div>'")],
    "order":  [("var best=F[0], worst=F[F.length-1];", "var best=F[F.length-1], worst=F[0];")],
    "base":   [("n2(j.baselinePrimary)", "n2(j.meanAbsErrPrimary)")],
    "method": [("'<b>Why this is not a lineup.</b> The projection file", "'The projection file")],
}

# What the page must never go back to saying, matched whole and case-folded.
# The first run of this fired on the page's OWN sentence describing what it used
# to promise - the same shape as the stamper that ate a quoted headline. The fix
# was to reword the page, not to exempt a region: a blunt check that cannot be
# fooled is worth more than a clever one with a hole in it, and "which players to
# start and which to sit" says it better anyway.
FORBIDDEN = ("locks", "fades", "optimizer", "minute-lock", "lineup optimizer")


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


def n2(v):
    return f"{v:.2f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    ap.add_argument("--block", action="store_true", help="refuse to serve the eval slice")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    ev_file = json.loads((SERVE / "assets" / "projection_eval.json").read_text(encoding="utf-8"))
    F = ev_file["features"]
    counts = ev_file.get("counts") or {}

    page = (SERVE / "dfs.html").read_text(encoding="utf-8")
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
            if path in ("/", "/dfs.html", "/dfs"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(body)
                return
            if args.block and path.endswith("/assets/projection_eval.json"):
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

    profile = Path(tempfile.gettempdir()) / "vh-dfs"
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
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/dfs.html"})
        time.sleep(3.0)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        mut += "  [file blocked]" if args.block else ""
        print(f"reading /dfs in {browser.name}{mut}\n")

        got = ev(ws, """(function(){
            var g=function(i){var e=document.getElementById(i);return e?(e.innerText||e.textContent||''):'';};
            var rows=[].slice.call(document.querySelectorAll('#dpBars .dp-row')).map(function(r){
              return [r.querySelector('.dp-lab').textContent.replace(/\\(secondary\\)/,'').trim(),
                      r.querySelector('.dp-num').textContent.trim()]; });
            return JSON.stringify({head:g('dpHead'), read:g('dpRead'), method:g('dpMethod'),
                                   scored:g('dpScored'), rows:rows,
                                   body:(document.body.innerText||'')});})()""")
        if not isinstance(got, dict):
            sys.exit(f"the page did not render: {got!r}")

        if args.block:
            print(f"  blocked  head {got['head'][:60]!r}")
            if "could not be loaded" not in got["head"].lower():
                fails.append(f"the file was unreachable and the head reads {got['head'][:60]!r}")
            if got["rows"]:
                fails.append(f"{len(got['rows'])} bar(s) drawn with no file behind them")
        else:
            print(f"  head     {got['head'][:78]!r}")
            print(f"  bars     {len(got['rows'])} row(s) against {len(F)} in the file")
            if len(got["rows"]) != len(F):
                fails.append(f"the page draws {len(got['rows'])} bars and the file has {len(F)}")
            for i, f in enumerate(F):
                if i >= len(got["rows"]):
                    break
                lab, num = got["rows"][i]
                if f["label"].lower() not in lab.lower():
                    fails.append(f"row {i + 1} is {lab!r}; the file's row {i + 1} is "
                                 f"{f['label']!r} — the order does not match")
                if num != n2(f["ratio"]):
                    fails.append(f"{f['label']}: the page shows {num} and the file says "
                                 f"{n2(f['ratio'])}")
            best, worst = F[0], F[-1]
            print(f"  extremes best {best['label']} {n2(best['ratio'])} · "
                  f"worst {worst['label']} {n2(worst['ratio'])}")
            # positions, not membership: swapping best and worst leaves both
            # names and both ratios on the page, so an "is it mentioned" check
            # passes on a headline that says the opposite. It ran green once.
            head = got["head"].lower()
            at = {}
            for f, which in ((best, "best"), (worst, "worst")):
                i = head.find(f["label"].lower())
                at[which] = i
                if i < 0:
                    fails.append(f"the headline does not name the {which} feature "
                                 f"({f['label']})")
                if n2(f["ratio"]) not in got["head"]:
                    fails.append(f"the headline does not quote the {which} ratio "
                                 f"{n2(f['ratio'])}")
            if at["best"] >= 0 and at["worst"] >= 0 and at["best"] > at["worst"]:
                fails.append(f"the headline puts {worst['label']} before {best['label']}; "
                             f"the file's best-predicted feature is {best['label']} at "
                             f"{n2(best['ratio'])} and the worst is {worst['label']} at "
                             f"{n2(worst['ratio'])}")
            for v, what in ((n2(ev_file["meanAbsErrPrimary"]), "primary MAE"),
                            (n2(ev_file["baselinePrimary"]), "guessing baseline")):
                if v not in got["read"]:
                    fails.append(f"the reading does not quote the {what} {v}")
            if str(counts.get("scored", "")) and f"{counts['scored']:,}" not in got["read"] \
                    and f"{counts['scored']:,}" not in got["scored"]:
                fails.append(f"the page never says how many rows were scored "
                             f"({counts['scored']:,})")
            if "not a lineup" not in got["method"].lower():
                fails.append("the method note no longer says why this is not a lineup — the whole "
                             "reason the page stopped offering one")
            low = got["body"].lower()
            back = [w for w in FORBIDDEN if re.search(r"\b" + re.escape(w), low)]
            print(f"  refuse   forbidden words present: {back or 'none'}")
            if back:
                fails.append(f"the page is offering {back} again, which the projection file's own "
                             f"method line says it cannot support")
            long_dec = re.search(r"\d+\.\d{3,}", got["body"])
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
        print("OK — with the file blocked /dfs says so and draws no bar" if args.block else
              "OK — every bar on /dfs is the ratio the file gives, in the file's order, and the "
              "page still says why it is not a lineup")
        return 0
    print(f"FAIL — {len(fails)} problem(s) on /dfs:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
