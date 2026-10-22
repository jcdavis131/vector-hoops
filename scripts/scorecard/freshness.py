"""Freshness: how old the site's realtime snapshot is, and how many NBA finals it shows.

Site side: assets/realtime/scoreboard.json, the only served file that carries scores (B-FRESH). Offline it is
the committed file; live it is a plain GET of the site's copy. Its `as_of` and its age at run time are measured.

NBA side: a cached cdn.nba.com scheduleLeagueV2.json (and todaysScoreboard_00.json if present) in --cdn-cache.
A final is a regular-season (002) game with gameStatus 3. It is "on site" only when the served scoreboard shows
the same two teams in state "post" with both scores equal to cdn.nba.com's. Without a cache the NBA side is null
"no-fetch-this-wave". Lag (final to on site) needs a first on-site sighting, which no run has recorded yet.
"""

from __future__ import annotations

import json

from . import common as c

# ESPN abbreviations the served scoreboard uses -> NBA tricodes
ESPN_TO_NBA = {"NY": "NYK", "SA": "SAS", "GS": "GSW", "NO": "NOP", "UTAH": "UTA", "WSH": "WAS", "PHO": "PHX"}
SCOREBOARD = "assets/realtime/scoreboard.json"


def _site_scoreboard(ctx: c.Ctx) -> tuple[dict | None, dict, str | None, str | None]:
    """(doc, input, fetched_at, reason)."""
    if ctx.offline or ctx.fetcher is None:
        inp = c.file_input(ctx.root, SCOREBOARD)
        if inp.get("missing"):
            return None, inp, None, f"{SCOREBOARD} is not in this checkout"
        return c.load_json(ctx.root / SCOREBOARD), inp, None, None
    url = f"{ctx.site_url.rstrip('/')}/{SCOREBOARD}"
    r = ctx.fetcher.get(url, use_cache=False)
    inp = {"url": url, "status": r.status, "sha256": r.sha256, "bytes": len(r.body) if r.body else None}
    if r.status != 200 or r.body is None:
        return None, inp, r.retrieved_at, f"GET {url} returned {r.status} {r.error or ''}".strip()
    return json.loads(r.body.decode("utf-8")), inp, r.retrieved_at, None


def _cdn_games(ctx: c.Ctx) -> tuple[dict | None, list[dict], str | None, str | None]:
    """({gameId: game}, inputs, fetched_at, reason) from the cdn cache."""
    if ctx.cdn_cache is None:
        return None, [], None, c.NO_FETCH
    games: dict[str, dict] = {}
    inputs, times = [], []
    sp = ctx.cdn_cache / "scheduleLeagueV2.json"
    if sp.is_file():
        meta = _meta(sp)
        inputs.append({"path": sp.as_posix(), "sha256": c.sha256_file(sp), "url": meta.get("url")})
        times.append(meta.get("retrieved_at"))
        doc = c.load_json(sp)
        for d in doc["leagueSchedule"]["gameDates"]:
            for g in d["games"]:
                games[str(g["gameId"])] = g
    tp = ctx.cdn_cache / "todaysScoreboard_00.json"
    if tp.is_file():
        meta = _meta(tp)
        inputs.append({"path": tp.as_posix(), "sha256": c.sha256_file(tp), "url": meta.get("url")})
        times.append(meta.get("retrieved_at"))
        for g in c.load_json(tp)["scoreboard"]["games"]:
            gid = str(g["gameId"])
            if g.get("gameStatus") == 3 or gid not in games:
                games[gid] = g
    if not inputs:
        return None, [], None, "no scheduleLeagueV2.json or todaysScoreboard_00.json in the cdn cache"
    return games, inputs, c.latest_time(times), None


def _meta(p) -> dict:
    mp = p.with_name(p.name + ".meta.json")
    return c.load_json(mp) if mp.is_file() else {}


