"""The Pixel Replay sprite sheet and its layout file agree with each other and with replay.js."""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPR = ROOT / "assets" / "sprites"


def test_sheet_matches_layout() -> None:
    meta = json.loads((SPR / "players.json").read_text(encoding="utf-8"))
    png = (SPR / meta["image"]).read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", png[16:24])
    cw, ch = meta["cell"]
    assert (w, h) == (cw * len(meta["frames"]), ch * meta["dirs"] * len(meta["elevations"]))
    assert meta["hash"] == hashlib.sha256(png).hexdigest()[:8]
    assert len(meta["anchors"]) == len(meta["elevations"])
    for a in meta["anchors"]:
        assert a["foot"][1] > a["head"][1] > 0


def test_every_pose_replay_js_asks_for_exists() -> None:
    meta = json.loads((SPR / "players.json").read_text(encoding="utf-8"))
    poses = meta["poses"]
    assert len(poses["run"]) == 4 and len(poses["jumper"]) == 4 and len(poses["dunk"]) >= 3
    assert len(poses["idle"]) == 2 and len(poses["celebrate"]) == 2
    frames = sorted(i for v in poses.values() for i in v)
    assert frames == list(range(len(meta["frames"])))
