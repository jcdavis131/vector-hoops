#!/usr/bin/env python3
"""Build shareable analytics insights from the embedding model data.

Stdlib-only data computation. Outputs:
  assets/insights.json                  curated insights w/ every number the page needs
  public/assets/insights.json           mirror (Vercel serves public/ at root)
  assets/og/insight-<slug>.png          per-card unfurl images (needs PIL; skipped if missing)
  public/assets/og/insight-<slug>.png   mirror (root/public mirror rule)
  insights/<slug>.html                  per-card OG stub pages (crawlers -> image, humans -> redirect)
  public/insights/<slug>.html           mirror (root/public mirror rule)

Real data only. No synthetic numbers, no invented annotations except the
clearly-marked MVP_SEASONS set (public record, used for one headline).
"""

import json
import math
import os
from collections import defaultdict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(REPO, "assets")
PUBLIC = os.path.join(REPO, "public")
DOMAIN = "https://hoops.dumbmodel.com"

NAME_FIXES = {
    "Shai GilgeousAlexander": "Shai Gilgeous-Alexander",
    "KarlAnthony Towns": "Karl-Anthony Towns",
    "Michael CarterWilliams": "Michael Carter-Williams",
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    "Royce ONeale": "Royce O'Neale",
}

# Public record, curated by hand for the uniqueness headline.
# Only seasons where the player actually won MVP that year.
MVP_SEASONS = {
    ("Russell Westbrook", "2016-17"),
    ("Giannis Antetokounmpo", "2019-20"),
    ("James Harden", "2017-18"),
}


def pretty(name):
    return NAME_FIXES.get(name, name)


def short_season(s):
    # "2018-19" -> "'18-19"
    a, b = s.split("-")
    return "'%s-%s" % (a[2:], b)


