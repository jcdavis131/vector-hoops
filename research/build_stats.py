#!/usr/bin/env python3
"""Build scratch-stats.json: per-season NBA stats for the same-team sacrifice analysis.

REAL DATA ONLY. Every number below was transcribed from a tool result observed
2026-10-01 (StatMuse season tables, BBRef leaders pages / search-index snippets,
poundingtherock.com advanced tables, dailymcplay.com, SpursTalk/BR/nbamaniacs for
a few Parker USG% approximations). Derived fields (ws from ws48, ages) are computed
here and flagged in the gaps array. See gaps for full provenance + conflicts.
"""
import json
from decimal import Decimal, ROUND_HALF_UP

def r1(x):
    return float(Decimal(str(x)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))

def r3(x):
    return float(Decimal(str(x)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP))

def age_feb1(season_label, birthdate):
    # BBRef Age = age on Feb 1 of the season's second calendar year
    y2 = int(season_label.split("-")[1])
    feb1_year = 2000 + y2 if y2 < 50 else 1900 + y2
    by, bm, bd = map(int, birthdate.split("-"))
    return feb1_year - by - (1 if (bm, bd) > (2, 1) else 0)

# (season, team, gp, mpg, ppg, usg, ws48, ws, min_exact)
# usg: BBRef-formula USG% (StatMuse matches BBRef). ws48: 3 decimals.
# ws: directly reported where known; else None -> derived as ws48*MIN/48.
# min_exact: exact total minutes from StatMuse where available; else None -> gp*mpg.
RAW = {
  "Dwyane Wade": dict(bbref=None, birth="1982-01-17", seasons=[
    ("2003-04","MIA",61,34.9,16.2,25.0,None,None,None),
    ("2004-05","MIA",77,38.6,24.1,30.8,None,None,None),
    ("2005-06","MIA",75,38.6,27.2,32.3,0.239,None,None),
    ("2006-07","MIA",51,37.9,27.4,34.5,0.219,None,None),
    ("2007-08","MIA",51,38.3,24.6,33.0,0.082,None,None),
    ("2008-09","MIA",79,38.6,30.2,36.1,0.232,14.7,None),
    ("2009-10","MIA",77,36.3,26.6,34.8,0.224,None,2792),
    ("2010-11","MIA",76,37.1,25.5,31.6,0.218,None,2823),
    ("2011-12","MIA",49,33.2,22.1,31.2,0.228,None,1625),
    ("2012-13","MIA",69,34.7,21.2,29.4,0.192,None,2391),
    ("2013-14","MIA",54,32.9,19.0,27.9,0.149,None,1775),
    ("2014-15","MIA",62,31.8,21.5,34.7,None,None,1971),
    ("2015-16","MIA",74,30.5,19.0,31.6,None,None,None),
    ("2016-17","CHI",60,29.9,18.3,29.6,None,None,None),
    ("2017-18","TOT",67,22.9,11.4,26.2,None,None,None),
    ("2018-19","MIA",72,26.2,15.0,27.9,None,None,None),
  ]),
  "Manu Ginobili": dict(bbref=None, birth="1977-07-28", seasons=[
    ("2002-03","SAS",69,20.7, 7.6,18.5,0.141, 4.2,1431),
    ("2003-04","SAS",77,29.4,12.8,22.1,0.194, 9.1,2260),
    ("2004-05","SAS",74,29.6,16.0,24.3,0.240,11.0,2193),
    ("2005-06","SAS",65,27.9,15.1,25.0,0.234, 8.8,1813),
    ("2006-07","SAS",75,27.5,16.5,27.1,0.246,10.6,2060),
    ("2007-08","SAS",74,31.1,19.5,28.7,0.232,11.1,2299),
    ("2008-09","SAS",44,26.8,15.5,27.2,0.203, 5.0,None),
    ("2009-10","SAS",75,28.7,16.5,25.8,0.216, 9.7,None),
    ("2010-11","SAS",80,30.3,17.4,26.0,0.195, 9.9,None),
    ("2011-12","SAS",34,23.3,12.9,22.7,0.257, 4.2,None),
    ("2012-13","SAS",60,23.2,11.8,24.6,-0.004,0.0,None),
    ("2013-14","SAS",68,22.8,12.3,None,None,None,None),
    ("2014-15","SAS",70,22.7,10.5,None,None,None,None),
    ("2015-16","SAS",58,19.6, 9.6,None,None,None,None),
    ("2016-17","SAS",69,18.7, 7.5,None,None,None,None),
    ("2017-18","SAS",65,20.0, 8.9,None,None,None,None),
  ]),
  "Klay Thompson": dict(bbref=None, birth="1990-02-08", seasons=[
    ("2011-12","GSW",66,24.4,12.5,24.8,0.051,1.7,1608),
    ("2012-13","GSW",82,35.8,16.6,21.9,0.070,4.3,2936),
    ("2013-14","GSW",81,35.4,18.4,22.7,0.112,6.7,2868),
    ("2014-15","GSW",77,31.9,21.7,27.7,0.191,None,2455),
    ("2015-16","GSW",80,33.3,22.1,26.4,0.144,8.0,2666),
    ("2016-17","GSW",78,34.0,22.3,26.1,0.129,7.1,2651),
    ("2017-18","GSW",73,34.3,20.0,23.8,0.094,4.9,None),
    ("2018-19","GSW",78,34.0,21.5,25.7,0.096,5.3,None),
    ("2021-22","GSW",32,29.4,20.4,29.7,0.092,1.8,None),
    ("2022-23","GSW",69,33.0,21.9,26.5,0.065,3.1,None),
    ("2023-24","GSW",77,29.7,17.9,24.2,None,None,None),
    ("2024-25","DAL",72,27.3,14.0,21.9,None,None,None),
    ("2025-26","DAL",69,21.7,11.7,22.8,0.019,None,None),
  ]),
  "Tim Duncan": dict(bbref="duncati01", birth="1976-04-25", seasons=[
    ("1997-98","SAS",82,39.1,21.1,26.0,0.192,None,3204),
    ("1998-99","SAS",50,39.3,21.7,27.2,0.214,None,1963),
    ("1999-00","SAS",74,38.9,23.2,28.6,0.218,None,2875),
    ("2000-01","SAS",82,38.7,22.2,28.6,0.200,None,3174),
    ("2001-02","SAS",82,40.6,25.5,28.9,0.257,None,3329),
    ("2002-03","SAS",81,39.3,23.3,27.9,0.248,None,3181),
    ("2003-04","SAS",69,36.6,22.3,29.5,0.249,None,2527),
    ("2004-05","SAS",66,33.4,20.3,28.8,0.245,None,2203),
    ("2005-06","SAS",80,34.8,18.6,27.6,0.187,None,2784),
    ("2006-07","SAS",80,34.1,20.0,27.8,0.230,None,2726),
    ("2007-08","SAS",78,34.0,19.3,28.1,0.201,None,2651),
    ("2008-09","SAS",75,33.7,19.3,28.3,0.191,None,2524),
    ("2009-10","SAS",78,31.3,17.9,26.0,0.215,None,2438),
    ("2010-11","SAS",76,28.4,13.4,22.9,None,None,2156),
    ("2011-12","SAS",58,28.2,15.4,26.2,None,None,1634),
    ("2012-13","SAS",69,30.1,17.8,27.7,0.191,None,2078),
    ("2013-14","SAS",74,29.2,15.1,25.1,None,None,2158),
    ("2014-15","SAS",77,28.9,13.9,22.1,0.207,None,2227),
    ("2015-16","SAS",61,25.2, 8.6,17.5,None,None,1536),
  ]),
  "Dirk Nowitzki": dict(bbref="nowitdi01", birth="1978-06-19", seasons=[
    ("1998-99","DAL",47,20.4, 8.2,22.3,None,None, 958),
    ("1999-00","DAL",82,35.8,17.5,21.2,None,None,2938),
    ("2000-01","DAL",82,38.1,21.8,23.7,0.224,None,3125),
    ("2001-02","DAL",76,38.0,23.4,25.4,0.222,None,2891),
    ("2002-03","DAL",80,39.0,25.1,27.3,0.249,None,3117),
    ("2003-04","DAL",77,37.9,21.8,24.4,None,None,2915),
    ("2004-05","DAL",78,38.7,26.1,28.5,0.248,None,3020),
    ("2005-06","DAL",81,38.1,26.6,30.0,0.275,None,3089),
    ("2006-07","DAL",78,36.2,24.6,28.8,0.278,None,2820),
    ("2007-08","DAL",77,36.0,23.6,28.8,0.223,None,2769),
    ("2008-09","DAL",81,37.7,25.9,30.2,None,None,3050),
    ("2009-10","DAL",81,37.5,25.0,28.7,0.194,None,3039),
    ("2010-11","DAL",73,34.3,23.0,28.2,0.213,None,2504),
    ("2011-12","DAL",62,33.5,21.6,29.1,None,None,2079),
    ("2012-13","DAL",53,31.3,17.3,24.2,None,None,1661),
    ("2013-14","DAL",80,32.9,21.7,26.8,0.199,None,2628),
    ("2014-15","DAL",77,29.6,17.3,24.8,None,None,2282),
    ("2015-16","DAL",75,31.5,18.3,25.5,None,None,2364),
    ("2016-17","DAL",54,26.4,14.2,25.8,None,None,1424),
    ("2017-18","DAL",77,24.7,12.0,20.5,None,None,1900),
    ("2018-19","DAL",51,15.6, 7.3,22.6,None,None, 795),
  ]),
  "Stephen Curry": dict(bbref=None, birth="1988-03-14", seasons=[
    ("2009-10","GSW",80,36.2,17.5,21.9,None,None,None),
    ("2010-11","GSW",74,33.6,18.6,24.5,None,None,None),
    ("2011-12","GSW",26,28.2,14.7,24.1,None,None,None),
    ("2012-13","GSW",78,38.2,22.9,26.4,None,None,None),
    ("2013-14","GSW",78,36.5,24.0,28.3,0.225,None,None),
    ("2014-15","GSW",80,32.7,23.8,28.9,0.288,None,None),
    ("2015-16","GSW",79,34.2,30.1,32.6,0.318,None,None),
    ("2016-17","GSW",79,33.4,25.3,30.1,0.229,None,None),
    ("2017-18","GSW",51,32.0,26.4,30.9,0.267,None,None),
    ("2018-19","GSW",69,33.8,27.3,30.4,None,None,None),
    ("2019-20","GSW", 5,27.8,20.8,33.6,None,None,None),
    ("2020-21","GSW",63,34.1,32.0,34.8,None,None,None),
    ("2021-22","GSW",64,34.5,25.5,30.8,None,None,None),
    ("2022-23","GSW",56,34.7,29.4,31.0,None,None,None),
    ("2023-24","GSW",74,32.7,26.4,31.3,None,None,None),
    ("2024-25","GSW",70,32.2,24.5,29.8,None,None,None),
    ("2025-26","GSW",43,30.9,26.6,32.5,None,None,1329),
  ]),
  "Tony Parker": dict(bbref="parketo01", birth="1982-05-17", seasons=[
    ("2001-02","SAS",77,29.4, 9.2,None,None,None,2267),
    ("2002-03","SAS",82,33.8,15.5,None,None,None,2774),
    ("2003-04","SAS",75,34.4,14.7,None,None,None,None),
    ("2004-05","SAS",80,34.2,16.6,None,None,None,None),
    ("2005-06","SAS",80,33.9,18.9,27.1,None,None,None),
    ("2006-07","SAS",77,32.5,18.6,None,None,None,None),
    ("2007-08","SAS",69,33.5,18.8,28.1,None,None,None),
    ("2008-09","SAS",72,34.1,22.0,31.7,None,None,None),
    ("2009-10","SAS",56,30.9,16.0,None,None,None,None),
    ("2010-11","SAS",78,32.4,17.5,None,None,None,None),
    ("2011-12","SAS",60,32.1,18.3,27.7,None,None,None),
    ("2012-13","SAS",66,32.9,20.3,None,0.206,None,None),
    ("2013-14","SAS",68,29.4,16.7,24.7,None,None,None),
    ("2014-15","SAS",68,28.7,14.4,24.8,None,None,None),
    ("2015-16","SAS",72,27.5,11.9,21.2,None,None,None),
    ("2016-17","SAS",63,25.2,10.1,None,None,None,None),
    ("2017-18","SAS",55,19.5, 7.7,None,None,None,None),
    ("2018-19","CHA",56,17.9, 9.5,None,None,None,None),
  ]),
}

