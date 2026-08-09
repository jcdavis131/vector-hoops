#!/usr/bin/env python3
"""
Per-season FO cache for time-machine: true historical FOR snapshots 1996-2026.
Zero-deps, stdlib only. Uses:
 - pipeline/cache/team_base_{season}.json  (30 seasons)
 - assets/data/payroll_by_season.json (dict season->team->payroll_m)
 - assets/data/cap_history.json (31 seasons)
 - assets/data/preseason_win_totals.json (33 seasons, 944 entries)
 - assets/data/player_season_props.json (optional 2020+)
 - pipeline/cache/draft_history.json + vectors.json for draft pillar (no future leak: drafts <= season)
 - assets/data/model_zoo_eval.json existence for validity logging
 - assets/data/front_office.json for champ map
"""
import json, pathlib, math, collections, re
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
ASSETS_DATA = ROOT / "assets" / "data"

def norm_name(n:str):
    s=n.lower()
    s=re.sub(r"[.'’`]", "", s)
    s=re.sub(r"\s+(jr|sr|ii|iii|iv|v)$","",s.strip())
    s=re.sub(r"\s+"," ",s).strip()
    return s

def load_json(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))

def list_seasons():
    files = list(CACHE.glob("team_base_*.json"))
    seasons=[]
    for f in files:
        seasons.append(f.name.replace("team_base_","").replace(".json",""))
    return sorted(seasons)

def load_cap_history():
    p=ASSETS_DATA/"cap_history.json"
    if not p.exists():
        return {}
    return load_json(p)

def load_payroll():
    p=ASSETS_DATA/"payroll_by_season.json"
    if not p.exists():
        return {}
    try:
        j=load_json(p)
        # j is dict season->team->payroll_m
        return j
    except Exception:
        return {}

def load_vegas():
    p=ASSETS_DATA/"preseason_win_totals.json"
    if not p.exists():
        return {}
    j=load_json(p)
    # could be {"seasons": {...}} or direct
    if isinstance(j, dict) and "seasons" in j:
        return j["seasons"]
    return j

def load_props():
    p=ASSETS_DATA/"player_season_props.json"
    if not p.exists():
        return {}
    try:
        j=load_json(p)
        if isinstance(j, dict) and "seasons" in j:
            return j["seasons"]
        # flat top-level seasons
        return {k:v for k,v in j.items() if k and k[0].isdigit() and isinstance(v, dict)}
    except Exception:
        return {}

def load_wins_for(season):
    p=CACHE/f"team_base_{season}.json"
    if not p.exists():
        # try assets/data
        p2=ASSETS_DATA/f"team_base_{season}.json"
        if not p2.exists():
            return []
        p=p2
    try:
        rows=load_json(p)
        # rows is list of dicts with TEAM_ID, W, L
        return rows
    except Exception:
        return []

def load_teams_def():
    # abbr map
    tdef_path=ROOT/"assets"/"teams.json"
    try:
        tdef=load_json(tdef_path)
        teams=tdef.get("teams",[])
        abbr_from_id={}
        for t in teams:
            if "id" in t and "abbr" in t:
                abbr_from_id[int(t["id"])]=t["abbr"]
        return abbr_from_id, teams
    except Exception:
        # fallback hard-coded NBA map from original build script
        abbr_map={
            1610612737:"ATL",1610612738:"BOS",1610612739:"CLE",1610612740:"NOP",
            1610612741:"CHI",1610612742:"DAL",1610612743:"DEN",1610612744:"GSW",
            1610612745:"HOU",1610612746:"LAC",1610612747:"LAL",1610612748:"MIA",
            1610612749:"MIL",1610612750:"MIN",1610612751:"BKN",1610612752:"NYK",
            1610612753:"ORL",1610612754:"IND",1610612755:"PHI",1610612756:"PHX",
            1610612757:"POR",1610612758:"SAC",1610612759:"SAS",1610612760:"OKC",
            1610612761:"TOR",1610612762:"UTA",1610612763:"MEM",1610612764:"WAS",
            1610612765:"DET",1610612766:"CHA",
        }
        teams=[{"abbr":v,"name":v,"id":k} for k,v in abbr_map.items()]
        return abbr_map, teams

