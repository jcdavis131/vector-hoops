"""pipeline/real_caches.py: a fixture, or a byte copy of one, never counts as the real input.

Run:  python -m pytest tests/test_real_caches.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import real_caches as rc  # noqa: E402


def test_wide_skills_refuses_proxy_docs(tmp_path, monkeypatch):
    monkeypatch.setattr(rc, "CACHE", tmp_path)
    (tmp_path / "wide_skills.example.json").write_text('{"players": {}}', encoding="utf-8")
    assert "fetch_wide_skills.py" in rc.wide_skills(), "the example fixture is not a season cache"

    (tmp_path / "wide_skills_2015-16.json").write_text(json.dumps({"complete": True, "players": {}}), encoding="utf-8")
    assert rc.wide_skills() is None

    (tmp_path / "wide_skills_2013-14.json").write_text(json.dumps({"proxy": True, "players": {}}), encoding="utf-8")
    msg = rc.wide_skills()
    assert msg and "wide_skills_2013-14.json" in msg and "proxy" in msg


def test_game_ratings_byte_copy_of_the_fixture_is_not_real(tmp_path, monkeypatch):
    monkeypatch.setattr(rc, "CACHE", tmp_path)
    fixture = b'{"complete": false, "source": "fixture", "players": []}'
    (tmp_path / "game_ratings.example.json").write_bytes(fixture)
    assert rc.game_ratings() is not None

    # What `fetch_2k_ratings.py --offline` does: shutil.copy of the fixture.
    (tmp_path / "game_ratings_2k25.json").write_bytes(fixture)
    assert rc.game_ratings() is not None

    (tmp_path / "game_ratings_2k26.json").write_bytes(b'{"complete": true, "players": [{"norm_name": "x"}]}')
    assert rc.game_ratings() is None


def test_season_patterns_skip_examples_and_manifests(tmp_path, monkeypatch):
    monkeypatch.setattr(rc, "CACHE", tmp_path)
    monkeypatch.setattr(rc, "DATA", tmp_path)
    for name in ("playoffs.example.json", "honors.example.json", "team_season_manifest.json"):
        (tmp_path / name).write_text("{}", encoding="utf-8")
    assert rc.playoffs() and rc.honors() and rc.team_season() and rc.gamelogs() and rc.draft_history()
    for name in (
        "playoffs_1996-97.json",
        "honors_award_1997.json",
        "team_season_1996-97.json",
        "gamelogs_2015-16.jsonl",
        "draft_history.json",
    ):
        (tmp_path / name).write_text("{}", encoding="utf-8")
    assert [rc.playoffs(), rc.honors(), rc.team_season(), rc.gamelogs(), rc.draft_history()] == [None] * 5


def test_all_of_reports_every_missing_part(tmp_path, monkeypatch):
    monkeypatch.setattr(rc, "CACHE", tmp_path)
    monkeypatch.setattr(rc, "DATA", tmp_path)
    msg = rc.all_of(rc.gamelogs, rc.team_season)()
    assert "gamelogs" in msg and "team_season" in msg
