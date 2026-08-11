"""Explain one player on /model and check the bars against the tensor on disk.

`assets/mtnn_attr_topk.bin` is [12966][4][8] — for every player-season, the eight
input features that moved each of four predictions most, signed. Until now no page
read it; `/model` showed only the population mean. The new card reads one row with
two HTTP Range requests totalling **48 bytes** out of 2,489,472.

The failure mode that matters here is not a blank screen. It is **plausible
numbers for the wrong row** — an off-by-one in the offset arithmetic, a value
block read from the index block's origin, or float32 decoded big-endian — all of
which draw eight confident bars that are simply not this player's. So every
assertion below decodes the same bytes in Python and compares.

Checked:

  disabled  the picker ships disabled and says why, then enables with a count
  bytes     48 bytes off the wire for the tensor, not 2,489,472
  agree     the eight features and values on screen equal the eight this script
            decodes from the file, for two players and two targets
  refuse    a name that is not in the list is refused, not fuzzy-matched
  fallback  with Range switched off the page still reads the right row out of the
            whole file, and says that is what happened

    python scripts/smoke_attr.py
    python scripts/smoke_attr.py --norange        # the no-206 path
    python scripts/smoke_attr.py --mutate offset  # expect FAIL
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import shutil
import socket
import socketserver
import struct
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

MUTATIONS = {
    # each one draws eight confident bars that are not this player's
    "row":    [("var flat = (row * NT + target) * K;", "var flat = (0 * NT + target) * K;")],
    "offset": [("vv.getFloat32(vb + k*4, true)", "vv.getFloat32(vb, true)")],
    "endian": [("vv.getFloat32(vb + k*4, true)", "vv.getFloat32(vb + k*4, false)")],
    "target": [("var flat = (row * NT + target) * K;", "var flat = (row * NT + 0) * K;")],
    "refuse": [("if(!key){", "if(false){")],
}

# the map is "limited 1 per player" - one signature season each, whatever the
# file chose, so these are read from it rather than picked by hand
PLAYERS = [("Stephen Curry", "2025-26"), ("Tim Duncan", "1997-98")]


def ev(ws, expr):
    r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    if "exceptionDetails" in r:
        return {"err": str(r["exceptionDetails"].get("text", "exception"))}
    v = (r.get("result") or {}).get("value")
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def decode(blob, layout, features, row, target):
    """The same eight numbers, straight out of the file."""
    k = layout["k"]
    nt = layout["shape"][1]
    val_off = next(b["offset"] for b in layout["blocks"] if b["name"] == "value")
    flat = (row * nt + target) * k
    idx = struct.unpack_from("<%dH" % k, blob, flat * 2)
    val = struct.unpack_from("<%df" % k, blob, val_off + flat * 4)
    return [(features[i], round(v, 3)) for i, v in zip(idx, val)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", choices=sorted(MUTATIONS))
    ap.add_argument("--norange", action="store_true",
                    help="serve 200 with the whole file, ignoring Range")
    args = ap.parse_args()

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")

    A = SERVE / "assets"
    pop = json.loads((A / "mtnn_attr_pop.json").read_text(encoding="utf-8"))
    idx = json.loads((A / "attr_index.json").read_text(encoding="utf-8"))
    pts = json.loads((A / "embedding_map_points_limited.json").read_text(encoding="utf-8"))["points"]
    blob = (A / "mtnn_attr_topk.bin").read_bytes()
    layout, features, targets = pop["topkLayout"], pop["features"], pop["targets"]

    want = []
    for name, season in PLAYERS:
        p = next((q for q in pts if q["display_name"] == name and q["season"] == season), None)
        if not p:
            sys.exit(f"{name} {season} is not one of the mapped seasons")
        key = f"{p['pid']}|{p['season']}"
        if key not in idx["rows"]:
            sys.exit(f"{key} has no row in attr_index.json")
        want.append((f"{name} — {season}", idx["rows"][key]))

    page = (SERVE / "model.html").read_text(encoding="utf-8")
    if args.mutate:
        for find, repl in MUTATIONS[args.mutate]:
            if find not in page:
                sys.exit(f"mutation {args.mutate!r} no longer matches: {find!r}")
            page = page.replace(find, repl, 1)
    body = page.encode("utf-8")
    served = {"tensor_bytes": 0, "tensor_hits": 0}

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/model.html", "/model"):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "max-age=0, must-revalidate")
                self.end_headers()
                self.wfile.write(body)
                return
            if path.endswith("/assets/mtnn_attr_topk.bin"):
                served["tensor_hits"] += 1
                rng = self.headers.get("Range")
                m = re.match(r"bytes=(\d+)-(\d+)", rng or "") if not args.norange else None
                if m:
                    a, b = int(m.group(1)), int(m.group(2))
                    chunk = blob[a:b + 1]
                    served["tensor_bytes"] += len(chunk)
                    self.send_response(206)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", f"bytes {a}-{b}/{len(blob)}")
                    self.send_header("Content-Length", str(len(chunk)))
                    self.end_headers()
                    self.wfile.write(chunk)
                    return
                served["tensor_bytes"] += len(blob)
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(blob)))
                self.end_headers()
                self.wfile.write(blob)
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

    profile = Path(tempfile.gettempdir()) / "vh-attr"
    shutil.rmtree(profile, ignore_errors=True)
    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check", "--window-size=1280,900",
         f"--user-data-dir={profile}", f"--remote-debugging-port={cdp}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    fails: list[str] = []
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
        # The shipped-disabled state is read from the MARKUP, not from a live
        # sample: the index is 38 KB off localhost, so any sample early enough to
        # catch the disabled state is a sample racing the fetch that clears it.
        # A racing assertion passes or fails on timing, which is not a property
        # of the page.
        start = [bool(re.search(r'<input[^>]*id="pxName"[^>]*\sdisabled', page)),
                 bool(re.search(r'<button[^>]*id="pxGo"[^>]*\sdisabled', page))]
        ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site}/model.html"})
        time.sleep(3.2)

        mut = f"  [mutation {args.mutate}]" if args.mutate else ""
        mut += "  [Range off]" if args.norange else ""
        print(f"explaining players on /model in {browser.name}{mut}\n")

        ready = ev(ws, "JSON.stringify([document.getElementById('pxName').disabled,"
                       "document.getElementById('pxGo').disabled,"
                       "document.getElementById('pxState').textContent,"
                       "document.getElementById('pxList').options.length,"
                       "document.getElementById('pxTabs').children.length])")
        print(f"  ready    ships disabled {start} -> {ready[0]}/{ready[1]}, "
              f"{ready[3]} option(s), {ready[4]} target(s)")
        print(f"           {ready[2][:64]!r}")
        if start != [True, True]:
            fails.append(f"the markup ships the picker at {start}, not disabled — a control "
                         f"that looks ready before its index is a control that lies")
        if ready[0] is not False or ready[1] is not False:
            fails.append(f"the picker never enabled: {ready[:2]}")
        if ready[3] != len(idx["rows"]):
            fails.append(f"the list offers {ready[3]} seasons, the index has {len(idx['rows'])}")
        if ready[4] != len(targets):
            fails.append(f"{ready[4]} target buttons for {len(targets)} targets")

        for label, row in want:
            for ti in (0, 2):
                ev(ws, f"(function(){{var t=document.getElementById('pxTabs');"
                       f"t.children[{ti}].click();}})()")
                time.sleep(0.15)
                ev(ws, f"(function(){{var n=document.getElementById('pxName');"
                       f"n.value={json.dumps(label)};}})()")
                ev(ws, "document.getElementById('pxGo').click()")
                time.sleep(0.7)
                got = ev(ws, """(function(){
                    var rows=[].slice.call(document.querySelectorAll('#pxBars .px-row'));
                    return JSON.stringify(rows.map(function(r){
                      return [r.querySelector('.px-name').firstChild.textContent.trim(),
                              r.querySelector('.px-val').textContent.trim()]; }));})()""")
                mine = decode(blob, layout, features, row, ti)
                ok = (isinstance(got, list) and len(got) == len(mine) and
                      all(g[0] == m[0] and (g[1] == "n/m" if m[1] == 0 else
                                            abs(float(g[1]) - m[1]) < 5e-4)
                          for g, m in zip(got, mine)))
                head = ", ".join(f"{f} {v:+.3f}" for f, v in mine[:2])
                print(f"  {targets[ti]:<13} {label:<28} row {row:>5}  {head}  "
                      f"{'agrees' if ok else 'DISAGREES'}")
                if not ok:
                    fails.append(f"{label} / {targets[ti]}: the page shows {got[:3]} and the "
                                 f"file says {mine[:3]}")

        print(f"  wire     {served['tensor_bytes']:,} byte(s) of the "
              f"{len(blob):,}-byte tensor over {served['tensor_hits']} request(s)")
        if args.norange:
            if served["tensor_bytes"] < len(blob):
                fails.append("Range was switched off and the whole file did not come down — "
                             "the fallback is not being exercised")
            state = ev(ws, "document.getElementById('pxState').textContent") or ""
            if "did not honour Range" not in state:
                fails.append(f"the host ignored Range and the page says {state[:70]!r} — "
                             f"it should say what actually happened")
        elif served["tensor_bytes"] > 4096:
            fails.append(f"{served['tensor_bytes']:,} bytes came down for a 48-byte read")

        ev(ws, "(function(){var n=document.getElementById('pxName');"
               "n.value='Nobody At All — 1999-00';})()")
        ev(ws, "document.getElementById('pxGo').click()")
        time.sleep(0.4)
        refused = ev(ws, "document.getElementById('pxState').textContent") or ""
        bars = ev(ws, "document.querySelectorAll('#pxBars .px-row').length")
        before = len(want) and True
        print(f"  refuse   {refused[:62]!r}, {bars} bar(s) still drawn")
        if "not in the list" in refused.lower() or "no player-season" in refused.lower():
            pass
        else:
            fails.append(f"an unknown name got {refused[:60]!r} instead of a refusal")
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
        print("OK — every bar on screen is the number in the file, and only the bytes for the "
              "row asked about came down" if not args.norange else
              "OK — with Range refused the page reads the same row out of the whole file and "
              "says so")
        return 0
    print(f"FAIL — {len(fails)} problem(s) explaining players:")
    for f in fails:
        print(f"  - {f}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
