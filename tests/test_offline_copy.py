"""The offline messages say only what is true.

The service worker never caches the data files the game needs (sw.js DENY list)
and Lab was retired, so no script under assets/ may promise offline play. The
honest sentence is the one offline.html already uses.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
BOUNDARY = ASSETS / "error-boundary.js"

BANNED = (
    "Daily + Lab work offline",
    "still playable",
    "cache still works offline",
    "works offline",
    "work offline",
)


def _texts() -> dict[Path, str]:
    """Every file under assets/ that decodes as UTF-8; the rest are binary."""
    out = {}
    for p in sorted(ASSETS.rglob("*")):
        if not p.is_file():
            continue
        try:
            out[p] = p.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            continue
    return out


def test_no_asset_promises_offline_play():
    texts = _texts()
    assert BOUNDARY in texts, "error-boundary.js was not scanned"
    hits = []
    for path, text in texts.items():
        low = text.lower()
        for phrase in BANNED:
            if phrase.lower() in low:
                hits.append(f"{path.relative_to(ROOT)}: {phrase!r}")
    assert hits == []


def _toast() -> str:
    """The toast text: the one `t.textContent` in error-boundary.js, which must be
    a single whole-line string literal, so no concatenation, second assignment
    or `+=` can add to it unseen."""
    src = BOUNDARY.read_text(encoding="utf-8")
    assert src.count("t.textContent") == 1, "expected exactly one t.textContent"
    m = re.search(r"^\s*t\.textContent\s*=\s*'([^']*)';\s*$", src, re.M)
    assert m, "offline toast must be one plain string literal on its own line"
    return m.group(1)


def test_offline_toast_has_no_digit_run():
    toast = _toast()
    assert toast.startswith("Offline")
    assert not re.search(r"\d", toast), toast


def test_offline_toast_uses_the_offline_page_sentence():
    """The toast literal is exactly 'Offline — ' plus the offline.html sentence."""
    page = (ROOT / "offline.html").read_text(encoding="utf-8")
    honest = "Pages you’ve already opened may still work from this device’s cache."
    assert honest in page
    assert _toast() == "Offline — " + honest[0].lower() + honest[1:]