def load(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return json.load(f)


# ---- 10. playoff risers & fallers -----------------------------------------------
# Research: /tmp/playoff-runs-analysis.py (2026-10-01).
# Method: per-player regular-season vs playoff scoring rate (pts/100) from
# assets/playoffs.json (stats.nba.com splits). Established-scorer gate:
# RS pts/100 >= 28 over >= 40 RS games, PO GP >= 8, PO usage >= 18.
# 334 player-seasons qualify, 1996-97 -> 2025-26. Delta = PO - RS pts/100.
# Values below are exact to the computed deltas (rounded to 1 decimal).


def insight_playoff_swings():
    rows = [
        {"label": "Donovan Mitchell '24-25", "value": 8.6,
         "tag": "35.7 → 44.3 pts/100 · 9 games"},
        {"label": "Donovan Mitchell '20-21", "value": 8.3,
         "tag": "38.0 → 46.3 pts/100 · 10 games"},
        {"label": "Tim Duncan '05-06", "value": 8.2,
         "tag": "28.6 → 36.8 pts/100 · 13 games"},
        {"label": "LeBron James '08-09", "value": 7.2,
         "tag": "39.9 → 47.1 pts/100 · 14 games"},
        {"label": "Kevin Durant '18-19", "value": 7.2,
         "tag": "34.9 → 42.1 pts/100 · 12 games — tied 4th"},
        {"label": "Joel Embiid '22-23", "value": -14.6,
         "tag": "47.1 → 32.5 pts/100 · 9 games"},
        {"label": "Kristaps Porzingis '24-25", "value": -13.6,
         "tag": "32.4 → 18.8 pts/100 · 11 games"},
        {"label": "Jermaine O'Neal '04-05", "value": -13.2,
         "tag": "37.3 → 24.1 pts/100 · 13 games"},
        {"label": "Joel Embiid '21-22", "value": -12.6,
         "tag": "44.8 → 32.2 pts/100 · 10 games"},
        {"label": "Jordan Clarkson '17-18", "value": -12.0,
         "tag": "28.1 → 16.1 pts/100 · 19 games"},
    ]
    return {
        "slug": "playoff-swings",
        "tldr": "Among established scorers, Donovan Mitchell owns the two biggest "
        "playoff scoring leaps of the last 30 years — and Joel Embiid owns the "
        "single biggest collapse (-14.6). May doesn't just test talent; it tests "
        "whose game translates.",
        "kicker": "Playoff risers & fallers",
        "title": "May makes some stars bigger — and shrinks others",
        "lede": "Scoring-rate change from regular season to playoffs (pts/100) for "
        "established scorers: 28+ pts/100 across 40+ regular-season games, 8+ "
        "playoff games, and a real playoff role. 334 player-seasons qualified, "
        "1996-97 → 2025-26. The risers: Mitchell's 2025 encore (+8.6) and his "
        "2021 surge (+8.3), Duncan's 2006 throwback (+8.2), and a +7.2 tie for "
        "fourth between LeBron's 2009 rampage and Durant's pre-injury 2019 tear. "
        "The fallers: Embiid's 2023 collapse (-14.6, the largest in the sample) "
        "and his 2022 fade (-12.6), Porzingis's hollowed-out 2025 (-13.6), "
        "Jermaine O'Neal's 2005 fade (-13.2), and Jordan Clarkson's 2018 dip "
        "(-12.0).",
        "stat": "+8.6",
        "stat_label": "Mitchell's 2025 scoring jump (pts/100) — the biggest rise "
        "among established scorers",
        "viz": "bars",
        "viz_label": "Scoring change, regular season → playoffs (pts/100)",
        "rows": rows,
        "foot": "334 established-scorer seasons (28+ RS pts/100, 40+ RS games, 8+ "
        "playoff games, playoff usage ≥ 18); regular-season vs playoff splits via "
        "stats.nba.com. This is the biggest swing in scoring rate — not the "
        "greatest postseason run; see the playoff-runs rankings for that.",
        "og_title": "Playoff risers & fallers",
        "og_desc": "Mitchell owns the two biggest May scoring leaps in 30 years. "
        "Embiid owns the biggest collapse.",
    }


# ---- 11. contenders & pretenders (2026-27 preview) -----------------------------
# Research: recomputed 2026-10-01 (gp>=20 filter; suffix-tolerant name matching).
# Method: the contender-chemistry metric (mean pairwise 14-d style distance
# across the rotation) applied to projected 2026-27 rotations. Rotation =
# rostered players with >= 20 GP in 2025-26; stars who missed the season
# (Irving, Haliburton, Lillard) use their latest season's style vector.
# Values centered on the historical playoff-team mean (5.06) from the
# contender-chemistry card: positive = playoff-shaped, negative =
# lottery-shaped. Engine = top scorer by latest regular-season pts/100
# (stats.nba.com splits; 2025-26 for 2026 playoff teams, 2024-25 otherwise).
# Contender = clears BOTH bars: spread >= 5.06 AND top-10 engine.
# Roster source: 2026-27 projected rosters as of 2026-10-01; the summer's big
# moves (Giannis->MIA, Brown->PHI, LeBron->PHI, Kawhi->TOR, Morant->POR)
# verified against Reuters/USA Today 2026-09-28.
# Honesty: shape predicts MAKING the playoffs, not winning — the 2026
# finalists (Knicks 4.80, Spurs 4.84) both sit below the line.


def insight_contenders_pretenders():
    rows = [
        {"label": "Portland", "value": 0.61,
         "tag": "5.67 spread · Morant 34.6 pts/100 — shape, no engine"},
        {"label": "LA Lakers", "value": 0.50,
         "tag": "5.56 spread · Dončić 38.1 pts/100"},
        {"label": "Oklahoma City", "value": 0.25,
         "tag": "5.31 spread · Gilgeous-Alexander 44.1 pts/100"},
        {"label": "Denver", "value": 0.14,
         "tag": "5.20 spread · Jokić 37.1 pts/100"},
        {"label": "Philadelphia", "value": 0.08,
         "tag": "5.14 spread · Brown 41.0 pts/100 — plus LeBron"},
        {"label": "Miami", "value": 0.06,
         "tag": "5.12 spread · Antetokounmpo 42.7 pts/100"},
        {"label": "San Antonio", "value": -0.22,
         "tag": "4.84 spread · Wembanyama 40.2 — lost Finals"},
        {"label": "New York", "value": -0.26,
         "tag": "4.80 spread · Brunson 36.3 — defending champs"},
    ]
    return {
        "slug": "contenders-pretenders",
        "tldr": "Five teams clear both bars — a playoff-shaped rotation and a "
        "top-10 engine: the Lakers, Oklahoma City, Denver, Philadelphia and "
        "Miami. Portland has the most playoff-shaped rotation in the league "
        "and no engine to match; the champs and runners-up win on talent, "
        "not shape.",
        "kicker": "2026-27 preview",
        "title": "Who looks like a contender — and who looks lottery-shaped",
        "lede": "Each projected 2026-27 rotation measured with the "
        "contender-chemistry metric (mean pairwise style distance in the 14-d "
        "embedding space), centered on the historical playoff-team mean of "
        "5.06 — right of the line is playoff-shaped, left is lottery-shaped. "
        "Five teams clear both bars, shape and engine: the Lakers pair the "
        "second-most playoff-shaped rotation (5.56) with Dončić (38.1 "
        "pts/100); Oklahoma City (5.31, Gilgeous-Alexander 44.1); Denver "
        "(5.20, Jokić 37.1); Philadelphia (5.14, Brown 41.0 — plus LeBron, "
        "plus Embiid); and Miami (5.12, Antetokounmpo 42.7). The twist: last "
        "June's finalists both sit BELOW the line — the champion Knicks "
        "(4.80) and the Spurs (4.84) win on talent, not shape, exactly what "
        "the chemistry card predicted: variety gets you in, matchups decide "
        "the rest. The cautionary tale is Portland: the most playoff-shaped "
        "rotation in the league (5.67) with no top-10 engine — Sacramento "
        "(5.45), Utah (5.44) and Detroit (5.41) fit the same profile. At the "
        "bottom, Atlanta (4.06) has the most homogeneous rotation in the "
        "league. One asterisk from the risers & fallers card: Philadelphia's "
        "ceiling runs through Embiid, owner of the largest playoff scoring "
        "collapse of the last 30 years — and he has played 39% of possible "
        "games across the last three seasons.",
        "stat": "+0.61",
        "stat_label": "Portland's spread above the playoff-team line — most "
        "playoff-shaped rotation, without a top-10 engine",
        "viz": "bars",
        "viz_label": "2026-27 rotation spread vs the playoff-team mean (5.06)",
        "rows": rows,
        "foot": "30 projected 2026-27 rotations as of 2026-10-01 (rostered "
        "players with ≥20 GP in 2025-26; stars who missed the season use "
        "their latest season's style; camp cuts pending). Spread = mean "
        "pairwise 14-d style distance, centered on the 1996-97 → 2024-25 "
        "playoff-team mean (5.06). Engine = latest regular-season pts/100 "
        "(2025-26 for 2026 playoff teams, 2024-25 otherwise). Shape predicts "
        "making the playoffs, not winning the title.",
        "og_title": "Contenders & pretenders, 2026-27",
        "og_desc": "Five teams clear both bars: the Lakers, OKC, Denver, "
        "Philly and Miami. The champs break the mold.",
    }


def main():
    vec = load("vectors.json")
    players = vec["players"]
    clusters = vec["clusters"]
    eratwins = load("eratwins.json")["players"]
    drift = load("drift.json")

    D = 14
    N = len(players)
    cent = [0.0] * D
    for p in players:
        v = p["v"]
        for i in range(D):
            cent[i] += v[i]
    cent = [c / N for c in cent]

    def cdist(v):
        return math.sqrt(sum((v[i] - cent[i]) ** 2 for i in range(D)))

    insights = []
    insights.append(insight_unique(players, cdist))
    insights.append(insight_average(players, cdist))
    insights.append(insight_transformed(players))
    insights.append(insight_time_capsule(eratwins))
    insights.append(insight_dead_styles(players, clusters))
    insights.append(insight_three_point(drift))
    insights.append(insight_careful_era(drift))
    insights.append(insight_contender_chemistry())
    insights.append(insight_matchup_nightmares())
    insights.append(insight_playoff_swings())
    insights.append(insight_contenders_pretenders())

    out = {
        "built": "build_insights.py",
        "n_seasons": N,
        "domain": DOMAIN,
        "insights": insights,
    }
    for path in (
        os.path.join(ASSETS, "insights.json"),
        os.path.join(PUBLIC, "assets", "insights.json"),
    ):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, separators=(",", ":"))
    print("wrote insights.json (%d insights)" % len(insights))

    render_og_images(insights)
    write_og_stubs(insights)


