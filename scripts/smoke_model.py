"""Press a target chip on /model and listen.

`#attrBars` carried aria-live="polite" and render() writes twelve rows into it, so
a screen reader was handed the whole chart - measured at 279 characters, plus 176
more from the pipeline detail - on arrival, before the visitor pressed anything. A
container that receives a chart announces the chart.

The chart is a normal region now, and one status node carries a sentence only when
a press asks for one. What this asserts:

  quiet    nothing is announced by the page loading
  target   pressing a target chip names the target, how many features are shown,
           and the one at the top with its value
  stage    pressing a pipeline stage names the stage and where it sits

    python scripts/smoke_model.py
"""
from __future__ import annotations

import functools, http.server, json, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVE = ROOT / "public"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

SPOKEN = ("(function(){var l=document.getElementById('modelLive');"
          "return l?((l.textContent||'').trim()):'(NO STATUS NODE)';})()")

# The fix has two halves and the first version of this test only checked the
# second: restoring aria-live on the chart container left it green, because the
# status node still said the right thing. This asks the principle instead of the
# attribute — a live region is for a sentence, not for twelve rows — so a new
# offender anywhere on the page is caught too.
LIVE_SIZES = r"""(function(){
  return JSON.stringify([].slice.call(document.querySelectorAll('[aria-live]'))
    .map(function(e){
      var t=(e.textContent||'').replace(/\s+/g,' ').trim();
      return {id:e.id||e.tagName, chars:t.length, head:t.slice(0,40)};
    }));
})()"""
LIVE_MAX = 200


def ev(ws, e):
    r = ws.call("Runtime.evaluate", {"expression": e, "returnByValue": True})
    return (r.get("result") or {}).get("value")


def main() -> int:
    browser = next((b for b in BROWSERS if b.exists()), None)

    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def handle_one_request(self):
            try: super().handle_one_request()
            except (ConnectionResetError, BrokenPipeError): self.close_connection = True

    with socket.socket() as s: s.bind(("127.0.0.1", 0)); site = s.getsockname()[1]
    with socket.socket() as s: s.bind(("127.0.0.1", 0)); cdp = s.getsockname()[1]
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", site),
                                            functools.partial(Q, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    profile = Path(tempfile.gettempdir()) / "vh-mlive"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
        "--disable-extensions", "--window-size=1280,900", f"--user-data-dir={profile}",
        f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(60):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cdp}/json/list", timeout=2) as r:
                    for x in json.load(r):
                        if x.get("type") == "page": target = x["webSocketDebuggerUrl"]; break
                if target: break
            except Exception: time.sleep(0.25)
        ws = WS(target)
        ws.call("Page.enable"); ws.call("Runtime.enable")
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/model.html"})
        time.sleep(3)
        for _ in range(6):
            ev(ws, "window.scrollBy(0,window.innerHeight*0.9)"); time.sleep(0.4)
        time.sleep(3)
        regions = ev(ws, LIVE_SIZES) or []
        if isinstance(regions, str):
            regions = json.loads(regions)
        print(f"  live regions      "
              + ", ".join(f"{r['id']}={r['chars']}c" for r in regions))
        for r in regions:
            if r["chars"] > LIVE_MAX:
                failures.append(
                    f"#{r['id']} is a live region holding {r['chars']} characters "
                    f"({r['head']!r}…) — a live region announces whatever lands in it, and "
                    f"that is a chart, not a sentence")

        first = str(ev(ws, SPOKEN) or "")
        print(f"  on arrival        {first!r}")
        if first == "(NO STATUS NODE)":
            failures.append("the page has no status node, so nothing can be announced at all")
        elif first:
            failures.append(
                f"the page announced {first[:60]!r} to a visitor who pressed nothing — a "
                f"container that receives a chart announces the chart, and this one is "
                f"twelve rows")
        ev(ws, "(function(){var b=document.querySelectorAll('#attrTargets button');"
               "for(var i=0;i<b.length;i++){if(b[i].getAttribute('aria-pressed')!=='true'){"
               "b[i].click();return;}}})()")
        time.sleep(0.7)
        chip = str(ev(ws, SPOKEN) or "")
        print(f"  after a chip      {chip!r}")
        if not chip:
            failures.append("pressing a target chip redrew the chart and announced nothing")
        elif "feature" not in chip.lower():
            failures.append(f"a target chip announced {chip[:60]!r}, which does not say what "
                            f"is now on screen")
        ev(ws, "(function(){var b=document.querySelectorAll('#flow button[data-i]');"
               "if(b.length>1) b[1].click();})()")
        time.sleep(0.7)
        stage = str(ev(ws, SPOKEN) or "")
        print(f"  after a stage     {stage!r}")
        if not stage or "stage" not in stage.lower():
            failures.append(f"pressing a pipeline stage announced {stage[:60]!r}")
        elif stage == chip:
            failures.append("the stage press left the chip's sentence standing — the status "
                            "node was never updated")
    finally:
        if ws:
            try: ws.close()
            except Exception: pass
        proc.terminate(); httpd.shutdown()

    print()
    if failures:
        print(f"FAIL — {len(failures)} problem(s) with what /model says:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("OK — /model says nothing until asked, and then one sentence that names what "
          "changed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
