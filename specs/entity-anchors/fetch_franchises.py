#!/usr/bin/env python3
"""v2 franchises, take 2: curated current-team lists (US) + active-membership
SPARQL (soccer: P118 with start but no end). Writes v2/franchises.jsonl
"""

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

EA = Path("~/workspace/vector-hoops/specs/entity-anchors/v2").expanduser()
Path(EA).mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "ScoutAtlas/1.0 (research)"}

NFL = [
    "Arizona Cardinals",
    "Atlanta Falcons",
    "Baltimore Ravens",
    "Buffalo Bills",
    "Carolina Panthers",
    "Chicago Bears",
    "Cincinnati Bengals",
    "Cleveland Browns",
    "Dallas Cowboys",
    "Denver Broncos",
    "Detroit Lions",
    "Green Bay Packers",
    "Houston Texans",
    "Indianapolis Colts",
    "Jacksonville Jaguars",
    "Kansas City Chiefs",
    "Las Vegas Raiders",
    "Los Angeles Chargers",
    "Los Angeles Rams",
    "Miami Dolphins",
    "Minnesota Vikings",
    "New England Patriots",
    "New Orleans Saints",
    "New York Giants",
    "New York Jets",
    "Philadelphia Eagles",
    "Pittsburgh Steelers",
    "San Francisco 49ers",
    "Seattle Seahawks",
    "Tampa Bay Buccaneers",
    "Tennessee Titans",
    "Washington Commanders",
]
MLB = [
    "Arizona Diamondbacks",
    "Athletics",
    "Atlanta Braves",
    "Baltimore Orioles",
    "Boston Red Sox",
    "Chicago Cubs",
    "Chicago White Sox",
    "Cincinnati Reds",
    "Cleveland Guardians",
    "Colorado Rockies",
    "Detroit Tigers",
    "Houston Astros",
    "Kansas City Royals",
    "Los Angeles Angels",
    "Los Angeles Dodgers",
    "Miami Marlins",
    "Milwaukee Brewers",
    "Minnesota Twins",
    "New York Mets",
    "New York Yankees",
    "Philadelphia Phillies",
    "Pittsburgh Pirates",
    "San Diego Padres",
    "San Francisco Giants",
    "Seattle Mariners",
    "St. Louis Cardinals",
    "Tampa Bay Rays",
    "Texas Rangers",
    "Toronto Blue Jays",
    "Washington Nationals",
]
NHL = [
    "Anaheim Ducks",
    "Boston Bruins",
    "Buffalo Sabres",
    "Calgary Flames",
    "Carolina Hurricanes",
    "Chicago Blackhawks",
    "Colorado Avalanche",
    "Columbus Blue Jackets",
    "Dallas Stars",
    "Detroit Red Wings",
    "Edmonton Oilers",
    "Florida Panthers",
    "Los Angeles Kings",
    "Minnesota Wild",
    "Montreal Canadiens",
    "Nashville Predators",
    "New Jersey Devils",
    "New York Islanders",
    "New York Rangers",
    "Ottawa Senators",
    "Philadelphia Flyers",
    "Pittsburgh Penguins",
    "San Jose Sharks",
    "Seattle Kraken",
    "St. Louis Blues",
    "Tampa Bay Lightning",
    "Toronto Maple Leafs",
    "Utah Mammoth",
    "Vancouver Canucks",
    "Vegas Golden Knights",
    "Washington Capitals",
    "Winnipeg Jets",
]
MLS = [
    "Atlanta United",
    "Austin FC",
    "Charlotte FC",
    "Chicago Fire",
    "FC Cincinnati",
    "Colorado Rapids",
    "Columbus Crew",
    "D.C. United",
    "FC Dallas",
    "Houston Dynamo",
    "Sporting Kansas City",
    "LA Galaxy",
    "LAFC",
    "Inter Miami",
    "Minnesota United",
    "CF Montréal",
    "Nashville SC",
    "New England Revolution",
    "New York City FC",
    "New York Red Bulls",
    "Orlando City",
    "Philadelphia Union",
    "Portland Timbers",
    "Real Salt Lake",
    "San Diego FC",
    "San Jose Earthquakes",
    "Seattle Sounders",
    "St. Louis City SC",
    "Toronto FC",
    "Vancouver Whitecaps",
]
WNBA = [
    "Atlanta Dream",
    "Chicago Sky",
    "Connecticut Sun",
    "Dallas Wings",
    "Golden State Valkyries",
    "Indiana Fever",
    "Las Vegas Aces",
    "Los Angeles Sparks",
    "Minnesota Lynx",
    "New York Liberty",
    "Phoenix Mercury",
    "Seattle Storm",
    "Washington Mystics",
]
CURATED = {"NFL": NFL, "MLB": MLB, "NHL": NHL, "MLS": MLS, "WNBA": WNBA}

