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


# --- Basketball-Reference fetchers -------------------------------------------------------


def test_bbref_advanced_offline_gate_can_fail_now(tmp_path, monkeypatch):
    import fetch_bbref_advanced as fba

    monkeypatch.setattr(fba, "CACHE", tmp_path)
    # Before: 30 "no cache" lines and exit 0, so CI's gate could not fail.
    assert run(fba.main, ["fetch_bbref_advanced.py", "--offline"], monkeypatch) == 2
    rows = {f"p{i}": {"per": 15.0} for i in range(fba.MIN_ROWS)}
    (tmp_path / "bbref_advanced_2003-04.json").write_text(json.dumps(rows), encoding="utf-8")
    assert run(fba.main, ["fetch_bbref_advanced.py", "--offline", "--season", "2003-04"], monkeypatch) == 0
    short = dict(list(rows.items())[:50])
    (tmp_path / "bbref_advanced_2003-04.json").write_text(json.dumps(short), encoding="utf-8")
    assert run(fba.main, ["fetch_bbref_advanced.py", "--offline", "--season", "2003-04"], monkeypatch) == 2


def test_bbref_advanced_online_parse_is_a_failure_not_an_empty_success(tmp_path, monkeypatch):
    import fetch_bbref_advanced as fba

    monkeypatch.setattr(fba, "CACHE", tmp_path)
    monkeypatch.setattr(fba, "retry_call", lambda fn, label: '<table id="advanced_stats"></table>')
    assert run(fba.main, ["fetch_bbref_advanced.py", "--season", "2003-04"], monkeypatch) == 2
    assert not list(tmp_path.glob("bbref_advanced_*.json"))


def test_honors_all_star_fallback(monkeypatch):
    import fetch_honors as fh
    import nba_http

    def missing(url):
        raise ingest.FetchError("404") from nba_http.HTTPStatusError(404, url)

    def broken(url):
        raise ingest.FetchError("500 x5") from nba_http.HTTPStatusError(500, url)

    monkeypatch.setattr(fh, "fetch_html", missing)
    assert fh.parse_all_stars("<html></html>", 1999) == set()  # no All-Star Game that year
    monkeypatch.setattr(fh, "fetch_html", broken)
    # Before: `except Exception: pass`, i.e. asg=0 for every player in a complete cache.
    with pytest.raises(ingest.FetchError):
        fh.parse_all_stars("<html></html>", 2010)


def test_honors_partial_run(tmp_path, monkeypatch):
    import fetch_honors as fh

    monkeypatch.setattr(fh, "CACHE", tmp_path)
    monkeypatch.setattr(fh, "AWARD_YEARS", [2098, 2099])
    monkeypatch.setattr(fh.time, "sleep", lambda s: None)

    def build(year):
        if year == 2098:
            raise ingest.FetchError("HTTP 429 x5")
        return {
            "source": "fake",
            "season": "2098-99",
            "players": {"a": {}},
            "vote_getters": 1,
            "all_nba_selected": 0,
            "all_stars": 0,
        }

    monkeypatch.setattr(fh, "build_year_cache", build)
    assert run(fh.main, ["fetch_honors.py"], monkeypatch) == 2  # before: printed FAILED, exit 0
    assert sorted(p.name for p in tmp_path.glob("honors_award_*.json")) == ["honors_award_2099.json"]


def test_positions_short_parse_fails_and_is_not_cached(tmp_path, monkeypatch):
    import fetch_positions as fpos

    cache = tmp_path / "positions_bbref.json"
    monkeypatch.setattr(fpos, "CACHE", cache)
    monkeypatch.setattr(fpos.time, "sleep", lambda s: None)
    vectors = tmp_path / "assets" / "vectors.json"
    vectors.parent.mkdir()
    vectors.write_text(json.dumps({"seasons": ["2002-03", "2003-04"]}), encoding="utf-8")
    monkeypatch.setattr(fpos, "ROOT", tmp_path / "pipeline")
    monkeypatch.setattr(fpos, "fetch_season", lambda s: {f"p{i}": "G" for i in range(60 if s == "2002-03" else 3)})
    assert run(fpos.main, ["fetch_positions.py"], monkeypatch) == 2
    assert list(json.loads(cache.read_text(encoding="utf-8"))) == ["2002-03"]


class FakeRequests:
    """Just enough of `requests` for fetch_salary_history / fetch_salaries."""

    class RequestException(Exception):  # noqa: N818 -- the name fetch_salary_history catches
        pass

    def __init__(self, status=200, text=""):
        self.status, self.text = status, text

    def get(self, url, headers=None, timeout=None):
        outer = self

        class R:
            status_code = outer.status
            text = outer.text
            encoding = None

            def raise_for_status(self):
                if outer.status >= 400:
                    raise RuntimeError(f"HTTP {outer.status}")

        return R()


def test_salary_history_empty_page_is_not_cached(tmp_path, monkeypatch):
    import fetch_salary_history as fsh

    monkeypatch.setattr(fsh, "SAL_DIR", tmp_path)
    monkeypatch.setitem(sys.modules, "requests", FakeRequests(200, "<html>no salaries2 table</html>"))
    with pytest.raises(ingest.EmptyPayloadError):
        fsh.fetch_team_season("ATL", 2020, delay=0)  # before: wrote [] and served it ever after
    assert not (tmp_path / "2020" / "ATL.json").exists()
    monkeypatch.setitem(sys.modules, "requests", FakeRequests(403))
    with pytest.raises(ingest.BlockedError):
        fsh.fetch_team_season("ATL", 2020, delay=0)


def test_salary_history_csv_append_keeps_the_append_mode_bytes(tmp_path, monkeypatch):
    import fetch_salary_history as fsh

    csv_path = tmp_path / "salaries_history.csv"
    old = b"name,season,salary,team,cap_pct\r\nA B,2017-18,1000000,ATL,\r\n"
    csv_path.write_bytes(old)
    monkeypatch.setattr(fsh, "CSV_PATH", csv_path)
    new = {("C D", "2019-20"): {"name": "C D", "season": "2019-20", "salary": 2500000.0, "team": "BOS"}}
    monkeypatch.setattr(fsh, "collect", lambda years: new)
    fsh.write_csv([2020])
    assert csv_path.read_bytes() == old + b"C D,2019-20,2500000,BOS,\r\n"
    assert (tmp_path / "salaries_history.csv.bak").read_bytes() == old


def test_salaries_empty_parse_keeps_the_cache(tmp_path, monkeypatch):
    import fetch_salaries as fs

    cache = tmp_path / "salary_bbref_current.json"
    cache.write_text('{"a|2025-26": 1.0}', encoding="utf-8")
    monkeypatch.setattr(fs, "BBREF_CACHE", cache)
    monkeypatch.setattr(fs, "ROOT", tmp_path)
    monkeypatch.setitem(sys.modules, "requests", FakeRequests(200, "<html>layout changed</html>"))
    assert run(fs.main, ["fetch_salaries.py", "--fetch-bbref"], monkeypatch) == 2
    assert cache.read_text(encoding="utf-8") == '{"a|2025-26": 1.0}'
