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


@pytest.mark.parametrize(("season", "box_outs"), [("2016-17", None), ("2018-19", 2.5)])
def test_wide_skills_absent_is_null_not_zero(monkeypatch, season, box_outs):
    import fetch_wide_skills as fws

    hustle = {
        "a": {
            "SCREEN_ASSISTS": 1.0,
            "DEFLECTIONS": 2.0,
            "LOOSE_BALLS_RECOVERED": 0.5,
            "CHARGES_DRAWN": 0.0,
            "CONTESTED_SHOTS": 4.0,
            "BOX_OUTS": 2.5,
        }
    }
    calls = []

    def ptstats(season, measure):
        calls.append(measure)
        return {"a": {"PULL_UP_FG3A": 1.2}, "b": {"PULL_UP_FG3A": 0.4}}

    monkeypatch.setattr(fws, "fetch_ptstats", ptstats)
    monkeypatch.setattr(
        fws, "fetch_synergy", lambda s, t: {"a": {"POSS_PCT": 0.1, "PPP": 0.9}} if t == "Postup" else {}
    )
    monkeypatch.setattr(fws, "fetch_hustle", lambda s: hustle)
    doc = fws.build_season_cache(season)
    a, b = doc["players"]["a"], doc["players"]["b"]
    # Before: b (absent from synergy and hustle) got 0.0 for all ten, and d_fg_pct was 0.0 for everyone.
    assert a["charges"] == 0.0  # a measured zero stays a zero
    assert a["box_outs"] == box_outs  # box_outs is not tracked before 2017-18
    assert a["post_freq"] == pytest.approx(10.0) and a["trans_freq"] is None and a["d_fg_pct"] is None
    assert all(b[k] is None for k in b if k != "pull_up_fg3a") and b["pull_up_fg3a"] == 0.4
    assert calls == ["PullUpShot"]  # no Defense call: it never returned D_FG_PCT
    assert doc["field_coverage"]["deflections"] == 1 and doc["field_coverage"]["d_fg_pct"] == 0
    assert "d_fg_pct" in doc["untracked_fields"]


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


# --- fetch_advanced_tracking -----------------------------------------------------------


@pytest.fixture
def fat(tmp_path, monkeypatch):
    import fetch_advanced_tracking

    monkeypatch.setattr(fetch_advanced_tracking, "CACHE", tmp_path)
    monkeypatch.setattr(fetch_advanced_tracking, "SEASONS", ["2097-98", "2098-99"])
    monkeypatch.setattr(fetch_advanced_tracking.time, "sleep", lambda s: None)
    # Both write outside the repo (bundles/ mission log, ~/.cache marker).
    monkeypatch.setattr(fetch_advanced_tracking, "_log_timeline", lambda *a, **k: None)
    monkeypatch.setattr(fetch_advanced_tracking, "_create_gpu_handoff_marker", lambda *a, **k: None)
    return fetch_advanced_tracking


def payload(headers, row):
    return {"resultSets": [{"name": "X", "headers": headers, "rowSet": [row]}]}


def test_advanced_tracking_writes_its_own_files_not_tracking_json(fat, tmp_path, monkeypatch):
    def fake(endpoint, params, timeout=None):
        if endpoint == fat.HUSTLE_ENDPOINT:
            return payload(["PLAYER_ID", "PLAYER_NAME", "DEFLECTIONS"], [1, "A", 2.0])
        return payload(["PLAYER_ID", "PLAYER_NAME", "GP", "DRIVES"], [1, "A", 70, 5.0])

    monkeypatch.setattr(fat, "fetch_stats_json", fake)
    assert run(fat.main, ["fetch_advanced_tracking.py"], monkeypatch) == 0
    assert sorted(p.name for p in tmp_path.glob("advanced_tracking_*.json")) == [
        "advanced_tracking_2097-98.json",
        "advanced_tracking_2098-99.json",
    ]
    assert not list(tmp_path.glob("tracking_*-*.json")), "tracking_<season>.json is build_vectors' input"
    rec = json.loads((tmp_path / "advanced_tracking_2097-98.json").read_text(encoding="utf-8"))["1"]
    assert rec["deflections"] == 2.0 and rec["drives"] == 5.0