out_players = []
for name, p in RAW.items():
    seasons = []
    for (season, team, gp, mpg, ppg, usg, ws48, ws, min_exact) in p["seasons"]:
        mins = min_exact if min_exact is not None else gp * mpg
        ws_out = ws
        ws_derived = False
        if ws_out is None and ws48 is not None:
            ws_out = r1(Decimal(str(ws48)) * Decimal(str(mins)) / Decimal(48))
            ws_derived = True
        seasons.append({
            "season": season,
            "age": age_feb1(season, p["birth"]),
            "team": team,
            "gp": gp,
            "mpg": r1(mpg),
            "usg": r1(usg) if usg is not None else None,
            "ws48": r3(ws48) if ws48 is not None else None,
            "ws": r1(ws_out) if ws_out is not None else None,
            "pts": r1(ppg),
            "_ws_derived": ws_derived,
        })
    # drop helper flag after counting
    n_derived = sum(1 for s in seasons if s.pop("_ws_derived"))
    out_players.append({"name": name, "bbref": p["bbref"], "seasons": seasons,
                        "n_seasons": len(seasons), "n_ws_derived": n_derived})

gaps = [
  "PROVENANCE: BBRef player pages do not render season tables via text fetch (bio/FAQ only). Per-game stats and USG% come from StatMuse season tables (same official box-score basis; StatMuse USG% matches the BBRef formula). WS/WS/48 come from BBRef advanced tables via search-index snippets, BBRef single-season leaders pages, and (Manu 02-03..12-13) poundingtherock.com advanced tables transcribed from BBRef.",
  "Duncan USG%: from a fresh StatMuse page read on 2026-10-01; differs 0.1-0.2 from an earlier search-snippet crawl (e.g. 03-04: 29.5 fresh vs 29.7 snippet) -- StatMuse data refresh suspected; fresh page values used.",
  "Manu 10-11 USG% conflict: 26.0 (PTR Nov-2012 table) vs 26.3 (PTR Feb-2011 article); 26.0 used (later, fuller table).",
  "Manu 13-14..17-18 USG% (BBRef formula) not found. Cleaning the Glass possession-usage (26.3/25.8/24.2/20.6/21.9) and ESPN Hollinger USG (24.2/23.5/23.2/20.4/21.5) use different formulas -- excluded.",
  "ESPN Hollinger USG column excluded throughout (different formula; e.g. Dirk 02-03: ESPN 25.1 vs BBRef/StatMuse 27.3).",
  "Parker USG%: directly measured (StatMuse) only for 05-06 (27.1), 07-08 (28.1), 08-09 (31.7), 11-12 (27.7). 13-14 (24.7) APPROXIMATE per Bleacher Report ('usage dipped from 27.7 to 24.7 in just two seasons'); 14-15 (24.8) APPROXIMATE per nbamaniacs ('losing 4 USG points' vs 15-16); 15-16 (21.2) per SpursTalk citing BBRef splits (full season). All other Parker seasons: USG% unknown.",
  "Klay 14-15 conflict: BBRef WS/48 .191 (11th in NBA) vs dailymcplay blog WS 8.8 (implies .172). BBRef used; WS derived as 9.8. Klay WS for other seasons per dailymcplay year-by-year table; WS/48 derived as WS*48/MIN.",
  "Wade 12-13 WS/48 .192 and 13-14 .149 per BBRef via Bleacher Report ('slipped .227->.192->.149'); 07-08 WS/48 .082 per BBRef (career worst).",
  "ws values flagged n_ws_derived were computed as WS = WS/48 x MIN/48 (definitionally exact). MIN is exact from StatMuse where available, else GP x MPG (MPG rounded to 1 decimal, small error).",
  "Wade 17-18 uses the TOT row (CLE+MIA): 67 GP, 22.9 MPG, 11.4 PPG, 26.2 USG%.",
  "Klay missed 19-20 and 20-21 entirely (injury); no rows included.",
  "Curry 25-26 (43 GP) and Klay 25-26 (69 GP) as returned by StatMuse on 2026-10-01.",
  "bbref slugs verified verbatim only for Duncan (duncati01), Nowitzki (nowitdi01), Parker (parketo01); others null (not verified, not guessed).",
  "Ages use the BBRef Feb-1 convention, computed from birthdates (Wade 1982-01-17, Ginobili 1977-07-28, Thompson 1990-02-08, Duncan 1976-04-25, Nowitzki 1978-06-19, Curry 1988-03-14, Parker 1982-05-17); cross-checked against StatMuse age-by-season for Parker, Dirk, Duncan.",
]

doc = {
    "players": out_players,
    "fetched_at": "2026-10-01",
    "gaps": gaps,
}

with open("/home/hatch/workspace/vector-hoops-identity/research/scratch-stats.json", "w") as f:
    json.dump(doc, f, indent=2)

total_rows = sum(p["n_seasons"] for p in out_players)
print("players:", len(out_players), "season rows:", total_rows)
for p in out_players:
    usg_n = sum(1 for s in p["seasons"] if s["usg"] is not None)
    ws48_n = sum(1 for s in p["seasons"] if s["ws48"] is not None)
    ws_n = sum(1 for s in p["seasons"] if s["ws"] is not None)
    print(f'{p["name"]}: seasons={p["n_seasons"]} usg={usg_n} ws48={ws48_n} ws={ws_n} ws_derived={p["n_ws_derived"]}')