# ---- 1. most unique styles -----------------------------------------------


def insight_unique(players, cdist):
    scored = [
        (cdist(p["v"]), p["name"], p["season"])
        for p in players
        if p["total_min"] >= 1500
    ]
    scored.sort(reverse=True)
    rows = []
    for d, name, season in scored[:8]:
        rows.append(
            {
                "label": "%s %s" % (pretty(name), short_season(season)),
                "value": round(d, 2),
                "tag": "MVP" if (name, season) in MVP_SEASONS else None,
            }
        )
    top = rows[0]
    return {
        "slug": "most-unique",
        "tldr": "The weirdest ways anyone has ever played basketball mostly belong to MVPs — greatness looks strange.",
        "kicker": "Uniqueness",
        "title": "The strangest playing styles of the last 30 years belong to MVP-level superstars",
        "lede": "Style distance from the league-average player, 14-dimensional embedding space. "
        "Minimum 1,500 minutes. The five strangest seasons ever charted — three of them MVP campaigns.",
        "stat": str(top["value"]),
        "stat_label": "style distance — %s" % top["label"],
        "viz": "bars",
        "viz_label": "Distance from league-average style",
        "rows": rows,
        "foot": "Computed over 12,966 player-seasons (1996-97 → 2025-26). MVP seasons marked from the public record.",
        "og_title": "The weirdest NBA seasons in 30 years belong to superstars",
        "og_desc": "Harden '18-19 sits 9.57 style-points from the average player — the strangest season in 30 years of data.",
    }