def test_advanced_tracking_http_error_is_a_failure_not_zero_rows(fat, tmp_path, monkeypatch):
    def fake(endpoint, params, timeout=None):
        if params.get("Season") == "2098-99":
            raise ingest.BlockedError("HTTP 403 on 2 attempts")
        raise ingest.FetchError("HTTP 500 after 5 attempts")

    monkeypatch.setattr(fat, "fetch_stats_json", fake)
    # Before: HTTP 500 -> {} (a zero-row success), 403 -> None, and exit 0 either way.
    assert run(fat.main, ["fetch_advanced_tracking.py"], monkeypatch) == 2
    assert not list(tmp_path.glob("advanced_tracking_*.json"))
    summary = json.loads((tmp_path / "tracking_summary.json").read_text(encoding="utf-8"))
    assert summary["blocked_seasons"] == ["2098-99"]


# --- fetch_combine [health#5] -------------------------------------------------------------


def _combine_payload(rows: list[list]) -> dict:
    import fetch_combine as fc

    return {"resultSets": [{"name": "DraftCombineStats", "headers": fc.REQUIRED, "rowSet": rows}]}


@pytest.fixture
def fc(tmp_path, monkeypatch):
    import fetch_combine

    monkeypatch.setattr(fetch_combine, "CACHE", tmp_path)
    monkeypatch.setattr(fetch_combine, "OUT", tmp_path / "combine_measurements.json")
    monkeypatch.setattr(fetch_combine.time, "sleep", lambda s: None)
    return fetch_combine


def test_combine_keeps_measured_values_only(fc, tmp_path, monkeypatch):
    n = len(fc.FIELDS)
    measured = [1630000, "A Measured", 77.5, 78.75, 205.0, 83.25] + [None] * (n - 4)
    skipped_all = [1630001, "B Nothing"] + [None] * n
    calls = []

    def fake(endpoint, params, timeout=None):
        calls.append(params["SeasonYear"])
        return _combine_payload([measured, skipped_all]) if params["SeasonYear"] == "2019-20" else _combine_payload([])

    monkeypatch.setattr(fc, "fetch_stats_json", fake)
    # Before: every bio name got hash()-jittered wingspan/vertical/agility and a 78 in default height.
    assert run(fc.main, ["fetch_combine.py", "--first-year", "2019"], monkeypatch) == 2  # 2020+ came back empty
    doc = json.loads((tmp_path / "combine_measurements.json").read_text(encoding="utf-8"))
    assert doc["years"] == [2019] and calls[0] == "2019-20"
    a, b = doc["players"]["1630000"], doc["players"]["1630001"]
    assert a == {
        "name": "A Measured",
        "combine_year": 2019,
        "height_wo_shoes_in": 77.5,
        "height_w_shoes_in": 78.75,
        "weight_lbs": 205.0,
        "wingspan_in": 83.25,
    }
    assert b == {"name": "B Nothing", "combine_year": 2019}  # no field it did not measure


def test_combine_missing_column_fails_instead_of_reading_nulls(fc, monkeypatch):
    def fake(endpoint, params, timeout=None):
        payload = _combine_payload([])
        payload["resultSets"][0]["headers"] = [h for h in payload["resultSets"][0]["headers"] if h != "WINGSPAN"]
        return payload

    monkeypatch.setattr(fc, "fetch_stats_json", fake)
    assert run(fc.main, ["fetch_combine.py", "--first-year", "2025"], monkeypatch) == 2
    assert not fc.OUT.exists()


def test_combine_offline_without_a_cache_exits_2(fc, monkeypatch):
    assert run(fc.main, ["fetch_combine.py", "--offline"], monkeypatch) == 2


# --- operator scripts ----------------------------------------------------------------------


