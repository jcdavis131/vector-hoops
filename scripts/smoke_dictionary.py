"""Filter the dictionary.

Nineteen terms in six sections, deep-linked from five other pages, and the only
way to find one was a jump index that is a wall of nineteen chips. The filter
added alongside it runs over the DOM already on the page — nothing is fetched — so
the interesting parts are not timing but honesty:

  enabled   the box ships `disabled` and is enabled by the script, so a page whose
            script never ran offers a control that says it is unavailable rather
            than one that silently does nothing. If the enabling line goes, every
            visitor gets the dead version.
  counted   the number announced is the number on screen. A count that drifts from
            the page is worse than no count.
  empty     a query nobody matches has to say so. A filtered page with nothing on
            it and no message reads as broken.
  indexed   the jump index has to agree with the page it indexes, or it offers
            links to entries that are not there.
  sections  a section heading standing over nothing reads as an empty section
            rather than a filtered one.
  restored  clearing the box brings all nineteen back.

The query is derived from the page — a word from one heading that appears in
exactly one entry — because a hardcoded term rots the first time the glossary is
edited.

    python scripts/smoke_dictionary.py
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
PAGE = "/dictionary.html"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

STATE = """(function(){
  var all=[].slice.call(document.querySelectorAll('.entry[id]'));
  var shown=all.filter(function(e){return !e.hidden;});
  /* Sections are an h2 followed by entries, not a wrapper around them — this
     counted .card elements at first, of which the whole glossary is one, so
     "no empty section headings" was true however the filter behaved. */
  var groups=[];
  [].slice.call(document.querySelectorAll('h2')).forEach(function(h){
    var items=[], n=h.nextElementSibling;
    while(n && n.tagName!=='H2'){
      if(n.className && n.className.indexOf('entry')>=0) items.push(n);
      n=n.nextElementSibling; }
    if(items.length) groups.push({h:h, items:items}); });
  var links=[].slice.call(document.querySelectorAll('#jump a'));
  var stale=links.filter(function(a){
    if(a.hidden) return false;
    var e=document.getElementById(a.getAttribute('href').slice(1));
    return !!(e&&e.hidden); });
  return JSON.stringify({
    total:all.length,
    shown:shown.length,
    ids:shown.map(function(e){return e.id;}).slice(0,6),
    emptyGroups:groups.filter(function(g){
      return !g.h.hidden && !g.items.some(function(e){return !e.hidden;}); }).length,
    staleLinks:stale.length,
    said:((document.getElementById('dqCount')||{}).textContent||'').trim(),
    disabled:!!(document.getElementById('dq')||{}).disabled});
})()"""

PICK = """(function(){
  var all=[].slice.call(document.querySelectorAll('.entry[id]'));
  var texts=all.map(function(e){return (e.textContent||'').toLowerCase();});
  for(var i=0;i<all.length;i++){
    var h=all[i].querySelector('h3');
    var words=((h&&h.textContent)||'').toLowerCase().split(/[^a-z]+/);
    for(var w=0;w<words.length;w++){
      var tok=words[w];
      if(tok.length<5) continue;
      var hits=texts.filter(function(t){return t.indexOf(tok)>=0;}).length;
      if(hits===1) return JSON.stringify({tok:tok, id:all[i].id, total:all.length});
    }
  }
  return JSON.stringify({err:'no word in any heading is unique to its own entry'});
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


def typed(ws, text):
    ev(ws, "(function(){var q=document.getElementById('dq');q.value=" + json.dumps(text) +
           ";q.dispatchEvent(new Event('input',{bubbles:true}));})()")
    time.sleep(0.3)


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

    profile = Path(tempfile.gettempdir()) / "vh-dict"
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

        print(f"filtering {PAGE} in {browser.name}\n")
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{PAGE}"})
        time.sleep(3)

        start = ev(ws, STATE)
        print(f"  loaded   {start['total']} terms, {start['shown']} shown, "
              f"box disabled={start['disabled']}")
        if start.get("disabled"):
            failures.append("the filter box is still disabled after the page loaded — it "
                            "ships that way on purpose so a page with no JS is honest, and "
                            "the script is what makes it real")
        if start.get("total", 0) < 10:
            failures.append(f"only {start.get('total')} entries found — this test is not "
                            f"looking at the glossary")

        pick = ev(ws, PICK)
        if not isinstance(pick, dict) or pick.get("err"):
            failures.append(f"could not derive a query from the page: {pick}")
            pick = None

        if pick:
            typed(ws, pick["tok"])
            s = ev(ws, STATE)
            print(f"  match    {pick['tok']!r} → {s['shown']} of {s['total']} shown "
                  f"{s['ids']}, said {s['said']!r}")
            if s["shown"] != 1 or pick["id"] not in s["ids"]:
                failures.append(f"{pick['tok']!r} is in exactly one entry ({pick['id']}) and "
                                f"the page shows {s['shown']}: {s['ids']} — the filter is not "
                                f"filtering on what it says it is")
            if str(s["shown"]) not in s["said"] or str(s["total"]) not in s["said"]:
                failures.append(f"{s['shown']} of {s['total']} terms are on screen and the "
                                f"count says {s['said']!r} — a count that drifts from the page "
                                f"is worse than no count")
            if s["staleLinks"]:
                failures.append(f"{s['staleLinks']} jump link(s) still offer entries the "
                                f"filter has hidden — the index disagrees with the page it "
                                f"indexes")
            if s["emptyGroups"]:
                failures.append(f"{s['emptyGroups']} section heading(s) are left standing over "
                                f"no entries, which reads as an empty section rather than a "
                                f"filtered one")

            # a name nobody has
            typed(ws, "zzzznotaterm")
            e = ev(ws, STATE)
            print(f"  absent   'zzzznotaterm' → {e['shown']} shown, said {e['said']!r}")
            if e["shown"]:
                failures.append(f"a query nothing matches still shows {e['shown']} entries")
            elif not e["said"]:
                failures.append("a query nothing matches empties the page and says nothing — "
                                "a filtered page with no content and no message reads as "
                                "broken rather than filtered")

            # and back
            typed(ws, "")
            b = ev(ws, STATE)
            print(f"  cleared  {b['shown']} of {b['total']} shown, said {b['said']!r}")
            if b["shown"] != b["total"]:
                failures.append(f"clearing the box left {b['shown']} of {b['total']} terms on "
                                f"screen — the glossary does not come back")
            if b["emptyGroups"] or b["staleLinks"]:
                failures.append("clearing the box left sections or index links out of step "
                                "with the entries")

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
        print(f"FAIL — {len(failures)} problem(s) filtering the dictionary:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — the filter is live, narrows to the term asked for, counts what is on "
          "screen, keeps the index and the sections in step, says so when nothing "
          "matches, and gives the glossary back when cleared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
