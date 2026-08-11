"""Type a surname into the era-twin box on /trends.

The section asks "Who is the modern version of…?" and the box under it matched
with `k.indexOf(v)===0` — a prefix test against the whole name. So a surname
found nothing, and what the visitor was told was not "try a full name", it was:

    No charted career by that name with at least four seasons.

for "curry", while assets/eratwins.json holds five of them — Dell, Michael, Eddy,
Stephen and Seth. Telling someone a career is not charted when it is is worse
than finding nothing.

The same box also had the /player-cards bug, one page over:

    $('twinInput').addEventListener('input',function(){ if(!TW) load(); else lookup(); });

While the 632 KB is in flight, typing calls the loader and never the lookup, so
lookup()'s own "Still loading…" branch could not be reached by typing at all.
Measured on Fast 3G: the box was empty for 2,459 ms and then answered. load() is
memoised here — unlike player-cards, this never re-downloaded — so the cost was
silence rather than bandwidth.

Nothing below is hardcoded to a player. The queries are derived in-page from the
index that actually loaded: one token that matches several careers and one that
matches exactly one. A fixture name would rot the first time the file is rebuilt.

    python scripts/smoke_trends.py
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
PAGE = "/trends.html"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

FAST3G = {"offline": False, "latency": 150,
          "downloadThroughput": 1.6 * 1024 * 1024 / 8,
          "uploadThroughput": 750 * 1024 / 8}

STATE = """(function(){
  var r=document.getElementById('twinResult'), l=document.getElementById('live');
  return JSON.stringify({
    result:((r&&r.textContent)||'').trim(),
    live:((l&&l.textContent)||'').trim()});
})()"""

# One token several careers share, and one only a single career has. Derived
# from the datalist the page built for itself, so this cannot drift from the file.
PICK = """(function(){
  var opts=[].slice.call(document.querySelectorAll('#twinNames option'))
              .map(function(o){return (o.value||'').toLowerCase();});
  if(opts.length<50) return JSON.stringify({err:'only '+opts.length+' names in the datalist'});
  var counts={};
  opts.forEach(function(n){
    n.split(/\\s+/).forEach(function(tok){
      if(tok.length<5) return;
      counts[tok]=(counts[tok]||0)+opts.filter(function(x){return x.indexOf(tok)>=0;}).length/
                  opts.filter(function(x){return x.indexOf(tok)>=0;}).length; });
  });
  function hits(tok){ return opts.filter(function(x){return x.indexOf(tok)>=0;}); }
  var toks=Object.keys(counts);
  var many=null, one=null;
  for(var i=0;i<toks.length;i++){
    var h=hits(toks[i]);
    if(!many && h.length>=3 && h.length<=6) many={tok:toks[i],n:h.length,names:h};
    if(!one && h.length===1) one={tok:toks[i],n:1,names:h};
    if(many&&one) break;
  }
  return JSON.stringify({many:many, one:one, total:opts.length});
})()"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def typed(ws, text, clear_live=False):
    """Type a query a character at a time, as a person does.

    clear_live blanks the live region just before the final keystroke. Without
    that, an announcement check can be satisfied by an *earlier* one: typing
    "mckie" passes through "mck", whose match list already names Aaron McKie, so
    a card assertion looking for that name passed with the card's own say()
    deleted. Emptying the region first means only this keystroke can fill it.
    """
    ev(ws, "(function(){var q=document.getElementById('twinInput');q.value='';"
           "q.dispatchEvent(new Event('input',{bubbles:true}));})()")
    for i, ch in enumerate(text):
        if clear_live and i == len(text) - 1:
            ev(ws, "(function(){var l=document.getElementById('live');"
                   "if(l) l.textContent='';})()")
            time.sleep(0.05)
        ev(ws, "(function(){var q=document.getElementById('twinInput');q.value+=" +
               json.dumps(ch) + ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(0.05)


def main() -> int:
    argparse.ArgumentParser().parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    hits = {"twins": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if "eratwins.json" in self.path:
                hits["twins"] += 1
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

    profile = Path(tempfile.gettempdir()) / "vh-trends"
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

        print(f"searching {PAGE} on Fast 3G in {browser.name}\n")
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable"); ws.call("Network.enable")
        ws.call("Network.setCacheDisabled", {"cacheDisabled": True})
        ws.call("Network.emulateNetworkConditions", FAST3G)
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(8)
        hits["twins"] = 0

        # 1. the wait. Scroll in, type immediately, and look before the 632 KB
        #    can possibly have landed on this link.
        ev(ws, "document.getElementById('twinSection').scrollIntoView()")
        time.sleep(0.3)
        ev(ws, "document.getElementById('twinInput').focus()")
        t0 = time.time()
        typed(ws, "curry")
        during = ev(ws, STATE)
        ms = (time.time() - t0) * 1000
        print(f"  waiting  +{ms:.0f} ms  result={during['result'][:38]!r}  "
              f"live={during['live'][:34]!r}")
        if not during["result"]:
            failures.append(
                f"typing left the result box empty {ms:.0f} ms in — 632 KB is still in "
                f"flight and nothing on screen says so, which is the one state the box "
                f"has a message for and cannot reach")
        elif not during["live"]:
            failures.append("the wait is shown but not announced, so a non-visual visitor "
                            "has no way to tell a slow lookup from a broken one")

        # let it land
        for _ in range(60):
            time.sleep(0.4)
            if ev(ws, "!!document.querySelectorAll('#twinNames option').length"):
                break
        time.sleep(0.6)

        print(f"  requests eratwins.json fetched {hits['twins']} time(s) for 5 keystrokes")
        if hits["twins"] > 1:
            failures.append(f"{hits['twins']} downloads of a 632 KB file for one search — "
                            f"the loader is not memoised, so every keystroke starts another")

        picks = ev(ws, PICK)
        if not isinstance(picks, dict) or picks.get("err") or not picks.get("many"):
            failures.append(f"could not derive test queries from the loaded index: {picks}")
        else:
            # 2. a token several careers share. The count shown has to be the
            #    real one, and it must never claim there are none.
            many = picks["many"]
            typed(ws, many["tok"], clear_live=True)
            time.sleep(0.4)
            s = ev(ws, STATE)
            print(f"  shared   {many['tok']!r} matches {many['n']} → {s['result'][:52]!r}")
            if "no charted career" in s["result"].lower():
                failures.append(
                    f"{many['tok']!r} is in {many['n']} charted careers "
                    f"({', '.join(many['names'][:3])}…) and the page says there are none — "
                    f"a surname is how anybody types a basketball player")
            elif str(many["n"]) not in s["result"]:
                failures.append(f"{many['tok']!r} matches {many['n']} careers and the result "
                                f"does not say so: {s['result'][:70]!r} — a list that stops "
                                f"silently reads as all of them")
            # "not empty" is not an announcement: #live still held the
            # "Still loading…" line from a moment earlier, so both announcement
            # assertions passed with their say() deleted. Tie the check to THIS
            # answer — the count and one of the names that are on screen now.
            spoken = s["live"].lower()
            if str(many["n"]) not in spoken or not any(n in spoken for n in many["names"]):
                failures.append(
                    f"the match list is on screen and the live region reads "
                    f"{s['live'][:54]!r} — not this answer, so a non-visual visitor is "
                    f"left with whatever was announced before it")

            # 3. a token exactly one career has resolves straight to the card
            one = picks.get("one")
            if one:
                typed(ws, one["tok"], clear_live=True)
                time.sleep(0.4)
                s2 = ev(ws, STATE)
                print(f"  unique   {one['tok']!r} → {s2['result'][:52]!r}")
                if "did you mean" in s2["result"].lower() or not s2["result"]:
                    failures.append(f"{one['tok']!r} matches exactly one charted career and "
                                    f"the page still asks which one: {s2['result'][:60]!r}")
                elif one["names"][0] not in s2["live"].lower():
                    failures.append(
                        f"the card for {one['names'][0]!r} is on screen and the live region "
                        f"reads {s2['live'][:54]!r} — the rotation chart and the archetype "
                        f"map both announce, and this box is the answer the section is "
                        f"named after")

            # 4. a name nobody has still has to be told honestly
            typed(ws, "zzzznotaplayer")
            time.sleep(0.4)
            s3 = ev(ws, STATE)
            print(f"  absent   'zzzznotaplayer' → {s3['result'][:52]!r}")
            if not s3["result"]:
                failures.append("a name with no match leaves the box empty, which reads as "
                                "a broken search rather than an answer")

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
        print(f"FAIL — {len(failures)} problem(s) looking up a career:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — the era-twin box says something while it loads, fetches its index once, "
          "finds a career by surname, names every match it found, and announces the answer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
