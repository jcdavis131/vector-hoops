"""Type into the player-cards search before its 539 KB index has arrived.

/player-cards is 30.4 KB on load; `assets/wiki_index.json` is 539 KB and lazy.
Everything interesting happens in the gap, and two defects lived there — both
invisible to every gate, because the search works perfectly once the index is in
and every existing check waits for a quiet page before it looks.

  once     `loadIndex()` short-circuited on IDX, which stays null for the whole
           flight, so focus plus five keystrokes started six downloads of the same
           539 KB. Measured on Fast 3G: five requests for "curry", contending, and
           first results at 12.0 seconds against 2.7 for one clean fetch.
  loading  `search()` had a `if(!IDX)` branch that renders "Loading index…", and
           the only caller was `IDX ? search() : loadIndex()` — so the branch could
           not be reached by typing. Twelve seconds of an empty list under a search
           box, with the right words sitting unreachable three lines away.

Both are one edit from returning and nothing else here would notice, so:

  1. however many keystrokes land before the index does, it is fetched once
  2. something says so while the wait is on
  3. the query typed during the wait produces results without retyping

Fast 3G, because on a fast link the gap this is about does not exist.

    python scripts/smoke_cards.py
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
PAGE = "/player-cards.html"
QUERY = "curry"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

FAST3G = {"offline": False, "latency": 150,
          "downloadThroughput": 1.6 * 1024 * 1024 / 8,
          "uploadThroughput": 750 * 1024 / 8}

STATE = """(function(){
  var q=document.getElementById('q'), h=document.getElementById('hits');
  if(!q||!h) return JSON.stringify({err:'no search box'});
  return JSON.stringify({
    typed:q.value,
    options:h.querySelectorAll('li[role="option"]').length,
    rows:h.querySelectorAll('li').length,
    text:(h.textContent||'').trim().slice(0,60),
    expanded:q.getAttribute('aria-expanded')});
})()"""


# Holds one card's fetch for three seconds. A controlled version of what an
# unlucky link does to a single resource, so the race has a decided winner
# instead of depending on which 3 KB file happens to arrive first.
HOLD = """
(function(){
  var orig=window.fetch;
  window.fetch=function(u,o){
    if(String(u).indexOf('vince-carter')>=0){
      return new Promise(function(res,rej){
        setTimeout(function(){ orig(u,o).then(res,rej); }, 3000);
      });
    }
    return orig(u,o);
  };
})();
"""

CARD = """(function(){
  var c=document.getElementById('card');
  return JSON.stringify({
    title:document.title.slice(0,44),
    url:location.search,
    body:((c&&c.textContent)||'').trim().slice(0,70),
    live:((document.getElementById('live')||{}).textContent||'').trim().slice(0,44)});
})()"""


def pick(ws, query, needle):
    """Type a query, wait for options, click the one whose text contains needle."""
    ev(ws, "(function(){var q=document.getElementById('q');q.value=" + json.dumps(query) +
           ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
    for _ in range(40):
        time.sleep(0.25)
        if ev(ws, "document.querySelectorAll('#hits li[role=\"option\"]').length"):
            break
    return ev(ws,
              "(function(){var o=[].slice.call("
              "document.querySelectorAll('#hits li[role=\"option\"]'));"
              "var t=o.filter(function(x){return (x.textContent||'').toLowerCase().indexOf(" +
              json.dumps(needle.lower()) + ")>=0;})[0];"
              "if(!t) return 'NOT FOUND';t.click();"
              "return (t.textContent||'').trim().slice(0,30);})()")


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


def main() -> int:
    argparse.ArgumentParser().parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    hits = {"index": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if "wiki_index.json" in self.path:
                hits["index"] += 1
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

    profile = Path(tempfile.gettempdir()) / "vh-cards"
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
        time.sleep(3)
        hits["index"] = 0

        # a visitor clicks the box and types immediately — the box is the page
        ev(ws, "document.getElementById('q').focus()")
        time.sleep(0.15)
        for ch in QUERY:
            ev(ws, "(function(){var q=document.getElementById('q');q.value+=" +
                   json.dumps(ch) + ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
            time.sleep(0.18)

        during = ev(ws, STATE)
        if not isinstance(during, dict) or during.get("err"):
            failures.append(f"the page has no search box: {during}")
            raise SystemExit
        print(f"  while loading  rows={during['rows']} options={during['options']} "
              f"{during['text'][:44]!r}")
        if during["rows"] == 0:
            failures.append(
                "typing before the index arrives leaves the results list completely "
                "empty — search() has a 'Loading index…' branch for exactly this and "
                "its caller guards on the condition that would reach it, so a visitor "
                "on a slow link watches nothing happen for ten seconds")
        if during["expanded"] == "true" and during["options"] == 0:
            failures.append("the combobox reports expanded with no options in it")

        # results have to arrive for the query already typed, without retyping
        got = None
        for _ in range(40):
            time.sleep(0.5)
            got = ev(ws, STATE)
            if got["options"] > 0:
                break
        print(f"  settled        options={got['options']} {got['text'][:44]!r}")
        if not got["options"]:
            failures.append(
                f"the index arrived and {QUERY!r} produced no options — the query typed "
                f"during the wait was dropped, so the search only works for people who "
                f"type again after it finishes")

        print(f"  requests       {hits['index']} for {len(QUERY)} keystrokes plus focus")
        if hits["index"] != 1:
            failures.append(
                f"the 539 KB index was requested {hits['index']} times for one search — "
                f"loadIndex memoises its result and IDX is null for the whole flight, so "
                f"every keystroke starts another download and they contend")

        # 4 + 5. the failure path, and whether it can be recovered from. Holding the
        #        promise makes a failed load sticky unless the catch clears it, so
        #        "a later keystroke can retry" is a claim that needs a second request
        #        to back it up — the same claim-without-a-run that the landing page's
        #        button was committed with one pass ago.
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(2.5)
        ws.call("Network.setBlockedURLs", {"urls": ["*wiki_index.json*"]})
        ev(ws, "document.getElementById('q').focus()")
        time.sleep(0.2)
        for ch in QUERY:
            ev(ws, "(function(){var q=document.getElementById('q');q.value+=" +
                   json.dumps(ch) + ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
            time.sleep(0.15)
        time.sleep(2.0)
        blocked = ev(ws, STATE)
        said = ev(ws, "(document.getElementById('live')||{}).textContent||''")
        print(f"\n  index blocked  {blocked['text'][:44]!r} expanded={blocked['expanded']!r}")
        print(f"                 announced {str(said).strip()[:48]!r}")
        if "unavailable" not in blocked["text"].lower():
            failures.append(f"with the index blocked the results list shows "
                            f"{blocked['text'][:60]!r} — a visitor is left with an empty "
                            f"box and no reason for it")
        if blocked["expanded"] == "true":
            failures.append("the combobox claims to be expanded over a failure message")
        if "could not" not in str(said).lower():
            failures.append(f"a failed index announced {str(said).strip()[:60]!r} — someone "
                            f"who cannot see the list is told nothing went wrong")

        ws.call("Network.setBlockedURLs", {"urls": []})
        before = hits["index"]
        ev(ws, "(function(){var q=document.getElementById('q');q.value+='x';"
               "q.dispatchEvent(new Event('input',{bubbles:true}));"
               "q.value=q.value.slice(0,-1);"
               "q.dispatchEvent(new Event('input',{bubbles:true}));})()")
        again = None
        for _ in range(30):
            time.sleep(0.4)
            again = ev(ws, STATE)
            if again["options"] > 0:
                break
        print(f"  after recovery requests {before} -> {hits['index']}, "
              f"options {again['options']}")
        if hits["index"] <= before:
            failures.append(
                "typing again after a failed index started no new request — the catch "
                "does not clear the memoised promise, so one bad network moment leaves "
                "the search permanently dead for that visit")
        elif not again["options"]:
            failures.append("the index loaded on retry and the search still shows nothing")

        # 6. two cards in quick succession. open() writes the card, the title, the
        #    history entry and the announcement on resolve, so without a sequence
        #    guard the request that finishes LAST wins whichever the visitor asked
        #    for last. One request is held deliberately, because the cards are
        #    2.6-5.4 KB and real jitter will not decide this reliably in a test.
        ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": HOLD})
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(2.5)
        ev(ws, "document.getElementById('q').focus()")
        time.sleep(2.5)
        first = pick(ws, "vince carter", "vince carter")
        time.sleep(0.4)
        second = pick(ws, "gerald brown", "gerald brown")
        print(f"\n  raced          {first!r} held, then {second!r}")
        if "NOT FOUND" in (str(first), str(second)):
            failures.append("could not find both cards to race — the search returned neither")
        else:
            time.sleep(5.0)
            end = ev(ws, CARD)
            print(f"  5s later       title {end['title']!r} url {end['url']!r}")
            print(f"                 announced {end['live']!r}")
            landed = (end["title"] + end["url"] + end["live"]).lower()
            if "brown" not in landed:
                failures.append(
                    f"a card the visitor moved away from replaced the one they chose — "
                    f"title {end['title']!r}, url {end['url']!r}. open() has no sequence "
                    f"guard, so a slow response overwrites a newer one and pushes a "
                    f"history entry for a page nobody navigated to")

            # 7. the same race, but the held request FAILS. The catch writes the
            #    "No wiki page" copy, so it needs the guard too — a stale 404 must
            #    not land on a card the visitor has since opened. Cache is disabled
            #    for this run, so blocking really does reach the network.
            ws.call("Network.setBlockedURLs", {"urls": ["*vince-carter.md*"]})
            pick(ws, "vince carter", "vince carter")
            time.sleep(0.4)
            pick(ws, "gerald brown", "gerald brown")
            time.sleep(5.0)
            after = ev(ws, CARD)
            ws.call("Network.setBlockedURLs", {"urls": []})
            print(f"  raced a 404    title {after['title']!r} url {after['url']!r}")
            if "no wiki page" in after["body"].lower():
                failures.append(
                    f"a card that failed to load replaced one the visitor had already "
                    f"opened — the catch writes its 'No wiki page' copy without checking "
                    f"whether it is still the current request, so a dead link three "
                    f"seconds ago wipes out the page someone is reading now")
            if "brown" not in (after["title"] + after["url"]).lower():
                failures.append(
                    f"a failed card took over the title and url: {after['title']!r} "
                    f"{after['url']!r}")

            # 9. The announcement has to count the matches, not the cap. `hits`
            #    was sliced to ten before anything counted it, so a query with
            #    forty matches told a screen-reader user "10 matches" and showed
            #    ten rows with nothing saying there were more.
            #
            #    The true count comes from the index this test already serves,
            #    not from the page: IDX lives inside an IIFE and Runtime.evaluate
            #    cannot see it, and asking the page how many matches it found is
            #    asking the thing under test to grade itself.
            seed, true_n = None, 0
            try:
                idx = json.loads((SERVE / "assets" / "wiki_index.json")
                                 .read_text(encoding="utf-8"))
                names = [str(x.get("name", "")).lower() for x in (idx.get("players") or [])]
                for cand in ("an", "ar", "on", "er", "le", "ma", "jo", "ri"):
                    n = sum(1 for x in names if cand in x)
                    if n > 12:
                        seed, true_n = cand, n
                        break
            except Exception as e:                                   # noqa: BLE001
                failures.append(f"could not read the index to count matches: {e}")

            if seed:
                ev(ws, "(function(){var q=document.getElementById('q');q.value=" +
                       json.dumps(seed) +
                       ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
                time.sleep(0.8)
                shown = ev(ws, "document.querySelectorAll('#hits li[role=\"option\"]').length")
                spoken = str(ev(ws, "(document.getElementById('live')||{}).textContent") or "")
                print(f"  counted        {seed!r} matches {true_n}, list shows {shown}, "
                      f"said {spoken.strip()[:52]!r}")
                if str(true_n) not in spoken:
                    failures.append(
                        f"{seed!r} matches {true_n} charted players and the announcement "
                        f"says {spoken.strip()[:44]!r} — that is the length of the list, "
                        f"not the number of matches, so the one number a non-visual "
                        f"visitor gets is the cap")
                elif isinstance(shown, int) and 0 < shown < true_n \
                        and "showing" not in spoken.lower():
                    failures.append(
                        f"{shown} of {true_n} matches are on screen and the announcement "
                        f"does not say the list is cut short: {spoken.strip()[:50]!r}")
            elif not failures or "could not read the index" not in failures[-1]:
                failures.append("no two-letter seed matches more than twelve names, so the "
                                "capped-count path was never exercised")

            # 8. Back. open() pushes a history entry and rewrites document.title, so
            #    backing out of a card has to undo both. Measured before the fix:
            #      Back   url ''   hidden=True   title 'Vince Carter — Vector Hoops'
            #    — the card was gone and the tab still named it. A title is what the
            #    tab shows, what a bookmark saves, and what a screen reader reads on
            #    navigation.
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
            time.sleep(3)
            base_title = ev(ws, "document.title")
            ev(ws, "document.getElementById('q').focus()")
            time.sleep(2.5)
            picked = pick(ws, "gerald brown", "gerald brown")
            time.sleep(1.5)
            opened = ev(ws, CARD)
            ev(ws, "history.back()")
            time.sleep(2.0)
            backed = ev(ws, CARD)
            hidden = ev(ws, "!!(document.getElementById('cardWrap')||{}).hidden")
            print(f"  back           {picked!r} -> url {backed['url']!r} hidden={hidden} "
                  f"title {backed['title'][:34]!r}")
            if opened["title"] == base_title:
                failures.append("opening a card did not change the document title, so the "
                                "Back assertion below cannot mean anything")
            elif backed["title"] != base_title:
                failures.append(
                    f"after backing out of a card the tab still reads "
                    f"{backed['title'][:44]!r} rather than {base_title[:44]!r} — the card "
                    f"is gone and the title, the bookmark and the screen reader all still "
                    f"name it")
            if not hidden:
                failures.append("backing out of a card left the card on screen")
            if "closed" not in (backed["live"] or "").lower():
                failures.append(
                    f"backing out of a card announced {backed['live'][:44]!r} — a "
                    f"non-visual visitor is told when a card opens and nothing when it "
                    f"goes away")
    except SystemExit:
        pass
    finally:
        if ws:
            ws.close()
        proc.kill()
        httpd.shutdown()

    if failures:
        print(f"\nFAIL — {len(failures)} problem(s) in the player search:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — the search says it is loading, fetches its index once, and answers the "
          "query typed while it waited")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