# ---- 2. most average ------------------------------------------------------


def insight_average(players, cdist):
    scored = [
        (cdist(p["v"]), p["name"], p["season"])
        for p in players
        if p["total_min"] >= 1500
    ]
    scored.sort()
    rows = [
        {"label": "%s %s" % (pretty(n), short_season(s)), "value": round(d, 2)}
        for d, n, s in scored[:5]
    ]
    top = rows[0]
    return {
        "slug": "most-average",
        "tldr": "We found the single most ordinary NBA season ever recorded — the perfectly average player, scientifically.",
        "kicker": "Uniqueness",
        "title": "The most average NBA season ever charted",
        "lede": "Closest to the centroid of all 12,966 player-seasons in style space. "
        "Not bad, not weird — the platonic NBA role player, quantified.",
        "stat": str(top["value"]),
        "stat_label": "style distance — %s" % top["label"],
        "viz": "bars",
        "viz_label": "Distance from league-average style (smaller = more average)",
        "rows": rows,
        "foot": "Minimum 1,500 minutes. 14-dimensional serving vectors, 1996-97 → 2025-26.",
        "og_title": "The most average NBA season ever: Caleb Martin '23-24",
        "og_desc": "1.02 style-points from the league-average player — the platonic NBA season, measured.",
    }


# ---- 3. transformed -------------------------------------------------------


def insight_transformed(players):
    by = defaultdict(list)
    for p in players:
        if p["total_min"] >= 800:
            # person_id, never the display name: Sr./Jr. sharing a name must
            # not merge into one career (identity fix 2026-10-01)
            by[p["person_id"]].append(p)

    def euc(a, b):
        return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(14)))

    scored = []
    for pid, ps in by.items():
        if len(ps) < 4:
            continue
        ps.sort(key=lambda p: p["season"])
        d = euc(ps[0]["v"], ps[-1]["v"])
        # display name is 1:1 with person_id (qa_player_identity.py check 2)
        scored.append((d, ps[0]["name"], ps[0]["season"], ps[-1]["season"], len(ps)))
    scored.sort(reverse=True)
    most = scored[0]
    steady = [s for s in scored if s[4] >= 11]
    steady.sort()
    least = steady[0]
    rows = [
        {
            "label": "%s %s → %s"
            % (pretty(most[1]), short_season(most[2]), short_season(most[3])),
            "value": round(most[0], 2),
            "tag": "%d seasons" % most[4],
        },
        {
            "label": "%s %s → %s"
            % (pretty(least[1]), short_season(least[2]), short_season(least[3])),
            "value": round(least[0], 2),
            "tag": "%d seasons" % least[4],
        },
    ]
    return {
        "slug": "transformed",
        "tldr": "Giannis reinvented his game more than any player in 30 years; Terrence Ross played 11 seasons as basically the same guy.",
        "kicker": "Career arcs",
        "title": "Nobody transformed like Giannis. Nobody stayed the same like Terrence Ross.",
        "lede": "Style distance between a player's first and last charted season. "
        "Giannis went from raw rookie to MVP force — the biggest reinvention in the dataset. "
        "Ross played 11 seasons as essentially the same player.",
        "stat": str(round(most[0], 2)),
        "stat_label": "style distance — %s's reinvention" % pretty(most[1]),
        "viz": "bars",
        "viz_label": "First-to-last season style distance",
        "rows": rows,
        "foot": "First-to-last style distance. Minimum 4 charted seasons at 800+ minutes each; the steadiest needs 11+. 14-d style space.",
        "og_title": "Giannis reinvented his game more than anyone in 30 years",
        "og_desc": "8.43 style-points from his rookie season to now. Terrence Ross: 1.07 across 11 seasons.",
    }


# ---- 4. time-capsule twins -------------------------------------------------


