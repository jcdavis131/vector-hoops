"""Pixel Replay from ESPN play-by-play, and the replay plate on Courtside Live.

assets/replay-espn.js turns the ESPN summary the live page already polls into the event
format pipeline/build_replays.py writes from the NBA feed. These tests run it in node on a
real ESPN summary (tests/fixtures, Q1 of ATL @ ORL 2026-10-21, trimmed) and hold it to the
NBA-built replay of the same game; then check the embedded plate follows live and rewinds.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "espn_summary_401909834_q1.json"
NBA = ROOT / "assets" / "replays" / "0022600085.json"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")

DUMP = """
const E = require(process.argv[1]), fs = require('fs');
const g = E.toGame(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), '401909834');
process.stdout.write(JSON.stringify(g));
"""


@pytest.fixture(scope="module")
def game() -> dict:
    out = subprocess.run(
        ["node", "-e", DUMP, str(ROOT / "assets" / "replay-espn.js"), str(FIX)],
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return json.loads(out.stdout)


def test_shape_matches_the_nba_built_files(game: dict) -> None:
    nba = json.loads(NBA.read_text(encoding="utf-8"))
    assert game["types"] == nba["types"]
    assert [t["tri"] for t in game["teams"]] == [t["tri"] for t in nba["teams"]]
    assert all(len(e) == 14 for e in game["events"])
    assert len(game["src"]) == len(game["events"]) == len(game["wall"])
    assert game["lineups"] and all(len(a) == 5 and len(b) == 5 for _, a, b in game["lineups"])
    ids = {int(k) for k in game["players"]}
    assert all(e[5] == 0 or e[5] in ids for e in game["events"])
    assert "staged" in game and "assumed" in game["staged"]


def test_q1_agrees_with_the_nba_feed(game: dict) -> None:
    """Same quarter, two publishers: score, shot count and shot spots line up."""
    nba = json.loads(NBA.read_text(encoding="utf-8"))
    q1 = [e for e in nba["events"] if e[0] == 1]
    end_nba = next(e for e in q1 if nba["types"][e[2]] == "period" and e[3] == "end")
    end_espn = next(e for e in game["events"] if game["types"][e[2]] == "period" and e[3] == "end")
    assert end_espn[8:10] == end_nba[8:10]
    fg = lambda ev, ty: [e for e in ev if ty[e[2]] in ("2pt", "3pt") and e[0] == 1]  # noqa: E731
    a, b = fg(game["events"], game["types"]), fg(q1, nba["types"])
    # ESPN logs Suggs's 0:00 heave; the NBA feed does not. Otherwise the two lists are the same shots.
    assert abs(len(a) - len(b)) <= 1, (len(a), len(b))
    errs = []
    for e in a:
        if e[6] is None:
            continue
        m = [x for x in b if abs(x[1] - e[1]) < 1.01 and x[10] == e[10] and x[6] is not None]
        if len(m) == 1:
            errs.append(((m[0][6] - e[6]) ** 2 + (m[0][7] - e[7]) ** 2) ** 0.5)
    assert len(errs) >= 0.9 * len(a), (len(errs), len(a))
    errs.sort()
    assert errs[len(errs) // 2] < 1.0 and errs[int(len(errs) * 0.95)] < 1.5, errs[-5:]


def test_embedded_replay_follows_live_and_rewinds() -> None:
    proc = subprocess.run(
        ["node", str(ROOT / "tests" / "replay_live_check.mjs")], cwd=ROOT, capture_output=True, text=True, timeout=120
    )
    rep = json.loads(proc.stdout)
    assert proc.returncode == 0 and rep["ok"], rep


def test_live_page_carries_the_plate() -> None:
    html = (ROOT / "live.html").read_text(encoding="utf-8")
    assert 'id="rpPlate"' in html and 'data-mode="embed"' in html
    order = [m.group(1) for m in re.finditer(r'<script src="assets/([\w.-]+?)\.js', html)]
    assert order.index("replay-espn") < order.index("replay") < order.index("replay-live") < order.index("live")
    plate = html[html.index('id="rpPlate"') : html.index("</div>\n", html.index("rp-embed__now"))]
    assert "projected" in plate and "assumed" in plate and "not tracking data" in plate
    nums = [int(n) for n in re.findall(r"PLATE (\d\d)", html)]
    assert nums == list(range(1, len(nums) + 1))
    js = (ROOT / "assets" / "live.js").read_text(encoding="utf-8")
    assert "courtside:render" in js


def test_replay_page_reads_espn_too() -> None:
    html = (ROOT / "replay.html").read_text(encoding="utf-8")
    assert html.index("replay-espn.js") < html.index("/assets/replay.js")
    assert 'href="/live"' in html and 'id="rpLive"' in html
    assert "ESPN" in html[html.index("rp-honest") :]