def _on_site(game: dict, site_games: list[dict]) -> bool:
    h, a = game["homeTeam"], game["awayTeam"]
    for s in site_games:
        if s.get("state") != "post":
            continue
        sh, sa = s.get("home") or {}, s.get("away") or {}
        if ESPN_TO_NBA.get(sh.get("abbr"), sh.get("abbr")) != h.get("teamTricode"):
            continue
        if ESPN_TO_NBA.get(sa.get("abbr"), sa.get("abbr")) != a.get("teamTricode"):
            continue
        try:
            if int(sh.get("score")) == int(h.get("score")) and int(sa.get("score")) == int(a.get("score")):
                return True
        except (TypeError, ValueError):
            return False
    return False


def measure(ctx: c.Ctx) -> dict:
    cmd = ctx.cmd
    out: dict = {}
    sb, sb_in, sb_at, sb_why = _site_scoreboard(ctx)
    if sb is None:
        for name, unit in (("site_scoreboard_as_of", "timestamp"), ("site_scoreboard_age_minutes", "minutes")):
            out[name] = c.null(unit, sb_why or "unknown", command=cmd(f"freshness.{name}"), inputs=[sb_in])
        site_games: list[dict] = []
    else:
        site_games = sb.get("games") or []
        as_of = sb.get("as_of")
        out["site_scoreboard_as_of"] = c.metric(
            as_of, "timestamp", command=cmd("freshness.site_scoreboard_as_of"), inputs=[sb_in], fetched_at=sb_at,
            detail={"source": sb.get("source"), "date": sb.get("date"), "games": len(site_games)},
        )  # fmt: skip
        t = c.parse_time(as_of)
        if t is None:
            out["site_scoreboard_age_minutes"] = c.null(
                "minutes", "scoreboard.json has no readable as_of", command=cmd("freshness.site_scoreboard_age_minutes")
            )
        else:
            ref = c.parse_time(sb_at) or ctx.now
            out["site_scoreboard_age_minutes"] = c.metric(
                round((ref - t).total_seconds() / 60, 1),
                "minutes",
                command=cmd("freshness.site_scoreboard_age_minutes"),
                inputs=[sb_in],
                fetched_at=sb_at,
                detail={"measured_at": c.iso(ref), "as_of": as_of},
            )
    games, cdn_in, cdn_at, cdn_why = _cdn_games(ctx)
    if games is None:
        for name in ("nba_finals_listed", "finals_with_result_on_site"):
            out[name] = c.null("games", cdn_why, command=cmd(f"freshness.{name}"))
    else:
        finals = {gid: g for gid, g in games.items() if gid.startswith("002") and g.get("gameStatus") == 3}
        on = sorted(gid for gid, g in finals.items() if _on_site(g, site_games))
        out["nba_finals_listed"] = c.metric(
            len(finals), "games", command=cmd("freshness.nba_finals_listed"), inputs=cdn_in, fetched_at=cdn_at,
            detail={"regular_season_games_in_cache": sum(1 for g in games if g.startswith("002"))},
        )  # fmt: skip
        if sb is None:
            out["finals_with_result_on_site"] = c.null(
                "games", sb_why or "site scoreboard unreadable", command=cmd("freshness.finals_with_result_on_site")
            )
        else:
            out["finals_with_result_on_site"] = c.metric(
                len(on), "games", command=cmd("freshness.finals_with_result_on_site"), inputs=[*cdn_in, sb_in],
                fetched_at=c.latest_time([cdn_at, sb_at]),
                detail={"finals": len(finals), "on_site": on, "not_on_site": sorted(set(finals) - set(on))},
            )  # fmt: skip
    seen = out.get("finals_with_result_on_site", {}).get("value")
    why = (
        "no final was seen on the site in this run, so no on_site_seen_at exists to bound a lag"
        if seen == 0
        else "a lag needs final_at (cdn play-by-play) and a first on-site sighting kept across runs; "
        "the scorecard keeps no such ledger yet (B-FRESH's reprobe.py does)"
    )
    out["lag_p95_minutes"] = c.null("minutes", why, command=cmd("freshness.lag_p95_minutes"))
    return out
