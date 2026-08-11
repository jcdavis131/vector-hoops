"""Open player cards and check that every link on them goes somewhere.

`/player-cards` renders 2,308 committed markdown cards with a small purpose-built
renderer that turned **every** `[[x]]` into an anchor, whether or not `x` was a
page. 2,306 of the 39,389 wikilinks across those cards resolve to nothing.

**And almost none of them ever rendered.** This file was written expecting a dead
link on every player card, because the source has one — the word appears in a
boilerplate sentence on all 2,293 of them:

    <!-- Curated layer. Add scouting notes, history, film observations,
         corrections, and further [[wikilinks]] here. -->

It is inside an HTML comment, and `render()` strips comments before `inline()`
ever sees them. **2,306 of the 2,308 unresolvable targets are hidden that way.**
The assertion below that the sentence appears as text failed on the first run,
which is how that got caught instead of shipped as a claim.

What was actually reaching a reader: **two** format examples in `OKF.md`
(`[[slug]]`, `[[../archetypes/slug]]`) rendering as anchors to nothing, and
`[[OKF|OKF.md]]` on `INDEX.md` — a real link to a real card — pointing at
`players/OKF`, because every bare slug was forced under `players/`. Three links.

`check_frontend`'s `wiki` check guards the source. This guards the render, which
is the half a static check cannot see: an anchor exists only once a page builds
it, and whether it is built at all depends on where in the file it sits.

Checked:

  resolve   every anchor a card renders has a target that is a committed card
  demote    OKF.md's two format examples are text, not anchors to nothing
  top       [[OKF|OKF.md]] from INDEX.md resolves — a bare slug that is not a
            player but is a top-level card, which the old rule forced under
            players/
  hubs      the 8 archetype and 5 position hubs list their members as links,
            not as the raw markdown that a naive row split leaves behind
  follow    clicking a rendered wikilink opens the card it names

    python scripts/smoke_wiki.py
    python scripts/smoke_wiki.py --mutate demote-bare    # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socket
import socketserver
import shutil
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
    "demote-label": [("if(!knows(p)) return label;", "")],
    "demote-bare":  [("if(!knows(p)) return esc(t);", "")],
    "norm":         [("return knows('players/'+s) ? 'players/'+s : (knows(s) ? s : 'players/'+s);",
                      "return 'players/'+s;")],
    # code spans are quotations: putting the span back inline before the
    # wikilink pass is exactly the bug this rule exists to stop
    "code":         [(r"return '\u0000'+(code.length-1)+'\u0000';", "return c;")],
    # the row splitter: one character, 520 broken table rows
    "table":        [("if(s[k]==='|' && !depth){ out.push(buf.trim()); buf=''; continue; }",
                      "if(s[k]==='|'){ out.push(buf.trim()); buf=''; continue; }")],
}

HUBS = ["archetypes/playmaking-steals", "positions/pg"]

# Every unresolvable target in the committed cards is either inside a comment the
# renderer strips or carries a label, so nothing on disk exercises the bare-link
# demotion — its mutation ran green for want of an input, not for want of a bug.
# This card is served from memory to give it one.
SYNTHETIC = """---
kind: player
name: "Smoke Test"
---
# Smoke Test

A bare link to [[nope-not-a-card]] and a labelled one to
[[also-nope|Also Nope]], neither of which is a page.

