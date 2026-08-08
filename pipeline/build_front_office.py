#!/usr/bin/env python3
"""
Build front office evaluations for vector hoops.

Three pillars:
  1. Draft Smarts — first-5-season quality-adjusted minutes surplus vs expected pick value
  2. Cap Efficiency — wins per million payroll vs league
  3. Foresight — retained bargain deals where performance > salary and salary growth < cap growth
  + Timing — when you sign/trade/draft matters as contracts mature vs cap $90M->$154M

Outputs:
  assets/data/front_office.json
  assets/front_office.json (copy for backwards compat)

Zero-deps, stdlib only. Recomputable from:
  - pipeline/cache/draft_history.json
  - assets/vectors.json
  - pipeline/cache/salaries_merged.json
  - pipeline/cache/team_base_*.json
  - assets/teams.json
  - pipeline/nba_salary_cap.py (era-aware)
"""
from __future__ import annotations
import json, math, time, pathlib, collections, re
from datetime import datetime
# era-aware cap rules
try:
    from nba_salary_cap import (
        CAP_BY_SEASON as _CAP_BY_SEASON_IMPORTED,
        TAX_THRESHOLD_BY_SEASON,
        APRON1_BY_SEASON,
        APRON2_BY_SEASON,
        CBA_BY_SEASON,
        TV_DEAL_BY_SEASON,
        rules_for_season,
    )
    CAP_BY_SEASON = _CAP_BY_SEASON_IMPORTED
except Exception:
    CAP_BY_SEASON = {}
    TAX_THRESHOLD_BY_SEASON = {}
    APRON1_BY_SEASON = {}
    APRON2_BY_SEASON = {}
    CBA_BY_SEASON = {}
    TV_DEAL_BY_SEASON = {}
    def rules_for_season(s): return {"season": s, "cap": None, "tax": None, "apron1": None, "apron2": None, "cba": "unknown", "tv_deal": "unknown", "cap_growth_vs_prior": None}

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / "cache"
ASSETS = ROOT / "assets"
VECTORS = ASSETS / "vectors.json"
DRAFT = CACHE / "draft_history.json"
SALARIES = CACHE / "salaries_merged.json"
TEAMS_DEF = ASSETS / "teams.json"

