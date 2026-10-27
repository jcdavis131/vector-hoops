"""Twin Reveal must never reveal the mystery star as his own twin.

Regression for the 2026-10-26 Daily Court puzzle: Stephen Curry 2016-17's
Twin Reveal listed Curry 2014-15 / 2015-16 / 2017-18, because twinReveal()
excluded only the exact player-season row, and a player's own other seasons
are the nearest rows in embedding space. The fix excludes the target's whole
person (person_id, falling back to name) — mirrored here, and asserted to be
present in assets/game-mechanics.js so the rule cannot silently drop out.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VEC = ROOT / "assets" / "vectors.json"
MECH = ROOT / "assets" / "game-mechanics.js"


def cos(a, b):
    d = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return d / (na * nb) if na and nb else 0


def is_self(target, row):
    if target.get("person_id") and row.get("person_id"):
        return row["person_id"] == target["person_id"]
    return row.get("name") == target.get("name")


def top_twins(players, target, n=3):
    scored = [
        (cos(target["v"], p["v"]), p) for p in players if p is not target and p.get("v") and not is_self(target, p)
    ]
    scored.sort(key=lambda z: -z[0])
    return scored[:n]


def test_twin_reveal_rule_present_in_js() -> None:
    src = MECH.read_text(encoding="utf-8")
    reveal = src[src.index("function twinReveal()") : src.index("function eraLock()")]
    assert "person_id" in reveal and "isSelf" in reveal


def test_curry_2016_17_reveal_has_no_curry() -> None:
    players = json.loads(VEC.read_text(encoding="utf-8"))["players"]
    target = next(p for p in players if p["name"] == "Stephen Curry" and p["season"] == "2016-17")
    top = top_twins(players, target)
    assert len(top) == 3
    assert all(p["person_id"] != target["person_id"] for _, p in top)
    assert [(p["name"], p["season"]) for _, p in top] == [
        ("Manu Ginobili", "2009-10"),
        ("Manu Ginobili", "2006-07"),
        ("Jamal Murray", "2020-21"),
    ]


def test_no_self_twin_for_sampled_targets() -> None:
    players = json.loads(VEC.read_text(encoding="utf-8"))["players"]
    sample = players[::1000]  # 13 targets across the whole dataset
    for target in sample:
        top = top_twins(players, target)
        assert len(top) == 3
        assert all(not is_self(target, p) for _, p in top)


def test_same_name_different_person_is_not_a_self_twin() -> None:
    # Two Dee Browns, two Reggie Williams: person_id keeps them apart, so a
    # same-name different person must NOT be classified as the target himself.
    players = json.loads(VEC.read_text(encoding="utf-8"))["players"]
    by_name = {}
    for p in players:
        by_name.setdefault(p["name"], []).append(p)
    for name in ("Dee Brown", "Reggie Williams", "Mike James"):
        rows = by_name[name]
        ids = {p["person_id"] for p in rows}
        assert len(ids) > 1, name
        a = next(p for p in rows if p["person_id"] == sorted(ids)[0])
        other = next(p for p in rows if p["person_id"] != a["person_id"])
        assert not is_self(a, other)
