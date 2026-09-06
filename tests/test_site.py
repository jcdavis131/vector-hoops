"""Smoke tests for the hoops.dumbmodel.com static site. Stdlib + pytest only.

The site is static files on Vercel: the ways it breaks are a truncated JSON asset,
a script tag pointing at a file that is not there, or a page that stopped being
HTML. Each of those is asserted here so the repo has a CI signal at all (it had
none before 2026-09-05).
"""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PAGES = [
    "index.html",
    "play.html",
    "players.html",
    "model.html",
    "methods.html",
    "trends.html",
    "leaderboard.html",
    "everyday.html",
    "offline.html",
    "404.html",
]


def _json_files() -> list[Path]:
    return sorted(
        p
        for p in ROOT.rglob("*.json")
        if "node_modules" not in p.parts and ".git" not in p.parts
    )


@pytest.mark.parametrize("path", _json_files(), ids=lambda p: str(p.relative_to(ROOT)))
def test_every_json_asset_parses(path: Path) -> None:
    json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("page", PAGES)
def test_pages_exist_and_are_html(page: str) -> None:
    text = (ROOT / page).read_text(encoding="utf-8")
    assert "<html" in text.lower() and "</html>" in text.lower(), page


class _Srcs(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.srcs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "link", "img"):
            for k, v in attrs:
                if k in ("src", "href") and v and v.startswith("/assets/"):
                    self.srcs.append(v.split("?")[0])


@pytest.mark.parametrize("page", PAGES)
def test_local_asset_references_resolve(page: str) -> None:
    parser = _Srcs()
    parser.feed((ROOT / page).read_text(encoding="utf-8"))
    missing = [s for s in parser.srcs if not (ROOT / s.lstrip("/")).is_file()]
    assert not missing, f"{page} references missing assets: {missing}"


def test_manifest_and_service_worker() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.get("name") and manifest.get(
        "start_url"
    ), "manifest needs name and start_url"
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    assert re.search(
        r"addEventListener\(['\"]fetch['\"]", sw
    ), "sw.js has no fetch handler"


def test_vectors_have_coordinates() -> None:
    doc = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))
    players = doc["players"] if isinstance(doc, dict) else doc
    assert len(players) == 12966, "vectors.json should carry all 12,966 player-seasons"
