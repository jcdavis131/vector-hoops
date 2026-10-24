"""No page carries an inline <script>: production's Content-Security-Policy is `script-src 'self'`
with no nonce, so inline code never runs there. Twenty Questions and Era Crossed shipped as
inline scripts and were dead games on the live site until 2026-10-23. Data blocks
(application/json, ld+json) are not scripts and are allowed."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INLINE = re.compile(r"<script(?![^>]*(?<![\w-])src=)([^>]*)>", re.I)
DATA_TYPES = ("application/json", "application/ld+json", "importmap", "text/template")


def pages():
    yield from ROOT.glob("*.html")
    yield from ROOT.glob("play/*.html")
    yield from ROOT.glob("insights/*.html")
    yield from ROOT.glob("models/*.html")
    yield from ROOT.glob("teams/*.html")


def test_pages_have_no_inline_scripts() -> None:
    bad = []
    for page in pages():
        html = page.read_text(encoding="utf-8", errors="replace")
        for m in INLINE.finditer(html):
            attrs = m.group(1)
            if any(t in attrs for t in DATA_TYPES):
                continue
            bad.append(f"{page.relative_to(ROOT)}:{html[: m.start()].count(chr(10)) + 1}")
    assert not bad, "inline <script> blocked by the site CSP: " + ", ".join(bad)


def test_csp_still_forbids_inline() -> None:
    cfg = (ROOT / "vercel.json").read_text(encoding="utf-8")
    assert "script-src 'self'" in cfg and "'unsafe-inline'" not in cfg.split("script-src")[1].split(";")[0]