def test_2k_ratings_missing_fixture_writes_no_placeholder(tmp_path, monkeypatch):
    import fetch_2k_ratings as f2k

    monkeypatch.setattr(f2k, "CACHE", tmp_path)
    monkeypatch.setattr(f2k, "FIXTURE", tmp_path / "game_ratings.example.json")
    # Before: '{"players": {}}' written as game_ratings_2k25.json, exit 0.
    assert run(f2k.main, ["fetch_2k_ratings.py", "--offline"], monkeypatch) == 2
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("argv", [["--offline"], []])
def test_2k_ratings_never_copies_the_fixture_into_a_release_cache(tmp_path, monkeypatch, argv):
    import fetch_2k_ratings as f2k

    fixture = tmp_path / "game_ratings.example.json"
    fixture.write_text('{"complete": false, "players": [{"norm_name": "x"}]}', encoding="utf-8")
    monkeypatch.setattr(f2k, "CACHE", tmp_path)
    monkeypatch.setattr(f2k, "FIXTURE", fixture)
    # Before: `if args.offline or True:` copied the fixture to
    # game_ratings_2k25.json and exited 0, with or without --offline [ingest#5].
    assert run(f2k.main, ["fetch_2k_ratings.py", *argv], monkeypatch) == 2
    assert sorted(p.name for p in tmp_path.iterdir()) == ["game_ratings.example.json"]


def test_2k_ratings_offline_reports_a_byte_copy_of_the_fixture_as_not_real(tmp_path, monkeypatch):
    import fetch_2k_ratings as f2k

    fixture = tmp_path / "game_ratings.example.json"
    fixture.write_text('{"complete": false, "players": []}', encoding="utf-8")
    (tmp_path / "game_ratings_2k25.json").write_bytes(fixture.read_bytes())
    monkeypatch.setattr(f2k, "CACHE", tmp_path)
    monkeypatch.setattr(f2k, "FIXTURE", fixture)
    assert run(f2k.main, ["fetch_2k_ratings.py", "--offline"], monkeypatch) == 2
    (tmp_path / "game_ratings_2k25.json").write_text('{"complete": true, "players": []}', encoding="utf-8")
    assert run(f2k.main, ["fetch_2k_ratings.py", "--offline"], monkeypatch) == 0


def test_hf_datasets_failed_inspect_exits_2(monkeypatch):
    import fetch_hf_datasets as fhf

    def boom(name):
        raise OSError("hf://datasets unreachable")

    monkeypatch.setattr(fhf, "inspect", boom)
    assert run(fhf.main, ["fetch_hf_datasets.py", "--inspect", "all"], monkeypatch) == 2  # before: ERR lines, 0


def test_preseason_odds_failures(tmp_path, monkeypatch):
    import fetch_preseason_odds as fpo

    monkeypatch.setattr(fpo, "CACHE", tmp_path / "preseason_odds_raw.json")
    monkeypatch.setattr(fpo, "DEST", tmp_path / "preseason_win_totals.json")
    monkeypatch.setattr(fpo, "season_range", lambda first: ["2003-04"])
    monkeypatch.setattr(fpo.time, "sleep", lambda s: None)
    monkeypatch.setattr(fpo, "fetch_season", lambda end_year: {"BOS": 50.5})
    # A short parse is a failure now, not a printed SUSPICIOUS and exit 0.
    assert run(fpo.main, ["fetch_preseason_odds.py"], monkeypatch) == 2
    assert not (tmp_path / "preseason_win_totals.json").exists()
    # An unreadable raw cache used to become {} and be overwritten.
    (tmp_path / "preseason_odds_raw.json").write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["fetch_preseason_odds.py"])
    with pytest.raises(ValueError, match="preseason_odds_raw"):
        fpo.main()
    assert (tmp_path / "preseason_odds_raw.json").read_text(encoding="utf-8") == "{bad"


def test_honors_extended_unreadable_award_cache_raises(tmp_path, monkeypatch):
    import fetch_honors_extended as fhe

    monkeypatch.setattr(fhe, "CACHE", tmp_path)
    (tmp_path / "honors_award_1999.json").write_text("{", encoding="utf-8")
    with pytest.raises(ValueError, match="honors_award_1999"):
        fhe.load_existing_award_caches()  # before: the year was skipped without a word


def test_contracts_unreadable_merged_salaries_raises(tmp_path, monkeypatch):
    import fetch_contracts as fc

    merged = tmp_path / "salaries_merged.json"
    merged.write_text("{", encoding="utf-8")
    monkeypatch.setattr(fc, "MERGED", merged)
    with pytest.raises(ValueError, match="salaries_merged"):
        fc.load_merged()  # before: printed "merged load err" and returned {}
