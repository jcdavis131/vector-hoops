"""Block every file /player reads and check it invents nothing.

This page has produced a fresh set of made-up numbers on every pass over it, and
until now it had no smoke at all — the only substantial page on the site without
one. What has been found here, in order:

    it sat in public/ with no root counterpart, so all sixteen root-walking
    checks went past it: prices on a free site, unsourced figures, ten cards
    with no heading, no <h1>, no <main>, 388px of layout at 320

    5,231,646 bytes fetched for a 19 KB page, {cache:'no-store'} on three of
    four, and on failure 480 players at random coordinates named Player0..479
    under a status line reading "30T · 20719×64-d" whether or not anything
    loaded

    a 2,753,469-byte file read with Array.isArray against an object, so it was
    fetched, parsed and discarded every visit while the line a visitor read was
    the typed "avgΔ -1.02" — against a real mean of -0.035

    and in one five-line function: a fit of "0.92/1.45" and a figure of
    "$10.6M" with no team file, an invented team at cap_pct 0.84 when the
    selected one was not found, and capN falling back to 0.9

Every one of those puts a number on screen with nothing behind it. So the
strongest thing this can assert is not that the page is right when the files
load — it is that the page says nothing numeric when they do not.

  props     the props line equals what props_summary.json holds
  teams     the picker is filled from front_office_lite.json, in cap_pct order
  status    the counts on screen are the counts in the files
  blocked   with every file refused, no figure from any of them appears, and the
            page says they did not load

A fifth pass found the rest of it. vectors_map_lite.json's key is `players`, so
every `V.vectors` read was undefined: the status line called a loaded file
unloaded, the canvas drew from `[]`, and the twin search filtered on `v.n` and
`v.name`, which that file has never carried — so no query could match and every
visitor got the `else`. The fit score multiplied a `Math.random()` term and
printed three decimals. And five figures in the static copy — 20,719x64-d, 12
arch, sep 0.867, lift 0.8116, NN 98.2% pure — are in no committed file at all.

    python scripts/smoke_player.py
    python scripts/smoke_player.py --block
    python scripts/smoke_player.py --mutate props            # expect FAIL
    python scripts/smoke_player.py --mutate invent --block   # expect FAIL

`invent` restores the two typed figures in the branch that runs only when the
team file is missing, so it is driven with --block. On a normal load that branch
never executes, and the mutation ran green for want of an input — the same shape
of hole as smoke_wiki's demote-bare, and the reason the mutations check exists.

`scatter` puts Math.random() back into the canvas. No assertion over innerText
can see where a dot landed, so this one is caught by painting the map twice and
comparing the bytes.
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

# each one puts back a number the page used to invent
MUTATIONS = {
    "invent": [("noteEl.textContent = teams.length",
                "fitEl.textContent='0.92/1.45'; foreEl.textContent='$10.6M';"
                " noteEl.textContent = teams.length")],
    "props":  [("props.meanPtsDelta.toFixed(2)", "'-1.02'")],
    "status": [("teams.length+' teams · '+PTS.length.toLocaleString()+' map points'",
                "'30 teams · 20,719 map points'")],
    "movers": [("m.ptsDelta.toFixed(1)", "'+5.7'")],
    # the fit score multiplied a random term and printed three decimals
    "random": [("t.w_per_m.toFixed(2)", "(t.w_per_m*(1+Math.random()*0.2)).toFixed(3)")],
    # the map placed a point at a random spot rather than skipping it
    "scatter": [("c.arc(v.x*540+10, v.y*300+10,",
                 "c.arc(Math.random()*540+10, Math.random()*300+10,")],
}

BLOCKED = ("/assets/front_office_lite.json", "/assets/embedding_map_points_limited.json",
           "/assets/props_summary.json")


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
    ap.add_argument("--block", action="store_true",
                    help="refuse every file the page reads")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    A = SERVE / "assets"
    lite = json.loads((A / "front_office_lite.json").read_text(encoding="utf-8"))
    props = json.loads((A / "props_summary.json").read_text(encoding="utf-8"))
    vecs = json.loads((A / "embedding_map_points_limited.json").read_text(encoding="utf-8"))
    n_vec = len(vecs["points"])
    teams = lite["teams"]
    by_cap = sorted(teams, key=lambda t: t.get("cap_pct") or 0)

    page = (SERVE / "player.html").read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                # exit 2, not 1: a mutation that never applied must not look
                # like a mutation the assertions caught
                print("MUTATION DID NOT APPLY — "
                      f"mutation {args.mutate!r} no longer matches: {find!r}")
                raise SystemExit(2)
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/player.html", "/player"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(body)
                return
            if args.block and any(path.endswith(b) for b in BLOCKED):
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

    profile = Path(tempfile.gettempdir()) / "vh-player"
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
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player.html"})
        time.sleep(3.4)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        mut += "  [every file blocked]" if args.block else ""
        print(f"reading /player in {browser.name}{mut}\n")

        got = ev(ws, """(function(){
            var g=function(i){var e=document.getElementById(i);
              return e?(e.innerText||e.textContent||''):''; };
            var sel=document.getElementById('teamCap');
            return JSON.stringify({
              live:g('live'), props:g('props'), fitS:g('fitS'), foreS:g('foreS'),
              foreT:g('foreT'),
              opts:sel?[].slice.call(sel.options).map(function(o){return o.value||o.text;}):[],
              body:(document.body.innerText||'')});})()""")
        if not isinstance(got, dict):
            sys.exit(f"the page did not render: {got!r}")

        if args.block:
            print(f"  live     {got['live'][:66]!r}")
            print(f"  props    {got['props'][:66]!r}")
            print(f"  fit/fore {got['fitS']!r} / {got['foreS']!r}")
            if "did not load" not in got["live"].lower():
                fails.append(f"with every file refused the status line reads {got['live'][:60]!r}")
            if "did not load" not in got["props"].lower():
                fails.append(f"with the summary refused the props line reads "
                             f"{got['props'][:60]!r}")
            # nothing the files carry may appear
            forbidden = {f"{props['meanPtsDelta']:.2f}", f"{props['scored']:,}",
                         "0.92/1.45", "$10.6M", "-1.02", "20,719", f"{n_vec:,}"}
            back = sorted(w for w in forbidden if w and w in got["body"])
            print(f"  invented {back or 'nothing'}")
            if back:
                fails.append(f"with every file blocked the page still shows {back} — a number "
                             f"on screen with nothing behind it")
        else:
            print(f"  live     {got['live'][:70]!r}")
            print(f"  props    {got['props'][:96]!r}")
            print(f"  picker   {len(got['opts'])} option(s), first {got['opts'][:3]}")

            if str(len(teams)) not in got["live"] or f"{n_vec:,}" not in got["live"]:
                fails.append(f"the status line reads {got['live'][:70]!r}; the files hold "
                             f"{len(teams)} teams and {n_vec:,} vectors")
            if len(got["opts"]) != len(teams):
                fails.append(f"the team picker has {len(got['opts'])} options for "
                             f"{len(teams)} teams in the file")
            elif got["opts"][0] not in (by_cap[0]["abbr"], by_cap[0]["name"]):
                fails.append(f"the picker starts at {got['opts'][0]!r}; sorted by cap_pct the "
                             f"file's first is {by_cap[0]['abbr']} at {by_cap[0]['cap_pct']}")

            for val, what in ((f"{props['meanPtsDelta']:.2f}", "mean pts_delta"),
                              (f"{props['scored']:,}", "scored player-seasons"),
                              (f"{props['players']:,}", "player-seasons"),
                              (f"{props['medianPtsDelta']:.2f}", "median")):
                if val not in got["props"]:
                    fails.append(f"the props line does not quote the {what} {val} that "
                                 f"props_summary.json holds")
            m = (props.get("biggestMovers") or [None])[0]
            if m:
                if m["name"] not in got["props"]:
                    fails.append(f"the props line does not name {m['name']}, the biggest "
                                 f"qualified mover in the file")
                if f"{abs(m['ptsDelta']):.1f}" not in got["props"]:
                    fails.append(f"the props line does not quote {m['name']}'s "
                                 f"{m['ptsDelta']:+.1f}")
            if "market line" not in got["props"].lower():
                fails.append("the props line does not say a prop here is not a market line — "
                             "it is the prior season's average rounded to 0.5")
            for gone in ("0.92/1.45", "$10.6M", "-1.02"):
                if gone in got["body"]:
                    fails.append(f"{gone!r} is back on the page; it was typed, not computed")
            long_dec = re.search(r"\d+\.\d{3,}", got["body"])
            if long_dec:
                fails.append(f"more than two decimals on screen: {long_dec.group(0)!r}")

            # The twin search filtered on v.n and v.name, and the map file carries
            # neither — so no query could ever match and every visitor read the
            # `else`. Search for a player who is definitely in the file.
            who = vecs["points"][0]["display_name"]
            # twinQ lives inside the page's IIFE, so calling it by name throws and
            # leaves the load-time message on screen looking like an answer. Click
            # the button, which is what a visitor does.
            ev(ws, f"document.getElementById('q').value={json.dumps(who)}")
            ev(ws, "document.getElementById('btn').click()")
            time.sleep(0.3)
            twin = ev(ws, "document.getElementById('twin').innerText||''") or ""
            print(f"  twin     {who!r} -> {twin[:74]!r}")
            if who.split()[-1] not in twin:
                fails.append(f"the twin search was given {who!r}, who is in the map file, "
                             f"and answered {twin[:60]!r}")
            elif not re.search(r"distance \d\.\d\d", twin):
                fails.append(f"the twin search named {who} but quoted no neighbour distance: "
                             f"{twin[:70]!r}")

            # The canvas drew `v.x||Math.random()`, so a point with no coordinate
            # landed somewhere new every visit. No assertion over innerText can
            # see that — a smoke that reads only text would have passed it. Two
            # loads of one file over one dataset must paint the same bytes.
            first = ev(ws, "document.getElementById('map').toDataURL()")
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player.html"})
            time.sleep(3.0)
            second = ev(ws, "document.getElementById('map').toDataURL()")
            same = isinstance(first, str) and first == second
            print(f"  canvas   {len(first) if isinstance(first, str) else '?'} chars, "
                  f"identical across two loads: {same}")
            if not isinstance(first, str) or not first.startswith("data:image"):
                fails.append(f"the map canvas did not read back as an image: {str(first)[:60]!r}")
            elif not same:
                fails.append("the map painted differently on two loads of the same file over "
                             "the same data, so something in it is not derived from the data")
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
        print("OK — with every file refused /player shows no figure from any of them and says "
              "they did not load" if args.block else
              "OK — every number on /player is one its files carry, and the page names its own "
              "source for the props line")
        return 0
    print(f"FAIL — {len(fails)} problem(s) on /player:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