def norm_name(n: str) -> str:
    s = n.lower()
    s = re.sub(r"[.'’`]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _quality_multiplier(v_list):
    """q = 1.0 + 0.12*PLUS_MINUS (v[13]) + 0.05*PTS (v[0]), clamp 0.65-1.65."""
    try:
        if not v_list or len(v_list) < 14:
            return 1.0
        pm = float(v_list[13] or 0)
        pts = float(v_list[0] or 0)
        q = 1.0 + 0.12 * pm + 0.05 * pts
        if q < 0.65:
            q = 0.65
        if q > 1.65:
            q = 1.65
        return q
    except Exception:
        return 1.0

def season_to_start_year(season_str: str) -> int | None:
    try:
        return int(season_str.split("-")[0])
    except Exception:
        return None

def load_vectors():
    j = json.loads(VECTORS.read_text(encoding="utf-8"))
    players = j.get("players", [])
    career = collections.defaultdict(float)
    career_seasons = collections.defaultdict(int)
    season_vals = []  # (nm, season, tm, gp, mpg, season_val, v)
    season_v_map = {}  # (nm, season) -> v
    name_to_entries = collections.defaultdict(list)
    for p in players:
        nm = norm_name(p["name"])
        tm = float(p.get("total_min") or 0)
        gp = float(p.get("gp") or 0)
        mpg = float(p.get("mpg") or 0)
        v = p.get("v") or []
        career[nm] += tm
        career_seasons[nm] += 1
        name_to_entries[nm].append(p)
        season_val = tm * 0.6 + gp * mpg * 0.4 if tm>0 else gp*mpg
        season_vals.append((nm, p["season"], tm, gp, mpg, season_val, v))
        season_v_map[(nm, p["season"])] = v
    return players, career, career_seasons, name_to_entries, season_vals, season_v_map

def build_first5_totals(season_vals, draft_players_map):
    """
    For each draft (norm,year) sum total_min of first 5 seasons post-draft
    season start year in [year, year+4], counts seasons, avg quality multiplier,
    qual_adj_total = sum(tm * q), gp, latest_pm.

    draft_players_map: dict norm -> list of {year, overall, ...} or entries list.
    Returns dict (norm,year) -> {total_min, seasons, avg_q, qual_adj_total, gp, latest_pm, latest_season}
    """
    by_norm = collections.defaultdict(list)
    for entry in season_vals:
        nm = entry[0]
        seas = entry[1]
        tm = entry[2]
        gp = entry[3]
        v = entry[6] if len(entry) > 6 else []
        q = _quality_multiplier(v)
        try:
            start_y = int(seas.split("-")[0])
        except Exception:
            continue
        by_norm[nm].append((seas, start_y, tm, gp, v, q))

    first5 = {}
    for nm, entries in (draft_players_map.items() if isinstance(draft_players_map, dict) else []):
        if not entries:
            continue
        for e in entries:
            if isinstance(e, dict):
                year = int(e.get("year") or 0)
            elif isinstance(e, (list, tuple)) and len(e) >= 2:
                continue
            else:
                continue
            if year <=0:
                continue
            key = (nm, year)
            if key in first5:
                continue
            seasons_in_window = []
            for seas, sy, tm, gp, v, q in by_norm.get(nm, []):
                if sy >= year and sy <= year+4:
                    seasons_in_window.append((seas, sy, tm, gp, v, q))
            if not seasons_in_window:
                first5[key] = {
                    "total_min": 0.0,
                    "seasons": 0,
                    "avg_q": 1.0,
                    "qual_adj_total": 0.0,
                    "gp": 0,
                    "latest_pm": 0.0,
                    "latest_season": None,
                    "latest_tm": 0.0,
                    "latest_qual": 0.0,
                    "last_season_tm": 0.0,
                    "last_season_qual": 0.0,
                    "regular_season_mins": 0.0,
                }
                continue
            seasons_in_window.sort(key=lambda x: x[1])
            total_min = sum(x[2] for x in seasons_in_window)
            gp_tot = sum(x[3] for x in seasons_in_window)
            qs = [x[5] for x in seasons_in_window]
            avg_q = sum(qs)/len(qs) if qs else 1.0
            qual_adj_total = sum(x[2]*x[5] for x in seasons_in_window)
            latest_entry = seasons_in_window[-1]
            latest_v = latest_entry[4]
            latest_tm = float(latest_entry[2])
            latest_q = float(latest_entry[5])
            latest_qual = latest_tm * latest_q
            try:
                latest_pm = float(latest_v[13]) if latest_v and len(latest_v)>=14 else 0.0
            except Exception:
                latest_pm = 0.0
            latest_season = latest_entry[0]
            first5[key] = {
                "total_min": total_min,
                "seasons": len(seasons_in_window),
                "avg_q": avg_q,
                "qual_adj_total": qual_adj_total,
                "gp": gp_tot,
                "latest_pm": latest_pm,
                "latest_season": latest_season,
                "latest_tm": latest_tm,
                "latest_qual": latest_qual,
                "last_season_tm": latest_tm,
                "last_season_qual": latest_qual,
                "regular_season_mins": total_min,
            }
    return first5

def compute_expected_first5(overall_to_entries, first5_map, min_year=1996, max_year=2022, use_qual_adj=True):
    """Average qual_adj_total (or total_min) per overall pick 1-60 across min-max, trimmed mean 10%."""
    pick_vals = collections.defaultdict(list)
    for overall, entries in overall_to_entries.items():
        if overall > 60:
            continue
        for nm, year, pick, team in entries:
            if year < min_year or year > max_year:
                continue
            f = first5_map.get((nm, year))
            if not f:
                pick_vals[overall].append(0.0)
                continue
            val = f["qual_adj_total"] if use_qual_adj else f["total_min"]
            pick_vals[overall].append(float(val))
    expected = {}
    for overall in range(1,61):
        vals = pick_vals.get(overall, [])
        if vals:
            vals_sorted = sorted(vals)
            if len(vals_sorted) > 10:
                trim = len(vals_sorted)//10
                vals_sorted = vals_sorted[trim:-trim] if trim>0 else vals_sorted
            avg = sum(vals_sorted)/len(vals_sorted) if vals_sorted else 0
            expected[overall] = round(avg,1)
        else:
            expected[overall] = None
    known = [(k,v) for k,v in expected.items() if v is not None]
    known.sort()
    if known:
        for i in range(1,61):
            if expected[i] is None:
                lower=None; upper=None
                for k,v in known:
                    if k < i: lower=(k,v)
                    if k > i and upper is None: upper=(k,v); break
                if lower and upper:
                    frac = (i - lower[0])/(upper[0]-lower[0])
                    expected[i] = round(lower[1]*(1-frac)+upper[1]*frac,1)
                elif lower:
                    expected[i]=lower[1]
                elif upper:
                    expected[i]=upper[1]
                else:
                    expected[i]=0
    return expected, pick_vals

def load_draft():
    d = json.loads(DRAFT.read_text(encoding="utf-8"))
    players = d.get("players", {})
    overall_to_entries = collections.defaultdict(list)
    team_picks = collections.defaultdict(list)
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
        by_norm_season[(nm, season)] = {"salary": amount, "team": team, "name": v.get("name"), "season": season}
        if team:
            payroll[(team, season)] += amount
            payroll_counts[(team, season)] += 1
            by_team_season_player[(team, season)].append((nm, amount, v.get("name")))
    return sal, payroll, payroll_counts, by_team_season_player, by_norm_season

def build_contract_timelines(by_norm_season):
    """Group by norm sorted by start year, infer contract segments.

    New contract if:
      prev team != current team OR gap>1 year OR salary increase >50% OR decrease >20%
    Returns:
      timelines_by_norm: norm -> list of season entries sorted
      lookup: (norm, season) -> entry with contract start info
    """
    by_norm = collections.defaultdict(list)
    for (nm, season_str), rec in by_norm_season.items():
        sy = season_to_start_year(season_str)
        if sy is None:
            continue
        by_norm[nm].append((season_str, sy, rec.get("team"), float(rec.get("salary") or 0), rec.get("name")))
    timelines_by_norm = {}
    lookup = {}
    for nm, seasons in by_norm.items():
        seasons_sorted = sorted(seasons, key=lambda x: x[1])
        timeline = []
        cur_start_season = None
        cur_start_salary = None
        cur_start_year = None
        prev_team = None
        prev_year = None
        prev_salary = None
        for season_str, sy, team, sal, name in seasons_sorted:
            is_new = False
            if cur_start_season is None:
                is_new = True
            else:
                if prev_team and team and prev_team != team:
                    is_new = True
                elif prev_year is not None and (sy - prev_year) > 1:
                    is_new = True
                elif prev_salary and prev_salary > 0:
                    # increase >50%
                    if sal > prev_salary * 1.5:
                        is_new = True
                    elif sal < prev_salary * 0.8:
                        # decrease >20% often new deal / pay cut
                        is_new = True
            if is_new:
                cur_start_season = season_str
                cur_start_salary = sal
                cur_start_year = sy
            age = sy - cur_start_year if cur_start_year is not None else 0
            entry = {
                "season": season_str,
                "start_year": sy,
                "team": team,
                "salary": sal,
                "name": name,
                "contract_start_season": cur_start_season,
                "contract_start_salary": cur_start_salary,
                "contract_start_year": cur_start_year,
                "contract_age_years": age,
            }
            timeline.append(entry)
            lookup[(nm, season_str)] = entry
            prev_team = team
            prev_year = sy
            prev_salary = sal
        timelines_by_norm[nm] = timeline
    return timelines_by_norm, lookup

def load_team_wins(seasons):
    wins = {}
    abbr_map = {}
    try:
        tdef = json.loads(TEAMS_DEF.read_text())
        for t in tdef.get("teams", []):
            abbr_map[t["id"]] = t["abbr"]
    except:
        pass
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
                if not abbr:
                    name = r.get("TEAM_NAME","")
                    for td in tdef.get("teams", []):
                        if td["name"] in name or name in td["name"]:
                            abbr = td["abbr"]; break
                if abbr:
                    wins[(abbr, season)] = {"W": w, "L": float(r.get("L") or 0), "W_PCT": float(r.get("W_PCT") or (w/82 if w else 0)), "TEAM_NAME": r.get("TEAM_NAME")}
        except Exception:
            continue
    return wins

def compute_expected_pick_value(overall_to_entries, career, min_year=1996, max_year=2022):
    pick_vals = collections.defaultdict(list)
    for overall, entries in overall_to_entries.items():
        if overall > 60:
            continue
        for nm, year, pick, team in entries:
            if year < min_year or year > max_year:
                continue
            cv = career.get(nm)
            if cv is None or cv == 0:
                cv = 0.0
            pick_vals[overall].append(cv)
    expected = {}
    for overall in range(1,61):
        vals = pick_vals.get(overall, [])
        if vals:
            vals_sorted = sorted(vals)
            if len(vals_sorted) > 10:
                trim = len(vals_sorted)//10
                vals_sorted = vals_sorted[trim:-trim]
            avg = sum(vals_sorted)/len(vals_sorted) if vals_sorted else 0
            expected[overall] = round(avg,1)
        else:
            expected[overall] = None
    known = [(k,v) for k,v in expected.items() if v is not None]
    known.sort()
    if known:
        for i in range(1,61):
            if expected[i] is None:
                lower = None; upper=None
                for k,v in known:
                    if k < i: lower=(k,v)
                    if k > i and upper is None: upper=(k,v); break
                if lower and upper:
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
    players_vec, career, career_seasons, name_to_entries, season_vals, season_v_map = load_vectors()
    print(f"career distinct {len(career)} players")

    print("loading draft...")
    draft_players, overall_to_entries, team_picks, pick_by_year = load_draft()
    print(f"draft teams {len(team_picks)}")

    # build first-5-year totals (quality-adjusted)
    print("building first5...")
    first5_map = build_first5_totals(season_vals, draft_players)
    print(f"first5 entries {len(first5_map)}")

    expected_first5, expected_first5_pick_vals = compute_expected_first5(overall_to_entries, first5_map, min_year=1996, max_year=2022, use_qual_adj=True)
    # legacy for reference
    expected_pick_legacy, _ = compute_expected_pick_value(overall_to_entries, career)
    print(f"expected first5 curve computed, sample pick1={expected_first5.get(1)} pick30={expected_first5.get(30)}")

    print("loading salaries...")
    sal_raw, payroll, payroll_counts, by_team_season_player, by_norm_season = load_salaries()

    print("building contract timelines...")
    contract_timelines_by_norm, contract_lookup = build_contract_timelines(by_norm_season)
    print(f"contract timelines {len(contract_timelines_by_norm)} players, lookup {len(contract_lookup)} season entries")

    all_seasons = sorted(set([s for _,s in payroll.keys()] + [f"{y}-{str(y+1)[-2:]}" for y in range(1996,2026)]))
    recent_seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2015,2026)]
    wins = load_team_wins(recent_seasons)
    print(f"wins entries {len(wins)}")

    # gp lookup for draft timing (rookie retention)
    gp_by_norm_season = {}
    for nm, season_str, tm, gp, mpg, sval, v in season_vals:
        gp_by_norm_season[(nm, season_str)] = gp

    # Cap efficiency baseline 2024-25
    season_focus = "2024-25"
    cap = CAP_BY_SEASON.get(season_focus, 140_588_000) if CAP_BY_SEASON else 140_588_000
    try:
        tdef = json.loads(TEAMS_DEF.read_text())
        teams_defs = {t["abbr"]: t for t in tdef.get("teams", [])}
    except:
        teams_defs = {}

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

    output_teams = []
    for abbr in sorted(teams_defs.keys()):
        tinfo = teams_defs[abbr]
        name = tinfo.get("name", abbr)
        winfo = wins.get((abbr, season_focus), {"W":0,"L":0,"W_PCT":0})
        pw = payroll.get((abbr, season_focus), 0)
        pw_m = round(pw/1_000_000,2) if pw else 0
        wpm = round(winfo.get("W",0) / (pw/1_000_000),3) if pw and pw>0 else 0
        rank = 0
        if league_wpm_sorted:
            rank = sum(1 for v in league_wpm_sorted if v <= wpm) / len(league_wpm_sorted)
        cap_pct = round(pw / cap,3) if cap and pw else None

        # DRAFT: window 2020-2025 inclusive to capture Flagg/Harper
        drafts_5yr = [d for d in team_picks.get(abbr, []) if d["year"] >= 2020 and d["year"] <= 2025]
        drafts_5yr_sorted = sorted(drafts_5yr, key=lambda x: x["year"])
        draft_surpluses = []
        draft_details = []
        total_surplus = 0.0
        for d in drafts_5yr_sorted:
            nm = d["norm"]
            overall = d["overall"]
            year = d["year"]
            draft_team = d["team"]
            exp = expected_first5.get(overall, 0) or 0
            exp_legacy = expected_pick_legacy.get(overall, 0) or 0
            f = first5_map.get((nm, year))
            # helper for rookie-scale retention and cut early checks
            def _is_retained_rookie():
                if year < 2021:
                    return False
                cur = by_norm_season.get((nm, season_focus))
                if not cur:
                    return False
                if (cur.get("team") or "").upper() != draft_team:
                    return False
                gp_cur = gp_by_norm_season.get((nm, season_focus), 0)
                if gp_cur < 20:
                    # also try perf later but approximate
                    return False
                return True
            def _cut_early():
                # only for busts – did team exit within 2 seasons?
                # check draft+1, draft+2 seasons existence/team
                for dy in [year+1, year+2]:
                    seas_str = f"{dy}-{str(dy+1)[-2:]}"
                    rec = by_norm_season.get((nm, seas_str))
                    if rec is None:
                        # out of league within 2 years -> cut early
                        return True
                    t = (rec.get("team") or "").upper()
                    if t != draft_team:
                        return True
                return False

            if f:
                actual_first5 = f["total_min"]
                seasons_played = f["seasons"]
                avg_q = f["avg_q"]
                qual_adj_actual = f["qual_adj_total"]
                latest_pm = f["latest_pm"]
                latest_tm = f.get("latest_tm") or f.get("last_season_tm") or 0
                latest_qual = f.get("latest_qual") or f.get("last_season_qual") or (qual_adj_actual / seasons_played if seasons_played else 0)
                if seasons_played <=0:
                    completion = 0.15
                else:
                    completion = seasons_played / 5.0
                if year == 2025 and seasons_played == 1 and actual_first5 > 3000:
                    completion = min(completion, 0.18)
                if completion < 0.15:
                    completion = 0.15
                if completion > 1.0:
                    completion = 1.0
                if completion > 0.05:
                    base_proj = qual_adj_actual / completion
                else:
                    base_proj = qual_adj_actual * 2.5
                remaining = 5 - seasons_played
                proj_last = qual_adj_actual + remaining * latest_qual if remaining>0 else qual_adj_actual
                improving = False
                try:
                    if latest_pm and latest_pm > 1.0:
                        improving = True
                    if avg_q and avg_q > 1.10:
                        improving = True
                    if latest_qual and seasons_played>0 and (latest_qual > (qual_adj_actual/seasons_played if seasons_played else 0)*1.15):
                        improving = True
                except Exception:
                    improving=False
                if improving and proj_last > base_proj:
                    projected_5yr = proj_last
                else:
                    projected_5yr = base_proj
                surplus = projected_5yr - exp

                # rookie-scale clock bonus 15% if still on drafting team 20+GP and surplus positive
                retained_on_rookie_scale = False
                rookie_bonus_applied = False
                if surplus > 0 and year >= 2021:
                    if _is_retained_rookie():
                        retained_on_rookie_scale = True
                        surplus_before = surplus
                        surplus = surplus * 1.15
                        rookie_bonus_applied = True

                # trade timing mitigation for busts
                cut_early = False
                cut_early_mitigated = False
                if surplus < 0:
                    if _cut_early():
                        cut_early = True
                        # reduce negative by 40%
                        surplus = surplus * 0.6
                        cut_early_mitigated = True

                draft_surpluses.append(surplus)
                total_surplus += surplus
                is_rookie_2025 = (year == 2025)
                draft_details.append({
                    "year": year,
                    "overall": overall,
                    "pick": d["pick"],
                    "round": d["round"],
                    "player": nm.title(),
                    "norm": nm,
                    "draft_team": draft_team,
                    "expected_min": exp,
                    "expected_min_legacy_full_career": exp_legacy,
                    "actual_min": round(actual_first5,1),
                    "actual_first5_min": round(actual_first5,1),
                    "projected_min": round(projected_5yr,1),
                    "projected_5yr_qual_adj": round(projected_5yr,1),
                    "qual_adj_total": round(qual_adj_actual,1),
                    "actual_qual_adj": round(qual_adj_actual,1),
                    "seasons": seasons_played,
                    "seasons_played": seasons_played,
                    "completion": round(completion,2),
                    "avg_quality": round(avg_q,3),
                    "plus_minus": round(latest_pm,3),
                    "latest_pm": round(latest_pm,3),
                    "regular_season_mins": round(actual_first5,1),
                    "regular_season_impact": round(actual_first5,1),
                    "playoff_proxy": round(latest_pm,3),
                    "playoff_impact_proxy": round(latest_pm,3),
                    "is_rookie_2025": is_rookie_2025,
                    "surplus_min": round(surplus,1),
                    "surplus": round(surplus,1),
                    "retained_on_rookie_scale": retained_on_rookie_scale,
                    "rookie_bonus_applied": rookie_bonus_applied,
                    "cut_early": cut_early,
                    "cut_early_mitigated": cut_early_mitigated,
                })
            else:
                seasons_played = 0
                actual_first5 = 0
                qual_adj_actual = 0
                latest_pm = 0
                avg_q = 1.0
                surplus = -exp*0.6
                # cut early still applies if player never appeared – treat as cut early? Only if drafted team missing quickly; but keep simple.
                cut_early = True
                cut_early_mitigated = False
                # reduce negative slightly if truly no data? Keep -0.6 already mitigated
                draft_surpluses.append(surplus)
                total_surplus += surplus
                draft_details.append({
                    "year": year,
                    "overall": overall,
                    "pick": d["pick"],
                    "round": d["round"],
                    "player": nm.title(),
                    "norm": nm,
                    "draft_team": draft_team,
                    "expected_min": exp,
                    "expected_min_legacy_full_career": exp_legacy,
                    "actual_min": 0,
                    "actual_first5_min": 0,
                    "projected_min": 0,
                    "projected_5yr_qual_adj": 0,
                    "qual_adj_total": 0,
                    "seasons": 0,
                    "seasons_played": 0,
                    "completion": 0.0,
                    "avg_quality": round(avg_q,3),
                    "plus_minus": 0,
                    "latest_pm": 0,
                    "regular_season_mins": 0,
                    "regular_season_impact": 0,
                    "playoff_proxy": 0,
                    "playoff_impact_proxy": 0,
                    "is_rookie_2025": (year==2025),
                    "surplus_min": round(surplus,1),
                    "surplus": round(surplus,1),
                    "retained_on_rookie_scale": False,
                    "rookie_bonus_applied": False,
                    "cut_early": cut_early,
                    "cut_early_mitigated": cut_early_mitigated,
                })

        avg_surplus = round(sum(draft_surpluses)/len(draft_surpluses),1) if draft_surpluses else 0
        draft_score_raw = 50 + avg_surplus/35
        draft_score = max(0, min(100, draft_score_raw))
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
        draft_grade = grade_from_score(draft_score*1.2)

        # FORESIGHT with timing maturation
        perf_by_player = {}
        for entry in season_vals:
            nm = entry[0]; seas = entry[1]; tm = entry[2]; gp = entry[3]; mpg = entry[4]; sval = entry[5]
            if seas == season_focus:
                perf_by_player[nm] = {"tm": tm, "gp": gp, "mpg": mpg, "val": sval, "v": entry[6] if len(entry)>6 else []}

        sal_vals = []
        for (team_abbr,seas), plist in by_team_season_player.items():
            if seas != season_focus:
                continue
            for nm, amt, _ in plist:
                sal_vals.append(amt)
        sal_vals_sorted = sorted(sal_vals)
        median_sal = sal_vals_sorted[len(sal_vals_sorted)//2] if sal_vals_sorted else 5_000_000

        median_perf = 0
        if perf_by_player:
            perf_vals = sorted([v["tm"] for v in perf_by_player.values()])
            median_perf = perf_vals[len(perf_vals)//2] if perf_vals else 1000

        bargain_deals = []
        surplus_total = 0
        surplus_total_before_timing = 0
        total_contract_age = 0
        count_contract_age = 0
        for (team_abbr,seas), plist in by_team_season_player.items():
            if team_abbr != abbr or seas != season_focus:
                continue
            for nm, amt, raw_name in plist:
                perf = perf_by_player.get(nm)
                if not perf or perf["gp"]<20:
                    continue
                if median_perf>0:
                    perf_ratio = perf["tm"] / median_perf if median_perf else 1
                else:
                    perf_ratio = 1
                exp_sal = median_sal * (0.4 + 0.8 * min(perf_ratio, 3))
                surplus_usd = exp_sal - amt
                if surplus_usd > 1_000_000:
                    prev = by_norm_season.get((nm, "2023-24"))
                    same_team_flag = prev and (prev.get("team")==abbr)
                    cap_growth = (CAP_BY_SEASON.get("2024-25",140_588_000) - CAP_BY_SEASON.get("2023-24",136_021_000)) / CAP_BY_SEASON.get("2023-24",136_021_000) if CAP_BY_SEASON and CAP_BY_SEASON.get("2023-24") else 0.033
                    sal_growth = 0
                    if prev:
                        sal_growth = (amt - prev["salary"])/prev["salary"] if prev["salary"]>0 else 0
                    foresight_bonus = 1.0
                    if same_team_flag and sal_growth <= cap_growth+0.05:
                        foresight_bonus = 1.25
                    adj_surplus = surplus_usd * foresight_bonus
                    surplus_total_before_timing += adj_surplus

                    # TIMING MATURATION – contract timeline
                    contract_entry = contract_lookup.get((nm, season_focus))
                    if contract_entry is None:
                        # fallback to earliest season for this player maybe
                        timeline = contract_timelines_by_norm.get(nm, [])
                        # find entry for 2024-25 if possible else last
                        if timeline:
                            # pick last with <=2024
                            contract_entry = timeline[-1]
                        else:
                            contract_entry = None
                    contract_start_season = None
                    contract_start_salary = None
                    contract_start_year = None
                    contract_age = 0
                    initial_cap_pct = None
                    current_cap_pct = None
                    cap_growth_since_start = None
                    salary_growth_since_start = None
                    maturation_ratio = None
                    timing_multiplier = 1.0
                    if contract_entry:
                        contract_start_season = contract_entry.get("contract_start_season")
                        contract_start_salary = contract_entry.get("contract_start_salary")
                        contract_start_year = contract_entry.get("contract_start_year")
                        contract_age = contract_entry.get("contract_age_years", 0) or 0
                        # handle case where entry itself is contract start? entry has start info
                        try:
                            cap_start = CAP_BY_SEASON.get(contract_start_season) if contract_start_season else None
                            if cap_start is None and contract_start_year:
                                # fallback to CAP_BY_SEASON year lookup: map year -> season string?
                                # season string is e.g., 2020-21 ; cap dict keys like "2020-21"
                                # try to infer season string from year
                                guess_season = f"{contract_start_year}-{str(contract_start_year+1)[-2:]}"
                                cap_start = CAP_BY_SEASON.get(guess_season)
                            cap_now = CAP_BY_SEASON.get(season_focus, 140_588_000) if CAP_BY_SEASON else 140_588_000
                            if cap_start and cap_start>0 and contract_start_salary and contract_start_salary>0:
                                initial_cap_pct = contract_start_salary / cap_start
                                current_cap_pct = amt / cap_now if cap_now else None
                                cap_growth_since_start = cap_now / cap_start - 1 if cap_start else None
                                salary_growth_since_start = amt / contract_start_salary - 1 if contract_start_salary else None
                                if cap_growth_since_start is not None and salary_growth_since_start is not None:
                                    maturation_ratio = (1+cap_growth_since_start)/(1+salary_growth_since_start) if (1+salary_growth_since_start)>0 else 1.0
                                    # timing multiplier
                                    timing_multiplier = 1.0 + 0.08*contract_age + 0.12*max(0, (maturation_ratio or 1)-1)*3
                                    # clamp reasonable 0.85-2.2
                                    if timing_multiplier < 0.85:
                                        timing_multiplier = 0.85
                                    if timing_multiplier > 2.2:
                                        timing_multiplier = 2.2
                        except Exception:
                            pass
                    # final timing-adjusted surplus
                    adj_surplus_timed = adj_surplus * timing_multiplier
                    surplus_total += adj_surplus_timed
                    if contract_age is not None:
                        total_contract_age += contract_age
                        count_contract_age += 1
                    bargain_deals.append({
                        "player": raw_name or nm.title(),
                        "norm": nm,
                        "salary_m": round(amt/1_000_000,2),
                        "exp_salary_m": round(exp_sal/1_000_000,2),
                        "surplus_m": round(surplus_usd/1_000_000,2),
                        "adj_surplus_m": round(adj_surplus_timed/1_000_000,2),
                        "adj_surplus_m_before_timing": round(adj_surplus/1_000_000,2),
                        "tm": round(perf["tm"],0),
                        "gp": int(perf["gp"]),
                        "mpg": round(perf["mpg"],1),
                        "retained": bool(same_team_flag),
                        "salgrowth": round(sal_growth,3),
                        "contract_start_season": contract_start_season,
                        "contract_start_salary_m": round(contract_start_salary/1_000_000,2) if contract_start_salary else None,
                        "contract_age": contract_age,
                        "initial_cap_pct": round(initial_cap_pct,5) if initial_cap_pct is not None else None,
                        "current_cap_pct": round(current_cap_pct,5) if current_cap_pct is not None else None,
                        "cap_growth_since_start": round(cap_growth_since_start,4) if cap_growth_since_start is not None else None,
                        "salary_growth_since_start": round(salary_growth_since_start,4) if salary_growth_since_start is not None else None,
                        "maturation_ratio": round(maturation_ratio,4) if maturation_ratio is not None else None,
                        "timing_multiplier": round(timing_multiplier,3),
                    })
        bargain_deals_sorted = sorted(bargain_deals, key=lambda x: x["adj_surplus_m"], reverse=True)[:6]
        # foresight score uses timed surplus_total, but also boost if avg contract age high (better timing)
        # base score
        foresight_score = max(0, min(100, 50 + surplus_total/6_000_000*10))
        foresight_grade = grade_from_score(foresight_score)
        avg_contract_age_team = round(total_contract_age / count_contract_age, 2) if count_contract_age else 0

        if median_wpm>0:
            cap_score = max(0, min(100, 50 + (wpm - median_wpm)/median_wpm*50))
        else:
            cap_score = 50
        cap_grade = grade_from_score(cap_score)

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
                "grade": draft_grade,
                "expected_first5_sample": {"1": expected_first5.get(1), "2": expected_first5.get(2), "30": expected_first5.get(30)},
            },
            "foresight": {
                "bargain_deals": bargain_deals_sorted,
                "surplus_total_m": round(surplus_total/1_000_000,2),
                "surplus_total_m_before_timing": round(surplus_total_before_timing/1_000_000,2),
                "surplus_count": len(bargain_deals),
                "score": round(foresight_score,1),
                "grade": foresight_grade,
                "avg_contract_age": avg_contract_age_team,
            },
            "for_score": for_score,
            "for_grade": for_grade,
            "avg_contract_age_2024_25": avg_contract_age_team,
        })

    # widen draft spread via z-score
    import statistics as _stats
    try:
        raw_surps = [t["draft"]["avg_surplus_min"] for t in output_teams]
        mean_s = _stats.mean(raw_surps) if raw_surps else 0
        stdev_s = _stats.stdev(raw_surps) if len(raw_surps)>1 else 800
        if stdev_s < 200: stdev_s = 800
    except:
        mean_s = -2930
        stdev_s = 2573
    for t in output_teams:
        z = (t["draft"]["avg_surplus_min"] - mean_s) / stdev_s if stdev_s else 0
        new_score = 50 + z*18
        new_score = max(0, min(100, new_score))
        t["draft"]["score"] = round(new_score,1)
        t["draft"]["score_raw_z"] = round(z,2)
        def _grade2(s):
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
        t["draft"]["grade"] = _grade2(new_score)
        cap_s = t["cap_efficiency"]["score"]
        fore_s = t["foresight"]["score"]
        new_for = round(0.35*new_score + 0.35*cap_s + 0.30*fore_s,1)
        t["for_score"] = new_for

    season_next = "2025-26"
    cap_next = CAP_BY_SEASON.get(season_next, 154_647_000) if CAP_BY_SEASON else 154_647_000
    payroll_next_inferred = collections.defaultdict(float)
    payroll_counts_next_inferred = collections.defaultdict(int)
    by_team_next_inferred = collections.defaultdict(list)
    try:
        outer = json.loads(SALARIES.read_text(encoding="utf-8"))
        salaries_dict_outer = outer.get("salaries", outer) if isinstance(outer, dict) else {}
    except Exception:
        salaries_dict_outer = {}
    for key, v in salaries_dict_outer.items():
        if not isinstance(v, dict):
            continue
        if v.get("season") != season_next:
            continue
        nm = v.get("norm_name") or norm_name(v.get("name",""))
        amt = float(v.get("salary") or 0)
        if amt < 10000:
            continue
        team = (v.get("team") or "").strip().upper()
        if not team:
            for back_season in ["2024-25","2023-24","2022-23","2021-22"]:
                prev = by_norm_season.get((nm, back_season))
                if prev and prev.get("team"):
                    team = prev["team"]
                    break
        if not team:
            continue
        payroll_next_inferred[(team, season_next)] += amt
        payroll_counts_next_inferred[(team, season_next)] += 1
        by_team_next_inferred[(team, season_next)].append((nm, amt, v.get("name")))
    for k,v in payroll_next_inferred.items():
        payroll[k] = v
    for k,v in payroll_counts_next_inferred.items():
        payroll_counts[k] = v
    for k,v in by_team_next_inferred.items():
        by_team_season_player[k] = v

    for t in output_teams:
        abbr = t["abbr"]
        pw_next = payroll.get((abbr, season_next), 0)
        pw_next_m = round(pw_next/1_000_000,2) if pw_next else 0
        cap_pct_next = round(pw_next/cap_next,3) if cap_next and pw_next else None
        cap_space_next = cap_next - pw_next if cap_next else None
        cap_space_m = round(cap_space_next/1_000_000,2) if cap_space_next is not None else None
        committed = payroll_counts.get((abbr, season_next), 0)
        plist_next = by_team_season_player.get((abbr, season_next), [])
        if plist_next:
            top = max(plist_next, key=lambda x: x[1])
        else:
            top = None
        t["payroll_2025_26"] = pw_next
        t["payroll_m_2025_26"] = pw_next_m
        t["cap_pct_2025_26"] = cap_pct_next
        t["cap_space_m_2025_26"] = cap_space_m
        t["cap_2025_26"] = cap_next
        t["committed_2025_26"] = committed
        t["top_earner_2025_26"] = {"name": top[2], "salary_m": round(top[1]/1_000_000,2)} if top else None

        tax_next = TAX_THRESHOLD_BY_SEASON.get(season_next) if TAX_THRESHOLD_BY_SEASON else None
        apron1_next = APRON1_BY_SEASON.get(season_next) if APRON1_BY_SEASON else None
        apron2_next = APRON2_BY_SEASON.get(season_next) if APRON2_BY_SEASON else None
        cba_next = CBA_BY_SEASON.get(season_next) if CBA_BY_SEASON else None
        tv_next = TV_DEAL_BY_SEASON.get(season_next) if TV_DEAL_BY_SEASON else None
        t["cap_rules_2025_26"] = {
            "cap": cap_next,
            "tax": tax_next,
            "apron1": apron1_next,
            "apron2": apron2_next,
            "cba": cba_next,
            "tv_deal": tv_next,
        }
        over_tax = pw_next > tax_next if tax_next and pw_next else False
        over_apron1 = pw_next > apron1_next if apron1_next and pw_next else False
        over_apron2 = pw_next > apron2_next if apron2_next and pw_next else False
        t["tax_apron_status_2025_26"] = {
            "over_tax": over_tax,
            "over_apron1": over_apron1,
            "over_apron2": over_apron2,
            "tax_level": tax_next,
            "apron1_level": apron1_next,
            "apron2_level": apron2_next,
        }
        flex_pct = cap_pct_next or 0
        if flex_pct == 0:
            flex_grade = "—"
        elif flex_pct < 0.80:
            flex_grade = "A+"
        elif flex_pct < 0.92:
            flex_grade = "A"
        elif flex_pct < 1.00:
            flex_grade = "B+"
        elif flex_pct < 1.10:
            flex_grade = "B"
        elif flex_pct < 1.25:
            flex_grade = "B-"
        else:
            flex_grade = "C"
        if over_apron2:
            flex_grade = "D"
        elif over_apron1:
            if flex_grade in ("A+", "A", "B+", "B"):
                flex_grade = "B-" if flex_grade in ("A+", "A") else "C+"
        elif over_tax:
            if flex_grade == "A+":
                flex_grade = "A"
        t["flexibility_2025_26"] = {"cap_pct": cap_pct_next, "grade": flex_grade, "over_tax": over_tax, "over_apron1": over_apron1, "over_apron2": over_apron2}

    output_teams_sorted = sorted(output_teams, key=lambda x: x["for_score"], reverse=True)
    for i, t in enumerate(output_teams_sorted):
        t["for_rank"] = i+1
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
        t["for_grade"] = rank_grade(t["for_rank"])

    out_payload = {
        "built": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season_focus": season_focus,
        "season_cap": CAP_BY_SEASON.get(season_focus) if CAP_BY_SEASON else cap,
        "season_next": season_next,
        "season_next_cap": cap_next,
        "method": {
            "draft": "First-5-season quality-adjusted minutes (PTS vol + PLUS_MINUS) trimmed, z-scored, includes 2020-25 to capture Flagg/Harper. Projects partial careers linearly (actual_qual / completion), rewards Wemby/Castle early elite: exp = trimmed mean qual_adj 1996-2022 per overall pick, surplus = projected_5yr - exp, seasons 0 => -0.6*exp. Avg surplus z 50+z*18 0-100. Rookie retention bonus 15% if year>=2021 + still on drafting team 20+GP. Bust mitigation 40% reduced negative if cut/traded within 2 seasons.",
            "cap": "Wins per $1M payroll 2024-25. Score 50=median W/$M. Cap% payroll/cap $140.588M.",
            "foresight": "2024-25 players 20+GP expected salary=median_sal*(0.4+0.8*tm/median_tm) capped 3x. Surplus=exp-actual >$1M kept. Retained bonus 1.25x if same team and sal growth <= cap growth+5%. Score 50+surplus/6M*10. Timing: contract timelines inferred from salary history contiguous same team + growth <=50%. Timing multiplier =1+0.08*age +0.12*max(0,maturation_ratio-1)*3 where maturation_ratio=(1+cap_growth)/(1+salary_growth). Older flat deals signed when cap $90-110M now $140-154M get boosted. Jokic-like 2018 $26M deal maturation high.",
            "cap_2025_26": "Payroll sum 2025-26 inferred (team missing -> backfill 2024-25). cap_pct, cap_space, flexibility grade era-aware: <80% A+ <92% A <100% B+ <110% B <125% B- else C, downgraded to D if over 2nd apron $207.8M (hard-cap no MLE/agg/frozen pick). Tax $187.9M, Apron1 $195.9M.",
            "composite": "FOR = 0.35*zDraft + 0.35*cap + 0.30*foresight rank-curved A+ top 7%. Foresight now includes timing multiplier so long cheap locks get more credit. Avg contract age tie-breaker narrative.",
            "sources": "draft_history.json, vectors.json v[0] PTS v[13] +/- total_min gp mpg, salaries_merged 16678 with contract timeline inference, team_base, CAP_BY_SEASON 1996-2027 + TAX/APRON/CBA/TV era",
            "quality_multiplier": "q=1.0+0.12*PLUS_MINUS +0.05*PTS clamp 0.65-1.65, qual_adj = sum(tm*q)",
            "timing": "Contract maturation: bargains weighted by age and cap-vs-salary growth since signing. Older flat deals signed when cap $90-110M now at $140-154M get +8%/yr +12%*maturation. Rookie draft retention bonus 15% if still on drafting team 20+GP. Busts mitigated 40% if cut/traded within 2 seasons. Avg contract age per team added as rebuild narrative.",
            "timing_notes": "Salary history team changes >1yr gap or >50% raise or <-20% cut = new deal. Initial cap pct = start_salary / CAP_start. Current cap pct = 2024-25 salary / 140.5M. Improvement positive = deal cheaper relative to cap as $136M->$140.5M->$154M rises. Maturation ratio >1 when cap outruns salary. Timing multiplier amplifies adj surplus."
        },
        "median": {"wpm": round(median_wpm,3), "median_sal_m": round(median_sal/1_000_000,2) if 'median_sal' in locals() else None, "draft_mean_surplus": round(mean_s,1) if 'mean_s' in locals() else None, "draft_stdev": round(stdev_s,1) if 'stdev_s' in locals() else None, "expected_first5_pick1": expected_first5.get(1), "expected_first5_pick30": expected_first5.get(30)},
        "expected_pick_first5": expected_first5,
        "expected_pick_legacy_full": expected_pick_legacy,
        "teams": output_teams_sorted,
        "teams_by_abbr": {t["abbr"]: t for t in output_teams_sorted}
    }

    out_dir = ASSETS / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "front_office.json"
    out_path.write_text(json.dumps(out_payload, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    (ASSETS / "front_office.json").write_text(json.dumps(out_payload, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_path} ({len(output_teams_sorted)} teams) + assets/front_office.json")
    print(f"top 3: {[(t['abbr'], t['for_score'], t['for_grade']) for t in output_teams_sorted[:3]]}")
    print(f"bottom 3: {[(t['abbr'], t['for_score'], t['for_grade']) for t in output_teams_sorted[-3:]]}")
    # sanity: SAS should be high due to Wemby/Castle/Harper
    sas = next((x for x in output_teams_sorted if x['abbr']=='SAS'), None)
    if sas:
        print(f"SAS draft score {sas['draft']['score']} avg_surplus {sas['draft']['avg_surplus_min']} picks sample {sas['draft']['picks'][:2]}")
        print(f"SAS foresight avg_contract_age {sas['foresight'].get('avg_contract_age')} surplus_total_m {sas['foresight'].get('surplus_total_m')}")
        for bd in sas['foresight']['bargain_deals'][:3]:
            print(f"SAS bargain {bd}")
    dal = next((x for x in output_teams_sorted if x['abbr']=='DAL'), None)
    if dal:
        for p in dal['draft']['picks']:
            if 'flagg' in p['player'].lower():
                print(f"DAL Flagg pick {p}")
    bos = next((x for x in output_teams_sorted if x['abbr']=='BOS'), None)
    if bos:
        print(f"BOS foresight {bos['foresight']['surplus_total_m']} deals {bos['foresight']['bargain_deals'][:2]}")

if __name__ == "__main__":
    main()

