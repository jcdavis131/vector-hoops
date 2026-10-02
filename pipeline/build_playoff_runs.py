#!/usr/bin/env python3
"""Build the Greatest Playoff Runs rankings page data — TWO-WAY edition.

Method (2026-10-02): the ranking is now all-around (offense + defense + net
rating), per Cameron's verdict that the stat should be greatest all-around.
- Source: assets/playoffs.json (stats.nba.com RS vs playoff splits,
  5,950 player-season records, 1996-97 -> 2025-26) for offense/series data;
  data/playoff_defense_bref.json (Basketball-Reference, fetched 2026-10-02)
  for playoff OBPM/DBPM/BPM per player-season and official playoff team
  ORtg/DRtg/NRtg/W/L per season.
- Individuals: PO GP >= 10, across player-seasons with sourced defensive data.
  score = pts/100 + 10*(TS-0.55) + DBPM + 0.25*(team playoff net rating)
          + 2 per round won + 4 if champion.
  Calibration: a point of DBPM (points prevented per 100 possessions) moves
  the score exactly as much as a point of per-100 scoring — symmetric, no
  thumb on the scale; DBPM is zero-centered by construction so no era
  adjustment is needed. Team playoff net rating enters at quarter weight
  because it is shared across the whole roster: full weight would let team
  context swamp the individual signal. A +12 demolition (e.g. 2001 Lakers
  +13.7, 2017 Warriors +13.5) is worth about +3.4 — a real boost, never the
  whole story. A runtime bound check proves no player outside the sourced
  pool can reach the top 10 (old score + generous defensive/team maxima).
  One documented exclusion: Shaquille O'Neal's 1998 run — its DBPM could not
  be sourced from BRef and is not estimated (see research/two-way-playoff-runs.md).
- Units (duos/trios): same eligibility as before (RS GP >= 40, PO GP >= 12 so
  every unit won a series, PO usage >= 15), ordered by RS scoring rate.
  score = sum over members of (pts/100 + 10*(TS-0.55) + DBPM)
          + 0.25*(team playoff net rating) + 2 per round won + 4 if champion.
  Labeled "two-way cores", not lineups or starters: the dataset's MIN field
  is not conventional MPG (verified 2026-10-01) and rate stats alone admit
  garbage-time chuckers, so fives/starters are NOT ranked (we refuse to fake
  them). Units are ranked only where every member has sourced defensive
  data; skipped units that could reach the top 10 under verified bounds are
  reported (not estimated) — see the NOTE output and research/two-way-playoff-runs.md.
- Teams: grouped by (season, ordered playoff-opponent path); ranked by
  official BRef playoff net rating first, then wins. Only teams that won at
  least two series (>= 8 wins) qualify — a run has to go somewhere. Net
  rating first means some dominant non-champions outrank champions; that is
  the formula working as designed, not a bug.
- Every featured unit/team carries a hand-verified team name; the build
  hard-fails if any is missing.

Hard-block QA: population counts, bound checks, no duplicate names in a
unit, all unit members from the same team-season, mirrored root/public
outputs, valid JSON.
"""

import json
import os
import unicodedata
from collections import defaultdict

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


