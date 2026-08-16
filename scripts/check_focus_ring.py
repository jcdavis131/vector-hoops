"""The focus ring, measured against what is behind it. WCAG 1.4.11 wants 3:1.

`check_focus.py` proves a ring exists and that Tab reaches things in a sensible
order. It never asks whether the ring can be *seen*: a 3px outline is fine on
paper and can vanish on a dark inset or a brand-coloured pill.

**The ring only exists under a real Tab.** The site styles focus with
`:focus-visible`, and Chrome does not match that for scripted focus:

    programmatic .focus()   fv False   outline: none 3px rgb(0, 0, 238)
    a real Tab press        fv True    outline: solid 3px rgb(0, 114, 178)
                                       shadow:  rgba(0,114,178,.22) 0 0 0 5px

The first version of this check used `element.focus()` and reported 67 controls
across 22 pages as having no focus indicator at all. Every one of those was the
measurement, not the site. So this walks each page with real key events and reads
the active element at every stop.

Reported: any ring below 3:1 against the colour behind it, and any stop with no
outline and no box-shadow at all.

    python scripts/check_focus_ring.py
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
# 60 truncated /players at exactly 60, which is a cap reporting itself as a
# count. Raised until every page terminates on its own; the run below prints the
# per-page numbers, so a page that ever hits this ceiling is visible rather than
# quietly rounded down.
MAX_TABS = 110

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

READ = r"""(function(){
  function parse(c){
    var m=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c||'');
    return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null;
  }
  function over(f,b){var a=f[3];return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a),1];}
  function lum(c){var s=[c[0],c[1],c[2]].map(function(v){v/=255;
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*s[0]+0.7152*s[1]+0.0722*s[2];}
  function ratio(a,b){var l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}
  function backdrop(el){
    /* the ring is drawn outside the element, so what sits behind it is the first
       opaque background at or above the parent, not the element's own */
    var acc=null,n=el.parentElement;
    while(n&&n.nodeType===1){var c=parse(getComputedStyle(n).backgroundColor);
      if(c&&c[3]>0){acc=acc===null?c:over(acc,c); if(c[3]>=1) return acc.slice(0,3).concat([1]);}
      /* out through the shadow boundary as well, or the composite stops at the
         shadow root and the ring is judged against the wrong backdrop — which
         only bites for the elements the fix above has just made visible */
      n=n.parentElement||(n.getRootNode&&n.getRootNode().host)||null;}
    return acc||[255,255,255,1];
  }
  var a=document.activeElement;
  /* Follow focus into open shadow roots. document.activeElement stops at the
     host, so on /player-animations every Tab inside a <posecode-player> reported
     the same element: the ring was measured on the host rather than on the
     control that had focus, and the identity dedupe below then ended the walk
     early — 14 stops recorded against check_focus's 18. check_focus already
     resolves this the same way; this is its loop. */
  while(a&&a.shadowRoot&&a.shadowRoot.activeElement) a=a.shadowRoot.activeElement;
  if(!a||a===document.body||a===document.documentElement) return JSON.stringify({none:true});
  /* Wrap detection by node identity, not by text. It used to key on
     tag.class|text, which meant any two controls that look alike ended the walk:
     /model grew a second group of Archetype / Position / Skills / Next Profile
     buttons and the count fell 499 -> 493, silently covering less of a page that
     had just got bigger. A gate that quietly measures less is the same defect as
     a gate that measures nothing. */
  if(a.hasAttribute('data-vhring')) return JSON.stringify({wrapped:true});
  a.setAttribute('data-vhring','1');
  var cs=getComputedStyle(a);
  var cls=(a.className&&a.className.baseVal!==undefined?a.className.baseVal:a.className||'').toString();
  var sel=a.tagName.toLowerCase()+(cls?'.'+cls.trim().split(/\s+/).slice(0,2).join('.'):'');
  var w=parseFloat(cs.outlineWidth)||0, style=cs.outlineStyle;
  var shadow=(cs.boxShadow||'none');
  var text=((a.textContent||a.getAttribute('aria-label')||a.value||'')+'').replace(/\s+/g,' ').trim().slice(0,26);
  if((style==='none'||w===0)&&shadow==='none')
    return JSON.stringify({sel:sel,text:text,ring:false});
  if(style==='none'||w===0)
    return JSON.stringify({sel:sel,text:text,shadowOnly:true});
  var oc=parse(cs.outlineColor); if(!oc) return JSON.stringify({sel:sel,text:text,skip:true});
  var bg=backdrop(a), eff=oc[3]<1?over(oc,bg):oc;
  return JSON.stringify({sel:sel, text:text, w:+w.toFixed(1),
                         color:cs.outlineColor, bg:'rgb('+bg.slice(0,3).map(Math.round).join(',')+')',
                         got:+ratio(eff,bg).toFixed(2)});
})()"""


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": "exception"}
    v = (r.get("result") or {}).get("value")
    try:
        return json.loads(v) if isinstance(v, str) else v
    except ValueError:
        return v


def tab(ws):
    for t in ("rawKeyDown", "keyUp"):
        ws.call("Input.dispatchKeyEvent", {"type": t, "windowsVirtualKeyCode": 9,
                                           "nativeVirtualKeyCode": 9, "key": "Tab", "code": "Tab"})
    time.sleep(0.09)


def main() -> int:
    argparse.ArgumentParser().parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    class Q(http.server.SimpleHTTPRequestHandler):
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
        ("127.0.0.1", site), functools.partial(Q, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    profile = Path(tempfile.gettempdir()) / "vh-ring"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,900",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    pages = [f"/{p.name}" for p in sorted(SERVE.glob("*.html"))]
    pages += [f"/{p.parent.name}/index.html" for p in sorted(SERVE.glob("*/index.html"))
              if p.parent.name not in {"assets", "knowledge", "node_modules"}]

    ws, stops, bad = None, 0, []
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
        for page in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}{page}"})
            time.sleep(2.2)
            page_bad, n = 0, 0
            for _ in range(MAX_TABS):
                tab(ws)
                d = ev(ws, READ)
                if not isinstance(d, dict) or d.get("none") or d.get("err"):
                    continue
                if d.get("wrapped"):
                    break                      # came back to a stop already walked
                n += 1
                if d.get("skip") or d.get("shadowOnly"):
                    continue
                if d.get("ring") is False:
                    page_bad += 1
                    bad.append((page, d, "no outline and no box-shadow under a real Tab"))
                elif d.get("got", 99) < 3:
                    page_bad += 1
                    bad.append((page, d, f"{d['color']} on {d['bg']}"))
            stops += n
            print(f"  {page:<28} {n:>3} tab stop(s), {page_bad} ring(s) under 3:1")
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    if not bad:
        print(f"OK — {stops} tab stop(s) walked with real key events; every focus ring "
              f"clears 3:1 against the colour behind it")
        return 0
    print(f"FAIL — {len(bad)} focus ring(s) below WCAG 1.4.11:")
    for page, d, why in bad[:20]:
        print(f"  - {page} <{d.get('sel')}> {d.get('text')!r} — {d.get('got', 0)}:1, {why}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
