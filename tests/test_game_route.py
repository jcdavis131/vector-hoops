"""Truth table for assets/game-route.js — the one 24h routing rule.

Runs the JS module in node and asserts surfaceFor() across the contract
(PRD-SPEC.md C2.1). The table lives here AND in game-route.js comments —
keep them in sync. Kill criterion K2: any redirect loop -> the track
doesn't ship; the loop-freedom property is asserted, not assumed.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "assets" / "game-route.js"
H = 3600 * 1000
NOW = "Date.now()"


def run_table(cases):
    """cases: list of (state, age_ms_or_None, margin_ms, expected)."""
    prog = (
        "const G=require(%s);const R=[];"
        % json.dumps(str(JS))
        + "const NOW=Date.now();"
        + "".join(
            "R.push(G.surfaceFor(%s,%s,%s));"
            % (
                json.dumps(s),
                "null" if a is None else "(NOW-(%d))" % a,
                m,
            )
            for s, a, m, _ in cases
        )
        + "console.log(JSON.stringify(R));"
    )
    out = subprocess.run(
        ["node", "-e", prog], capture_output=True, text=True, check=True, timeout=30
    )
    return json.loads(out.stdout)


CASES = [
    # (state, age_ms, margin_ms, expected)
    ("pre", None, 0, "live"),  # scheduled games always live surface
    ("in", None, 0, "live"),  # live games always live surface
    ("post", 1 * H, 0, "live"),  # final 1h ago -> live (morning-after)
    ("post", 23 * H, 0, "live"),  # final 23h ago -> live
    ("post", 25 * H, 0, "replay"),  # final 25h ago -> replay
    ("post", 72 * H, 0, "replay"),  # final 3d ago -> replay
    ("post", None, 0, "stay"),  # unknown age -> stay, no redirect (D4)
    ("bogus", 5 * H, 0, "stay"),  # unknown state -> stay
    # estimation margin: callers estimate final from tip+2.5h; the gray zone
    # must never confidently route (K2 loop-freedom)
    ("post", 23 * H, int(2.5 * H), "stay"),  # 23h old, estimated -> gray
    ("post", 20 * H, int(2.5 * H), "live"),  # 20h old, estimated -> live
    ("post", 30 * H, int(2.5 * H), "replay"),  # 30h old, estimated -> replay
]


def test_surfacefor_truth_table():
    got = run_table(CASES)
    for (s, a, m, want), have in zip(CASES, got):
        assert have == want, f"surfaceFor({s!r}, age={a}, margin={m}) = {have!r}, want {want!r}"


def test_readparams_normalizes_id_spellings():
    prog = (
        "const G=require(%s);const R=["
        % json.dumps(str(JS))
        + "G.readParams('?game=ABC'),G.readParams('?g=ABC'),G.readParams('?espn=ABC'),"
        + "G.readParams('?espn=ABC&possession=12&t=44&view=follow&cam=baseline'),"
        + "G.readParams('?t=44'),G.readParams('')];console.log(JSON.stringify(R));"
    )
    out = subprocess.run(
        ["node", "-e", prog], capture_output=True, text=True, check=True, timeout=30
    )
    r = json.loads(out.stdout)
    assert r[0]["id"] == "ABC" and r[1]["id"] == "ABC" and r[2]["id"] == "ABC"
    # deep-link params preserved, never treated as ids
    assert r[3]["keep"] == "possession=12&t=44&view=follow&cam=baseline"
    assert r[4]["id"] is None  # ?t= alone is not a game id
    assert r[5]["id"] is None


def test_guard_never_loops():
    """Guard fires only when surfaceFor() disagrees with the current surface.
    Simulate both directions across the boundary: after a redirect, the other
    surface's guard must NOT redirect back."""
    prog = (
        "const G=require(%s);" % json.dumps(str(JS))
        + "const NOW=Date.now();"
        + "function mkLoc(search){return{search:search,replaced:null,replace(u){this.replaced=u;}};}"
        # final 30h ago, estimated: live page must redirect to replay...
        + "var l1=mkLoc('?game=E1');var r1=G.guard('live',function(){return{state:'post',gameTimeMs:NOW-30*3600e3};},l1);"
        # ...and the replay page, seeing the redirected URL, must stay put.
        + "var l2=mkLoc('?espn=E1');var r2=G.guard('replay',function(){return{state:'post',gameTimeMs:NOW-30*3600e3};},l2);"
        # final 5h ago: replay page redirects to live...
        + "var l3=mkLoc('?espn=E2&possession=7');var r3=G.guard('replay',function(){return{state:'post',gameTimeMs:NOW-5*3600e3};},l3);"
        # ...and the live page stays put.
        + "var l4=mkLoc('?game=E2');var r4=G.guard('live',function(){return{state:'post',gameTimeMs:NOW-5*3600e3};},l4);"
        # unknown age: no redirect anywhere.
        + "var l5=mkLoc('?game=E3');var r5=G.guard('live',function(){return{state:'post',gameTimeMs:null};},l5);"
        + "console.log(JSON.stringify({r1:r1,to1:l1.replaced,r2:r2,r3:r3,to3:l3.replaced,r4:r4,r5:r5}));"
    )
    out = subprocess.run(
        ["node", "-e", prog], capture_output=True, text=True, check=True, timeout=30
    )
    d = json.loads(out.stdout)
    assert d["r1"] is True and d["to1"].startswith("/replay?espn=E1")
    assert "notice=moved-to-replay" in d["to1"]
    assert d["r2"] is False, "replay page must not bounce a 30h-final back to live"
    assert d["r3"] is True and d["to3"].startswith("/live?game=E2")
    assert "possession=7" in d["to3"], "possession deep-link must survive the redirect"
    assert d["r4"] is False, "live page must not bounce a 5h-final back to replay"
    assert d["r5"] is False, "unknown age must never redirect"
