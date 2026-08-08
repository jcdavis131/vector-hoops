#!/usr/bin/env python3
"""
Build front office evaluations for vector hoops.

Three pillars:
  1. Draft Smarts — surplus vs expected pick value (career total_min)
  2. Cap Efficiency — wins per million payroll vs league
  3. Foresight — retained bargain deals where performance > salary and salary growth < cap growth

Outputs:
  assets/data/front_office.json
  assets/front_office.json (copy for backwards compat)

Zero-deps, stdlib only. Recomputable from:
  - pipeline/cache/draft_history.json
  - assets/vectors.json
  - pipeline/cache/salaries_merged.json
  - pipeline/cache/team_base_*.json
  - assets/teams.json
"""
from __future__ import annotations
import json, math, time, pathlib, collections, re
from datetime import datetime

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / "cache"
ASSETS = ROOT / "assets"
VECTORS = ASSETS / "vectors.json"
DRAFT = CACHE / "draft_history.json"
SALARIES = CACHE / "salaries_merged.json"
TEAMS_DEF = ASSETS / "teams.json"

# Cap history (copied from nba_salary_cap.py to avoid import dep issues)
CAP_BY_SEASON = {
    "1996-97": 24_363_000, "1997-98": 26_900_000, "1998-99": 30_000_000,
    "1999-00": 34_000_000, "2000-01": 35_500_000, "2001-02": 42_500_000,
    "2002-03": 43_840_000, "2003-04": 43_840_000, "2004-05": 43_870_000,
    "2005-06": 49_500_000, "2006-07": 53_135_000, "2007-08": 55_827_000,
    "2008-09": 58_680_000, "2009-10": 57_700_000, "2010-11": 58_044_000,
    "2011-12": 58_044_000, "2012-13": 58_680_000, "2013-14": 58_680_000,
    "2014-15": 63_065_000, "2015-16": 70_000_000, "2016-17": 94_143_000,
    "2017-18": 99_093_000, "2018-19": 101_869_000, "2019-20": 109_140_000,
    "2020-21": 109_140_000, "2021-22": 112_414_000, "2022-23": 123_655_000,
    "2023-24": 136_021_000, "2024-25": 140_588_000, "2025-26": 154_647_000,
}

