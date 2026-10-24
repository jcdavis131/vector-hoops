"""Build assets/pregame/latest.json — the pre-game show's data.

Reads ~/workspace/nba-props/data/game_logs/*_2026.json (2025-26 season,
per-player game rows) and emits, per team:
  - style: pace, points per possession, 3P attempt rate, eFG% — with league rank
  - opp_style: the same, as ALLOWED by that team's defense (from the opp column)
  - trending: top-5 players by points over their last 5 games (>=3 games)
  - starters: probable starters = started=true on the team's latest game date
  - asof: build date, rendered on the cards ("as of this morning")

Every number is computed from the game logs, never asserted. Early-season
thin samples are labeled downstream ("2 games is not a trend yet").

Rebuild:
    python3 scripts/build_pregame.py
Output:
    assets/pregame/latest.json  (<100KB, carries asof)

Refresh story (V6): this JSON goes stale daily in-season. Proposed cron
(pattern: economy-data-refresh, weekly Mon ~19:10 CT): run this script, and
on change open a data-only PR (guard+CI must pass) that commits
assets/pregame/latest.json. The cron itself is a follow-up; the asof field
rendered on every card is the fail-closed freshness signal (K3: no asof ->
the trending/starters cards don't ship).

Stdlib only.
"""

from __future__ import annotations

import datetime as dt
import glob
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = Path(os.environ.get("GAMELOG_DIR", str(Path.home() / "workspace" / "nba-props" / "data" / "game_logs")))
OUT = ROOT / "assets" / "pregame" / "latest.json"
SEASON_SUFFIX = "_2026"  # 2025-26 season files


def possessions(r):
    return r["fga"] - r["orb"] + r["tov"] + 0.44 * r["fta"]


