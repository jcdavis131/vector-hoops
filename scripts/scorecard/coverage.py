"""Coverage: seasons, player-seasons and games on the site against the NBA's own lists.

Site side (repo only): rows of assets/vectors.json (the file players.html reads), distinct pids, the rows whose
served `mpg` exceeds 48 (it is minutes per 100 possessions), and the site's gate replicated over the repo's own
pipeline/cache/dashbase_<season>.json. No regular-season game rows are served, so that count is null with why.

NBA side (cached stats.nba.com responses in the B-COV layout, --stats-cache): leaguedashplayerstats Totals
(players with GP > 0), the same list through the site's gate as built (per-100 MIN) and as stated (real minutes),
and leaguegamelog T (distinct GAME_ID). Without a cache every NBA-side number is null "no-fetch-this-wave".

Definitions follow wave 1's B-COV (evidence/B-COV/counts.py, coverage.py); see METRICS.md.
"""

from __future__ import annotations

from collections import defaultdict

from . import common as c

SEASONS = [f"{y}-{str(y + 1)[-2:]}" for y in range(1946, 2027)]
SEASON_GAMES = {"1998-99": 50, "2011-12": 66, "2019-20": 72, "2020-21": 72}
FIRST_DASH_SEASON = 1996  # leaguedashplayerstats serves no rows before 1996-97 (B-COV probe2 1985-86)


def min_gp(s: str) -> int:
    return max(10, min(15, round(0.15 * SEASON_GAMES.get(s, 82))))


def min_total(s: str) -> int:
    return max(450, round(0.06 * SEASON_GAMES.get(s, 82) * 48))


def _gated_per100(rows: list[dict], s: str) -> set:
    return {
        x["PLAYER_ID"]
        for x in rows
        if int(x.get("GP") or 0) >= min_gp(s) and int(x.get("GP") or 0) * float(x.get("MIN") or 0) >= min_total(s)
    }


