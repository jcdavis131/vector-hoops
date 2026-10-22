"""Pixel Replay data contract: committed replay files equal a fresh build from the cached
NBA play-by-play, every shot spot matches the feed's own shot distance, lineups are five a
side, and the page only claims what the data holds."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPLAYS = ROOT / "assets" / "replays"


def test_committed_replays_equal_a_fresh_build():
    r = subprocess.run(
        [sys.executable, "pipeline/build_replays.py", "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr


def test_index_lists_only_files_that_exist():
    ix = json.loads((REPLAYS / "index.json").read_text(encoding="utf-8"))
    assert ix["games"], "no games in the replay index"
    for g in ix["games"]:
        assert (REPLAYS / f"{g['gameId']}.json").exists(), g["gameId"]


def test_shot_spots_match_feed_distances_and_lineups_are_five():
    for p in REPLAYS.glob("00*.json"):
        g = json.loads(p.read_text(encoding="utf-8"))
        assert g["check"]["shots"] > 50
        assert g["check"]["distErrP95Ft"] is not None and g["check"]["distErrP95Ft"] <= 1.0, p.name
        for idx, away, home in g["lineups"]:
            assert len(away) == 5 and len(home) == 5, (p.name, idx)
            assert all(g["players"][pid]["t"] == 0 for pid in away)
            assert all(g["players"][pid]["t"] == 1 for pid in home)
        assert "staged" in g and "nine" in g["staged"]
        assert g["source"].startswith("https://cdn.nba.com/static/json/liveData/playbyplay/")


def test_page_says_what_is_staged():
    html = (ROOT / "replay.html").read_text(encoding="utf-8")
    assert "staged" in html and "not tracking data" in html


NETWORK_MODULES = {"urllib", "http", "socket", "ssl", "ftplib", "requests", "httpx"}


def test_refresh_replays_is_offline_and_dry_runs(tmp_path):
    import ast

    script = ROOT / "scripts" / "refresh_replays.py"
    assert script.exists(), "scripts/refresh_replays.py is missing"
    tree = ast.parse(script.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    assert not names & NETWORK_MODULES, names & NETWORK_MODULES
    doc = ast.get_docstring(tree) or ""
    assert "no network" in doc.lower() and "build_replays.py" in doc
    r = subprocess.run(
        [sys.executable, str(script), "--from", str(tmp_path), "--dry-run"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stdout + r.stderr
    assert "0 new" in r.stdout, r.stdout


def test_phone_layout_rules():
    """At phone width (390px) nothing on the page is wider than the viewport: one column
    under 860px, the game strip scrolls inside itself, the canvas is fluid, and the
    feed/moment rows can shrink and wrap long names."""
    import re

    css = (ROOT / "assets" / "replay.css").read_text(encoding="utf-8")
    flat = re.sub(r"\s+", "", css)
    assert "@media(max-width:860px){.rp{grid-template-columns:minmax(0,1fr);}" in flat
    assert ".rp-gamelist{display:flex;" in flat and "overflow-x:auto" in flat
    assert "#rpCanvas{display:block;width:100%;height:auto;" in flat
    rows = re.findall(r"grid-template-columns:52px([^;]+);", flat)
    assert rows and all(r == "minmax(0,1fr)" for r in rows), rows
    assert "overflow-wrap:anywhere" in flat