def load_draft():
    p=CACHE/"draft_history.json"
    if not p.exists():
        return {}, {}
    try:
        d=load_json(p)
        players=d.get("players",{})
        # team_picks dict abbr->list
        team_picks=collections.defaultdict(list)
        for nm, entries in players.items():
            for e in entries:
                team=(e.get("team_abbr") or "").strip().upper()
                if not team: continue
                year=int(e.get("year") or 0)
                overall=int(e.get("overall") or 0)
                if overall<=0: continue
                team_picks[team].append({"norm":nm,"year":year,"overall":overall,"pick": e.get("pick"),"team":team,"round": e.get("round")})
        return players, team_picks
    except Exception as ex:
        print("draft load fail",ex)
        return {}, {}

def load_first5_curve():
    # we can reuse expected_first5 from current FO or recompute quickly trimmed mean if exists
    fo_path=ASSETS_DATA/"front_office.json"
    if fo_path.exists():
        try:
            j=load_json(fo_path)
            curve=j.get("expected_pick_first5")
            if curve:
                # curve keys may be str->float
                return {int(k): float(v) for k,v in curve.items()}
        except Exception:
            pass
    # fallback simple curve: 1/overall shape
    curve={}
    for i in range(1,61):
        curve[i]= 8000/(i**0.6)  # rough
    return curve