def norm(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode("ascii")
    return " ".join(n.lower().replace("'", "").replace(".", "").replace("-", "").split())


def poyr_of(season):
    return str(int(season.split("-")[0]) + 1)


def load(name):
    with open(os.path.join(REPO, "assets", name), encoding="utf-8") as f:
        return json.load(f)


def load_defense():
    with open(os.path.join(REPO, "data", "playoff_defense_bref.json"), encoding="utf-8") as f:
        return json.load(f)


def wl_str(series):
    w = sum(r["wins"] for r in series)
    losses = sum(r["losses"] for r in series)
    return "%d-%d" % (w, losses), w + losses


# BRef playoff "tm" abbrev -> franchise nickname (suffix of BRef full names)
ABBR_TO_NICK = {
    "CHI": "Bulls", "CLE": "Cavaliers", "BOS": "Celtics", "BRK": "Nets",
    "NJN": "Nets", "NYK": "Knicks", "PHI": "76ers", "TOR": "Raptors",
    "ATL": "Hawks", "CHH": "Hornets", "CHO": "Hornets", "CHA": "Bobcats",
    "NOH": "Hornets", "NOK": "Hornets", "NOP": "Pelicans", "MIA": "Heat",
    "ORL": "Magic", "WAS": "Wizards", "WSB": "Wizards", "DET": "Pistons",
    "IND": "Pacers", "MIL": "Bucks", "DAL": "Mavericks", "DEN": "Nuggets",
    "HOU": "Rockets", "MEM": "Grizzlies", "VAN": "Grizzlies",
    "MIN": "Timberwolves", "OKC": "Thunder", "SEA": "SuperSonics",
    "POR": "Trail Blazers", "SAC": "Kings", "SAS": "Spurs", "UTA": "Jazz",
    "GSW": "Warriors", "LAC": "Clippers", "LAL": "Lakers", "PHX": "Suns",
}

# Documented exclusion: real DBPM could not be sourced (never synthesized).
EXCLUDED = {("1998", "shaquille oneal")}


class Defense:
    def __init__(self, data):
        self.rows = {(str(r["poyr"]), norm(r["name"])): r for r in data["players"]}
        self.teams = data["teams"]

    def row(self, season, name):
        return self.rows.get((poyr_of(season), norm(name)))

    def team_full(self, poyr, abbr):
        nick = ABBR_TO_NICK.get(abbr)
        if not nick:
            return None
        for full in self.teams[str(poyr)]:
            if full.endswith(nick):
                return full
        return None

    def netrtg(self, season, name):
        r = self.row(season, name)
        if r is None:
            return None
        full = self.team_full(r["poyr"], r["tm"])
        if full is None:
            return None
        return self.teams[str(r["poyr"])][full]["netrtg"], full


def old_indiv_score(po, s):
    return po["PTS100"] + 10 * (po["TS"] - 0.55) + 2 * s["rounds"] + (4 if s.get("champion") else 0)


def compute():
    D = load("playoffs.json")["splits"]
    D2 = {k: s for k, s in D.items() if "series" in s}
    defense = Defense(load_defense())

    # ---- individuals ----
    indiv, skipped = [], 0
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        po = s["po"]
        if po["GP"] < 10:
            continue
        r = defense.row(season, name)
        if r is None:
            skipped += 1
            continue
        nt = defense.netrtg(season, name)
        assert nt is not None, "no team netrtg for %s %s" % (name, season)
        netrtg, team_full = nt
        # Two-way score: offense + defense + shared team dominance.
        score = (
            po["PTS100"]
            + 10 * (po["TS"] - 0.55)
            + r["dbpm"]
            + 0.25 * netrtg
            + 2 * s["rounds"]
            + (4 if s.get("champion") else 0)
        )
        wls, _ = wl_str(s["series"])
        indiv.append(
            {
                "player": pretty(name),
                "season": season,
                "team": team_full,
                "pts100": round(po["PTS100"], 1),
                "ts": round(po["TS"], 3),
                "dbpm": round(r["dbpm"], 1),
                "team_netrtg": round(netrtg, 1),
                "gp": po["GP"],
                "wl": wls,
                "rounds": s["rounds"],
                "champion": bool(s.get("champion")),
                "score": round(score, 2),
            }
        )
    indiv.sort(key=lambda r: -r["score"])
    # Bound check: no skipped player-season can reach the top 10 even with
    # generous defensive/team maxima (DBPM <= +6, team netrtg <= +16).
    if indiv:
        cut = indiv[9]["score"] if len(indiv) >= 10 else -1e9
        viol = []
        for key, s in D2.items():
            name, season = key.rsplit("|", 1)
            po = s["po"]
            if po["GP"] < 10 or defense.row(season, name) is not None:
                continue
            if (poyr_of(season), norm(name)) in EXCLUDED:
                continue
            if old_indiv_score(po, s) + 6 + 0.25 * 16 >= cut:
                viol.append((name, season))
        assert not viol, "bound check failed, players could reach top 10: %s" % viol
    print("individuals: %d ranked, %d skipped (no defensive data)" % (len(indiv), skipped))

    # ---- units ----
    byts = defaultdict(list)
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        if s["po"]["GP"] < 12 or s["rs"]["GP"] < 40 or (s["po"]["USG"] or 0) < 15:
            continue
        path = tuple(r["opp"] for r in s["series"])
        byts[(season, path)].append((name, s))

    duos, trios = [], []
    skipped_units = 0
    for (season, path), members in byts.items():
        members = sorted(members, key=lambda m: -(m[1]["rs"]["PTS100"] or 0))
        if len(members) < 3:
            continue
        top3 = members[:3]
        names3 = [m[0] for m in top3]
        assert len(set(names3)) == len(names3), "dup in %s %s" % (season, path)
        drows = [defense.row(season, m) for m in names3]
        if any(d is None for d in drows):
            skipped_units += 1
            continue
        # all members share a team-season
        tms = {d["tm"] for d in drows}
        assert len(tms) == 1, "unit spans teams: %s %s %s" % (season, names3, tms)
        nt = defense.netrtg(season, names3[0])
        assert nt is not None, "no team netrtg for unit %s %s" % (season, names3)
        netrtg, team_full = nt
        champ = any(m[1].get("champion") for m in top3)
        rounds = max(m[1]["rounds"] for m in top3)
        wls, gp = wl_str(top3[0][1]["series"])

        def row(ms):
            sc = (
                sum(
                    m[1]["po"]["PTS100"]
                    + 10 * (m[1]["po"]["TS"] - 0.55)
                    + defense.row(season, m[0])["dbpm"]
                    for m in ms
                )
                + 0.25 * netrtg
                + 2 * rounds
                + (4 if champ else 0)
            )
            return {
                "players": [pretty(m[0]) for m in ms],
                "season": season,
                "team": team_full,
                "path": "-".join(path),
                "wl": wls,
                "gp": gp,
                "pts100": round(sum(m[1]["po"]["PTS100"] for m in ms), 1),
                "dbpm_sum": round(sum(defense.row(season, m[0])["dbpm"] for m in ms), 1),
                "team_netrtg": round(netrtg, 1),
                "champion": champ,
                "score": round(sc, 2),
            }

        duos.append(row(top3[:2]))
        trios.append(row(top3[:3]))
    for b in (duos, trios):
        b.sort(key=lambda r: -r["score"])
    # Skipped-unit threat report: for every skipped unit, compute the score it
    # could reach if each missing member posted the verified BRef bound
    # (DBPM < 2.83 for player-seasons absent from the single-season playoff
    # top-250 leaders). Units that could reach the top 10 are listed, not
    # estimated — the exclusion is documented in the method string.
    # (Verified 2026-10-02; see research/two-way-playoff-runs.md.)
    VERIFIED_DBPM_BOUND = 2.83
    threats = []
    for bucket, n in ((duos, 2), (trios, 3)):
        cut = bucket[9]["score"] if len(bucket) >= 10 else -1e9
        for (season, path), members in byts.items():
            members = sorted(members, key=lambda m: -(m[1]["rs"]["PTS100"] or 0))
            if len(members) < 3:
                continue
            ms = members[:n]
            drows = [defense.row(season, m[0]) for m in ms]
            if all(d is not None for d in drows):
                continue
            if any((poyr_of(season), norm(m[0])) in EXCLUDED for m in ms):
                continue
            b = sum(old_indiv_score(m[1]["po"], m[1]) for m in ms)
            for m in ms:
                d = defense.row(season, m[0])
                b += d["dbpm"] if d else VERIFIED_DBPM_BOUND
            known = next((d for d in drows if d), None)
            if known:
                nt = defense.netrtg(season, ms[0][0])
                b += 0.25 * (nt[0] if nt else 0)
            else:
                b += 0.25 * 16
            if b >= cut:
                threats.append(
                    {"bucket": "duo" if n == 2 else "trio",
                     "season": season, "players": [m[0] for m in ms],
                     "upper_bound": round(b, 2),
                     "missing": [m[0] for m in ms if defense.row(season, m[0]) is None]})
    if threats:
        print("NOTE: %d skipped units could reach the top 10 (verified-bound upper shown); "
              "excluded per documented rule, not estimated:" % len(threats))
        for t in sorted(threats, key=lambda x: -x["upper_bound"])[:25]:
            print("   %s %s %s upper=%.1f missing=%s" % (
                t["bucket"], t["season"], t["players"], t["upper_bound"], t["missing"]))
    with open("/tmp/unit_threats.json", "w") as f:
        json.dump(threats, f, indent=1)
    print("units: %d duos, %d trios ranked; %d skipped (incomplete defensive data)" % (
        len(duos), len(trios), skipped_units))

    # ---- teams ----
    teams = {}
    for key, s in D2.items():
        name, season = key.rsplit("|", 1)
        path = tuple(r["opp"] for r in s["series"])
        gkey = (season, path)
        t = teams.setdefault(gkey, {"W": 0, "L": 0, "champ": False,
                                    "top": (0, ""), "members": []})
        for r in s["series"]:
            t["W"] += r["wins"]
            t["L"] += r["losses"]
        if s.get("champion"):
            t["champ"] = True
        if s["po"]["PTS100"] > t["top"][0] and s["po"]["GP"] >= 8:
            t["top"] = (round(s["po"]["PTS100"], 1), pretty(name))
        t["members"].append(name)
    team_rows = []
    for (season, path), t in teams.items():
        n = len(t["members"])
        W, L = round(t["W"] / n), round(t["L"] / n)
        if W < 8:
            continue  # a run has to go somewhere: >= 2 series won
        poyr = poyr_of(season)
        # franchise: prefer a member's sourced team abbrev, else (W,L) match
        fran = None
        for mname in t["members"]:
            d = defense.rows.get((poyr, norm(mname)))
            if d:
                fran = defense.team_full(poyr, d["tm"])
                break
        if fran is None:
            ovr = TEAM_OVERRIDES.get((season, "-".join(path)))
            if ovr:
                fran = ovr
            else:
                cands = [tm for tm, rr in defense.teams[poyr].items()
                         if rr["w"] == W and rr["l"] == L]
                assert len(cands) == 1, "ambiguous team for %s %s %d-%d: %s" % (
                    season, path, W, L, cands)
                fran = cands[0]
        rr = defense.teams[poyr][fran]
        assert (rr["w"], rr["l"]) == (W, L), "record mismatch %s %s" % (season, path)
        team_rows.append(
            {
                "season": season,
                "team": fran,
                "path": "-".join(path),
                "wl": "%d-%d" % (W, L),
                "winpct": round(W / (W + L), 3),
                "netrtg": round(rr["netrtg"], 1),
                "score": round(rr["netrtg"], 2),  # ranking value: net rating
                "champion": t["champ"],
                "top_scorer": t["top"][1],
                "top_pts100": t["top"][0],
            }
        )
    team_rows.sort(key=lambda r: (-r["netrtg"], -int(r["wl"].split("-")[0])))
    return {
        "individuals": indiv[:10],
        "duos": duos[:10],
        "trios": trios[:10],
        "teams": team_rows[:12],
    }


# Hand-verified override for the single ambiguous (season, path) -> franchise
# mapping in 30 postseasons: 2013-14 ATL-WAS-MIA 10-9 matches both Indiana
# (10-9) and Oklahoma City (10-9) on W-L alone; the path is unmistakably the
# Pacers (beat ATL in 7, WAS in 6, lost the ECF to MIA in 6).
TEAM_OVERRIDES = {
    ("2013-14", "ATL-WAS-MIA"): "Indiana Pacers",
}


# Hand-verified team names for every featured unit/team. Keys use SORTED
# player tuples, matching the QA lookup. Build hard-fails on any missing
# key — never ship an unnamed ranking. (Two-way edition: keys below were
# re-derived from the new rankings on 2026-10-02.)
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
    ("2020-21", ("Giannis Antetokounmpo", "Khris Middleton")): "Milwaukee Bucks",
    ("2025-26", ("Jalen Brunson", "Karl-Anthony Towns")): "New York Knicks",
    ("2004-05", ("Manu Ginobili", "Tim Duncan")): "San Antonio Spurs",
    # trios
    ("2025-26", ("Jalen Brunson", "Karl-Anthony Towns", "OG Anunoby")): "New York Knicks",
    ("2019-20", ("Anthony Davis", "Kyle Kuzma", "LeBron James")): "Los Angeles Lakers",
    ("2015-16", ("Kevin Love", "Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    ("2016-17", ("Kevin Durant", "Klay Thompson", "Stephen Curry")): "Golden State Warriors",
    ("2017-18", ("Kevin Durant", "Klay Thompson", "Stephen Curry")): "Golden State Warriors",
    ("2018-19", ("Kevin Durant", "Klay Thompson", "Stephen Curry")): "Golden State Warriors",
    ("2021-22", ("Jonathan Kuminga", "Jordan Poole", "Stephen Curry")): "Golden State Warriors",
    ("2011-12", ("Chris Bosh", "Dwyane Wade", "LeBron James")): "Miami Heat",
    ("2016-17", ("Kevin Love", "Kyrie Irving", "LeBron James")): "Cleveland Cavaliers",
    ("1997-98", ("Michael Jordan", "Scottie Pippen", "Toni Kukoc")): "Chicago Bulls",
    ("2022-23", ("Jamal Murray", "Michael Porter Jr.", "Nikola Jokić")): "Denver Nuggets",
    ("2020-21", ("Bobby Portis", "Giannis Antetokounmpo", "Khris Middleton")): "Milwaukee Bucks",
    # teams: (season, ordered opponent path) — net-rating era top runs
    ("2025-26", "ATL-PHI-CLE-SAS"): "New York Knicks",
    ("2000-01", "POR-SAC-SAS-PHI"): "Los Angeles Lakers",
    ("2016-17", "POR-UTA-SAS-CLE"): "Golden State Warriors",
    ("2017-18", "SAS-NOP-HOU-CLE"): "Golden State Warriors",
    ("2013-14", "DAL-POR-OKC-MIA"): "San Antonio Spurs",
    ("2008-09", "DET-ATL-ORL"): "Cleveland Cavaliers",
    ("2009-10", "CHA-ATL-BOS"): "Orlando Magic",
    ("2015-16", "DET-ATL-TOR-GSW"): "Cleveland Cavaliers",
    ("2008-09", "NOH-DAL-LAL"): "Denver Nuggets",
    ("2022-23", "MIN-PHX-LAL-MIA"): "Denver Nuggets",
    ("2023-24", "MIA-CLE-IND-DAL"): "Boston Celtics",
    ("2018-19", "DET-BOS-TOR"): "Milwaukee Bucks",
}


def attach_teams(data):
    def key(season, players):
        return (season, tuple(sorted(players)))

    for bucket in ("duos", "trios"):
        for row in data[bucket]:
            k = key(row["season"], row["players"])
            if k not in TEAM_NAMES:
                raise SystemExit("HARD-BLOCK: no team name for %s %s" % (bucket, k))
            assert row["team"] == TEAM_NAMES[k], "team mismatch %s" % (k,)
    for row in data["teams"]:
        k = (row["season"], row["path"])
        if k not in TEAM_NAMES:
            raise SystemExit("HARD-BLOCK: no team name for team %s" % (k,))
        assert row["team"] == TEAM_NAMES[k], "team mismatch %s" % (k,)
    return data


def write_outputs(data):
    payload = {
        "generated": "2026-10-02",
        "source": "assets/playoffs.json (stats.nba.com RS vs playoff splits, 1996-97 → 2025-26) "
                  "for offense/series data; data/playoff_defense_bref.json (Basketball-Reference, "
                  "fetched 2026-10-02) for playoff OBPM/DBPM/BPM and official playoff team ORtg/DRtg/NRtg",
        "method": {
            "individuals": "Two-way, all-around ranking (Cameron's verdict: greatest ALL-AROUND, not offense-only). "
                "PO GP>=10 across 113 player-seasons with sourced playoff defensive data "
                "(plus a runtime bound check proving no unsourced player-season can reach the top 10). "
                "score = pts/100 + 10*(TS-0.55) + DBPM + 0.25*(team playoff net rating) + 2 per round won + 4 if champion. "
                "Defense counts one-for-one: a point of DBPM (points prevented per 100 possessions) moves the score "
                "exactly as much as a point of per-100 scoring — symmetric, no thumb on the scale; DBPM is zero-centered "
                "by construction so no era adjustment is needed. Team playoff net rating enters at quarter weight because "
                "it is shared across the whole roster — full weight would let team context swamp the individual signal. "
                "Documented exclusion: Shaquille O'Neal's 1998 run (its DBPM could not be sourced; not estimated).",
            "units": "Two-way cores (not 'scoring cores'). Rotation players (RS GP>=40, PO GP>=12 so every unit won a series, "
                "PO usage>=15) ordered by RS scoring rate; score = sum over members of (pts/100 + 10*(TS-0.55) + DBPM) "
                "+ 0.25*(team playoff net rating) + 2 per round won + 4 if champion. "
                "Not lineups or starters: the dataset's MIN field is not conventional MPG. "
                "Ranked only where every member has sourced playoff DBPM — units with unsourced members are excluded, not estimated "
                "(this omits some iconic cores: 2002 Shaq/Kobe, 2008-09/2009-10 Kobe/Pau/Bynum, 2008 Celtics, 2013 Heat, "
                "1999/2003/2014 Spurs, 2004 Pistons — see research/two-way-playoff-runs.md for their verified score ranges; "
                "a live-browser read of BRef player pages would complete them).",
            "teams": "Grouped by (season, ordered playoff-opponent path); ranked by official Basketball-Reference playoff "
                "net rating first, then wins. Only teams that won at least two series (>=8 wins) qualify — a run has to go "
                "somewhere. Net rating first means some dominant non-champions outrank champions; that is the formula working "
                "as designed.",
        },
        "rankings": data,
    }
    text = json.dumps(payload, indent=1, ensure_ascii=False)
    for base in (REPO, PUBLIC):
        p = os.path.join(base, "assets", "playoff-runs.json")
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
    print("wrote assets/playoff-runs.json (+ public mirror)")


def main():
    data = compute()
    assert len(data["individuals"]) == 10, data["individuals"]
    assert len(data["duos"]) == 10
    assert len(data["trios"]) == 10
    assert len(data["teams"]) == 12
    for bucket, n in (("duos", 2), ("trios", 3)):
        for row in data[bucket]:
            assert len(row["players"]) == n, row
            assert len(set(row["players"])) == n, "dup in %s" % row
    for row in data["individuals"] + data["duos"] + data["trios"] + data["teams"]:
        assert isinstance(row["score"], (int, float)), row
    for bucket in ("individuals", "duos", "trios", "teams"):
        sc = [r["score"] for r in data[bucket]]
        assert sc == sorted(sc, reverse=True), "not sorted desc: %s" % bucket
    data = attach_teams(data)
    write_outputs(data)
    print("top individual:", data["individuals"][0]["player"], data["individuals"][0]["season"],
          data["individuals"][0]["score"])
    print("top duo:", data["duos"][0]["players"], data["duos"][0]["season"], data["duos"][0]["score"])
    print("top trio:", data["trios"][0]["players"], data["trios"][0]["season"], data["trios"][0]["score"])
    print("top team:", data["teams"][0]["team"], data["teams"][0]["season"], data["teams"][0]["wl"],
          data["teams"][0]["netrtg"])


if __name__ == "__main__":
    main()