def insight_time_capsule(eratwins):
    def yr(s):
        return int(s.split("-")[0])

    cands = []
    for t in eratwins:
        tw = t.get("twin") or {}
        s1, s2, sim = t.get("season"), tw.get("season"), tw.get("similarity")
        if not (s1 and s2 and sim):
            continue
        gap = abs(yr(s1) - yr(s2))
        if sim >= 0.60:
            cands.append((gap, sim, t.get("name"), s1, tw.get("name"), s2))
    cands.sort(key=lambda c: (-c[0], -c[1]))
    # One appearance per player: greedy take in gap order so the card keeps
    # its widest-gap premise while maximizing variety.
    used, picks = set(), []
    for gap, sim, n1, s1, n2, s2 in cands:
        if n1 in used or n2 in used:
            continue
        used.add(n1)
        used.add(n2)
        picks.append((gap, sim, n1, s1, n2, s2))
        if len(picks) == 4:
            break
    rows = [
        {
            "a": "%s %s" % (pretty(n1), short_season(s1)),
            "b": "%s %s" % (pretty(n2), short_season(s2)),
            "gap": g,
            "sim": round(s, 3),
        }
        for g, s, n1, s1, n2, s2 in picks
    ]
    top = rows[0]
    return {
        "slug": "time-capsule",
        "tldr": "Players 29 years apart can play almost identically — basketball styles echo across generations.",
        "kicker": "Era twins",
        "title": "Separated by 29 years. Nearly the same player.",
        "lede": "The widest era gaps with similarity ≥ 0.60 in the full 64-d embedding — "
        "each player appears once for maximum variety. "
        "Styles echo across decades — the model keeps finding 1996-97 in 2025-26.",
        "stat": "%dy" % top["gap"],
        "stat_label": "widest twin gap — %s ↔ %s" % (top["a"], top["b"]),
        "viz": "timeline",
        "rows": rows,
        "foot": "Twins found in the full 64-dimensional embedding; similarity is cosine there. "
        "Dataset window 1996-97 → 2025-26.",
        "og_title": "29 years apart. Nearly the same player.",
        "og_desc": "Jeff Green '25-26 ↔ LaSalle Thompson '96-97: the widest era-twin gap in the model.",
    }


# ---- 5. dead styles ---------------------------------------------------------


def insight_dead_styles(players, clusters):
    seasons = sorted({p["season"] for p in players})
    early, late = seasons[:3], seasons[-3:]
    share = {s: defaultdict(int) for s in ("early", "late")}
    tot = {"early": 0, "late": 0}
    for p in players:
        if p["season"] in early:
            share["early"][p["c"]] += 1
            tot["early"] += 1
        elif p["season"] in late:
            share["late"][p["c"]] += 1
            tot["late"] += 1
    drops = []
    for ci, name in enumerate(clusters):
        es = share["early"][ci] / tot["early"]
        ls = share["late"][ci] / tot["late"]
        drops.append((es - ls, name, es, ls, ci))
    drops.sort(reverse=True)
    d, name, e, ls0, dead_ci = drops[0]
    rows = [
        {
            "label": n,
            "early": round(100 * se, 1),
            "late": round(100 * sl, 1),
            "delta": round(100 * (sl - se), 1),
        }
        for _, n, se, sl, _ in drops
    ]
    # Last of the breed: players nearest the dying archetype's centroid
    # among the two most recent seasons (minimum 800 minutes).
    members = [p for p in players if p["c"] == dead_ci]
    centroid = [sum(p["v"][i] for p in members) / len(members) for i in range(14)]

    def to_cent(p):
        return math.sqrt(sum((p["v"][i] - centroid[i]) ** 2 for i in range(14)))

    recent = [
        p
        for p in players
        if p["season"] in seasons[-2:] and p["c"] == dead_ci and p["total_min"] >= 800
    ]
    recent.sort(key=to_cent)
    examples = [
        {"label": "%s %s" % (pretty(p["name"]), short_season(p["season"]))}
        for p in recent[:4]
    ]
    return {
        "slug": "dead-styles",
        "tldr": "The old-school bruising rebounder who lives at the rim is dying out — only a few are left.",
        "kicker": "Archetypes",
        "title": 'The "%s" is going extinct' % name,
        "lede": "Share of player-seasons in each style archetype: first three seasons vs last three. "
        "The 'Defensive Glass + Rim Pressure' archetype is being selected out of the league — "
        "these are its last true practitioners.",
        "stat": "%+.1fpp" % (100 * (ls0 - e)),
        "stat_label": "share change — %s" % name,
        "viz": "shares",
        "rows": rows,
        "examples": examples,
        "foot": "8 k-means archetypes over 14-d serving vectors. Shares of charted player-seasons. "
        "Examples are the players nearest the archetype centroid in 2024-25 → 2025-26 (min 800 min).",
        "og_title": "An NBA playing style is going extinct",
        "og_desc": '"%s" fell %+.1f points of league share. The model watched it happen.'
        % (name, 100 * (ls0 - e)),
    }


# ---- 6. three-point takeover --------------------------------------------------


