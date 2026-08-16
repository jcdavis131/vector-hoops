"""Elements told to be a size, that are not that size.

/model drew twelve feature-attribution bars as identical hollow outlines. Every
one carried `style="width:79.3%"` and painted 1px, because `.attr-fill` is a
<span> and nothing set `display` on it: width and height do not apply to an
inline box at all. The numbers beside the bars were right, the markup was right,
the CSS was right, and the chart was blank.

Nothing in this repo could see it. It is not a contrast fault, not a target-size
fault, not a broken link, not a missing id; the element is present in the DOM
carrying exactly the style it should carry. Every existing gate reads a property
that was correct.

So this reads the one thing that was not: what the browser actually did with the
instruction.

  ignored   an inline `style` sets width or height, and the element computes to
            `display:inline`, where both are discarded outright
  collapsed a width was asked for in percent and the element painted under 3px —
            a bar that renders as its own border and nothing else

Both are checked against the used value, so a rule that is overridden, a parent
that is zero-width, and a flex child that shrank all surface the same way.

    python scripts/check_dimensions.py
    python scripts/check_dimensions.py --page model
    python scripts/check_dimensions.py --mutate inline    # expect FAIL
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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_viewport import WS, BROWSERS  # noqa: E402

DEFER = {"trends": "smLoad"}

# Put the fault back, to prove this can see it. `.attr-fill` is a <span>; drop
# the display and its width stops applying, which is exactly how it shipped.
MUTATIONS = {
    "inline": ("model.html",
               ".attr-fill{display:block;height:100%",
               ".attr-fill{height:100%"),
}

PROBE = r"""(function(){
  var out=[];
  function walk(root){
    var all=root.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var e=all[i];
      if(e.shadowRoot) walk(e.shadowRoot);
      var inline=e.getAttribute&&e.getAttribute('style');
      if(!inline) continue;
      if(!/(^|;)\s*(width|height)\s*:/.test(inline)) continue;
      var cs=getComputedStyle(e);
      if(cs.display==='none'||cs.visibility==='hidden') continue;
      var r=e.getBoundingClientRect();
      if(!r.width && !r.height) continue;          /* not laid out at all */
      var why=null;
      if(cs.display==='inline') why='display:inline discards width and height';
      else {
        var m=/(^|;)\s*width\s*:\s*([\d.]+)%/.exec(inline);
        if(m && parseFloat(m[2])>5 && r.width<3)
          why='asked for width '+m[2]+'% and painted '+r.width.toFixed(1)+'px';
      }
      if(!why) continue;
      out.push({tag:e.tagName.toLowerCase(),
                cls:(e.className&&e.className.baseVal!==undefined
                     ? e.className.baseVal : (e.className||'')).toString().slice(0,30),
                style:inline.slice(0,46), display:cs.display,
                w:Math.round(r.width*10)/10, h:Math.round(r.height*10)/10,
                why:why});
    }
  }
  walk(document);
  /* one line per distinct (class, reason): twelve identical bars are one fault */
  var seen={}, uniq=[];
  for(var j=0;j<out.length;j++){
    var k=out[j].cls+'|'+out[j].why.replace(/[\d.]+/g,'#');
    if(seen[k]){ seen[k].n++; continue; }
    seen[k]=out[j]; out[j].n=1; uniq.push(out[j]);
  }
  return uniq.slice(0,8);
})()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page")
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    args = ap.parse_args()

    pages = sorted(p.stem for p in SERVE.glob("*.html"))
    if args.page:
        if args.page not in pages:
            sys.exit(f"no such page: {args.page}")
        pages = [args.page]

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    patched: dict[str, bytes] = {}
    if args.mutate:
        rel, find, repl = MUTATIONS[args.mutate]
        src = SERVE / rel
        text = src.read_text(encoding="utf-8")
        if find not in text:
            print(f"MUTATION DID NOT APPLY — {args.mutate!r} no longer matches: {find[:60]!r}")
            return 2
        patched["/" + rel] = text.replace(find, repl, 1).encode("utf-8")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in patched:
                body = patched[path]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
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

    profile = Path(tempfile.gettempdir()) / "vh-dims"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails: list[str] = []
    ws = None
    try:
        target = None
        for _ in range(80):
            try:
                with urllib.request.urlopen(
                        f"http://127.0.0.1:{cdp}/json/list", timeout=2) as r:
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
        ws.call("Emulation.setDeviceMetricsOverride", {
            "width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"what the browser did with the size it was given{mut}\n")
        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}.html"})
            time.sleep(2.4)
            if name in DEFER:
                for _ in range(25):
                    if ev(f"!!document.getElementById('{DEFER[name]}')"):
                        ev(f"document.getElementById('{DEFER[name]}').click()"); break
                    time.sleep(0.4)
            ev("window.scrollTo(0,document.body.scrollHeight)")
            time.sleep(1.8)
            ev("window.scrollTo(0,0)")
            time.sleep(0.5)
            found = ev(PROBE) or []
            mark = f"  {len(found)} suspect" if found else ""
            print(f"  /{name}{mark}")
            for it in found:
                n = it.get("n", 1)
                print(f"      <{it['tag']} class={it['cls']!r}> x{n}  "
                      f"{it['style']!r} -> {it['w']}x{it['h']}  ({it['why']})")
                fails.append(f"/{name}: <{it['tag']}> .{it['cls']} — {it['why']}"
                             + (f", on {n} elements" if n > 1 else ""))
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
        print(f"OK — across {len(pages)} page(s), every element given a width or a "
              f"height got one")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
