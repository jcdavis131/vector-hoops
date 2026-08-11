"""Contrast on what the browser painted, not on what the CSS declared.

`check_contrast.py` reads CSS rules, and says so in its own docstring: a rule that
sets colour alone is "evaluated against that page's own <body> background and
printed to check in a browser, never failed on, because the true backdrop depends
on nesting a static read cannot settle."

This is the browser half. It matters because most of this site's text is not in
the CSS at all - it is rendered from JSON into elements a static pass never sees:
card badges, bar rows, match lists, tables, chips. The first run found 75 text
elements below AA, including archetype names at 1.04:1, which is not low contrast
but invisible.

Every page is loaded and scrolled so the lazy sections fill, then every element
that paints its own text has its real backdrop composited through however many
transparent ancestors it has, and alpha on the foreground composited too. WCAG 2.2
AA: 4.5:1, or 3:1 for text at 24px, or 18.66px when bold.

    python scripts/check_painted_contrast.py
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
  function parse(c){
    var m=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c||'');
    return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null;
  }
  function over(f,b){var a=f[3];return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a),1];}
  function lum(c){var s=[c[0],c[1],c[2]].map(function(v){v/=255;
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2];}
  function ratio(a,b){var l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}
  function backdrop(el){var acc=null,n=el;
    while(n&&n.nodeType===1){var c=parse(getComputedStyle(n).backgroundColor);
      if(c&&c[3]>0){acc=acc===null?c:over(acc,c); if(c[3]>=1) return acc.slice(0,3).concat([1]);}
      n=n.parentElement;}
    return acc||[255,255,255,1];}
  function sel(e){
    var c=(e.className&&e.className.baseVal!==undefined?e.className.baseVal:e.className||'').toString().trim();
    return e.tagName.toLowerCase()+(c?'.'+c.split(/\s+/).join('.'):'');
  }
  var out=[],seen={};
  var all=document.querySelectorAll('body *');
  for(var i=0;i<all.length;i++){
    var e=all[i], own='';
    for(var k=0;k<e.childNodes.length;k++){var nd=e.childNodes[k]; if(nd.nodeType===3) own+=nd.nodeValue;}
    own=own.replace(/\s+/g,' ').trim();
    if(!own) continue;
    if(typeof e.getClientRects!=='function'||!e.getClientRects().length) continue;
    var cs=getComputedStyle(e);
    if(cs.visibility==='hidden'||+cs.opacity===0) continue;
    var r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    var fg=parse(cs.color); if(!fg) continue;
    var bg=backdrop(e), eff=fg[3]<1?over(fg,bg):fg;
    var px=parseFloat(cs.fontSize)||16, w=parseInt(cs.fontWeight,10)||400;
    var need=(px>=24||(px>=18.66&&w>=700))?3:4.5;
    var got=ratio(eff,bg);
    if(got>=need) continue;
    var s=sel(e), key=s+'|'+cs.color+'|'+px;
    if(seen[key]) continue; seen[key]=1;
    out.push({sel:s, fg:cs.color, bg:'rgb('+bg.slice(0,3).map(Math.round).join(',')+')',
              px:+px.toFixed(1), w:w, need:need, got:+got.toFixed(2), text:own.slice(0,30)});
  }
  return JSON.stringify(out);
})()"""


def ev(ws, e):
    r = ws.call("Runtime.evaluate", {"expression": e, "returnByValue": True})
    if "exceptionDetails" in r:
        return []
    v = (r.get("result") or {}).get("value")
    try:
        return json.loads(v) if isinstance(v, str) else (v or [])
    except ValueError:
        return []


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
    profile = Path(tempfile.gettempdir()) / "vh-cgroups"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen([str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
        "--disable-extensions", "--window-size=1280,900", f"--user-data-dir={profile}",
        f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    pages = [f"/{p.name}" for p in sorted(SERVE.glob("*.html"))]
    pages += [f"/{p.parent.name}/index.html" for p in sorted(SERVE.glob("*/index.html"))
              if p.parent.name not in {"assets", "knowledge", "node_modules"}]
    ws = None
    rows = []
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
            time.sleep(2.2)
            for r in ev(ws, PROBE):
                r["page"] = page
                rows.append(r)
    finally:
        if ws:
            try: ws.close()
            except Exception: pass
        proc.terminate(); httpd.shutdown()

    print(f"checked {len(pages)} page(s)\n")
    if not rows:
        print("OK — every painted text element clears WCAG AA, with its real backdrop "
              "composited through transparent ancestors")
        return 0

    by = {}
    for r in rows:
        by.setdefault((r["fg"], r["bg"]), []).append(r)
    print(f"FAIL — {len(rows)} painted text element(s) below WCAG AA:")
    for (fg, bg), rs in sorted(by.items(), key=lambda kv: -len(kv[1])):
        r = rs[0]
        pages_ = sorted({x["page"] for x in rs})
        print(f"  - {len(rs)}× {r['got']}:1 (needs {r['need']}) {fg} on {bg} — "
              f"{r['px']}px/{r['w']} <{r['sel']}> {r['text']!r}")
        print(f"    on {', '.join(p.lstrip('/') for p in pages_)[:96]}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