def insight_three_point(drift):
    rates = drift["leagueRates"]
    seasons = sorted(rates.keys())
    first, last = seasons[0], seasons[-1]
    f3, l3 = rates[first]["FG3A"], rates[last]["FG3A"]
    series = [{"s": s, "v": round(rates[s]["FG3A"], 2)} for s in seasons]
    return {
        "slug": "three-point-takeover",
        "tldr": "NBA teams shoot way, way more threes than they used to — the biggest style shift in 30 years.",
        "kicker": "League drift",
        "title": "The three-point takeover, measured",
        "lede": "League-average three-point attempts per game, 30 seasons. "
        "The single biggest stylistic shift in the dataset — the map itself rotated toward the arc.",
        "stat": "%.1fx" % (l3 / f3),
        "stat_label": "growth in 3PA/game, %s → %s" % (first, last),
        "viz": "line",
        "viz_label": "3-point attempts per game",
        "rows": series,
        "first": {"s": first, "v": round(f3, 1)},
        "last": {"s": last, "v": round(l3, 1)},
        "foot": "Per-game rates across charted player-seasons. See the drift section on trends for the full rotation analysis.",
        "og_title": "NBA 3-point attempts are up %.1fx in 30 years" % (l3 / f3),
        "og_desc": "From %.1f to %.1f per game — the biggest stylistic shift the model has measured."
        % (f3, l3),
    }


# ---- 7. the careful era -------------------------------------------------------


def insight_careful_era(drift):
    rates = drift["leagueRates"]
    seasons = sorted(rates.keys())
    first, last = seasons[0], seasons[-1]
    tov_first, tov_last = rates[first]["TOV"], rates[last]["TOV"]
    f_ast, l_ast = rates[first]["AST"], rates[last]["AST"]
    ratio_gain = 100 * ((l_ast / tov_last) / (f_ast / tov_first) - 1)
    series = [{"s": s, "v": round(rates[s]["TOV"], 2)} for s in seasons]
    return {
        "slug": "careful-era",
        "tldr": "NBA players turn the ball over way less than they used to — the game got cleaner even as scoring went up.",
        "kicker": "League drift",
        "title": "The league stopped turning it over",
        "lede": "League-average turnovers per game, 30 seasons. As the game moved to the "
        "perimeter — more catch-and-shoot, fewer post-ups — the riskiest plays faded and "
        "ball-handling tightened league-wide: assist-to-turnover ratio is up %d%% over the "
        "same span." % round(ratio_gain),
        "stat": "%+.1f%%" % (100 * (tov_last - tov_first) / tov_first),
        "stat_label": "turnovers/game, %s → %s (%.2f → %.2f)"
        % (first, last, tov_first, tov_last),
        "viz": "line",
        "viz_label": "Turnovers per game",
        "rows": series,
        "first": {"s": first, "v": round(tov_first, 2)},
        "last": {"s": last, "v": round(tov_last, 2)},
        "foot": "Per-game rates across charted player-seasons, 1996-97 → 2025-26. "
        "Scoring rose 9.6% over the same span — this is not a minutes artifact.",
        "og_title": "NBA turnovers are down 18% in 30 years",
        "og_desc": "From %.2f to %.2f per game — assist-to-turnover ratio up %d%%. "
        "The careful era, measured." % (tov_first, tov_last, round(ratio_gain)),
    }


# ---- 8. contender chemistry --------------------------------------------------
# Research: /tmp/champ-chem-v2-report.md (2026-10-01).
# Method: mean pairwise 14-d embedding distance among rotation players
# (>=1,000 min), 862 team-seasons, 1996-97 -> 2024-25 (2025-26 excluded,
# season in progress). Honest null: no style-spread gradient across playoff
# rounds — the cliff is binary (playoffs vs not). "Spread gets you in,
# matchups decide the rest."


def insight_contender_chemistry():
    # Exact values from the research pass; kept as constants with the
    # citation above (recomputing needs player_team_season.json joins).
    playoff_spread, missed_spread = 5.06, 4.82
    rows = [
        {"label": "Champions", "value": 5.14, "tag": "29 title teams"},
        {"label": "Lost Finals", "value": 4.96, "tag": "29 Finals losers"},
        {
            "label": "Lost conf. finals",
            "value": 5.06,
            "tag": "58 teams",
        },
        {
            "label": "Rest of playoff field",
            "value": 5.02,
            "tag": "348 team-seasons",
        },
        {
            "label": "Missed playoffs",
            "value": 4.73,
            "tag": "398 team-seasons",
        },
    ]
    return {
        "slug": "contender-chemistry",
        "tldr": "Playoff rotations are way more stylistically diverse than lottery teams' "
        "— winners collect different weapons, not copies — but the spread doesn't "
        "predict how deep a run goes.",
        "kicker": "Contender chemistry",
        "title": "Making the playoffs takes variety — surviving them takes matchups",
        "lede": "Mean pairwise style distance among rotation players (≥1,000 min), "
        "14-d embedding space, 1996-97 → 2024-25. Every tier of the playoffs draws "
        "from the same diverse pool — once you're in, style spread doesn't predict "
        "how far you go. Most-diverse champs: the 2014-15 Warriors (5.78), 2019-20 "
        "Lakers (5.62), 2010-11 Mavericks (5.62); tightest: the 1999-00 Lakers (4.10).",
        "stat": "+5.0%",
        "stat_label": "wider rotation style spread — playoff teams vs non-playoff "
        "(%.2f vs %.2f)" % (playoff_spread, missed_spread),
        "viz": "bars",
        "viz_label": "Mean rotation style spread by furthest round reached",
        "rows": rows,
        "foot": "862 team-seasons; furthest round from playoff series records; "
        "2025-26 excluded (season in progress).",
        "og_title": "Winners don't look alike",
        "og_desc": "Playoff rotations span 5% more style space — but Finals teams are "
        "no more diverse than first-round exits. Matchups decide.",
    }


