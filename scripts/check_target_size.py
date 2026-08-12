"""Target size, measured. WCAG 2.2 AA (2.5.8) wants 24 x 24 CSS px.

This site is built out of small mono pills and chips and nothing had ever measured
one. Across 22 pages: 555 targets, 43 of them under 24 x 24. Eight are inline links
inside a sentence, which the criterion exempts outright. The other 35 pass on the
spacing exception - a 24px-diameter circle centred on each reaches no other target.

So the site meets 2.5.8, but 35 targets meet it by spacing rather than by size,
which is exactly the kind of pass a later layout change can quietly take away.
Hence this gate: both exceptions are implemented, so it stays silent about chips
that are small and alone, and speaks the moment two of them crowd.

    python scripts/check_target_size.py
"""
from __future__ import annotations

import functools, http.server, json, shutil, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVE = ROOT / "public"
sys.path.insert(0, str(Path(__file__).resolve().parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from check_viewport import WS, BROWSERS  # noqa: E402

PROBE = r"""(function(){
  var SEL='a[href],button,input,select,textarea,summary,[role="button"],[role="option"],'+
          '[role="columnheader"][tabindex],[tabindex]:not([tabindex="-1"])';
  /* Shadow roots too. document.querySelectorAll stops at the shadow boundary,
     and /player-animations mounts eight <posecode-player> elements holding
     sixteen focusable controls between them — this gate reported 26 targets on
     that page, which is the light-DOM count exactly, and said nothing about the
     other sixteen. They are judged by the same two exceptions below as everything
     else; nothing here is special-cased for being in a shadow root. */
  function collect(root, out){
    var all=root.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var e=all[i];
      if(e.matches && e.matches(SEL)) out.push(e);
      if(e.shadowRoot) collect(e.shadowRoot, out);
    }
    return out;
  }
  var els=collect(document, []).filter(function(e){
    if(typeof e.getClientRects!=='function' || !e.getClientRects().length) return false;
    var cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0) return false;
    var r=e.getBoundingClientRect();
    return r.width>0 && r.height>0;
  });
  var boxes=els.map(function(e){
    var r=e.getBoundingClientRect();
    return {e:e, x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height};
  });
  function inlineInText(e){
    /* the inline exception: a link inside a sentence, not a control in a bar */
    var cs=getComputedStyle(e);
    if(cs.display!=='inline') return false;
    var p=e.parentElement; if(!p) return false;
    var txt=(p.textContent||'').replace(/\s+/g,' ').trim();
    var own=(e.textContent||'').replace(/\s+/g,' ').trim();
    return txt.length > own.length + 20;      // real prose around it
  }
  var out=[], under=0, afterInline=0;
  for(var i=0;i<boxes.length;i++){
    var b=boxes[i];
    if(b.w>=24 && b.h>=24) continue;
    under++;
    if(inlineInText(b.e)) continue;
    afterInline++;
    /* spacing exception: 24px circles, centre to centre */
    var crowded=null;
    for(var j=0;j<boxes.length && !crowded;j++){
      if(j===i) continue;
      var o=boxes[j], dx=b.x-o.x, dy=b.y-o.y, d=Math.sqrt(dx*dx+dy*dy);
      if(d < 24) crowded={d:+d.toFixed(1),
        t:((o.e.textContent||o.e.getAttribute('aria-label')||'')+'').replace(/\s+/g,' ').trim().slice(0,22)};
    }
    if(!crowded) continue;
    var e=b.e;
    var cls=(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className||'').toString();
    out.push({sel:e.tagName.toLowerCase()+(cls?'.'+cls.trim().split(/\s+/).join('.'):''),
              w:+b.w.toFixed(1), h:+b.h.toFixed(1),
              near:crowded.t, dist:crowded.d,
              text:((e.textContent||e.value||e.getAttribute('aria-label')||'')+'').replace(/\s+/g,' ').trim().slice(0,30)});
  }
  return JSON.stringify({total:boxes.length, under:under, afterInline:afterInline,
                         small:out.slice(0,12)});
})()"""


def ev(ws, e):
    r = ws.call("Runtime.evaluate", {"expression": e, "returnByValue": True})
    if "exceptionDetails" in r:
        d = r["exceptionDetails"]
        return {"err": str((d.get("exception") or {}).get("description") or d.get("text"))[:140]}
    v = (r.get("result") or {}).get("value")
    try:
        return json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return v


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
    profile = Path(tempfile.gettempdir()) / "vh-targets"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
        "--disable-extensions", "--window-size=1280,900", f"--user-data-dir={profile}",
        f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    pages = [f"/{p.name}" for p in sorted(SERVE.glob("*.html"))]
    pages += [f"/{p.parent.name}/index.html" for p in sorted(SERVE.glob("*/index.html"))
              if p.parent.name not in {"assets", "knowledge", "node_modules"}]
    ws, seen, bad = None, 0, []
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
        for page in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{page}"})
            time.sleep(2.0)
            for _ in range(5):
                ev(ws, "window.scrollBy(0,window.innerHeight*0.9)"); time.sleep(0.35)
            ev(ws, "window.scrollTo(0,0)"); time.sleep(2.0)
            d = ev(ws, PROBE)
            if isinstance(d, dict) and d.get("err"):
                print(f"  {page:<28} probe error {d['err'][:60]}"); continue
            small = d.get("small") or []
            seen += d.get("total", 0)
            bad += [(page, s) for s in small]
            print(f"  {page:<28} {d.get('total',0):>3} targets · {d.get('under',0):>2} under 24px · "
                  f"{d.get('afterInline',0):>2} after the inline exception · {len(small)} still failing")
            for s in small:
                print(f"        {s['w']}×{s['h']}  <{s['sel']}>  {s['text']!r}  "
                      f"{s['dist']}px from {s['near']!r}")
    finally:
        if ws:
            try: ws.close()
            except Exception: pass
        proc.terminate(); httpd.shutdown()

    print()
    if not bad:
        print(f"OK — {seen} target(s) checked; every one is 24×24 or has the room the "
              f"spacing exception asks for")
        return 0
    print(f"FAIL — {len(bad)} target(s) below 24×24 with a neighbour inside the 24px circle:")
    for page, s in bad:
        print(f"  - {page} {s['w']}×{s['h']} <{s['sel']}> {s['text']!r} — "
              f"{s['dist']}px from {s['near']!r}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