SOCCER = {"EPL": "Q9448", "LaLiga": "Q32454", "Bundesliga": "Q82595", "SerieA": "Q397", "Ligue1": "Q13394"}


def api(params):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)
    for a in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception:
            time.sleep(3 * (a + 1))
    return None


def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    for a in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
        except Exception:
            time.sleep(5 * (a + 1))
    return None


def slug(n):
    s = unicodedata.normalize("NFKD", n)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def entity_details(qid):
    r = api({"action": "wbgetentities", "ids": qid, "props": "claims|labels", "languages": "en", "format": "json"})
    if not r or "entities" not in r:
        return None
    e = r["entities"][qid]

    def claim(prop):
        for c in e.get("claims", {}).get(prop, []):
            try:
                return c["mainsnak"]["datavalue"]["value"]
            except KeyError:
                pass
        return None

    inc = claim("P571")
    hq = claim("P159")
    hq_name = None
    if isinstance(hq, dict):
        rr = api({"action": "wbgetentities", "ids": hq["id"], "props": "labels", "languages": "en", "format": "json"})
        try:
            hq_name = rr["entities"][hq["id"]]["labels"]["en"]["value"]
        except Exception:
            pass
    return inc, hq_name


def record(name, league, qid, inc, hq_name):
    f = inc["time"][1:11] if isinstance(inc, dict) else None
    prec = "unknown" if not f else ("year" if f[5:] == "01-01" else "day")
    if prec == "year":
        f = f[:4]
    return {
        "entity_id": f"sports:franchise:{slug(name)}",
        "entity_type": "franchise",
        "name": name,
        "league": league,
        "time_anchor": {"date": f, "precision": prec},
        "place_anchor": {
            "name": hq_name,
            "region": None,
            "country": None,
            "lat": None,
            "lon": None,
            "precision": "city" if hq_name else "unknown",
        },
        "provenance": {"source": "wikidata:" + qid, "retrieved": "2026-10-19", "method": "curated+wbgetentities"},
        "confidence": "high" if f and hq_name else "medium",
    }


out, seen = [], set()
CKPT = Path(EA) / "ckpt_franchises.json"
if Path(CKPT).exists():
    ck = json.load(Path(CKPT).open())
    seen = set(ck.get("qids", []))
    if (Path(EA) / "franchises.jsonl").exists():
        # only reuse if it's the new-format file (not the 13k-row buggy one)
        n_old = sum(1 for _ in open(Path(EA) / "franchises.jsonl"))
        if n_old < 2000:
            out = [json.loads(line) for line in open(Path(EA) / "franchises.jsonl")]


def save():
    with open(Path(EA) / "franchises.jsonl", "w") as fh:
        for r in out:
            fh.write(json.dumps(r) + "\n")
    json.dump({"qids": sorted(seen)}, Path(CKPT).open("w"))


# curated US leagues
for league, teams in CURATED.items():
    n = 0
    for name in teams:
        r = api({"action": "wbsearchentities", "search": name, "language": "en", "format": "json", "limit": 5})
        if not r:
            continue
        # prefer exact-ish label match
        best = None
        for e in r["search"]:
            if e.get("label", "").lower() == name.lower():
                best = e
                break
        best = best or r["search"][0]
        qid = best["id"]
        if qid in seen:
            continue
        seen.add(qid)
        det = entity_details(qid)
        if not det:
            continue
        out.append(record(best.get("label", name), league, qid, det[0], det[1]))
        n += 1
        time.sleep(0.4)
    save()
    print(f"{league}: {n}/{len(teams)}", flush=True)

# soccer: active membership (P118 with no end date)
for league, qid in SOCCER.items():
    q = (
        """SELECT DISTINCT ?team ?teamLabel WHERE {
      ?team p:P118 ?st. ?st ps:P118 wd:%s.
      FILTER NOT EXISTS { ?st pq:P582 ?end. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }"""
        % qid
    )
    r = sparql(q)
    if not r:
        print(f"{league}: query failed", flush=True)
        continue
    n = 0
    for b in r["results"]["bindings"]:
        tqid = b["team"]["value"].rsplit("/", 1)[-1]
        if tqid in seen:
            continue
        seen.add(tqid)
        det = entity_details(tqid)
        if not det:
            continue
        out.append(record(b["teamLabel"]["value"], league, tqid, det[0], det[1]))
        n += 1
        time.sleep(0.4)
    save()
    print(f"{league}: {n} active", flush=True)

save()
print(f"TOTAL: {len(out)} franchises", flush=True)