# ---- 9. matchup nightmares ----------------------------------------------------
# Research: /tmp/matchup-nightmares-report.md (2026-10-01).
# Method: per-player regular-season vs playoff splits from assets/playoffs.json
# (stats.nba.com: GP, MIN, USG, PTS100, TS, PLUS_MINUS), joined to 14-d
# embeddings + 8 style clusters; 4,739 rotation player-seasons (made playoffs,
# PO GP>=4, RS >=25 scaled min/g), 1996-97 -> 2024-25. League mean PO-RS
# pts/100 is -1.50 (defenses tighten), so flat is genuinely good.
# Honesty: "game-planning" is the best-fit mechanism (usage AND efficiency fall
# together for shooters), not proven causation. Cluster [2]'s +0.30 (n=125) is
# not significant -- tagged as noise, not claimed.
# 2026 Finals color (corrected 2026-10-01): Finals-SERIES-only numbers
# (Knicks d. Spurs 4-1, 5 games). The first version used full-playoff-run
# numbers (22g/18g/23g) and wrongly implied the Knicks "solved" Wembanyama --
# he averaged 26.0 ppg in the Finals. Sources: StatMuse series splits
# Harper 18.0 ppg vs 11.8 RS; Barnes faded out of the rotation in the Finals
# postseason vs 9.9 RS), SI (Alvarado +18.9 Finals on/off), NBC Sports
# (Alvarado 8 4th-quarter pts in the 29-pt Game 4 comeback), Fadeaway World
# (Brunson 32.6 ppg Finals MVP, 45 in the closeout).


def insight_matchup_nightmares():
    # Exact values from the research pass; kept as constants with the
    # citation above (recomputing needs playoffs.json split joins).
    rows = [
        {
            "label": "Pure shooters",
            "value": -2.28,
            "tag": "3PT accuracy + volume · n=1,010",
        },
        {"label": "Volume scorers", "value": -2.09, "tag": "shot volume + 3PT volume"},
        {
            "label": "Glass + rim pressure",
            "value": -1.92,
            "tag": "defensive glass + rim pressure",
        },
        {
            "label": "Glass + rim protection",
            "value": -1.69,
            "tag": "offensive glass + rim protection",
        },
        {
            "label": "Scoring volume",
            "value": -1.41,
            "tag": "scoring volume + shot volume",
        },
        {
            "label": "Low-volume glass",
            "value": -0.74,
            "tag": "offensive glass, low shot volume",
        },
        {
            "label": "3PT volume, low impact",
            "value": 0.30,
            "tag": "n=125 · not significant",
        },
        {
            "label": "Playmakers",
            "value": -0.18,
            "tag": "playmaking + steals · n=588 · role grows",
        },
    ]
    return {
        "slug": "matchup-nightmares",
        "tldr": "Playoff game plans erase pure shooters — scoring, usage and efficiency "
        "all crater — while playmakers are the only ones whose role grows. You can "
        "scheme a jumper in two days; not a creator.",
        "kicker": "Matchup nightmares",
        "title": "May solves shooters. It can't solve playmakers.",
        "lede": "Playoff minus regular-season pts/100 by style archetype — 4,739 rotation "
        "player-seasons, 1996-97 → 2024-25. Pure 3-point specialists lose 2.3 pts/100 in "
        "May, with usage (-1.00) and true shooting (-0.039) falling too — worst of all "
        "eight archetypes. Playmakers are the only group whose role grows (usage +0.19), "
        "and 1 in 16 playoff teams is led in usage by a playmaker, up "
        "from 1 in 250 in the regular season. The pattern fits a game-planning story — a "
        "best-of-7 gives defenses time to scheme a jumper, not a creator — but that's the "
        "best-fit mechanism, not proven causation. Loudest single-postseason swings are "
        "small-sample color, but the 2026 Finals lived the pattern. The Knicks' "
        "title run rode its playmakers: Finals MVP Jalen Brunson averaged 32.6 "
        "points (45 in the closeout), and Jose Alvarado — just 4.2 points a night "
        "but a +18.9 on/off — sparked the 29-point Game 4 comeback with 8 "
        "fourth-quarter points. Spurs rookie creator Dylan Harper's role grew all "
        "series, up to 18.0 points per game off the bench from 11.8 in the regular "
        "season. At the other end, veteran shooter Harrison Barnes was squeezed out "
        "of the rotation in the Finals after 9.9 per game in the regular "
        "season. Even Victor Wembanyama's brilliant 26-a-night "
        "couldn't scheme-proof San Antonio alone.",
        "stat": "-2.3",
        "stat_label": "playoff pts/100 drop for pure 3-point specialists "
        "(usage and efficiency fall too)",
        "viz": "bars",
        "viz_label": "Playoff scoring change (pts/100) by style archetype",
        "rows": rows,
        "foot": "4,739 rotation player-seasons (playoff GP ≥ 4, regular season ≥ 25 scaled "
        "min/g); regular-season vs playoff splits via stats.nba.com; 2025-26 excluded "
        "(season in progress).",
        "og_title": "The playoffs eat shooters",
        "og_desc": "Pure 3-point specialists lose 2.3 pts/100 in May — playmakers are the "
        "only ones whose role grows.",
    }


