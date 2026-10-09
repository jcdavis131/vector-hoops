"""The fetch_* scripts: a failed season exits 2 after the rest are tried, and writes nothing.

Every test points the script's cache at tmp_path and replaces the network
call with a fake, so nothing touches pipeline/cache, pipeline/data or a
server. Season labels from 2097-98 on are never final, so they behave like a
season still being played; 2003-04 and earlier are final.

Run:  python -m pytest tests/test_fetchers.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import ingest  # noqa: E402

LIVE = ["2097-98", "2098-99", "2099-00"]


def run(main, argv, monkeypatch) -> int:
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as ei:
        ingest.run_fetch(main, name="t")
    return ei.value.code


# --- fetch_playoffs ------------------------------------------------------------


@pytest.fixture
def fp(tmp_path, monkeypatch):
    import fetch_playoffs

    monkeypatch.setattr(fetch_playoffs, "CACHE", tmp_path)
    return fetch_playoffs


def playoff_doc(season, n=3):
    return {
        "built": "x",
        "source": "fake",
        "complete": True,
        "season": season,
        "players": {f"p{i}": {} for i in range(n)},
        "teams": {"1": {}},
    }


def test_playoffs_partial_run_exits_2_and_keeps_the_old_cache(fp, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(fp, "SEASONS", LIVE)
    old = tmp_path / "playoffs_2098-99.json"
    old.write_text('{"players": {"keep": {}}}', encoding="utf-8")
    attempted = []

    def build(season):
        attempted.append(season)
        if season == "2098-99":
            raise ingest.FetchError("HTTP 500 after 5 attempts")
        return playoff_doc(season)

    monkeypatch.setattr(fp, "build_season_cache", build)
    assert run(fp.main, ["fetch_playoffs.py"], monkeypatch) == 2
    assert attempted == LIVE, "the season after the failure is still fetched"
    assert old.read_text(encoding="utf-8") == '{"players": {"keep": {}}}'
    assert (tmp_path / "playoffs_2097-98.json").exists() and (tmp_path / "playoffs_2099-00.json").exists()
    assert "1 failed (2098-99)" in capsys.readouterr().err


def test_playoffs_empty_split(fp, tmp_path, monkeypatch):
    monkeypatch.setattr(fp, "fetch_player_split", lambda season, st: {})
    # Before: {"complete": true, "players": {}} for any season, cached for good.
    with pytest.raises(ingest.EmptyPayloadError):
        fp.build_season_cache("2003-04")
    assert fp.build_season_cache("2099-00") is None  # playoffs not started: nothing to cache
    monkeypatch.setattr(fp, "SEASONS", ["2099-00"])
    assert run(fp.main, ["fetch_playoffs.py"], monkeypatch) == 0
    assert not list(tmp_path.glob("playoffs_*.json"))


def test_playoffs_final_season_cache_is_kept(fp, tmp_path, monkeypatch):
    (tmp_path / "playoffs_2003-04.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(fp, "SEASONS", ["2003-04"])
    monkeypatch.setattr(fp, "build_season_cache", lambda s: pytest.fail("a final season is not refetched"))
    assert run(fp.main, ["fetch_playoffs.py"], monkeypatch) == 0


def test_playoffs_offline_reports_missing_caches(fp, tmp_path, monkeypatch):
    monkeypatch.setattr(fp, "SEASONS", ["2002-03", "2003-04"])
    (tmp_path / "playoffs_2002-03.json").write_text("{}", encoding="utf-8")
    assert run(fp.main, ["fetch_playoffs.py", "--offline"], monkeypatch) == 2
    (tmp_path / "playoffs_2003-04.json").write_text("{}", encoding="utf-8")
    assert run(fp.main, ["fetch_playoffs.py", "--offline"], monkeypatch) == 0


def test_playoffs_required_columns(fp, monkeypatch):
    payload = {"resultSets": [{"name": "LeagueDashPlayerStats", "headers": ["PLAYER_ID", "TS_PCT"], "rowSet": []}]}
    monkeypatch.setattr(fp, "fetch_stats_json", lambda endpoint, params: payload)
    with pytest.raises(ingest.MissingColumnsError, match="USG_PCT"):
        fp.dash_player_rows("2003-04", "Playoffs", "Advanced")


# --- fetch_playoff_gamelogs -----------------------------------------------------


def test_playoff_gamelogs_partial_run(tmp_path, monkeypatch):
    import fetch_playoff_gamelogs as fpg

    monkeypatch.setattr(fpg, "CACHE", tmp_path)
    monkeypatch.setattr(fpg, "SEASONS", LIVE)

    def build(season):
        if season == "2097-98":
            raise ingest.BlockedError("HTTP 403 on 2 attempts")
        return {"source": "fake", "teamGames": [{}], "playerGames": [], "seriesByTeam": {}}

    monkeypatch.setattr(fpg, "build_season_cache", build)
    assert run(fpg.main, ["fetch_playoff_gamelogs.py"], monkeypatch) == 2
    assert sorted(p.name for p in tmp_path.glob("playoff_games_*.json")) == [
        "playoff_games_2098-99.json",
        "playoff_games_2099-00.json",
    ]


# --- fetch_wide_skills ------------------------------------------------------------


def test_wide_skills_required_columns(monkeypatch):
    import fetch_wide_skills as fws

    monkeypatch.setattr(fws.time, "sleep", lambda s: None)
    headers = ["PLAYER_NAME", "SCREEN_ASSISTS", "LOOSE_BALLS_RECOVERED", "CHARGES_DRAWN", "CONTESTED_SHOTS"]

    def fake(endpoint, params, timeout=None):
        return {"resultSets": [{"name": "HustleStatsPlayer", "headers": headers, "rowSet": []}]}

    monkeypatch.setattr(fws, "fetch_stats_json", fake)
    with pytest.raises(ingest.MissingColumnsError, match="DEFLECTIONS"):
        fws.fetch_hustle("2016-17")  # before: deflections 0.0 for every player, complete: true
    headers.append("DEFLECTIONS")
    assert fws.fetch_hustle("2016-17") == {}  # BOX_OUTS is not required before 2017-18
    with pytest.raises(ingest.MissingColumnsError, match="BOX_OUTS"):
        fws.fetch_hustle("2018-19")


def test_wide_skills_live_season_with_no_rows_is_skipped(tmp_path, monkeypatch, capsys):
    import fetch_wide_skills as fws

    monkeypatch.setattr(fws, "CACHE", tmp_path)
    monkeypatch.setattr(fws, "SEASONS", ["2003-04", "2099-00"])
    monkeypatch.setattr(fws, "_require_curl_cffi", lambda: None)
    monkeypatch.setattr(fws, "build_season_cache", lambda s, skip_tracking: {"source": "fake", "players": {}})
    # 2099-00 (live, nothing yet) is a skip; 2003-04 (final, empty) is a failure.
    assert run(fws.main, ["fetch_wide_skills.py"], monkeypatch) == 2
    assert "1 failed (2003-04)" in capsys.readouterr().err
    assert not list(tmp_path.glob("wide_skills_*.json"))


# --- fetch_team_season ------------------------------------------------------------


def test_team_season_partial_run_still_writes_the_good_seasons(tmp_path, monkeypatch):
    import fetch_team_season as fts

    monkeypatch.setattr(fts, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(fts, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(fts, "SEASONS", ["2001-02", "2002-03"])

    def fetch_measure(season, measure, wanted, offline):
        if season == "2002-03":
            raise ingest.FetchError("HTTP 500 after 5 attempts")
        return [{"TEAM_ID": 1, "TEAM_NAME": "A", "W": 50.0, "L": 32.0, "W_PCT": 0.61, "PACE": 90.0}]

    monkeypatch.setattr(fts, "fetch_measure", fetch_measure)
    assert run(fts.main, ["fetch_team_season.py"], monkeypatch) == 2  # before: 0, one season was enough
    assert (tmp_path / "data" / "team_season_2001-02.json").exists()
    assert not (tmp_path / "data" / "team_season_2002-03.json").exists()
    manifest = json.loads((tmp_path / "data" / "team_season_manifest.json").read_text(encoding="utf-8"))
    assert manifest["seasons_missing"] == ["2002-03"]


def test_team_season_corrupt_cache_raises(tmp_path, monkeypatch):
    import fetch_team_season as fts

    monkeypatch.setattr(fts, "CACHE", tmp_path)
    (tmp_path / "team_base_2001-02.json").write_text("[{", encoding="utf-8")
    with pytest.raises(ValueError, match="team_base_2001-02"):
        fts.load_cached("team_base", "2001-02")  # before: None, i.e. "missing"


# --- fetch_gamelogs ------------------------------------------------------------------


class FakeFrame:
    def __init__(self, rows):
        self.rows = rows
        self.columns = list(rows[0])

    def __getitem__(self, cols):
        return FakeFrame([{c: r[c] for c in cols} for r in self.rows])

    def iterrows(self):
        yield from enumerate(self.rows)

    def __len__(self):
        return len(self.rows)


def test_gamelogs_jsonl_encoding_is_unchanged():
    import fetch_gamelogs as fg

    row = dict.fromkeys(fg.KEEP, 0)
    row.update({"PLAYER_NAME": "A", "GAME_DATE": "2024-01-01", "MIN": 31.5, "PTS": 22.0, "PLUS_MINUS": math.nan})
    line = fg.to_jsonl(FakeFrame([row]))
    rec = json.loads(line)
    assert line.endswith("\n") and rec["PTS"] == 22 and isinstance(rec["PTS"], int)
    assert rec["MIN"] == 31.5 and rec["PLUS_MINUS"] is None and rec["PLAYER_NAME"] == "A"
    assert list(rec) == fg.KEEP


def test_gamelogs_failure_exits_2_and_writes_nothing(tmp_path, monkeypatch):
    import fetch_gamelogs as fg

    monkeypatch.setattr(fg, "OUT", tmp_path)
    monkeypatch.setattr(fg, "SEASONS", ["2099-00"])
    monkeypatch.setattr(fg, "fetch", lambda s: (_ for _ in ()).throw(ingest.FetchError("reset x3")))
    assert run(fg.main, ["fetch_gamelogs.py"], monkeypatch) == 2  # before: -1 rows, exit 0
    assert not list(tmp_path.glob("gamelogs_*"))


# --- fetch_draft_history -------------------------------------------------------------


def test_draft_history_offline_without_cache_exits_2(tmp_path, monkeypatch):
    import fetch_draft_history as fdh

    monkeypatch.setattr(fdh, "OUT", tmp_path / "draft_history.json")
    assert run(fdh.main, ["fetch_draft_history.py", "--offline"], monkeypatch) == 2


def test_draft_history_empty_table_is_not_cached(tmp_path, monkeypatch):
    import fetch_draft_history as fdh

    out = tmp_path / "draft_history.json"
    out.write_text('{"players": {"keep": []}}', encoding="utf-8")
    monkeypatch.setattr(fdh, "OUT", out)
    monkeypatch.setattr(fdh, "fetch_all_drafts", lambda: [])
    assert run(fdh.main, ["fetch_draft_history.py"], monkeypatch) == 2
    assert out.read_text(encoding="utf-8") == '{"players": {"keep": []}}'