def measure(ctx: c.Ctx) -> dict:
    root = ctx.root
    vec_in = c.file_input(root, "assets/vectors.json")
    cmd = ctx.cmd
    out: dict = {}
    if vec_in.get("missing"):
        for name in ("site_player_seasons", "site_players_distinct_pid", "site_rows_mpg_over_48"):
            out[name] = c.null("count", "assets/vectors.json is not in this checkout", command=cmd(f"coverage.{name}"))
        rows = []
    else:
        rows = c.load_json(root / "assets/vectors.json")["players"]
        out["site_player_seasons"] = c.metric(
            len(rows), "player-seasons", command=cmd("coverage.site_player_seasons"), inputs=[vec_in], fetched_at=None
        )
        out["site_players_distinct_pid"] = c.metric(
            len({r["pid"] for r in rows}),
            "players",
            command=cmd("coverage.site_players_distinct_pid"),
            inputs=[vec_in],
            fetched_at=None,
        )
        over = [r for r in rows if (r.get("mpg") or 0) > 48]
        out["site_rows_mpg_over_48"] = c.metric(
            len(over),
            "player-seasons",
            command=cmd("coverage.site_rows_mpg_over_48"),
            inputs=[vec_in],
            fetched_at=None,
            detail={"note": "served mpg is MIN per 100 possessions; a value over 48 cannot be minutes per game"},
        )
    by_season: dict[str, set] = defaultdict(set)
    for r in rows:
        by_season[r["season"]].add(r["pid"])
    out["site_seasons_with_rows"] = c.metric(
        len(by_season),
        "seasons",
        command=cmd("coverage.site_seasons_with_rows"),
        inputs=[vec_in] if not vec_in.get("missing") else [{"path": "assets/vectors.json", "missing": True}],
        fetched_at=None,
        detail={"of": len(SEASONS), "first": min(by_season) if by_season else None, "last": max(by_season) if by_season else None},
    )
    if not by_season:
        out["site_seasons_with_rows"] = c.null("seasons", "assets/vectors.json is missing", command=cmd("coverage.site_seasons_with_rows"))

    # the site's gate replicated over the repo's own cache
    replica_inputs, replica_match, replica_seasons = [], 0, 0
    for s in SEASONS:
        rel = f"pipeline/cache/dashbase_{s}.json"
        p = root / rel
        if not p.is_file():
            continue
        d = c.load_json(p)
        replica_inputs.append(c.file_input(root, rel))
        replica_seasons += 1
        replica_match += _gated_per100(d, s) == by_season.get(s, set())
    if replica_seasons:
        out["site_gate_replica_matches_site"] = c.metric(
            replica_match,
            "seasons",
            command=cmd("coverage.site_gate_replica_matches_site"),
            inputs=[vec_in, *replica_inputs],
            fetched_at=None,
            detail={"seasons_with_cache": replica_seasons},
        )
    else:
        out["site_gate_replica_matches_site"] = c.null(
            "seasons", "no pipeline/cache/dashbase_<season>.json in this checkout", command=cmd("coverage.site_gate_replica_matches_site")
        )
    out["site_regular_season_games"] = c.null(
        "games",
        "the site serves no regular-season game or box-score rows (B-COV: no gamelogs_*, boxscore*, schedule* on origin/master)",
        command=cmd("coverage.site_regular_season_games"),
        inputs=[vec_in],
    )

    # ---- NBA side from the cache ---------------------------------------------------------------------------
    per_season: dict[str, dict] = {}
    nba_inputs: list[dict] = []
    times: list[str | None] = []
    missing: list[str] = []
    tot_ps = gate_site = gate_real = under_real = games = 0
    seasons_dash = seasons_games = face_equal = gated_equal = 0
    for s in SEASONS:
        y = int(s[:4])
        site_ids = by_season.get(s, set())
        rec: dict = {"site_player_seasons": len(site_ids), "nba_dash_players": None, "nba_games": None}
        if FIRST_DASH_SEASON <= y <= 2025:
            tot, why = c.stats_saved(ctx.stats_cache, f"dash_totals_{s}")
            if tot is None:
                missing.append(why)
            else:
                nba_inputs.append(tot["input"])
                times.append(tot["meta"].get("fetched_at"))
                d = c.as_dicts(tot["headers"], tot["rows"])
                nba = {x["PLAYER_ID"] for x in d if (x.get("GP") or 0) > 0}
                real = {x["PLAYER_ID"] for x in d if (x.get("GP") or 0) >= min_gp(s) and (x.get("MIN") or 0) >= min_total(s)}
                rec["nba_dash_players"] = len(nba)
                rec["nba_dash_gate_real_min"] = len(real)
                rec["site_rows_under_real_min_gate"] = len(site_ids - real)
                tot_ps += len(nba)
                gate_real += len(real)
                under_real += len(site_ids - real)
                seasons_dash += 1
                face_equal += len(site_ids) == len(nba) and site_ids == nba
                p100, why = c.stats_saved(ctx.stats_cache, f"dash_per100_{s}")
                if p100 is None:
                    missing.append(why)
                else:
                    nba_inputs.append(p100["input"])
                    times.append(p100["meta"].get("fetched_at"))
                    g = _gated_per100(c.as_dicts(p100["headers"], p100["rows"]), s)
                    rec["nba_dash_gate_site"] = len(g)
                    rec["site_ids_equal_nba_gate_site"] = g == site_ids
                    gate_site += len(g)
                    gated_equal += g == site_ids
        if y <= 2025:
            gl, why = c.stats_saved(ctx.stats_cache, f"gamelog_T_{s}")
            if gl is None:
                missing.append(why)
            else:
                nba_inputs.append(gl["input"])
                times.append(gl["meta"].get("fetched_at"))
                gi = gl["headers"].index("GAME_ID")
                rec["nba_games"] = len({r[gi] for r in gl["rows"]})
                games += rec["nba_games"]
                seasons_games += 1
        per_season[s] = rec
    fetched = c.latest_time(times)
    nba_meta = {"seasons_with_list": seasons_dash, "missing_responses": len(missing), "missing_examples": missing[:5]}

    def nba_metric(name: str, value: int, unit: str, seasons: int, detail: dict | None = None) -> dict:
        if ctx.stats_cache is None:
            return c.null(unit, c.NO_FETCH, command=cmd(f"coverage.{name}"))
        if seasons == 0:
            return c.null(unit, "no usable response in the stats cache", command=cmd(f"coverage.{name}"), detail=nba_meta)
        return c.metric(
            value,
            unit,
            command=cmd(f"coverage.{name}"),
            inputs=nba_inputs if name != "seasons_site_equals_nba_face_value" else [vec_in, *nba_inputs],
            fetched_at=fetched,
            detail={**nba_meta, **(detail or {})},
        )

    out["nba_player_seasons_1996_2025"] = nba_metric("nba_player_seasons_1996_2025", tot_ps, "player-seasons", seasons_dash)
    out["nba_player_seasons_gate_as_built"] = nba_metric("nba_player_seasons_gate_as_built", gate_site, "player-seasons", seasons_dash)
    out["nba_player_seasons_gate_as_stated"] = nba_metric("nba_player_seasons_gate_as_stated", gate_real, "player-seasons", seasons_dash)
    out["site_rows_under_stated_minutes_gate"] = nba_metric(
        "site_rows_under_stated_minutes_gate", under_real, "player-seasons", seasons_dash
    )
    out["nba_regular_season_games_1946_2025"] = nba_metric(
        "nba_regular_season_games_1946_2025", games, "games", seasons_games, {"seasons_with_game_log": seasons_games}
    )
    out["seasons_site_equals_nba_under_site_gate"] = nba_metric(
        "seasons_site_equals_nba_under_site_gate", gated_equal, "seasons", seasons_dash, {"of": len(SEASONS)}
    )
    out["seasons_site_equals_nba_face_value"] = nba_metric(
        "seasons_site_equals_nba_face_value",
        face_equal,
        "seasons",
        seasons_dash,
        {
            "of": len(SEASONS),
            "definition": "site player-seasons == every NBA player with GP > 0 (leaguedashplayerstats Totals); "
            "a season without that list is not equal",
            "per_season": per_season,
        },
    )
    return out
