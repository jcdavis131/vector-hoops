"""Pixel Replay runs clean and redraws only what moves.

tests/replay_harness.mjs runs assets/replay.js in node against a stub canvas and DOM for
every game in assets/replays/index.json (run it directly for the full JSON report). This
file puts it on the pytest lane, so the offline-build CI job runs it. Node ships on the
ubuntu-latest runner; anywhere node is missing the test skips instead of failing.

What it holds the page to:
- zero errors on every game, with and without prefers-reduced-motion;
- with the camera at rest, the visible canvas gets at most 40% of the draw calls it gets
  while the camera is being dragged (a drag redraws the whole scene every frame, which is
  what every frame cost before the static-court cache);
- every sprite pose shows up somewhere across the games, and under reduced motion
  nothing hops, ripples or shakes.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MJS = ROOT / "tests" / "replay_harness.mjs"
POSES = ("idle", "run", "jumper", "dunk", "hang", "celebrate")

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")


def _run(*extra: str) -> dict:
    proc = subprocess.run(
        ["node", str(MJS), *extra],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert proc.returncode in (0, 1), proc.stdout[-2000:] + proc.stderr[-2000:]
    return json.loads(proc.stdout)


@pytest.fixture(scope="module")
def report() -> dict:
    return _run("--starts", "30")


@pytest.fixture(scope="module")
def reduced() -> dict:
    return _run("--reduce", "--starts", "15")


def test_every_game_replays_without_errors(report: dict, reduced: dict) -> None:
    assert len(report["games"]) >= 5
    for r in (report, reduced):
        bad = {g["gameId"]: g["errors"][:3] for g in r["games"] if g["errors"]}
        assert not bad, bad


def test_rest_camera_redraws_at_most_40_percent(report: dict) -> None:
    for g in report["games"]:
        by = {p["name"]: p for p in g["passes"]}
        rest, drag = by["rest"]["perFrame"]["mean"], by["drag"]["perFrame"]["mean"]
        assert rest <= 0.40 * drag, (g["gameId"], rest, drag)


def test_every_pose_is_drawn(report: dict) -> None:
    seen = {k: 0 for k in POSES}
    for g in report["games"]:
        assert g["stats"], f"{g['gameId']}: window.PixelReplay.stats missing"
        for k in POSES:
            seen[k] += g["stats"]["poses"].get(k, 0)
        assert g["stats"]["cache"]["hits"] > 0, g["gameId"]
    assert all(seen.values()), seen
    assert sum(g["stats"]["netRipple"] for g in report["games"]) > 0
    assert sum(g["stats"]["rimShake"] for g in report["games"]) > 0


def test_reduced_motion_holds_still(reduced: dict) -> None:
    for g in reduced["games"]:
        s = g["stats"]
        assert s, g["gameId"]
        assert s["hop"] == 0 and s["netRipple"] == 0 and s["rimShake"] == 0, (
            g["gameId"],
            s,
        )


@pytest.fixture(scope="module")
def sprited() -> dict:
    return _run("--sprites", "--starts", "15")


def test_sprite_path_draws_every_game(sprited: dict) -> None:
    """With an Image available the players come off the Blender sheet: one drawImage each."""
    assert sprited["errors"] == 0, [g["errors"][:3] for g in sprited["games"] if g["errors"]]
    for g in sprited["games"]:
        s = g["stats"]["sprites"]
        assert s["ready"] == 1 and s["sheets"] == 2 and s["drawn"] > 0, (g["gameId"], s)
        assert s["cells"] <= 3000, (g["gameId"], s)
    seen = {p: sum(g["stats"]["poses"].get(p, 0) for g in sprited["games"]) for p in POSES}
    assert all(seen.values()), seen
