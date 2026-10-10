"""Left-censoring at the first cached season [features#4].

The caches start with 1996-97, so a career that began earlier is counted
from 1996-97: Gary Payton's 1996-97 row carried YEAR_IN_LEAGUE 1,
CAREER_EXP_YEARS 1.0 and CAREER_ACTIVE_FRAC 1.0 with mask 1 in his seventh
season. career_window decides which careers are seen from their start.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from career_window import career_fully_observed, draft_years_by_pid, first_seasons_by_pid  # noqa: E402


def test_drafted_from_1996_on_is_observed_earlier_is_not():
    drafts = {977: 1996, 56: 1990}  # Kobe Bryant, Gary Payton
    first = {977: "1996-97", 56: "1996-97"}
    assert career_fully_observed(977, drafts, first)
    assert not career_fully_observed(56, drafts, first)


def test_a_pre_1996_draftee_stays_censored_when_first_seen_later():
    # Drafted 1994, first visible 1998-99: a 1995-96 season cannot be ruled out.
    assert not career_fully_observed(1, {1: 1994}, {1: "1998-99"})


def test_undrafted_is_observed_only_when_first_seen_after_1996_97():
    first = {10: "1996-97", 11: "1997-98"}
    assert not career_fully_observed(10, {}, first)  # may have played before
    assert career_fully_observed(11, {}, first)
    assert not career_fully_observed(12, {}, first)  # never in a dashbase cache
    assert not career_fully_observed(None, {}, first)


def test_helpers_read_the_caches(tmp_path):
    (tmp_path / "dashbase_1997-98.json").write_text(json.dumps([{"PLAYER_ID": 5}, {"PLAYER_ID": 6}]), encoding="utf-8")
    (tmp_path / "dashbase_1996-97.json").write_text(json.dumps([{"PLAYER_ID": 5}]), encoding="utf-8")
    assert first_seasons_by_pid(tmp_path) == {5: "1996-97", 6: "1997-98"}
    draft = {"players": {"a b": [{"person_id": 5, "year": 1999}, {"person_id": 5, "year": 1995}], "c": [{"year": 1}]}}
    (tmp_path / "draft.json").write_text(json.dumps(draft), encoding="utf-8")
    assert draft_years_by_pid(tmp_path / "draft.json") == {5: 1995}  # earliest draft; no id, no entry
    assert draft_years_by_pid(tmp_path / "missing.json") == {}
