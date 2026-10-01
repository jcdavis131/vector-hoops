#!/usr/bin/env python3
"""Build the Greatest Playoff Runs rankings page data.

Method (2026-10-01, final):
- Source: assets/playoffs.json (regular-season vs playoff per-100 splits,
  stats.nba.com), 5,950 player-season records, 1996-97 -> 2025-26.
- Individuals: PO GP >= 10.
  score = pts/100 + 10*(TS-0.55) + 2 per round won + 4 if champion.
  Per-possession dominance first; winning matters but never swamps scoring.
- Units (duos/trios): for each team-season, eligible = RS GP >= 40,
  PO GP >= 12 (every unit here won at least a playoff series), PO USG >= 15,
  ordered by RS scoring rate (pts/100). No duplicate names; same team-season.
  score = (sum PO pts/100 + sum PO TS) + 2 per round won + 4 if champion.
  Labeled "highest-scoring duo/trio" — scoring cores, not lineups or starters:
  the dataset's MIN field is not conventional MPG (verified 2026-10-01) and
  rate stats alone admit garbage-time chuckers, so fives/starters are NOT
  ranked (we refuse to fake them).
- Teams: grouped by (season, ordered playoff-opponent path); W-L from the
  series records; ranked by (win%, wins, top-scorer pts/100).
- Every featured unit carries a hand-verified team name; the build
  hard-fails if any is missing.

Hard-block QA: population counts, no duplicate names in a unit, all unit
members from the same team-season, mirrored root/public outputs, valid JSON.
"""

import json
import os
from collections import defaultdict, Counter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(REPO, "public")
DOMAIN = "https://hoops.dumbmodel.com"

NAME_FIXES = {
    "Shai GilgeousAlexander": "Shai Gilgeous-Alexander",
    "KarlAnthony Towns": "Karl-Anthony Towns",
    "Michael CarterWilliams": "Michael Carter-Williams",
    "Shaquille ONeal": "Shaquille O'Neal",
    "Jermaine ONeal": "Jermaine O'Neal",
    "Royce ONeale": "Royce O'Neale",
    "Nikola Jokic": "Nikola Jokić",
    "Luka Doncic": "Luka Dončić",
}


def pretty(n):
    return NAME_FIXES.get(n, n)


def load(name):
    with open(os.path.join(REPO, "assets", name), encoding="utf-8") as f:
        return json.load(f)


def wl_str(series):
    w = sum(r["wins"] for r in series)
    losses = sum(r["losses"] for r in series)
    return "%d-%d" % (w, losses), w + losses


