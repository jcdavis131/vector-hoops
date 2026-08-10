"""Measure the pages at real phone widths, using Chrome's DevTools protocol.

`--window-size` cannot do this. Every headless mode on this machine clamps the
viewport to 497px: 320, 360 and 390 all render at 497, so a "390px screenshot" is
a 390px crop of a 497px layout. I misread exactly that once already and diagnosed
a clipping bug that did not exist.

`Emulation.setDeviceMetricsOverride` does do it, and it needs the DevTools
protocol, which is JSON over a WebSocket. Python's standard library has no
WebSocket client, so there is a small one below — handshake, masked client
frames, and enough of the frame decoder to read replies. About eighty lines and
no installs, which is the whole point: the alternative was adding a dependency to
a repo whose doctrine is zero-deps.

For each width it reports the document's scrollWidth against its clientWidth, and
names any element whose right edge crosses the viewport. A page that overflows
sideways on a phone is what this is for.

    python scripts/check_viewport.py
    python scripts/check_viewport.py --widths 320,360,390,414
"""

from __future__ import annotations

import argparse
import base64
import functools
import http.server
import json
import os
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

BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]

PAGES = ["/", "/owner/", "/teams.html", "/trends.html", "/model.html", "/play.html", "/players.html"]

# What to ask the page once it has settled. Returns the two widths and the worst
# offenders, so a failure names the element instead of just the number.
# An element wider than the viewport is fine when it sits in something that
# scrolls — that is the whole point of the wrappers on the owner table and
# .figwrap. A first version counted those and called /owner/ a failure with 95
# offenders while its scrollWidth equalled its clientWidth. The page-level
# question is scrollWidth vs clientWidth; the element list is only there to name
# the cause, so it now skips anything inside a scrollable ancestor. Computed
# style is the point of doing this in a browser at all.
PROBE = """(() => {
  const d = document.documentElement, out = [];
  const scrolls = e => {
    for (let p = e.parentElement; p && p !== d; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width && r.right > d.clientWidth + 1 && !scrolls(e)) {
      out.push(e.tagName.toLowerCase() +
               (e.id ? '#' + e.id : '') +
               (e.className && e.className.toString ? '.' + e.className.toString().trim().split(/\\s+/)[0] : '') +
               '@' + Math.round(r.right));
    }
  });
  return JSON.stringify({sw: d.scrollWidth, cw: d.clientWidth, over: out.slice(0, 6), n: out.length});
})()"""


class WS:
    """The smallest WebSocket client that can drive CDP."""

    def __init__(self, url: str):
        _, _, rest = url.partition("://")
        hostport, _, path = rest.partition("/")
        host, _, port = hostport.partition(":")
        self.sock = socket.create_connection((host, int(port or 80)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n".encode()
        )
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        if b"101" not in buf.split(b"\r\n")[0]:
            raise RuntimeError("websocket upgrade refused: " + buf.split(b"\r\n")[0].decode())
        self.rest = buf.split(b"\r\n\r\n", 1)[1]
        self._id = 0

    def _recv(self, n: int) -> bytes:
        while len(self.rest) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("websocket closed")
            self.rest += chunk
        out, self.rest = self.rest[:n], self.rest[n:]
        return out

    def send(self, method: str, params: dict | None = None) -> int:
        self._id += 1
        payload = json.dumps({"id": self._id, "method": method, "params": params or {}}).encode()
        head = bytearray([0x81])                      # FIN + text frame
        n = len(payload)
        mask = os.urandom(4)
        if n < 126:
            head.append(0x80 | n)
        elif n < 1 << 16:
            head.append(0x80 | 126); head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127); head += struct.pack(">Q", n)
        head += mask
        head += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(head))
        return self._id

    def frame(self) -> dict:
        b0, b1 = self._recv(2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", self._recv(2))[0]
        elif n == 127:
            n = struct.unpack(">Q", self._recv(8))[0]
        if b1 & 0x80:                                  # server frames are never masked, but be safe
            m = self._recv(4)
            data = bytes(c ^ m[i % 4] for i, c in enumerate(self._recv(n)))
        else:
            data = self._recv(n)
        return json.loads(data.decode("utf-8", "replace")) if data else {}

    def call(self, method: str, params: dict | None = None, timeout: float = 30) -> dict:
        want = self.send(method, params)
        end = time.time() + timeout
        while time.time() < end:
            msg = self.frame()
            if msg.get("id") == want:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
        raise TimeoutError(method)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--widths", default="320,360,390", help="comma-separated CSS pixel widths")
    args = ap.parse_args()
    widths = [int(w) for w in args.widths.split(",") if w.strip()]

    browser = next((b for b in BROWSERS if b.exists()), None)
    if not browser:
        sys.exit("no Chrome or Edge found")
    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def handle_one_request(self):
            # Chrome drops keep-alive sockets between navigations; the default
            # handler prints a full traceback for each one and buries the results.
            try:
                super().handle_one_request()
            except ConnectionResetError:
                self.close_connection = True

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); site_port = s.getsockname()[1]
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); cdp_port = s.getsockname()[1]

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", site_port),
                                   functools.partial(Quiet, directory=str(SERVE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    proc = subprocess.Popen(
        [str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
         "--disable-extensions", "--no-default-browser-check",
         f"--user-data-dir={Path(tempfile.gettempdir()) / 'vh-cdp'}",
         f"--remote-debugging-port={cdp_port}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ws = None
    failures: list[str] = []
    try:
        target = None
        for _ in range(60):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json/list", timeout=2) as r:
                    for t in json.load(r):
                        if t.get("type") == "page":
                            target = t["webSocketDebuggerUrl"]; break
                if target:
                    break
            except Exception:
                time.sleep(0.25)
        if not target:
            sys.exit("chrome never exposed a devtools target")

        ws = WS(target)
        ws.call("Page.enable")
        ws.call("Runtime.enable")

        print(f"serving public/ at 127.0.0.1:{site_port}, driving {browser.name} over CDP\n")
        for width in widths:
            ws.call("Emulation.setDeviceMetricsOverride",
                    {"width": width, "height": 900, "deviceScaleFactor": 1, "mobile": True})
            print(f"  {width}px")
            for path in PAGES:
                ws.call("Page.navigate", {"url": f"http://127.0.0.1:{site_port}{path}"})
                time.sleep(2.2)                        # let fetches and observers settle
                res = ws.call("Runtime.evaluate", {"expression": PROBE, "returnByValue": True})
                raw = (res.get("result") or {}).get("value")
                if not raw:
                    failures.append(f"{width}px {path}: probe returned nothing")
                    print(f"    FAIL {path:<16} probe returned nothing")
                    continue
                d = json.loads(raw)
                # the page-level test is scrollWidth; the element list only names the cause
                ok = d["sw"] <= d["cw"] + 1
                print(f"    {'ok  ' if ok else 'FAIL'} {path:<16} scrollWidth {d['sw']:>4}  clientWidth {d['cw']:>4}"
                      + (f"  overflowing {d['n']}" if d["n"] else ""))
                if not ok:
                    failures.append(f"{width}px {path}: scrollWidth {d['sw']} vs {d['cw']}, "
                                    f"{d['n']} element(s) past the edge: {', '.join(d['over'])}")
    finally:
        if ws:
            ws.close()
        proc.terminate()
        httpd.shutdown()
        httpd.server_close()

    print()
    if failures:
        print(f"FAIL — {len(failures)} page/width combination(s) overflow:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — {len(PAGES)} pages fit every width in {widths} with nothing past the edge")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
