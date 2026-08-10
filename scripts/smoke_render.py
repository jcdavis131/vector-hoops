"""Render the site in a real browser and check what a visitor would actually see.

Every other check on this branch is static analysis or a node stub with a DOM I
wrote myself. None of them can tell you the page renders. This one serves
`public/` — the directory Vercel actually publishes — over loopback, drives
headless Chrome at it, and reads the DOM *after* the page's JavaScript has run
and its fetches have settled.

What that catches which nothing else can: a page whose script throws on load and
leaves every "Loading…" placeholder sitting there. That is exactly the shape of
9a0a4481, where index.html's whole inline script was a SyntaxError and the page
shipped broken for an unknown length of time.

So each page is asserted two ways — something real appeared, and no placeholder
was left behind.

No installs. Chrome or Edge ships with Windows; http.server is stdlib. The server
binds 127.0.0.1 only and is always shut down.

    python scripts/smoke_render.py
    python scripts/smoke_render.py --keep   # leave the server up to look yourself
"""

from __future__ import annotations

import argparse
import functools
import http.server
import re
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SERVE = ROOT / "public"

BROWSERS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]

# (path, [things that must appear], [things that must NOT be left behind])
CASES: list[tuple[str, list[str], list[str]]] = [
    ("/", ["DUMB", "Pick Your Edge"], ["Loading the measured headline"]),
    ("/owner/", ["Boston Celtics", "78.10", "129.33"], ["Loading 30 teams"]),
    ("/teams.html", ["All 30 teams", "BOS", "78.10"], ["Loading <code>assets"]),
    ("/model.html", ["MTNN", "towers"], ["Loading the measured headline"]),
    ("/trends.html", ["rotation", "archetype"], ["Loading archetype names"]),
    ("/play.html", ["DUMB MODEL"], []),
    ("/dictionary.html", ["Embedding", "Cosine similarity"], []),
    ("/players.html", ["Explorer"], []),
]

PLACEHOLDER = re.compile(r"Loading[^<]{0,60}", re.I)
RE_SCRIPT_EL = re.compile(r"<script[^>]*>.*?</script>", re.S | re.I)


def rendered(dom: str) -> str:
    """The DOM with <script> elements removed.

    --dump-dom returns the whole document, script elements included, so asserting
    on the raw string matches the page's own source. The first run of this test
    reported /owner/ as stuck on "Loading 30 teams" when the table had rendered
    perfectly - the phrase was matching the tb.innerHTML placeholder inside the
    script that replaces it. Same for "Could not load", which is only ever the
    text of a catch branch that never ran.
    """
    return RE_SCRIPT_EL.sub(" ", dom)


RE_CONSOLE = re.compile(r"(?:ERROR|WARNING):CONSOLE[^\]]*\]\s*(.*)")

# The static server used here does not apply vercel.json's rewrites, so /offline
# 404s locally and sw.js reports skipping it. On Vercel that rewrite exists and
# the entry caches. The message is also proof the fix in 596a4001 works: each
# SHELL entry is added with its own catch, so one bad path degrades the shell
# instead of rejecting install and leaving the worker unregistered.
HARNESS_NOISE = (
    "sw: skipped /offline",
    "favicon.ico",
    "Failed to load resource: the server responded with a status of 404",
)


def console_errors(log: str) -> list[str]:
    """Console errors and warnings the page itself produced, minus harness noise."""
    out = []
    for line in log.splitlines():
        m = RE_CONSOLE.search(line)
        if not m:
            if "Uncaught" in line:
                out.append(line.strip())
            continue
        msg = m.group(1).strip()
        if any(n in msg for n in HARNESS_NOISE):
            continue
        out.append(msg)
    return out


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def find_browser() -> Path:
    for b in BROWSERS:
        if b.exists():
            return b
    sys.exit("no Chrome or Edge found — cannot render")


def dump(browser: Path, url: str, profile: Path, budget: int = 9000) -> tuple[str, str]:
    """Post-JavaScript DOM. virtual-time-budget lets fetches and timers settle."""
    cmd = [
        str(browser), "--headless=new", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", "--disable-extensions",
        f"--user-data-dir={profile}",
        "--window-size=1280,3000",          # tall, so observer-gated sections come into view
        "--enable-logging=stderr", "--log-level=0",
        f"--virtual-time-budget={budget}",
        "--dump-dom", url,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90,
                       encoding="utf-8", errors="replace")
    return r.stdout or "", r.stderr or ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="leave the server running")
    ap.add_argument("--only", help="substring: run just the pages whose path contains it")
    ap.add_argument("--budget", type=int, default=9000, help="virtual time budget in ms")
    ap.add_argument("--dump", action="store_true", help="write the DOM to a file")
    args = ap.parse_args()

    if not SERVE.is_dir():
        sys.exit(f"{SERVE} does not exist")
    browser = find_browser()
    port = free_port()
    # Silence the request log on the class, not on the functools.partial — setting
    # it on the partial does nothing and the first run buried its own results in
    # a few hundred lines of GET traffic on stderr.
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):          # noqa: D102
            pass

    handler = functools.partial(Quiet, directory=str(SERVE))

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"serving {SERVE.name}/ at http://127.0.0.1:{port}  via {browser.name}\n")

    # a Chrome profile inside the repo is untracked clutter at best and a large
    # accidental commit at worst, so it lives in the system temp directory
    profile = Path(tempfile.gettempdir()) / "vh-render-profile"
    failures: list[str] = []
    try:
        cases = [c for c in CASES if not args.only or args.only in c[0]]
        for path, must, must_not in cases:
            url = f"http://127.0.0.1:{port}{path}"
            dom, log = dump(browser, url, profile, args.budget)
            bad = console_errors(log)
            if not dom.strip():
                failures.append(f"{path}: browser returned nothing")
                print(f"  FAIL  {path:<18} empty DOM")
                continue

            if args.dump:
                out=Path(tempfile.gettempdir())/("dump"+path.replace("/","_")+".html"); out.write_text(dom,encoding="utf-8")
                print(f"        wrote {out}")
            body = rendered(dom)
            missing = [s for s in must if s not in body]
            left = [s for s in must_not if s in body]
            stuck = sorted(set(PLACEHOLDER.findall(body)))

            ok = not missing and not left and not bad
            print(f"  {'PASS' if ok else 'FAIL'}  {path:<18} {len(dom):>7,} b of DOM")
            if missing:
                failures.append(f"{path}: never rendered {missing}")
                print(f"        missing: {missing}")
            if left:
                failures.append(f"{path}: still showing {left}")
                print(f"        placeholder left: {left}")
            if bad:
                failures.append(f"{path}: {len(bad)} console error(s)")
                for b in bad[:3]:
                    print(f"        console: {b[:150]}")
            if stuck and not left:
                print(f"        note — text still reading 'Loading…': {stuck[:3]}")

        if args.keep:
            print(f"\nserver left running at http://127.0.0.1:{port} — Ctrl+C to stop")
            threading.Event().wait()
    finally:
        if not args.keep:
            httpd.shutdown()
            httpd.server_close()

    print()
    if failures:
        print(f"FAIL — {len(failures)} page(s) did not render as expected:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"OK — {len(cases)} pages render in a real browser with their content filled in")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
