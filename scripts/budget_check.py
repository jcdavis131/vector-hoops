#!/usr/bin/env python3
"""CI budget gates for vector-hoops. Stdlib only.

Three gates; any failure exits non-zero so the workflow step fails:

Gate 1 -- page-weight budget. For every served page, the bytes of the page
itself plus the CSS, JS and JSON it loads: markup references (script/link),
asset literals inside inline scripts, and the JSON each page's JS bundles
fetch (one level deep, string literals only). Budgets live in budgets.json at
the repo root, measured on the base commit at 1.5x with a 32 KiB floor. A
page with no budget entry fails the build: new pages must arrive with a
measured budget, not a guessed one.

Gate 2 -- interaction/parse budget, Lighthouse-less. Three site-wide numbers
as proxies for parse/compile and data cost:
  js_total_bytes        all distinct JS bytes any page references
  js_worst_page_bytes   JS bytes on the single heaviest-JS page
  assets_worst_page_bytes  CSS+JS+JSON bytes on the single heaviest page

Gate 3 -- ledger re-verification. Runs the repo's own freshness checks:
  scripts/check_site_facts.py
  scripts/stamp_assets.py --check
  scripts/sync_public.py --check   (root<->public parity, writes nothing)

Usage:
  python scripts/budget_check.py            # run all three gates
  python scripts/budget_check.py --measure  # print a fresh budgets.json
                                            # document (measurement + budgets)
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUDGETS = ROOT / "budgets.json"

COUNTED_EXTENSIONS = {".css", ".js", ".json"}
PAGE_GLOBS = ("*.html", "insights/*.html", "play/*.html", "models/*.html")

# Gate 3: the repo's own freshness checks, run as subprocesses.
LEDGER_CHECKS = [
    [sys.executable, "scripts/check_site_facts.py"],
    [sys.executable, "scripts/stamp_assets.py", "--check"],
    [sys.executable, "scripts/sync_public.py", "--check"],
]

# Asset literals inside scripts: /assets/x.json, assets/x.js, ./assets/x.css...
# A cache token (?v=<hex>, from scripts/stamp_assets.py) may follow the path; the file still counts.
_ASSET_LITERAL = re.compile(r"""['"`](\.?\.?/?assets/[A-Za-z0-9_./-]+\.(?:css|js|json))(?:\?v=[0-9a-f]+)?['"`]""")


class _Refs(HTMLParser):
    """Collect script/link asset references plus inline script bodies."""

    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []
        self.inline: list[str] = []
        self._buf: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = dict(attrs)
        if tag == "script":
            if d.get("src"):
                self.refs.append(d["src"])
            else:
                self._buf = []
        elif tag == "link" and d.get("href"):
            self.refs.append(d["href"])

    def handle_data(self, data: str) -> None:
        if self._buf is not None:
            self._buf.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._buf is not None:
            self.inline.append("".join(self._buf))
            self._buf = None


def _resolve(ref: str, base: Path) -> Path | None:
    """Map a page-relative or root-absolute ref to a repo file, or None."""
    ref = ref.split("?")[0].split("#")[0]
    if not ref or ref.startswith(("http", "data:", "mailto:", "//")):
        return None
    if Path(ref).suffix.lower() not in COUNTED_EXTENSIONS:
        return None
    path = (ROOT / ref[1:]) if ref.startswith("/") else (base.parent / ref).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return None
    return path if path.is_file() else None


def measure_page(page_rel: str) -> dict:
    """Bytes of page + CSS + JS + JSON it loads. Deterministic, stdlib only."""
    page = ROOT / page_rel
    text = page.read_text(encoding="utf-8", errors="replace")
    parser = _Refs()
    parser.feed(text)
    files: set[Path] = set()
    for ref in parser.refs:
        hit = _resolve(ref, page)
        if hit:
            files.add(hit)
    for block in parser.inline:
        for lit in _ASSET_LITERAL.findall(block):
            hit = _resolve(lit, page)
            if hit:
                files.add(hit)
    # One level deeper: JSON the page's JS bundles fetch at runtime.
    for js in [f for f in list(files) if f.suffix == ".js"]:
        body = js.read_text(encoding="utf-8", errors="replace")
        for lit in _ASSET_LITERAL.findall(body):
            if not lit.endswith(".json"):
                continue
            hit = _resolve(lit, js)
            if hit:
                files.add(hit)
    by_ext = {".css": 0, ".js": 0, ".json": 0}
    js_files: set[str] = set()
    for f in files:
        size = f.stat().st_size
        by_ext[f.suffix] += size
        if f.suffix == ".js":
            js_files.add(f.relative_to(ROOT).as_posix())
    html_bytes = page.stat().st_size
    return {
        "html_bytes": html_bytes,
        "css_bytes": by_ext[".css"],
        "js_bytes": by_ext[".js"],
        "json_bytes": by_ext[".json"],
        "total_bytes": html_bytes + sum(by_ext.values()),
        "js_files": sorted(js_files),
    }


def discover_pages() -> list[str]:
    pages: set[str] = set()
    for pattern in PAGE_GLOBS:
        for f in sorted(ROOT.glob(pattern)):
            pages.add(f.relative_to(ROOT).as_posix())
    return sorted(pages)


