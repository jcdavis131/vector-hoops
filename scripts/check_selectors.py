"""CSS selectors that name an element which does not exist.

`undefined:focus-visible{outline:3px solid #0072B2; ...}` shipped to every page
on this site. It is not a syntax error — `undefined` reads as a type selector,
so the browser parses the rule, keeps it, and matches it against nothing for the
life of the page. The site-wide focus ring was gone and every gate stayed green:

  check_focus_ring passed at 548 stops, because it measures whether the focused
  element ends up with a visible ring, and most pages carry their own
  :focus-visible rule or fall back to Chrome's default, which clears 3:1.

A gate that reads the outcome cannot see that the mechanism under it stopped
working. This reads the mechanism.

For every style rule the browser actually holds — inline <style>, linked
stylesheets, and anything a script injected at runtime — it takes the type
selector off the front of each compound and asks whether that element exists in
HTML or SVG. A tag is fine if it is a real HTML or SVG element — styling `button` on a page
with no button is dead CSS, not a bug — or if the document actually contains it.
That second half matters: an invented tag is still a DOM element and is still
selectable. /lab writes `<dot></dot>` and styles `.badge dot`, and that works;
hyphens are required to *register* a custom element, not to be matched by CSS.
`undefined` failed neither test — not a real element, and no <undefined> anywhere
on the page — which is exactly the shape of a rule that can never fire.

It cannot see a class typo (`.crad` is a valid selector for a class nobody uses)
and does not try to; the type-name case is the one that produced a live outage.

    python scripts/check_selectors.py
    python scripts/check_selectors.py --mutate ghost    # expect FAIL
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

# Put the outage back, in the shape it shipped in.
MUTATIONS = {
    "ghost": ("assets/keyboard-a11y.js",
              "style.textContent = CURRENT + ':focus-visible",
              "style.textContent = 'undefined' + ':focus-visible"),
}

KNOWN = """a abbr address area article aside audio b base bdi bdo big blockquote body br
button canvas caption cite code col colgroup data datalist dd del details dfn dialog div
dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup
hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav
noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp
script search section select slot small source span strong style sub summary sup table
tbody td template textarea tfoot th thead time title tr track u ul var video wbr
svg circle clipPath defs ellipse feBlend feColorMatrix feComposite feGaussianBlur filter
foreignObject g image line linearGradient marker mask path pattern polygon polyline
radialGradient rect stop symbol text textPath tspan use view animate""".split()

PROBE = r"""(function(){
  var KNOWN = %s;
  var known = {}; for (var i = 0; i < KNOWN.length; i++) known[KNOWN[i]] = 1;
  /* every tag the document actually contains, shadow roots included — an
     invented element is still an element and is still selectable by type */
  var present = {};
  (function collect(root){
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      present[all[i].tagName.toLowerCase()] = 1;
      if (all[i].shadowRoot) collect(all[i].shadowRoot);
    }
  })(document);
  var bad = [], seen = {};

  function typeOf(compound){
    /* the leading type name, before any class, id, attribute, pseudo or combinator */
    var m = /^([A-Za-z][\w-]*)/.exec(compound.trim());
    return m ? m[1] : '';
  }
  function check(sel, where){
    if (!sel) return;
    /* split on commas outside brackets — [href="a,b"] is one selector */
    var parts = [], depth = 0, cur = '';
    for (var i = 0; i < sel.length; i++) {
      var c = sel[i];
      if (c === '[' || c === '(') depth++;
      else if (c === ']' || c === ')') depth--;
      if (c === ',' && depth === 0) { parts.push(cur); cur = ''; }
      else cur += c;
    }
    parts.push(cur);
    for (var p = 0; p < parts.length; p++) {
      /* every compound in the chain, so `main undefiend > .x` is caught too */
      var chain = parts[p].split(/[\s>+~]+/);
      for (var q = 0; q < chain.length; q++) {
        var t = typeOf(chain[q]);
        if (!t) continue;
        var lower = t.toLowerCase();
        if (known[lower] || present[lower]) continue;
        var key = t + '|' + parts[p].trim();
        if (seen[key]) continue;
        seen[key] = 1;
        bad.push({type: t, sel: parts[p].trim().slice(0, 70), where: where});
      }
    }
  }
  function walk(rules, where){
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.selectorText) check(r.selectorText, where);
      if (r.cssRules) walk(r.cssRules, where);       /* @media, @supports, @layer */
    }
  }
  for (var s = 0; s < document.styleSheets.length; s++) {
    var sheet = document.styleSheets[s], rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }   /* cross-origin */
    if (!rules) continue;
    var where = sheet.href ? sheet.href.split('/').pop().split('?')[0] : 'inline or injected';
    walk(rules, where);
  }
  return bad.slice(0, 12);
})()""" % json.dumps(KNOWN)


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
        text = (SERVE / rel).read_text(encoding="utf-8")
        if text.count(find) != 1:
            print(f"MUTATION DID NOT APPLY — {args.mutate!r} matches {text.count(find)} "
                  f"times, needs exactly 1: {find!r}")
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
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
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

    profile = Path(tempfile.gettempdir()) / "vh-selectors"
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

        def ev(expr):
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            if "exceptionDetails" in r:
                return None
            return (r.get("result") or {}).get("value")

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        print(f"type selectors, against the elements that exist{mut}\n")
        total = 0
        for name in pages:
            ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/{name}.html"})
            time.sleep(1.6)
            n = ev("(function(){var c=0;for(var i=0;i<document.styleSheets.length;i++){"
                   "try{c+=document.styleSheets[i].cssRules.length}catch(e){}}return c})()")
            bad = ev(PROBE) or []
            total += n or 0
            print(f"  /{name:<22} {n or 0:>4} rules" + (f"   {len(bad)} suspect" if bad else ""))
            for b in bad:
                print(f"      <{b['type']}> is not an element — {b['sel']!r} in {b['where']}")
                fails.append(f"/{name}: {b['sel']!r} selects <{b['type']}>, which is not an "
                             f"HTML or SVG element and appears nowhere in this document — the "
                             f"rule parses, is kept, and can never match "
                             f"({b['where']})")
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
        print(f"OK — {total:,} style rule(s) across {len(pages)} page(s); every type "
              f"selector names an element that exists")
        return 0
    print(f"FAIL — {len(fails)} problem(s):")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