def compute():
    D = load("playoffs.json")["splits"]
    D2 = {k: s for k, s in D.items() if "series" in s}

    # ---- individuals ----
    indiv = []
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        po = s["po"]
        if po["GP"] < 10:
            continue
        # Per-possession dominance first; each round won and the title add
        # flat bonuses — winning matters, but never swamps the scoring signal.
        score = (
            po["PTS100"]
            + 10 * (po["TS"] - 0.55)
            + 2 * s["rounds"]
            + (4 if s.get("champion") else 0)
        )
        wls, _ = wl_str(s["series"])
        indiv.append(
            {
                "player": pretty(name),
                "season": season,
                "pts100": round(po["PTS100"], 1),
                "ts": round(po["TS"], 3),
                "gp": po["GP"],
                "wl": wls,
                "rounds": s["rounds"],
                "champion": bool(s.get("champion")),
                "score": round(score, 2),
            }
        )
    indiv.sort(key=lambda r: -r["score"])

    # ---- units ----
    # Eligibility: rotation players (RS GP >= 40, PO GP >= 12 — every unit
    # here won at least a playoff series — real playoff role via PO USG >= 15),
    # ordered by RS scoring rate. The dataset's MIN field is not conventional
    # MPG (verified 2026-10-01) and raw USG admits garbage-time chuckers, so
    # these are explicitly "highest-scoring" units — scoring cores, not
    # lineups or starters.
    byts = defaultdict(list)
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        if s["po"]["GP"] < 12 or s["rs"]["GP"] < 40 or (s["po"]["USG"] or 0) < 15:
            continue
        path = tuple(r["opp"] for r in s["series"])
        byts[(season, path)].append((name, s))

    def unit_score(members, champ, rounds):
        pts = sum(m[1]["po"]["PTS100"] for m in members)
        ts = sum(m[1]["po"]["TS"] for m in members)
        return (pts + ts) + 2 * rounds + (4 if champ else 0), pts

    duos, trios = [], []
    for (season, path), members in byts.items():
        members = sorted(members, key=lambda m: -(m[1]["rs"]["PTS100"] or 0))
        if len(members) < 3:
            continue
        top3 = members[:3]
        names3 = [m[0] for m in top3]
        assert len(set(names3)) == len(names3), "dup in %s %s" % (season, path)
        champ = any(m[1].get("champion") for m in top3)
        rounds = max(m[1]["rounds"] for m in top3)
        wls, gp = wl_str(top3[0][1]["series"])

        def row(ms):
            sc, pts = unit_score(ms, champ, rounds)
            return {
                "players": [pretty(m[0]) for m in ms],
                "season": season,
                "path": "-".join(path),
                "wl": wls,
                "gp": gp,
                "pts100": round(pts, 1),
                "champion": champ,
                "score": round(sc, 2),
            }

        duos.append(row(top3[:2]))
        trios.append(row(top3[:3]))
    for b in (duos, trios):
        b.sort(key=lambda r: -r["score"])

    # ---- teams ----
    teams, cnt = {}, Counter()
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        path = tuple(r["opp"] for r in s["series"])
        gkey = (season, path)
        cnt[gkey] += 1
        t = teams.setdefault(gkey, {"W": 0, "L": 0, "champ": False, "top": (0, "")})
        for r in s["series"]:
            t["W"] += r["wins"]
            t["L"] += r["losses"]
        if s.get("champion"):
            t["champ"] = True
        if s["po"]["PTS100"] > t["top"][0] and s["po"]["GP"] >= 8:
            t["top"] = (round(s["po"]["PTS100"], 1), pretty(name))
    team_rows = []
    for (season, path), t in teams.items():
        n = cnt[(season, path)]
        W, L = round(t["W"] / n), round(t["L"] / n)
        team_rows.append(
            {
                "season": season,
                "path": "-".join(path),
                "wl": "%d-%d" % (W, L),
                "winpct": round(W / (W + L), 3),
                "champion": t["champ"],
                "top_scorer": t["top"][1],
                "top_pts100": t["top"][0],
            }
        )
    team_rows.sort(
        key=lambda r: (-r["winpct"], -int(r["wl"].split("-")[0]), -r["top_pts100"])
    )
    return {
        "individuals": indiv[:10],
        "duos": duos[:10],
        "trios": trios[:10],
        "teams": team_rows[:12],
    }