def _budget_for(measured: int, factor: float, floor: int = 0) -> int:
    """Budget from a measurement: factor headroom, rounded up to 1 KiB."""
    raw = max(int(measured * factor), floor)
    return -(-raw // 1024) * 1024


def measure_all() -> dict:
    pages = {rel: measure_page(rel) for rel in discover_pages()}
    js_union: set[str] = set()
    for m in pages.values():
        js_union.update(m["js_files"])
    js_total = sum((ROOT / f).stat().st_size for f in js_union)
    js_worst = max((m["js_bytes"] for m in pages.values()), default=0)
    assets_worst = max(
        (m["css_bytes"] + m["js_bytes"] + m["json_bytes"] for m in pages.values()),
        default=0,
    )
    return {
        "pages": pages,
        "js_total_bytes": js_total,
        "js_worst_page_bytes": js_worst,
        "assets_worst_page_bytes": assets_worst,
    }


def build_budgets_doc(measured: dict) -> dict:
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=ROOT,
            check=True,
        ).stdout.strip()
    except Exception:  # noqa: BLE001 -- provenance only; never fails the gate
        commit = "unknown"
    doc = {
        "version": 1,
        "measured_commit": commit,
        "method": (
            "Per page: page HTML bytes + CSS/JS/JSON bytes referenced by markup "
            "(script src, link href), asset literals inside inline scripts, and "
            "JSON fetched by the page's JS bundles (one level, string literals). "
            "Budgets are 1.5x measured, rounded up to 1 KiB, with a 32 KiB floor. "
            "Interaction budgets are 1.25x measured, rounded up to 1 KiB."
        ),
        "pages": {
            rel: {"budget_bytes": _budget_for(m["total_bytes"], 1.5, 32 * 1024)} for rel, m in measured["pages"].items()
        },
        "interaction": {
            "js_total_bytes": _budget_for(measured["js_total_bytes"], 1.25),
            "js_worst_page_bytes": _budget_for(measured["js_worst_page_bytes"], 1.25),
            "assets_worst_page_bytes": _budget_for(measured["assets_worst_page_bytes"], 1.25),
        },
    }
    return doc


def _fmt(n: int) -> str:
    return f"{n / 1024:,.1f} KiB"


def run_gate_1(measured: dict, doc: dict) -> list[str]:
    failures: list[str] = []
    budgeted = doc.get("pages", {})
    print("Gate 1: page-weight budgets (HTML+CSS+JS+JSON per page)")
    for rel in sorted(set(measured["pages"]) | set(budgeted)):
        if rel not in measured["pages"]:
            failures.append(f"  OVER  {rel}: budgeted but page missing from repo")
            print(f"  OVER  {rel:45s} page file missing")
            continue
        if rel not in budgeted:
            failures.append(
                f"  OVER  {rel}: new page has no budget -- "
                "run scripts/budget_check.py --measure and add it to budgets.json"
            )
            print(f"  OVER  {rel:45s} no budget entry (new page?)")
            continue
        total = measured["pages"][rel]["total_bytes"]
        budget = budgeted[rel]["budget_bytes"]
        status = "ok  " if total <= budget else "OVER"
        print(f"  {status}  {rel:45s} {_fmt(total):>12s} / {_fmt(budget):>12s}")
        if total > budget:
            failures.append(f"  OVER  {rel}: {_fmt(total)} exceeds budget {_fmt(budget)}")
    return failures


def run_gate_2(measured: dict, doc: dict) -> list[str]:
    failures: list[str] = []
    budgets = doc.get("interaction", {})
    print("Gate 2: interaction/parse budgets (Lighthouse-less proxies)")
    for key, label in (
        ("js_total_bytes", "distinct JS bytes, all pages"),
        ("js_worst_page_bytes", "JS bytes, heaviest page"),
        ("assets_worst_page_bytes", "CSS+JS+JSON bytes, heaviest page"),
    ):
        value, budget = measured[key], budgets.get(key)
        if budget is None:
            failures.append(f"  OVER  {key}: no interaction budget defined")
            print(f"  OVER  {label:38s} no budget defined")
            continue
        status = "ok  " if value <= budget else "OVER"
        print(f"  {status}  {label:38s} {_fmt(value):>12s} / {_fmt(budget):>12s}")
        if value > budget:
            failures.append(f"  OVER  {key}: {_fmt(value)} exceeds {_fmt(budget)}")
    return failures


def run_gate_3() -> list[str]:
    failures: list[str] = []
    print("Gate 3: ledger re-verification (repo's own freshness checks)")
    for cmd in LEDGER_CHECKS:
        shown = " ".join(cmd[1:])
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
        out = (proc.stdout + proc.stderr).strip()
        if proc.returncode == 0:
            print(f"  ok    {shown}")
            for line in out.splitlines()[:3]:
                print(f"        {line}")
        else:
            print(f"  FAIL  {shown} (exit {proc.returncode})")
            for line in out.splitlines()[:10]:
                print(f"        {line}")
            failures.append(f"  FAIL  {shown} exited {proc.returncode}")
    return failures


def main() -> int:
    ap = argparse.ArgumentParser(description="CI budget gates for vector-hoops.")
    ap.add_argument(
        "--measure",
        action="store_true",
        help="print a fresh budgets.json document instead of gating",
    )
    args = ap.parse_args()

    measured = measure_all()
    if args.measure:
        print(json.dumps(build_budgets_doc(measured), indent=2))
        return 0

    if not BUDGETS.is_file():
        print(f"FAIL budgets.json missing at {BUDGETS}")
        return 1
    doc = json.loads(BUDGETS.read_text(encoding="utf-8"))

    failures: list[str] = []
    failures += run_gate_1(measured, doc)
    failures += run_gate_2(measured, doc)
    failures += run_gate_3()

    print()
    if failures:
        print(f"BUDGET GATES FAILED ({len(failures)}):")
        for f in failures:
            print(f)
        return 1
    print(f"BUDGET GATES PASSED: {len(measured['pages'])} pages, interaction proxies and ledger checks all green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