# ---- OG images + stub pages ---------------------------------------------------

OG_W, OG_H = 1200, 630
VOID = (30, 32, 34)
INK = (249, 246, 240)
TERRA = (193, 124, 96)
GOLD = (212, 175, 105)
MUTED = (140, 135, 125)


def render_og_images(insights):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("PIL missing — skipping OG images")
        return
    import io

    outdirs = [
        os.path.join(PUBLIC, "assets", "og"),
        os.path.join(REPO, "assets", "og"),
    ]
    for d in outdirs:
        os.makedirs(d, exist_ok=True)
    fb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    fr = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    def font(path, size):
        return ImageFont.truetype(path, size)

    for ins in insights:
        img = Image.new("RGB", (OG_W, OG_H), VOID)
        dr = ImageDraw.Draw(img)
        # terracotta top rule
        dr.rectangle([0, 0, OG_W, 10], fill=TERRA)
        # kicker
        dr.text((70, 64), ins["kicker"].upper(), font=font(fb, 34), fill=TERRA)
        # big stat
        dr.text((66, 120), ins["stat"], font=font(fb, 150), fill=GOLD)
        dr.text((70, 300), ins["stat_label"][:72], font=font(fr, 30), fill=MUTED)
        # title (wrapped)
        words, lines, cur = ins["og_title"].split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if dr.textlength(t, font=font(fb, 54)) < OG_W - 140:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
        y = 380
        for ln in lines[:2]:
            dr.text((70, y), ln, font=font(fb, 54), fill=INK)
            y += 66
        # footer
        dr.text(
            (70, OG_H - 70),
            "VECTOR HOOPS  ·  embedding atlas",
            font=font(fb, 26),
            fill=MUTED,
        )
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        for d in outdirs:
            with open(os.path.join(d, "insight-%s.png" % ins["slug"]), "wb") as f:
                f.write(data)
    print("wrote %d OG images (+ root twins)" % len(insights))


STUB = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title} — Vector Hoops Insights</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Vector Hoops">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0; url={target}">
</head>
<body>
<p>{tldr}</p>
<p><a href="{target}">View this insight on Vector Hoops</a></p>
<script>location.replace({target_js});</script>
</body>
</html>
"""


def write_og_stubs(insights):
    dirs = [os.path.join(PUBLIC, "insights"), os.path.join(REPO, "insights")]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
    for ins in insights:
        slug = ins["slug"]
        url = "%s/insights/%s" % (DOMAIN, slug)
        target = "/insights.html#%s" % slug
        html = STUB.format(
            title=ins["og_title"].replace('"', "&quot;"),
            desc=ins["tldr"].replace('"', "&quot;"),
            tldr=ins["tldr"].replace("<", "&lt;").replace(">", "&gt;"),
            url=url,
            img="%s/assets/og/insight-%s.png" % (DOMAIN, slug),
            target=target,
            target_js=json.dumps(target),
        )
        for d in dirs:
            with open(os.path.join(d, slug + ".html"), "w", encoding="utf-8") as f:
                f.write(html)
    print("wrote %d OG stub pages (+ root twins)" % len(insights))


if __name__ == "__main__":
    main()