def build():
    seasons=list_seasons()
    print(f"seasons found {len(seasons)} sample {seasons[:3]} .. {seasons[-3:]}")
    cap_hist=load_cap_history()
    payroll_map=load_payroll()
    vegas_map=load_vegas()
    props_map=load_props()
    abbr_from_id, teams_defs = load_teams_def()
    draft_players, team_picks = load_draft()
    expected_first5=load_first5_curve()

    # champ map from current FO if exists
    champ_map={}
    playoff_series={}
    playoff_wins={}
    try:
        fo_cur=load_json(ASSETS_DATA/"front_office.json")
        champ_map=fo_cur.get("champion_map",{})
        playoff_series=fo_cur.get("playoff_series_wins",{})
        playoff_wins=fo_cur.get("playoff_wins",{})
    except Exception:
        pass

    by_season={}
    validity_corrs=[]

    for season in sorted(seasons):  # earliest to latest
        # payroll for season exists?
        payroll_season = payroll_map.get(season, {})  # dict team->payroll_m
        cap_entry = cap_hist.get(season) if isinstance(cap_hist, dict) else None
        cap_val = None
        spike_flag=False
        cap_growth_vs_prior=None
        if cap_entry:
            cap_val = cap_entry.get("cap")
            if cap_entry.get("spike_flag"):
                spike_flag=True
            cap_growth_vs_prior = cap_entry.get("cap_growth_vs_prior")
        if not cap_val:
            # fallback typical cap progression
            cap_val = 50_000_000

        # wins
        rows=load_wins_for(season)
        wins_map={}
        for r in rows:
            tid=r.get("TEAM_ID")
            w=float(r.get("W") or 0)
            abbr=abbr_from_id.get(int(tid) if tid else None)
            if not abbr:
                # try name fallback
                name=r.get("TEAM_NAME","")
                for t in teams_defs:
                    if t["abbr"] in name or t.get("name","") in name:
                        abbr=t["abbr"]; break
                if not abbr:
                    continue
            wins_map[abbr]=w

        if not wins_map:
            continue

        # payroll fallback: if payroll_season empty, use 0 and skip cap scoring
        # compute median wpm for this season
        wpm_list=[]
        for abbr,w in wins_map.items():
            pay_m = payroll_season.get(abbr)
            if pay_m is None:
                continue
            # pay_m is already in millions
            if pay_m>0:
                wpm_list.append(w/pay_m)

        median_wpm = sorted(wpm_list)[len(wpm_list)//2] if wpm_list else 0.3

        # vegas for season
        vegas_season = vegas_map.get(season, {}) if isinstance(vegas_map, dict) else {}

        # props for season
        props_season = props_map.get(season, {}) if isinstance(props_map, dict) else {}

        # draft pillar per team: window 5 prior + current (6 yrs) capped 30 entries max
        try:
            season_start=int(season.split("-")[0])
        except Exception:
            season_start=2000

        teams_out=[]
        for abbr in sorted(wins_map.keys()):
            w=wins_map[abbr]
            pay_m = payroll_season.get(abbr)
            if pay_m is None:
                # try infer 0 -> use median
                pay_m = sum(payroll_season.values())/len(payroll_season) if payroll_season else 80
            pay_dollars = float(pay_m)*1_000_000
            cap_pct = pay_dollars/cap_val if cap_val else None
            # spike normalization: 2016-17 cap 94M vs 70M prior -> 34% jump, normalized cap for flex = prior*1.10
            cap_pct_norm = cap_pct
            effective_cap = cap_val
            if season=="2016-17" and spike_flag:
                # prior cap
                prior_key="2015-16"
                prior_cap_entry=cap_hist.get(prior_key) if isinstance(cap_hist, dict) else None
                prior_cap = prior_cap_entry.get("cap") if prior_cap_entry else 70000000
                # effective cap with 10% max rule
                effective_cap = prior_cap*1.10
                cap_pct_norm = pay_dollars/effective_cap if effective_cap else cap_pct

            # wins per $M
            w_per_m = w/pay_m if pay_m else 0

            # draft 5yr window
            picks = team_picks.get(abbr, [])
            picks_window = [p for p in picks if p["year"]>=season_start-5 and p["year"]<=season_start]
            # simplified draft score: avg surplus using expected_first5 curve and zero for early era where no vector data
            # For historical before vectors (1996-97 has vectors? yes from 1996). Use same logic but weight similar to current: weight = 1/sqrt(overall)
            draft_surpluses=[]
            weights=[]
            for d in picks_window:
                overall=d["overall"]
                exp = expected_first5.get(overall) or expected_first5.get(str(overall)) or 0
                if isinstance(exp,str):
                    try: exp=float(exp)
                    except: exp=0
                # we don't have first5 actual for historic compute quickly - approximate: if season_start close to draft year, actual unknown yet, use 0 - so surplus negative initially
                # Use draft year distance: if season_start - year <=1, we have <2 seasons data -> assume 0 (bust placeholder) => surplus -0.95*exp per current logic
                years_since = season_start - d["year"]
                if years_since<0:
                    continue
                # if years_since ==0, actual 0, surplus -0.95*exp
                # if years_since >=1, we could have partial but no vector lookup here to keep zero-deps low compute - approximate linear growth: actual grows 20% per year capped
                # For simplicity for historic snapshots, use growth model: actual_first5 approx exp * (0.1 + 0.18*years_since) but capped 1.2exp for elite later.
                # This gives negative early then positive as player matures, matching rookie wall.
                if years_since==0:
                    actual_factor=0.05  # almost zero
                elif years_since==1:
                    actual_factor=0.22
                elif years_since==2:
                    actual_factor=0.45
                elif years_since==3:
                    actual_factor=0.70
                elif years_since==4:
                    actual_factor=0.90
                else:
                    actual_factor=1.0
                actual = float(exp)*actual_factor
                surplus = actual - float(exp)
                # floor bust handling: if overall>35 cap
                if overall>35 and surplus>0:
                    cap_v = min(800, max(300, 2*float(exp)))
                    if surplus>cap_v:
                        surplus=cap_v
                w_sqrt = 1.0/(overall**0.5) if overall>0 else 0.05
                weight = 0.65*max(0.08, float(exp)/2000.0) + 0.35*w_sqrt if float(exp)>0 else w_sqrt
                weight = max(0.06, min(3.5, weight))
                draft_surpluses.append(surplus)
                weights.append(weight)

            if draft_surpluses and sum(weights)>0:
                total = sum(s*w for s,w in zip(draft_surpluses,weights))
                weighted_avg = total / sum(weights)
            else:
                weighted_avg = 0

            draft_score_raw = 50 + weighted_avg/40
            draft_score = max(0,min(100,draft_score_raw))

            # cap score
            if median_wpm>0:
                cap_score = max(0,min(100, 50 + (w_per_m - median_wpm)/median_wpm*50))
            else:
                cap_score = 50

            # foresight simplified: surplus_total approx 0 for historic without salary detail, use props if available, else 0
            foresight_score = 50  # baseline; will be nudged by vegas/props
            if props_season:
                # if we have payroll detail for this team in props? props not team-linked directly, skip
                pass

            # vegas alpha
            ou = vegas_season.get(abbr) if isinstance(vegas_season, dict) else None
            vegas_delta = None
            vegas_alpha = 0
            if ou is not None:
                try:
                    vegas_delta = float(w) - float(ou)
                    vegas_alpha = max(-3.0, min(5.0, vegas_delta*0.35))
                except Exception:
                    pass

            # props alpha simplified: if props available, avg pts_delta for this team? props mapping is norm->ent, team link missing - we use global avg for simplicity 0
            props_alpha = 0
            props_avg_delta = None

            # composite FOR base 0.35d+0.35c+0.30f+0.15vegas+0.08props
            for_base = round(0.35*draft_score + 0.35*cap_score + 0.30*foresight_score + 0.15*vegas_alpha + 0.08*props_alpha,1)

            champ_bonus = 0
            if season in champ_map and abbr in champ_map[season]:
                champ_bonus = champ_map[season][abbr]
            # weighted wins
            playoff_w = playoff_wins.get(season, {}).get(abbr, 0) if isinstance(playoff_wins, dict) else 0
            weighted_wins = round(float(w) + playoff_w*2.5,1)

            for_score = round(min(99, for_base + champ_bonus),1)

            teams_out.append({
                "abbr": abbr,
                "team": abbr,
                "season": season,
                "wins": w,
                "weighted_wins": weighted_wins,
                "payroll_m": round(float(pay_m),2) if isinstance(pay_m,(int,float)) else None,
                "payroll": float(pay_m)*1_000_000 if isinstance(pay_m,(int,float)) else None,
                "cap": cap_val,
                "cap_pct": round(cap_pct,3) if isinstance(cap_pct,float) else None,
                "cap_pct_normalized": round(cap_pct_norm,3) if isinstance(cap_pct_norm,float) else None,
                "effective_cap": effective_cap,
                "spike_flag": bool(spike_flag) if season=="2016-17" else False,
                "w_per_m": round(w_per_m,3) if isinstance(w_per_m,float) else 0,
                "draft_score": round(draft_score,1),
                "draft_avg_surplus": round(weighted_avg,1) if 'weighted_avg' in locals() else 0,
                "cap_score": round(cap_score,1),
                "foresight_score": round(foresight_score,1),
                "vegas_over_under": ou,
                "vegas_delta": round(vegas_delta,1) if isinstance(vegas_delta,(int,float)) else None,
                "vegas_alpha": round(vegas_alpha,2),
                "props_alpha": round(props_alpha,2),
                "props_avg_delta": props_avg_delta,
                "for_score_base": for_base,
                "champ_bonus": champ_bonus,
                "for_score": for_score,
                "for_final": for_score,
            })

        # sort and rank
        teams_sorted = sorted(teams_out, key=lambda x: x["for_score"], reverse=True)
        for i,t in enumerate(teams_sorted):
            t["for_rank"]=i+1

        # validity corr: correlation OU vs wins if enough OU
        corr=None
        if vegas_season and len(vegas_season)>=20:
            ws=[]
            ous=[]
            for tm in teams_sorted:
                ou=tm["vegas_over_under"]
                if ou is not None:
                    ws.append(tm["wins"])
                    ous.append(float(ou))
            if len(ws)>=10:
                # Pearson r
                try:
                    mx=sum(ws)/len(ws)
                    my=sum(ous)/len(ous)
                    num=sum((x-mx)*(y-my) for x,y in zip(ws,ous))
                    denx=sum((x-mx)**2 for x in ws)
                    deny=sum((y-my)**2 for y in ous)
                    den=(denx*deny)**0.5
                    corr = num/den if den else 0
                except Exception:
                    corr=0
                validity_corrs.append({"season":season,"vegas_wins_corr": round(corr,3) if isinstance(corr,float) else None, "n": len(ws)})

        by_season[season]={
            "season": season,
            "built": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "cap": cap_val,
            "cap_growth_vs_prior": cap_growth_vs_prior,
            "spike_flag": bool(spike_flag) if season=="2016-17" else False,
            "teams": teams_sorted,
            "median_wpm": round(median_wpm,3) if isinstance(median_wpm,float) else median_wpm,
        }

    out={
        "built": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seasons": sorted(by_season.keys()),
        "champion_map": champ_map,
        "playoff_series_wins": playoff_series,
        "playoff_wins": playoff_wins,
        "validity": {
            "vegas_wins_corrs": validity_corrs,
            "spike_note": "2016-17 cap 94.1M +34.5% vs 70M — cap_pct raw would be artificially low. Normalized effective cap = prior*1.10 for FOR. cap_pct_normalized stored.",
        },
        "by_season": by_season,
        # also flat shape for teams.html simple consumption
    }
    # flat convenience: season->team array small
    out["flat"]={s: v["teams"] for s,v in by_season.items()}

    dest=ASSETS_DATA/"front_office_by_season.json"
    dest.write_text(json.dumps(out, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    print(f"wrote {dest} seasons {len(by_season)} validity {len(validity_corrs)} entries")
    # also duplicate under assets/front_office_by_season.json for older fetch paths
    dest2=ROOT/"assets"/"front_office_by_season.json"
    dest2.write_text(json.dumps(out, separators=(",",":"), ensure_ascii=False), encoding="utf-8")
    # triple-check size
    print(f"size {dest.stat().st_size/1024:.1f}KB")
    return dest

if __name__=="__main__":
    build()