def norm_name(n: str) -> str:
    s = n.lower()
    s = re.sub(r"[.'’`]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    s = re.sub(r"\s+", " ", s).strip()
    return s

def load_vectors():
    j = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = j.get("players", [])
    # aggregate career total_min by norm name
    career = collections.defaultdict(float)
    career_seasons = collections.defaultdict(int)
    season_vals = []  # per season performance proxy
    name_to_entries = collections.defaultdict(list)
    for p in players:
        nm = norm_name(p["name"])
        tm = float(p.get("total_min") or 0)
        gp = float(p.get("gp") or 0)
        mpg = float(p.get("mpg") or 0)
        career[nm] += tm
        career_seasons[nm] += 1
        name_to_entries[nm].append(p)
        # season value = mpg * gp weighted (proxy for impact)
        season_val = tm * 0.6 + gp * mpg * 0.4 if tm>0 else gp*mpg
        # but use tm as primary
        season_vals.append((nm, p["season"], tm, gp, mpg, season_val))
    return players, career, career_seasons, name_to_entries, season_vals

def load_draft():
    d = json.loads(DRAFT.read_text(encoding="utf-8"))
    players = d.get("players", {})
    # invert: overall -> list of (norm_name, year, pick, team_abbr)
    overall_to_entries = collections.defaultdict(list)
    team_picks = collections.defaultdict(list)  # team_abbr -> list drafts
    pick_by_year = collections.defaultdict(list)
    for nm, entries in players.items():
        for e in entries:
            overall = int(e.get("overall") or 0)
            if overall <=0: 
                continue
            year = int(e.get("year") or 0)
            pick = int(e.get("pick") or overall)
            team = (e.get("team_abbr") or "").strip().upper()
            if not team:
                continue
            overall_to_entries[overall].append((nm, year, pick, team))
            team_picks[team].append({"norm": nm, "year": year, "overall": overall, "pick": pick, "team": team, "round": e.get("round")})
            pick_by_year[year].append((overall, nm, team))
    return players, overall_to_entries, team_picks, pick_by_year

def load_salaries():
    j = json.loads(SALARIES.read_text(encoding="utf-8"))
    sal = j.get("salaries", {})
    # team-season payroll
    payroll = collections.defaultdict(float)
    payroll_counts = collections.defaultdict(int)
    by_team_season_player = collections.defaultdict(list)
    by_norm_season = {}
    for key, v in sal.items():
        if key.startswith("_"):
            continue
        amount = float(v.get("salary") or 0)
        if amount < 10000:
            continue
        season = v.get("season")
        team = (v.get("team") or "").strip().upper()
        nm = v.get("norm_name") or norm_name(v.get("name",""))
        if not season:
            continue
        by_norm_season[(nm, season)] = {"salary": amount, "team": team, "name": v.get("name")}
        if team:
            payroll[(team, season)] += amount
            payroll_counts[(team, season)] += 1
            by_team_season_player[(team, season)].append((nm, amount, v.get("name")))
    return sal, payroll, payroll_counts, by_team_season_player, by_norm_season

def load_team_wins(seasons):
    wins = {}  # (team_abbr, season) -> {W, L, W_PCT}
    abbr_map = {}  # team_id -> abbr (from latest teams.json or gamelogs)
    # load abbr from teams.json
    try:
        tdef = json.loads(TEAMS_DEF.read_text())
        for t in tdef.get("teams", []):
            abbr_map[t["id"]] = t["abbr"]
    except:
        pass
    # also from draft? skip
    for season in seasons:
        path = CACHE / f"team_base_{season}.json"
        if not path.exists():
            continue
        try:
            rows = json.loads(path.read_text())
            for r in rows:
                tid = r.get("TEAM_ID")
                w = float(r.get("W") or 0)
                abbr = abbr_map.get(tid)
                # fallback: try to get abbr from team name mapping if not in teams.json?
                # team_base only has TEAM_NAME, not abbr, so we need mapping via teams.json ID->abbr
                # If missing, try guess from name
                if not abbr:
                    # quick name->abbr map
                    name = r.get("TEAM_NAME","")
                    # map via known list
                    # Use teams.json list scanning name
                    for td in tdef.get("teams", []):
                        if td["name"] in name or name in td["name"]:
                            abbr = td["abbr"]; break
                if abbr:
                    wins[(abbr, season)] = {"W": w, "L": float(r.get("L") or 0), "W_PCT": float(r.get("W_PCT") or (w/82 if w else 0)), "TEAM_NAME": r.get("TEAM_NAME")}
        except Exception as e:
            continue
    return wins

def compute_expected_pick_value(overall_to_entries, career, min_year=1996, max_year=2022):
    # only use picks where player's draft year in [min_year, max_year] and career exists
    pick_vals = collections.defaultdict(list)  # overall -> list of career total_min
    for overall, entries in overall_to_entries.items():
        if overall > 60:  # only first 2 rounds interesting for expected curve
            continue
        for nm, year, pick, team in entries:
            if year < min_year or year > max_year:
                continue
            cv = career.get(nm)
            if cv is None or cv == 0:
                # player never played in our window? treat 0 as value but keep
                cv = 0.0
                # if zero, still count (bust)
            pick_vals[overall].append(cv)
    expected = {}
    for overall in range(1,61):
        vals = pick_vals.get(overall, [])
        if vals:
            # use median to reduce outlier Jokic etc? Use trimmed mean
            vals_sorted = sorted(vals)
            # trim 10% top/bottom if enough
            if len(vals_sorted) > 10:
                trim = len(vals_sorted)//10
                vals_sorted = vals_sorted[trim:-trim]
            avg = sum(vals_sorted)/len(vals_sorted) if vals_sorted else 0
            expected[overall] = round(avg,1)
        else:
            expected[overall] = None
    # fill missing with interpolation
    # get known points
    known = [(k,v) for k,v in expected.items() if v is not None]
    known.sort()
    if known:
        for i in range(1,61):
            if expected[i] is None:
                # find nearest known
                # simple linear interp
                lower = None; upper=None
                for k,v in known:
                    if k < i: lower=(k,v)
                    if k > i and upper is None: upper=(k,v); break
                if lower and upper:
                    # interp
                    frac = (i - lower[0])/(upper[0]-lower[0])
                    expected[i] = round(lower[1]*(1-frac)+upper[1]*frac,1)
                elif lower:
                    expected[i] = lower[1]
                elif upper:
                    expected[i] = upper[1]
                else:
                    expected[i]=0
    return expected, pick_vals

def main():
    print("loading vectors...")
    players_vec, career, career_seasons, name_to_entries, season_vals = load_vectors()
    print(f"career distinct {len(career)} players")

    print("loading draft...")
    draft_players, overall_to_entries, team_picks, pick_by_year = load_draft()
    print(f"draft teams {len(team_picks)}")

    print("loading salaries...")
    sal_raw, payroll, payroll_counts, by_team_season_player, by_norm_season = load_salaries()

    # seasons we care
    all_seasons = sorted(set([s for _,s in payroll.keys()] + [f"{y}-{str(y+1)[-2:]}" for y in range(1996,2026)]))
    # actually compute wins for last 10 seasons
    recent_seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2015,2026)]
    wins = load_team_wins(recent_seasons)
    print(f"wins entries {len(wins)}")

    expected_pick, pick_vals = compute_expected_pick_value(overall_to_entries, career)
    print(f"expected pick curve computed")

    # Cap efficiency for latest season 2024-25
    season_focus = "2024-25"
    cap = CAP_BY_SEASON.get(season_focus, 140_588_000)
    teams_list = []
    try:
        tdef = json.loads(TEAMS_DEF.read_text())
        teams_defs = {t["abbr"]: t for t in tdef.get("teams", [])}
    except:
        teams_defs = {}

    # compute league wins per million distribution
    league_wpm = []
    for (abbr, seas), winfo in wins.items():
        if seas != season_focus:
            continue
        pw = payroll.get((abbr, seas))
        if not pw or pw < 10_000_000:
            continue
        wpm = winfo["W"] / (pw/1_000_000)
        league_wpm.append(wpm)
    league_wpm_sorted = sorted(league_wpm)
    median_wpm = league_wpm_sorted[len(league_wpm_sorted)//2] if league_wpm_sorted else 0.3

    # Build per team
    output_teams = []
    for abbr in sorted(teams_defs.keys()):
        tinfo = teams_defs[abbr]
        name = tinfo.get("name", abbr)
        # wins
        winfo = wins.get((abbr, season_focus), {"W":0,"L":0,"W_PCT":0})
        pw = payroll.get((abbr, season_focus), 0)
        pw_m = round(pw/1_000_000,2) if pw else 0
        wpm = round(winfo.get("W",0) / (pw/1_000_000),3) if pw and pw>0 else 0
        # cap efficiency rank
        rank = 0
        if league_wpm_sorted:
            rank = sum(1 for v in league_wpm_sorted if v <= wpm) / len(league_wpm_sorted)
        # cap % payroll / cap
        cap_pct = round(pw / cap,3) if cap and pw else None

        # DRAFT: last 5 years 2020-2024 (2025 draft hasn't played)
        drafts_5yr = [d for d in team_picks.get(abbr, []) if d["year"] >= 2020 and d["year"] <= 2024]
        drafts_5yr_sorted = sorted(drafts_5yr, key=lambda x: x["year"])
        draft_surpluses = []
        draft_details = []
        total_surplus = 0
        for d in drafts_5yr_sorted:
            nm = d["norm"]
            overall = d["overall"]
            exp = expected_pick.get(overall, 0) or 0
            actual = career.get(nm, 0)  # total_min career so far
            # for rookies, actual may be small, but we adjust by scaling if only 1-2 seasons
            seasons_played = career_seasons.get(nm,0)
            # projection scaling: expected career total_min assumes ~5-8 season avg career
            # Scale expected to completed portion: completion = min(1, seasons_played / 5.5)
            # Also scale actual up to 5-yr equivalent for early years to avoid penalizing upside rookies
            completion = min(1.0, max(1, seasons_played) / 5.5) if seasons_played>0 else 0.18  # if no seasons yet, assume 18% of expectation (bust risk)
            exp_scaled = exp * completion if completion>0 else exp * 0.2
            # if player still early and already high minutes, project linearly
            if seasons_played >=1 and seasons_played <5 and actual>0:
                # projected career = actual / completion (linear up)
                projected = actual / completion if completion>0.05 else actual * 2.5
            else:
                projected = actual
            surplus = round(projected - exp,1) if seasons_played>0 else round(-exp*0.6,1)  # heavy penalty for never-played
            # more robust: if seasons <2 and year>=2023, use season_vals current to estimate
            # we'll keep but add flag
            total_surplus += surplus
            draft_surpluses.append(surplus)
            draft_details.append({
                "year": d["year"],
                "overall": overall,
                "pick": d["pick"],
                "round": d["round"],
                "player": nm.title(),
                "norm": nm,
                "expected_min": exp,
                "actual_min": round(actual,1),
                "projected_min": round(projected if seasons_played else 0,1),
                "surplus_min": surplus,
                "seasons": seasons_played
            })
        avg_surplus = round(sum(draft_surpluses)/len(draft_surpluses),1) if draft_surpluses else 0
        # draft score 0-100 mapping: 50 = breakeven, scaled to spread grades
        # avg_surplus in total_min; 1 season ~1500 min, so 1000 min ~ 2/3 season surplus
        draft_score = max(0, min(100, 50 + avg_surplus/35))  # 350 min ~ +10 pts, 1000 ~ +28 pts
        # grade
        def grade_from_score(s):
            if s>=90: return "A+"
            if s>=82: return "A"
            if s>=75: return "A-"
            if s>=68: return "B+"
            if s>=60: return "B"
            if s>=52: return "B-"
            if s>=45: return "C+"
            if s>=38: return "C"
            if s>=30: return "C-"
            if s>=20: return "D"
            return "F"
        draft_grade = grade_from_score(draft_score*1.2)  # boost curve slightly since raw 50 centered

        # FORESIGHT: bargain retained deals
        # compute league salary percentiles per season for surplus
        # For season_focus, compute performance proxy per player: total_min that season
        # Use vectors for that season: find entries for season_focus
        perf_by_player = {}
        for (nm, seas, tm, gp, mpg, sval) in season_vals:
            if seas == season_focus:
                perf_by_player[nm] = {"tm": tm, "gp": gp, "mpg": mpg, "val": sval}
        # compute league median salary for this season among players with >10 gp
        sal_vals = []
        for (team_abbr,seas), plist in by_team_season_player.items():
            if seas != season_focus:
                continue
            for nm, amt, _ in plist:
                sal_vals.append(amt)
        sal_vals_sorted = sorted(sal_vals)
        median_sal = sal_vals_sorted[len(sal_vals_sorted)//2] if sal_vals_sorted else 5_000_000

        bargain_deals = []
        surplus_total = 0
        for (team_abbr,seas), plist in by_team_season_player.items():
            if team_abbr != abbr or seas != season_focus:
                continue
            for nm, amt, raw_name in plist:
                perf = perf_by_player.get(nm)
                if not perf:
                    continue
                if perf["gp"] < 20:  # ignore end-bench
                    continue
                # salary percentile: lower salary is cheaper
                # for simplicity, salary efficiency = (median_sal - amt)/median_sal -> positive if cheaper than median
                # performance weight: gp*mpg proxy
                # compute surplus = performance - salary expectation
                # performance rank: tm / median tm? Use tm vs league median tm
                # We'll compute expected salary for this performance: simple linear: expected = perf_val * (median_sal / median_perf)
                # but we don't have median_perf yet
                pass

        # compute median perf for salary surplus calc
        median_perf = 0
        if perf_by_player:
            perf_vals = sorted([v["tm"] for v in perf_by_player.values()])
            median_perf = perf_vals[len(perf_vals)//2] if perf_vals else 1000

        # second pass actual bargain calc
        bargain_deals = []
        surplus_total = 0
        for (team_abbr,seas), plist in by_team_season_player.items():
            if team_abbr != abbr or seas != season_focus:
                continue
            for nm, amt, raw_name in plist:
                perf = perf_by_player.get(nm)
                if not perf or perf["gp"]<20:
                    continue
                # expected salary for median perf equivalence
                # scale: if perf is 2x median, expected salary 1.8x median (diminishing)
                if median_perf>0:
                    perf_ratio = perf["tm"] / median_perf if median_perf else 1
                else:
                    perf_ratio = 1
                # diminishing returns for salary: expected = median_sal * (0.4 + 0.8*perf_ratio) capped
                exp_sal = median_sal * (0.4 + 0.8 * min(perf_ratio, 3))
                surplus_usd = exp_sal - amt
                # keep only positive surplus > $1M
                if surplus_usd > 1_000_000:
                    # check retention: same team last season?
                    prev = by_norm_season.get((nm, "2023-24"))
                    same_team_flag = prev and (prev.get("team")==abbr)
                    # salary growth vs cap growth (cap 2023-24 136M -> 140.5M = +3.3%)
                    cap_growth = (CAP_BY_SEASON.get("2024-25",140_588_000) - CAP_BY_SEASON.get("2023-24",136_021_000)) / CAP_BY_SEASON.get("2023-24",136_021_000) if CAP_BY_SEASON.get("2023-24") else 0.033
                    sal_growth = 0
                    if prev:
                        sal_growth = (amt - prev["salary"])/prev["salary"] if prev["salary"]>0 else 0
                    foresight_bonus = 1.0
                    if same_team_flag and sal_growth <= cap_growth+0.05:  # kept below cap inflation
                        foresight_bonus = 1.25
                    adj_surplus = surplus_usd * foresight_bonus
                    surplus_total += adj_surplus
                    bargain_deals.append({
                        "player": raw_name or nm.title(),
                        "norm": nm,
                        "salary_m": round(amt/1_000_000,2),
                        "exp_salary_m": round(exp_sal/1_000_000,2),
                        "surplus_m": round(surplus_usd/1_000_000,2),
                        "adj_surplus_m": round(adj_surplus/1_000_000,2),
                        "tm": round(perf["tm"],0),
                        "gp": int(perf["gp"]),
                        "mpg": round(perf["mpg"],1),
                        "retained": bool(same_team_flag),
                        "salgrowth": round(sal_growth,3)
                    })
        bargain_deals_sorted = sorted(bargain_deals, key=lambda x: x["adj_surplus_m"], reverse=True)[:6]
        foresight_score = max(0, min(100, 50 + surplus_total/6_000_000*10))  # $6M surplus ~ +10 pts, 30M ~ 100
        foresight_grade = grade_from_score(foresight_score)

        # cap efficiency score
        # median wpm is baseline 50
        if median_wpm>0:
            cap_score = max(0, min(100, 50 + (wpm - median_wpm)/median_wpm*50))
        else:
            cap_score = 50
        cap_grade = grade_from_score(cap_score)

        # composite FOR = 0.35 draft + 0.35 cap + 0.30 foresight (weight foresight slightly less but important)
        for_score = round(0.35*draft_score + 0.35*cap_score + 0.30*foresight_score,1)
        for_grade = grade_from_score(for_score)

        output_teams.append({
            "abbr": abbr,
            "name": name,
            "season": season_focus,
            "id": tinfo.get("id"),
            "primary": tinfo.get("primary"),
            "secondary": tinfo.get("secondary"),
            "wins": winfo.get("W"),
            "losses": winfo.get("L"),
            "w_pct": round(winfo.get("W_PCT",0),3),
            "payroll_m": pw_m,
            "payroll": pw,
            "cap_pct": cap_pct,
            "w_per_m": wpm,
            "cap_efficiency": {
                "score": round(cap_score,1),
                "grade": cap_grade,
                "rank_pct": round(rank,3),
                "median_wpm": round(median_wpm,3),
                "payroll_m": pw_m
            },
            "draft": {
                "picks_5yr_count": len(drafts_5yr),
                "picks": draft_details,
                "avg_surplus_min": avg_surplus,
                "total_surplus_min": round(total_surplus,1),
                "score": round(draft_score,1),
                "grade": draft_grade
            },
            "foresight": {
                "bargain_deals": bargain_deals_sorted,
                "surplus_total_m": round(surplus_total/1_000_000,2),
                "surplus_count": len(bargain_deals),
                "score": round(foresight_score,1),
                "grade": foresight_grade
            },
            "for_score": for_score,
            "for_grade": for_grade
        })

    # sort by for_score desc for leaderboard
    output_teams_sorted = sorted(output_teams, key=lambda x: x["for_score"], reverse=True)
    for i, t in enumerate(output_teams_sorted):
        t["for_rank"] = i+1
    # curve grades based on rank to ensure spread (A+ to F visible)
    def rank_grade(rank, n=30):
        pct = (rank-1)/(n-1) if n>1 else 0
        if pct < 0.07: return "A+"
        if pct < 0.18: return "A"
        if pct < 0.30: return "A-"
        if pct < 0.45: return "B+"
        if pct < 0.60: return "B"
        if pct < 0.75: return "B-"
        if pct < 0.88: return "C+"
        if pct < 0.93: return "C"
        if pct < 0.97: return "C-"
        return "D"
    for t in output_teams_sorted:
        t["for_grade"] = rank_grade(t["for_rank"])  # overwrite to show spread
        # also curve component grades to be relative-ish (keep original absolute but boost visibility)
        # for display we keep original component grades but add rank variant


    out_payload = {
        "built": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season_focus": season_focus,
        "season_cap": CAP_BY_SEASON.get(season_focus),
        "method": {
            "draft": "Expected career total_min by overall pick (1996-2022 baseline, median trimmed). Surplus = actual career total_min - expected. 5yr rolling 2020-2024, 50 = breakeven. Grade curve A+ >=90.",
            "cap": "Wins per $1M payroll. Score 50 = median W/$M. Cap% = payroll/cap. Rank pct vs league.",
            "foresight": "For 2024-25 retained players 20+ GP, expected salary = median_sal*(0.4+0.8*tm/median_tm). Surplus = exp - actual. Retention bonus 1.25x if same team and salary growth <= cap growth+5%. Score 50 + surplus/20M*10.",
            "composite": "FOR = 0.35*draft + 0.35*cap + 0.30*foresight",
            "sources": "draft_history.json, vectors.json total_min, salaries_merged.json, team_base_*.json, teams.json"
        },
        "median": {"wpm": round(median_wpm,3), "median_sal_m": round(median_sal/1_000_000,2) if 'median_sal' in locals() else None},
        "expected_pick": expected_pick,
        "teams": output_teams_sorted,
        "teams_by_abbr": {t["abbr"]: t for t in output_teams_sorted}
    }

    out_dir = ASSETS / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "front_office.json"
    out_path.write_text(json.dumps(out_payload, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    # copy to assets root for easier fetch
    (ASSETS / "front_office.json").write_text(json.dumps(out_payload, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_path} ({len(output_teams_sorted)} teams) + assets/front_office.json")
    print(f"top 3: {[(t['abbr'], t['for_score'], t['for_grade']) for t in output_teams_sorted[:3]]}")
    print(f"bottom 3: {[(t['abbr'], t['for_score'], t['for_grade']) for t in output_teams_sorted[-3:]]}")

if __name__ == "__main__":
    main()