The format is `[[slug|Display Name]]`, quoted rather than linked.
"""

CARDS = ["a-c-green", "tim-duncan", "stephen-curry"]


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
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    kroot = SERVE / "knowledge"
    committed = {p.relative_to(kroot).as_posix()[:-3] for p in kroot.rglob("*.md")}
    if not committed:
        sys.exit("no knowledge cards under public/")

    page = (SERVE / "player-cards.html").read_text(encoding="utf-8")
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
            if self.path.split("?")[0] == "/knowledge/players/__smoke__.md":
                blob = SYNTHETIC.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/markdown; charset=utf-8")
                self.send_header("Content-Length", str(len(blob)))
                self.end_headers()
                self.wfile.write(blob)
                return
            if self.path.split("?")[0] in ("/", "/player-cards.html", "/player-cards"):
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

    profile = Path(tempfile.gettempdir()) / "vh-wiki"
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
        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"opening cards on /player-cards in {browser.name}{mut}\n")

        total_links = 0
        for slug in CARDS:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player-cards.html?p={slug}"})
            time.sleep(2.4)
            got = ev(ws, """(function(){
                var a=[].slice.call(document.querySelectorAll('#card a.wikilink'));
                var t=(document.getElementById('card').textContent||'');
                return JSON.stringify({paths:a.map(function(x){return x.getAttribute('data-path');}),
                                       labels:a.map(function(x){return x.textContent.trim();}),
                                       chars:t.length});})()""")
            if not isinstance(got, dict):
                fails.append(f"{slug}: the card did not render ({got!r})")
                continue
            bad = [p for p in got["paths"] if p not in committed]
            total_links += len(got["paths"])
            print(f"  {slug:<16} {len(got['paths']):>3} link(s), "
                  f"{len(bad)} unresolved, {got['chars']:,} chars")
            if bad:
                fails.append(f"{slug} renders {len(bad)} anchor(s) to nothing: {sorted(set(bad))[:4]}")
            if "wikilinks" in got["labels"]:
                fails.append(f"{slug} renders 'wikilinks' as a link")

        # [[OKF|OKF.md]] on INDEX: a bare slug that is not a player but is a card
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player-cards.html?w=INDEX"})
        time.sleep(2.2)
        okf = ev(ws, """(function(){
            var a=[].slice.call(document.querySelectorAll('#card a.wikilink'))
              .filter(function(x){return x.getAttribute('data-path')==='OKF';});
            return JSON.stringify({n:a.length, label:a.length?a[0].textContent.trim():null});})()""")
        print(f"  INDEX            {okf['n']} anchor(s) to OKF, labelled {okf['label']!r}")
        if okf["n"] != 1:
            fails.append(f"[[OKF|OKF.md]] on INDEX rendered as {okf} — OKF is a committed card "
                         f"and should be a link to it")

        # OKF.md's own format examples: unresolvable targets on a page a reader
        # can actually reach, which is what separates them from the 2,306 the
        # renderer never sees
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player-cards.html?w=OKF"})
        time.sleep(2.2)
        fmt = ev(ws, """(function(){
            var a=[].slice.call(document.querySelectorAll('#card a.wikilink'));
            var t=document.getElementById('card').textContent||'';
            return JSON.stringify({dead:a.map(function(x){return x.getAttribute('data-path');})
                                     .filter(function(p){return /slug/.test(p);}),
                                   hasText:/slug/.test(t), chars:t.length});})()""")
        print(f"  OKF format       {len(fmt['dead'])} anchor(s) to a slug example, "
              f"example words present: {fmt['hasText']}, {fmt['chars']:,} chars")
        if fmt["dead"]:
            fails.append(f"OKF.md's format examples still render as anchors to nothing: "
                         f"{fmt['dead'][:3]}")
        if not fmt["hasText"]:
            fails.append("OKF.md's format examples vanished entirely — demoting a link should "
                         "leave its words behind, not delete them")

        # the hubs: every member row is a link, and no cell is raw markdown
        for hub in HUBS:
            ws.call("Page.navigate",
                    {"url": f"http://127.0.0.1:{site}/player-cards.html?w={hub}"})
            time.sleep(2.3)
            h = ev(ws, """(function(){
                var tds=[].slice.call(document.querySelectorAll('#card td'));
                return JSON.stringify({
                  cells:tds.length,
                  links:document.querySelectorAll('#card td a.wikilink').length,
                  raw:tds.filter(function(d){return /\\[\\[|\\]\\]/.test(d.textContent);}).length,
                  first:tds.length?tds[0].textContent.trim().slice(0,40):''});})()""")
            print(f"  {hub:<30} {h['cells']:>3} cell(s), {h['links']} link(s), "
                  f"{h['raw']} raw, first {h['first']!r}")
            if not h["cells"]:
                fails.append(f"{hub} rendered no member table at all")
            if h["raw"]:
                fails.append(f"{hub} leaves {h['raw']} table cell(s) as raw markdown — "
                             f"a wikilink's own pipe is being read as a column break")
            if h["links"] < h["cells"] / 3:
                fails.append(f"{hub} has {h['cells']} cells but only {h['links']} links; "
                             f"the member column is not linking")

        # the bare-link branch, on a card built to have one
        ws.call("Page.navigate",
                {"url": f"http://127.0.0.1:{site}/player-cards.html?p=__smoke__"})
        time.sleep(2.3)
        syn = ev(ws, """(function(){
            var t=document.getElementById('card').textContent||'';
            return JSON.stringify({
              anchors:document.querySelectorAll('#card a.wikilink').length,
              bare:/nope-not-a-card/.test(t), labelled:/Also Nope/.test(t),
              codeKept:/\\[\\[slug\\|Display Name\\]\\]/.test(t),
              inCode:(document.querySelector('#card code')||{}).textContent||''});})()""")
        print(f"  synthetic        {syn['anchors']} anchor(s), bare as text {syn['bare']}, "
              f"labelled as text {syn['labelled']}, format quoted {syn['codeKept']}")
        if syn["anchors"]:
            fails.append(f"a card whose every target is unresolvable still rendered "
                         f"{syn['anchors']} anchor(s)")
        if not syn["bare"]:
            fails.append("a bare unresolvable link lost its words instead of becoming text")
        if not syn["labelled"]:
            fails.append("a labelled unresolvable link lost its label instead of becoming text")
        if not syn["codeKept"]:
            fails.append(f"`[[slug|Display Name]]` in backticks was linkified instead of quoted "
                         f"— the code span reads {syn['inCode']!r}")

        # follow one
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/player-cards.html?p=a-c-green"})
        time.sleep(2.4)
        before = ev(ws, "document.title")
        ev(ws, "document.querySelector('#card a.wikilink').click()")
        time.sleep(2.2)
        after = ev(ws, "document.title")
        followed = ev(ws, "JSON.stringify([document.getElementById('card').textContent.length,"
                          "location.search])")
        print(f"  follow   {before!r} -> {after!r}, {followed[0]:,} chars at {followed[1]!r}")
        if after == before or not followed[0]:
            fails.append(f"clicking a wikilink left the page on {after!r}")
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
        print(f"OK — {total_links} link(s) across {len(CARDS)} cards all land on a committed "
              f"card, and the boilerplate that never had a page behind it is text")
        return 0
    print(f"FAIL — {len(fails)} problem(s) on the cards:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
