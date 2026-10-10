"""Unmeasured hustle values are null, a measured zero stays zero [ingest#2, features#3]."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
import hustle_coverage as hc  # noqa: E402

CACHE = ROOT / "pipeline" / "cache"

FULL = {
    "screen_ast": 1.0,
    "deflections": 2.0,
    "loose_balls": 0.5,
    "charges": 0.0,
    "box_outs": 3.0,
    "contested_shots": 4.0,
    "d_fg_pct": 0.0,
    "post_freq": 0.0,
}


def test_partial_season_keeps_measured_values_and_drops_ambiguous_zeros():
    # 2015-16 was covered only in part: a non-zero value came from the endpoint, a 0.0 may be a skipped player.
    rec = hc.apply_season_rules("2015-16", FULL)
    assert rec["screen_ast"] == 1.0 and rec["deflections"] == 2.0 and rec["contested_shots"] == 4.0
    assert rec["charges"] is None  # 0.0 in a partial season: cannot tell measured zero from absent
    assert rec["box_outs"] is None  # not tracked before 2017-18 at all
    assert rec["post_freq"] == 0.0  # synergy is not this module's to judge


def test_committed_2015_16_cache_keeps_its_386_measured_hustle_values():
    doc = json.loads((CACHE / "wide_skills_2015-16.json").read_text(encoding="utf-8"))
    values = [r[f] for r in doc["players"].values() for f in hc.HUSTLE_FIELDS if r.get(f) is not None]
    assert len(values) == 386 and all(v != 0.0 for v in values)
    assert doc["field_coverage"]["contested_shots"] == 143 and doc["field_coverage"]["box_outs"] == 0


def test_season_rules():
    assert hc.untracked_fields("2014-15") == hc.HUSTLE_FIELDS
    assert hc.untracked_fields("2015-16") == ("box_outs",)
    assert hc.untracked_fields("2016-17") == ("box_outs",)
    assert hc.untracked_fields("2017-18") == ()
    rec = hc.apply_season_rules("2016-17", FULL)
    assert rec["box_outs"] is None and rec["d_fg_pct"] is None
    assert rec["charges"] == 0.0  # charges drawn: 0 for ~40-60% of players, a real measurement
    assert rec["post_freq"] == 0.0  # synergy is not this module's to judge


def test_absent_row_is_every_tracked_field_zero():
    zeros = dict(FULL, screen_ast=0.0, deflections=0.0, loose_balls=0.0, contested_shots=0.0)
    # 2016-17 does not track box-outs, so its 3.0 here would be ignored, but 2018-19 does.
    assert hc.is_absent_row("2016-17", dict(zeros, box_outs=None))
    assert not hc.is_absent_row("2018-19", zeros)
    assert hc.is_absent_row("2018-19", dict(zeros, box_outs=0.0))
    out = hc.honest_record("2018-19", dict(zeros, box_outs=0.0), legacy=True)
    assert all(out[f] is None for f in hc.HUSTLE_FIELDS)
    # A doc that already records field_coverage is trusted: an all-zero row there was fetched as such.
    assert hc.honest_record("2018-19", dict(zeros, box_outs=0.0), legacy=False)["charges"] == 0.0


def test_honest_players_is_idempotent():
    doc = {"season": "2016-17", "players": {"a": dict(FULL), "b": {f: 0.0 for f in FULL}}}
    once = hc.honest_players(doc)
    twice = hc.honest_players({"season": "2016-17", "players": once})
    assert once == twice
    assert all(once["b"][f] is None for f in hc.HUSTLE_FIELDS)


def test_repair_doc_counts_and_coverage():
    doc = {"season": "2017-18", "complete": True, "players": {"a": dict(FULL), "b": {f: 0.0 for f in FULL}}}
    out, counts = hc.repair_doc(doc)
    assert counts["absent_rows"] == 1 and counts["box_outs"] == 1 and counts["d_fg_pct"] == 2
    assert out["field_coverage"]["box_outs"] == 1 and out["field_coverage"]["d_fg_pct"] == 0
    assert "post_freq" not in out["field_coverage"]  # synergy zeros were not repaired, so not counted
    assert list(out)[-1] == "players"


def test_committed_caches_carry_no_unmeasured_zeros():
    paths = sorted(CACHE.glob("wide_skills_*.json"))
    assert len(paths) >= 11
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        season = doc["season"]
        assert "field_coverage" in doc, f"{path.name} was not repaired"
        for rec in doc["players"].values():
            assert rec.get("d_fg_pct") is None
            for f in hc.untracked_fields(season):
                assert rec.get(f) is None, f"{path.name}: {f} carries a value in a season that did not track it"
            assert not hc.is_absent_row(season, rec), f"{path.name}: an all-zero hustle row survived"


def test_join_skill_npz_reads_an_optional_per_skill_mask(tmp_path):
    pytest.importorskip("torch")
    import train_mtnn

    names, seasons = np.array(["A", "B", "C"]), np.array(["2016-17"] * 3)
    grades = np.array([[0.5, 0.7], [0.2, 0.0]], dtype=np.float32)
    old = tmp_path / "old.npz"
    np.savez_compressed(old, name=names[:2], season=seasons[:2], keys=np.array(["motor", "post"]), grades=grades)
    G, M, keys = train_mtnn._join_skill_npz(old, names, seasons)
    assert keys == ["motor", "post"] and M.tolist() == [[1, 1], [1, 1], [0, 0]]  # unchanged without a mask
    new = tmp_path / "new.npz"
    mask = np.array([[1, 1], [1, 0]], dtype=np.float32)
    np.savez_compressed(
        new, name=names[:2], season=seasons[:2], keys=np.array(["motor", "post"]), grades=grades, mask=mask
    )
    G2, M2, _ = train_mtnn._join_skill_npz(new, names, seasons)
    assert M2.tolist() == [[1, 1], [1, 0], [0, 0]] and np.array_equal(G, G2)
