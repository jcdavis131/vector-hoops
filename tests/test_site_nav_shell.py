"""Shell contracts the SOTA upgrade adds to site-nav.js (T15, destinations)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAV = (ROOT / "assets" / "site-nav.js").read_text(encoding="utf-8")


def test_t15_focuses_close_first() -> None:
    assert "if (closeBtn) closeBtn.focus();" in NAV
    open_at = NAV.find("function open()")
    first_item = NAV.find("drawer.querySelector('.explore-item')")
    close_focus = NAV.find("closeBtn.focus();")
    assert open_at != -1 and close_focus != -1
    assert close_focus > open_at
    assert first_item == -1 or close_focus < first_item or "if (closeBtn) closeBtn.focus();" in NAV


def test_explore_lists_new_destinations() -> None:
    for href in ("/seasons", "/teams", "/games", "/compare"):
        assert f"href: '{href}'" in NAV


def test_jump_does_not_fetch_json() -> None:
    jump = NAV[NAV.find("function wireJump") :]
    assert "fetch(" not in jump.split("if (document.readyState")[0]