# Hand-verified team names for every featured unit. Keys use SORTED player
# tuples, matching the QA lookup. Build hard-fails on any missing key —
# never ship an unnamed ranking.
TEAM_NAMES = {
    # duos
    ("2016-17", ("Kevin Durant", "Stephen Curry")): "Golden State Warriors",
    ("2019-20", ("Anthony Davis", "LeBron James")): "Los Angeles Lakers",
    ("2018-19", ("Kevin Durant", "Stephen Curry")): "Golden State Warriors",
    ("2015-16", ("Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    ("2022-23", ("Jamal Murray", "Nikola Jokić")): "Denver Nuggets",
    ("2017-18", ("Kevin Durant", "Stephen Curry")): "Golden State Warriors",
    ("2011-12", ("Dwyane Wade", "LeBron James")): "Miami Heat",
    ("2016-17", ("Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    ("2024-25", ("Jalen Williams", "Shai Gilgeous-Alexander")): "Oklahoma City Thunder",
    ("2021-22", ("Jalen Brunson", "Luka Dončić")): "Dallas Mavericks",
    # trios
    (
        "2018-19",
        ("Kevin Durant", "Klay Thompson", "Stephen Curry"),
    ): "Golden State Warriors",
    (
        "2017-18",
        ("Kevin Durant", "Klay Thompson", "Stephen Curry"),
    ): "Golden State Warriors",
    ("2015-16", ("Kevin Love", "Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    (
        "2021-22",
        ("Jonathan Kuminga", "Jordan Poole", "Stephen Curry"),
    ): "Golden State Warriors",
    (
        "2016-17",
        ("Kevin Durant", "Klay Thompson", "Stephen Curry"),
    ): "Golden State Warriors",
    ("2019-20", ("Anthony Davis", "Kyle Kuzma", "LeBron James")): "Los Angeles Lakers",
    ("2016-17", ("Kevin Love", "Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    (
        "2015-16",
        ("Klay Thompson", "Marreese Speights", "Stephen Curry"),
    ): "Golden State Warriors",
    (
        "2021-22",
        ("Jalen Brunson", "Luka Dončić", "Spencer Dinwiddie"),
    ): "Dallas Mavericks",
    ("2011-12", ("Chris Bosh", "Dwyane Wade", "LeBron James")): "Miami Heat",
    # teams: (season, ordered opponent path)
    ("2016-17", "POR-UTA-SAS-CLE"): "Golden State Warriors",
    ("2000-01", "POR-SAC-SAS-PHI"): "Los Angeles Lakers",
    ("1998-99", "MIN-LAL-POR-NYK"): "San Antonio Spurs",
    ("2025-26", "ATL-PHI-CLE-SAS"): "New York Knicks",
    ("2023-24", "MIA-CLE-IND-DAL"): "Boston Celtics",
    ("2022-23", "MIN-PHX-LAL-MIA"): "Denver Nuggets",
    ("2006-07", "DEN-PHX-UTA-CLE"): "San Antonio Spurs",
    ("1996-97", "WAS-ATL-MIA-UTA"): "Chicago Bulls",
    ("2001-02", "POR-SAS-SAC-NJN"): "Los Angeles Lakers",
    ("2010-11", "POR-LAL-OKC-MIA"): "Dallas Mavericks",
    ("2019-20", "POR-HOU-DEN-MIA"): "Los Angeles Lakers",
    ("2017-18", "SAS-NOP-HOU-CLE"): "Golden State Warriors",
}


def attach_teams(data):
    def key(season, players):
        return (season, tuple(sorted(players)))

    for bucket in ("duos", "trios"):
        for row in data[bucket]:
            k = key(row["season"], row["players"])
            if k not in TEAM_NAMES:
                raise SystemExit("HARD-BLOCK: no team name for %s %s" % (bucket, k))
            row["team"] = TEAM_NAMES[k]
    for row in data["teams"]:
        k = (row["season"], row["path"])
        if k not in TEAM_NAMES:
            raise SystemExit("HARD-BLOCK: no team name for team %s" % (k,))
        row["team"] = TEAM_NAMES[k]
    return data


def write_outputs(data):
    payload = {
        "generated": "2026-10-01",
        "source": "assets/playoffs.json (stats.nba.com RS vs playoff splits, 1996-97 → 2025-26)",
        "method": {
            "individuals": "PO GP>=10; score = pts/100 + 10*(TS-0.55) + 2 per round won + 4 if champion",
            "units": "rotation players (RS GP>=40, PO GP>=12 so every unit won a series, PO usage>=15) "
            "ordered by RS scoring rate; "
            "score = (sum pts/100 + sum TS) + 2 per round won + 4 if champion; "
            "labeled highest-scoring duo/trio — scoring cores, not lineups "
            "(the dataset's MIN field is not conventional MPG)",
            "teams": "grouped by (season, ordered playoff-opponent path); ranked by win%, then wins, then top-scorer pts/100",
        },
        "rankings": data,
    }
    text = json.dumps(payload, indent=1, ensure_ascii=False)
    for base in (REPO, PUBLIC):
        p = os.path.join(base, "assets", "playoff-runs.json")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
    print("wrote assets/playoff-runs.json (+ public mirror)")


def render_og():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("PIL missing — skipping runs OG image")
        return
    W, H = 1200, 630
    VOID, TERRA, GOLD, INK, MUTED = (
        "#1E2022",
        "#C17C60",
        "#D4AF69",
        "#2A2A2A",
        "#8a8272",
    )
    fb = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    fr = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    img = Image.new("RGB", (W, H), VOID)
    dr = ImageDraw.Draw(img)
    dr.rectangle([0, 0, W, 10], fill=TERRA)
    dr.text(
        (70, 64), "GREATEST PLAYOFF RUNS", font=ImageFont.truetype(fb, 34), fill=TERRA
    )
    dr.text((66, 120), "Top 10", font=ImageFont.truetype(fb, 150), fill=GOLD)
    dr.text(
        (70, 300),
        "individuals · duos · trios · teams".ljust(72),
        font=ImageFont.truetype(fr, 30),
        fill=MUTED,
    )
    for i, ln in enumerate(["Every great May, ranked."]):
        dr.text((70, 380 + i * 66), ln, font=ImageFont.truetype(fb, 54), fill=INK)
    dr.text(
        (70, H - 70),
        "VECTOR HOOPS  ·  embedding atlas",
        font=ImageFont.truetype(fb, 26),
        fill=MUTED,
    )
    for d in (os.path.join(PUBLIC, "assets", "og"), os.path.join(REPO, "assets", "og")):
        os.makedirs(d, exist_ok=True)
        img.save(os.path.join(d, "playoff-runs.png"), format="PNG")
    print("wrote OG image playoff-runs.png (+ root twin)")


STUB = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Greatest Playoff Runs — Vector Hoops</title>
<meta name="description" content="Every great May, ranked: the ten greatest individual playoff runs, duos, trios and team runs of the last 30 years.">
<link rel="canonical" href="https://hoops.dumbmodel.com/playoff-runs">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Vector Hoops">
<meta property="og:title" content="Greatest Playoff Runs">
<meta property="og:description" content="Every great May, ranked: the ten greatest individual playoff runs, duos, trios and team runs of the last 30 years.">
<meta property="og:url" content="https://hoops.dumbmodel.com/playoff-runs">
<meta property="og:image" content="https://hoops.dumbmodel.com/assets/og/playoff-runs.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Greatest Playoff Runs">
<meta name="twitter:description" content="Every great May, ranked: the ten greatest individual playoff runs, duos, trios and team runs of the last 30 years.">
<meta property="og:image" content="https://hoops.dumbmodel.com/assets/og/playoff-runs.png">
<meta http-equiv="refresh" content="0; url=/playoff-runs.html">
</head>
<body>
<p>Every great May, ranked: the ten greatest individual playoff runs, duos, trios and team runs of the last 30 years.</p>
<p><a href="/playoff-runs.html">View the rankings on Vector Hoops</a></p>
<script>location.replace("/playoff-runs.html");</script>
</body>
</html>
"""


def write_stub():
    for d in (os.path.join(PUBLIC, "playoff-runs"), os.path.join(REPO, "playoff-runs")):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(STUB)
    print("wrote playoff-runs stub pages (+ root twin)")


def main():
    data = compute()
    # QA: population + shape
    assert len(data["individuals"]) == 10, data["individuals"]
    assert len(data["duos"]) == 10
    assert len(data["trios"]) == 10
    assert len(data["teams"]) == 12
    for bucket, n in (("duos", 2), ("trios", 3)):
        for row in data[bucket]:
            assert len(row["players"]) == n, row
            assert len(set(row["players"])) == n, "dup in %s" % row
    data = attach_teams(data)
    write_outputs(data)
    render_og()
    write_stub()
    print(
        "top individual:",
        data["individuals"][0]["player"],
        data["individuals"][0]["season"],
    )
    print(
        "top team:",
        data["teams"][0]["team"],
        data["teams"][0]["season"],
        data["teams"][0]["wl"],
    )


if __name__ == "__main__":
    main()
