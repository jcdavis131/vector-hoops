"""Find a player on the Explorer without a mouse.

The brief centres everything on the embedding map, and the Explorer is where it
lives. Its list rendered `dots.slice(0,80)` — the first 80 of however many the
filter left, 1,764 with All selected — and said nothing about the other 1,684,
while the label beside the map printed both `dots.length` and a frozen 1814 at
once. So the page disagreed with itself in public, and the only route to a player
outside those 80 was clicking a dot on a canvas.

What this asserts:

  live      the search box ships `disabled` and the script enables it, so a page
            with no JS is honest about it rather than offering a dead control
  narrows   a name that belongs to one player leaves that player, and the count
            says how many are on screen
  capped    with no query the list still caps, and now says what it is capping —
            "80 of 1,764 shown" rather than 80 rows and silence
  empty     a query nobody matches says so instead of leaving a blank list
  restored  clearing brings the list back
  operable  every row is still `role="button"` and focusable AFTER a re-render —
            the rows are <div onclick>, stamped by a MutationObserver, and a
            search that rebuilds the list is exactly what breaks that stamping

The query is derived from the data that loaded, never hardcoded to a player.

    python scripts/smoke_explorer.py
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
PAGE = "/players.html"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

STATE = r"""(function(){
  var rows=[].slice.call(document.querySelectorAll('#list .it'));
  var q=document.getElementById('pq');
  return JSON.stringify({
    rows:rows.length,
    first:rows.length?(rows[0].textContent||'').replace(/\s+/g,' ').trim().slice(0,40):'',
    unstamped:rows.filter(function(r){
      return r.getAttribute('role')!=='button' || r.getAttribute('tabindex')!=='0'; }).length,
    said:((document.getElementById('pqCount')||{}).textContent||'').trim(),
    disabled:!!(q&&q.disabled),
    pool:(typeof dots!=='undefined'&&dots)?dots.length:-1});
})()"""

PICK = r"""(function(){
  if(typeof dots==='undefined'||!dots||!dots.length) return JSON.stringify({err:'no dots'});
  var names=dots.map(function(d){return String(d.nm||'').toLowerCase();});
  for(var i=0;i<names.length;i++){
    var n=names[i];
    if(n.length<6) continue;
    var hits=names.filter(function(x){return x.indexOf(n)>=0;}).length;
    if(hits===1) return JSON.stringify({q:n, total:dots.length});
  }
  return JSON.stringify({err:'no name in the pool is unique to itself'});
})()"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        d = r["exceptionDetails"]
        ex = (d.get("exception") or {}).get("description") or d.get("text") or "exception"
        return {"err": " ".join(str(ex).split())[:140]}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def typed(ws, text):
    ev(ws, "(function(){var q=document.getElementById('pq');q.value=" + json.dumps(text) +
           ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
    time.sleep(0.45)


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

    profile = Path(tempfile.gettempdir()) / "vh-explorer"
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

        print(f"searching {PAGE} in {browser.name}\n")
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(5)

        s0 = ev(ws, STATE)
        print(f"  loaded   pool={s0['pool']} rows={s0['rows']} "
              f"box disabled={s0['disabled']} said {s0['said'][:44]!r}")
        if s0.get("disabled"):
            failures.append("the search box is still disabled after the page loaded — it "
                            "ships that way so a page with no JS is honest, and the script "
                            "is what makes it real")
        if s0.get("pool", 0) < 100:
            failures.append(f"only {s0.get('pool')} points loaded — this is not looking at "
                            f"the Explorer's real pool")
        elif s0["pool"] > s0["rows"]:
            if str(s0["rows"]) not in s0["said"] or str(s0["pool"]) not in s0["said"]:
                failures.append(
                    f"the list shows {s0['rows']} of {s0['pool']} players and says "
                    f"{s0['said'][:60]!r} — a list that stops without saying so reads as "
                    f"the whole pool, and the label beside the map says {s0['pool']}")
        if s0.get("unstamped"):
            failures.append(f"{s0['unstamped']} list row(s) are not role=button with a "
                            f"tabindex — the rows are <div onclick> and unreachable by "
                            f"keyboard without that stamping")

        pick = ev(ws, PICK)
        if not isinstance(pick, dict) or pick.get("err"):
            failures.append(f"could not derive a query from the loaded pool: {pick}")
        else:
            typed(ws, pick["q"])
            s1 = ev(ws, STATE)
            print(f"  narrows  {pick['q']!r} → rows={s1['rows']} first={s1['first'][:30]!r} "
                  f"said {s1['said'][:40]!r}")
            if s1["rows"] != 1:
                failures.append(f"{pick['q']!r} belongs to one player in the pool and the "
                                f"list shows {s1['rows']} — the search is not filtering on "
                                f"what it says it is")
            elif str(s1["rows"]) not in s1["said"]:
                failures.append(f"one player is on screen and the count says "
                                f"{s1['said'][:50]!r}")
            if s1.get("unstamped"):
                failures.append(f"after a search re-render {s1['unstamped']} row(s) lost "
                                f"role=button — the observer that stamps them did not run, "
                                f"so the results cannot be reached by keyboard")

            typed(ws, "zzzznotaplayer")
            s2 = ev(ws, STATE)
            print(f"  absent   'zzzznotaplayer' → rows={s2['rows']} said {s2['said'][:44]!r}")
            if s2["rows"]:
                failures.append(f"a query nothing matches still lists {s2['rows']} player(s)")
            elif not s2["said"]:
                failures.append("a query nothing matches empties the list and says nothing — "
                                "a blank list with no message reads as broken, not filtered")

            typed(ws, "")
            s3 = ev(ws, STATE)
            print(f"  cleared  rows={s3['rows']} said {s3['said'][:44]!r}")
            if s3["rows"] != s0["rows"]:
                failures.append(f"clearing the box left {s3['rows']} rows against "
                                f"{s0['rows']} before — the list does not come back")

            # A selection you can send to somebody. Picking a player draws their
            # career as an orange polyline, and that used to live only in memory:
            # no link, no bookmark, gone on reload.
            ev(ws, "document.querySelectorAll('.it')[0].scrollIntoView({block:'center'})")
            time.sleep(0.7)
            r = ev(ws, "(function(){var b=document.querySelectorAll('.it')[0]"
                       ".getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()")
            if isinstance(r, dict):
                for kind in ("mousePressed", "mouseReleased"):
                    ws.call("Input.dispatchMouseEvent", {"type": kind, "x": r["x"], "y": r["y"],
                                                         "button": "left", "clickCount": 1})
                time.sleep(2.2)
                url = ev(ws, "location.search") or ""
                lab = (ev(ws, "(document.getElementById('selLab')||{}).innerText||''") or "")
                print(f"  picked   url={url!r} sel={lab[:44]!r}")
                if "pid=" not in url:
                    failures.append(f"selecting a player left the address bar at {url!r} — the "
                                    f"selection cannot be linked to, bookmarked, or survive a reload")

                # and the link has to open on that player
                ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/players.html{url}"})
                time.sleep(6.0)
                lab2 = (ev(ws, "(document.getElementById('selLab')||{}).innerText||''") or "")
                print(f"  reopened sel={lab2[:44]!r}")
                if lab2.strip() != lab.strip():
                    failures.append(f"opening {url!r} cold selected {lab2[:50]!r}; clicking the "
                                    f"row had selected {lab[:50]!r}")

                # a pid the file does not carry says so rather than selecting nothing
                ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/players.html?pid=99999999"})
                time.sleep(6.0)
                lab3 = (ev(ws, "(document.getElementById('selLab')||{}).innerText||''") or "")
                print(f"  bad pid  sel={lab3[:52]!r}")
                if "99999999" not in lab3:
                    failures.append(f"a pid that is not in the file answered {lab3[:60]!r} rather "
                                    f"than naming the pid it could not find")

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
        print(f"FAIL — {len(failures)} problem(s) finding a player:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — the Explorer's search is live, narrows to the player asked for, says how "
          "many of how many it is showing, says so when nothing matches, gives the list "
          "back when cleared, and every row stays reachable by keyboard")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
