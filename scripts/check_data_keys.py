"""Every key a page reads off a data file must be a key that file has.

This exists because of one bug that hid for an unknown length of time.
`vectors_map_lite.json`'s top-level key is `players`. /player read `V.vectors`
in four places. Every read was `undefined`, and nothing looked broken, because
every read had a fallback: `V.vectors.length||20719` printed a plausible count,
`(V.vectors||[])` drew an empty map, `v.x||Math.random()` scattered a dot. The
status line told every visitor the file "did not load" while it was loading
fine.

No check on this site could see that. `derived` proves the generators produce
the files. `sourced` and `cited` prove the figures on screen match a file. None
of them proves the page reads the key it thinks it does — a page can fetch the
right file, parse it, and then ask it for a name it does not have.

Reading source cannot answer it either: `V.vectors` is a valid property access
against any object. The only thing that knows is the object itself, at the
moment of the read. So this runs the pages and asks it.

Before any page script runs, `Response.prototype.json` and `JSON.parse` are
patched so that every parsed object comes back wrapped in a Proxy. The proxy
forwards every get untouched and records the ones that ask for a key the object
does not have. Then each page is loaded and the record is read back.

A recorded miss is not automatically a bug — `if (d.optional)` is a legitimate
probe. It is a claim that wants an answer, and on this codebase every one found
so far has been the same defect. The output names the file and the key so the
answer is one grep away.

    python scripts/check_data_keys.py
    python scripts/check_data_keys.py --only player
    python scripts/check_data_keys.py --mutate     # expect FAIL
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

# Keys the language and the runtime ask for on their own. `then` matters most:
# awaiting a proxied object makes the engine probe it for `then`, and recording
# that would report a miss on every single fetch.
PROBE = """
window.__missing = []; window.__seen = [];
(function(){
  var SKIP = new Set(['then','catch','finally','toJSON','constructor','prototype',
    'hasOwnProperty','isPrototypeOf','propertyIsEnumerable','valueOf','toString',
    'toLocaleString','length','name','call','apply','bind','inspect','nodeType',
    'tagName','nodeName','splice','toStringTag','$$typeof','_owner']);
  function wrap(v, url){
    if(!v || typeof v !== 'object' || Array.isArray(v)) return v;
    return new Proxy(v, {
      get: function(t, k, r){
        if(typeof k === 'string' && !SKIP.has(k)){
          if(k in t){ window.__seen.push(url + ' :: ' + k); }
          else { window.__missing.push({url: url, key: k, has: Object.keys(t).slice(0, 12)}); }
        }
        return Reflect.get(t, k, r);
      }
    });
  }
  var oj = Response.prototype.json;
  Response.prototype.json = function(){
    var u = this.url || 'response';
    return oj.call(this).then(function(v){ return wrap(v, u); });
  };
  var op = JSON.parse;
  JSON.parse = function(text, reviver){
    return wrap(op.call(JSON, text, reviver), 'JSON.parse');
  };
})();
"""

# Put back the read that started this. If the gate cannot see it, the gate is
# measuring nothing.
MUTATION = ("var PTS = (V && V.points) || [];", "var PTS = (V && V.vectors) || [];")


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return None
    return (r.get("result") or {}).get("value")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="one page stem, e.g. player")
    ap.add_argument("--mutate", action="store_true",
                    help="put V.vectors back on /player and expect a report")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    pages = sorted(p.name for p in SERVE.glob("*.html"))
    if args.only:
        pages = [p for p in pages if Path(p).stem == args.only]
        if not pages:
            sys.exit(f"no page named {args.only!r}")

    mutated = None
    if args.mutate:
        src = (SERVE / "player.html").read_text(encoding="utf-8")
        if MUTATION[0] not in src:
            # exit 2, not 1: a mutation that never applied must not look like a
            # mutation the assertions caught
            print(f"MUTATION DID NOT APPLY — no longer matches: {MUTATION[0]!r}")
            raise SystemExit(2)
        mutated = src.replace(*MUTATION, 1).encode("utf-8")
        pages = ["player.html"]

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if mutated and self.path.split("?")[0] in ("/player.html", "/player"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(mutated)))
                self.end_headers()
                self.wfile.write(mutated)
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

    profile = Path(tempfile.gettempdir()) / "vh-datakeys"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,900",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    findings: list[tuple[str, str, str, list]] = []
    notes: list[tuple[str, str, list]] = []
    reads = 0
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
        ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": PROBE})

        print(f"reading every parsed data file in {browser.name}"
              f"{'  [mutation: V.points -> V.vectors]' if args.mutate else ''}\n")

        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}"})
            time.sleep(2.6)
            # the map pages boot lower cards on an IntersectionObserver
            ev(ws, "window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.9)
            miss = ev(ws, "JSON.stringify(window.__missing||[])")
            seen = ev(ws, "(window.__seen||[]).length")
            try:
                miss = json.loads(miss) if isinstance(miss, str) else []
            except ValueError:
                miss = []
            reads += seen or 0

            uniq = {}
            for m in miss:
                uniq[(m.get("url", ""), m.get("key", ""))] = m.get("has", [])
            local = 0
            for (url, key), has in sorted(uniq.items()):
                # Only a fetched file is a data file. JSON.parse also catches
                # localStorage state, where reading a key off `{}` on a first
                # visit is correct — /play's `ww.days?.length||0` yields 0, and
                # 0 days is the true answer. Failing on that would train me to
                # ignore this gate, which is how a real miss gets through.
                if url == "JSON.parse":
                    local += 1
                    notes.append((name, key, has))
                else:
                    findings.append((name, url.rsplit("/", 1)[-1].split("?")[0], key, has))
            hard = len(uniq) - local
            mark = f"{hard} missing" if hard else ("ok" + (f"  ({local} in local state)"
                                                          if local else ""))
            print(f"  /{Path(name).stem:<22} {seen or 0:>5} key read(s)   {mark}")
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.terminate()
        httpd.shutdown(); httpd.server_close()

    print()
    for page, key, has in notes:
        print(f"  note: /{Path(page).stem} reads .{key} off parsed local state holding "
              f"{{{', '.join(has) if has else ''}}} — guarded, not a data file")
    if notes:
        print()
    if not findings:
        print(f"OK — {reads:,} key read(s) across {len(pages)} page(s); every read of a fetched "
              f"data file names a key that file has")
        return 0
    print(f"FAIL — {len(findings)} read(s) of a key the file does not have:")
    for page, fil, key, has in findings:
        print(f"  - /{Path(page).stem} reads .{key} off {fil}, which has: "
              f"{', '.join(has) if has else '(no keys)'}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