def main() -> int:
    files = sorted(glob.glob(str(LOG_DIR / f"*{SEASON_SUFFIX}.json")))
    if not files:
        print(f"no {SEASON_SUFFIX} game-log files in {LOG_DIR}", file=sys.stderr)
        return 1

    # team-game aggregates: (team, date) -> summed stats
    tg = defaultdict(lambda: {"fga": 0, "fta": 0, "tov": 0, "orb": 0, "pts": 0,
                              "fg": 0, "tp": 0, "tpa": 0, "ast": 0, "opp": None})
    players = defaultdict(list)  # (team, bref_id) -> rows
    for f in files:
        try:
            rows = json.load(open(f))
        except Exception:
            continue
        for r in rows:
            try:
                team, date = r["team"], r["date"]
            except KeyError:
                continue
            g = tg[(team, date)]
            for k in ("fga", "fta", "tov", "orb", "pts", "fg", "tp", "tpa", "ast"):
                g[k] += r.get(k) or 0
            g["opp"] = r.get("opp")
            players[(team, r.get("bref_id") or r.get("player_name"))].append(r)

    # per-team season totals
    teams = defaultdict(lambda: {"g": 0, "poss": 0.0, "pts": 0, "fga": 0, "fg": 0,
                                 "tp": 0, "tpa": 0, "fta": 0, "tov": 0, "orb": 0, "ast": 0})
    allowed = defaultdict(lambda: {"g": 0, "poss": 0.0, "pts": 0, "tpa": 0, "fga": 0})
    for (team, _date), g in tg.items():
        t = teams[team]
        t["g"] += 1
        p = possessions(g)
        t["poss"] += p
        for k in ("pts", "fga", "fg", "tp", "tpa", "fta", "tov", "orb", "ast"):
            t[k] += g[k]
        if g["opp"]:
            a = allowed[g["opp"]]
            a["g"] += 1
            a["poss"] += p
            a["pts"] += g["pts"]
            a["tpa"] += g["tpa"]
            a["fga"] += g["fga"]

    def style(t):
        if not t["g"]:
            return None
        poss_g = t["poss"] / t["g"]
        return {
            "pace": round(poss_g, 1),
            "ppp": round(t["pts"] / t["poss"], 3) if t["poss"] else None,
            "tpar": round(t["tpa"] / t["fga"], 3) if t["fga"] else None,
            "efg": round((t["fg"] + 0.5 * t["tp"]) / t["fga"], 3) if t["fga"] else None,
        }

    def allowed_style(a):
        if not a["g"]:
            return None
        return {
            "opp_ppp": round(a["pts"] / a["poss"], 3) if a["poss"] else None,
            "opp_tpar": round(a["tpa"] / a["fga"], 3) if a["fga"] else None,
        }

    team_list = sorted(teams)
    raw_style = {t: style(teams[t]) for t in team_list}
    raw_allowed = {t: allowed_style(allowed[t]) for t in team_list}

    def ranks(metric, src, reverse=False):
        vals = sorted(((t, src[t][metric]) for t in team_list if src[t] and src[t][metric] is not None),
                      key=lambda x: x[1], reverse=reverse)
        return {t: i + 1 for i, (t, _) in enumerate(vals)}

    r_pace = ranks("pace", raw_style, reverse=True)
    r_ppp = ranks("ppp", raw_style, reverse=True)
    r_tpar = ranks("tpar", raw_style, reverse=True)
    r_efg = ranks("efg", raw_style, reverse=True)
    r_opp_ppp = ranks("opp_ppp", raw_allowed)  # low allowed = rank 1
    r_opp_tpar = ranks("opp_tpar", raw_allowed)

    out_teams = {}
    for t in team_list:
        st, al = raw_style[t], raw_allowed[t]
        # trending: last 5 games of 2025-26 by date, >=3 games
        cands = []
        seen_players = {bref for (tm, bref) in players if tm == t}
        for bref in seen_players:
            rows = sorted(players[(t, bref)], key=lambda r: r.get("date", ""))[-5:]
            rows = [r for r in rows if not r.get("dnp")]
            if len(rows) < 3:
                continue
            name = rows[-1].get("player_name") or bref
            cands.append({"name": name, "pts": round(sum(r.get("pts") or 0 for r in rows) / len(rows), 1),
                          "n": len(rows)})
        trending = sorted(cands, key=lambda c: c["pts"], reverse=True)[:5]
        # probable starters: started=true on the team's latest game date
        dates = sorted({r.get("date", "") for (tm, _b) in players if tm == t for r in players[(tm, _b)] if r.get("date")})
        starters = []
        if dates:
            last = dates[-1]
            for bref in seen_players:
                for r in players[(t, bref)]:
                    if r.get("date") == last and r.get("started") and not r.get("dnp"):
                        starters.append(r.get("player_name") or bref)
                        break
        style_obj = None
        if st:
            style_obj = {
                "pace": {"v": st["pace"], "rank": r_pace.get(t)},
                "ppp": {"v": st["ppp"], "rank": r_ppp.get(t)},
                "tpar": {"v": st["tpar"], "rank": r_tpar.get(t)},
                "efg": {"v": st["efg"], "rank": r_efg.get(t)},
            }
        allowed_obj = None
        if al:
            allowed_obj = {
                "opp_ppp": {"v": al["opp_ppp"], "rank": r_opp_ppp.get(t)},
                "opp_tpar": {"v": al["opp_tpar"], "rank": r_opp_tpar.get(t)},
            }
        out_teams[t] = {
            "n_games": teams[t]["g"],
            "style": style_obj,
            "allowed": allowed_obj,
            "trending": trending,
            "starters": sorted(set(starters)),
        }

    doc = {
        "asof": dt.date.today().isoformat(),
        "season": "2025-26",
        "source": "Basketball-Reference game logs via nba-props (per-player game rows, summed to team games)",
        "note": "Style fingerprints are full-2025-26; trending is each player's last 5 games of 2025-26. "
                "Label thin samples downstream — never present 2 games as a trend.",
        "teams": out_teams,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(doc, separators=(",", ":"))
    OUT.write_text(payload)
    kb = len(payload.encode()) / 1024
    print(f"wrote {OUT} ({kb:.1f} KB, asof {doc['asof']}, {len(out_teams)} teams)")
    if kb >= 100:
        print("WARNING: payload >=100KB budget", file=sys.stderr)
        return 2
    if "asof" not in doc:
        print("K3 VIOLATION: no asof", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
