import json, math, os, random

teams = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WAS']

# Base 2024-25 valuations in millions based on Forbes 2024 published roughly (2023-24 season valuations published Oct 2024)
# Forbes 2024 values (approx):
base_2024 = {
'GSW': 9140,
'NYK': 7500,
'LAL': 7100,
'CHI': 5730,
'HOU': 5420,
'BKN': 4990,  # nets
'LAC': 5050,
'BOS': 4960,
'DAL': 4700,
'PHI': 4400,
'TOR': 4250,
'PHX': 4300,
'MIA': 4250,
'GSW': 9140,
'WAS': 3950,
'DEN': 3640,
'MIL': 3500,
'CLE': 3400,
'POR': 3400,
'SAC': 3350,
'UTA': 3300,
'OKC': 3250,
'IND': 3180,
'ATL': 3110,
'SAS': 3080,
'DET': 3030,
'MIN': 2960,
'CHA': 2870,
'MEM': 2780,
'NOP': 2710,
'ORL': 2930,
}
# Fill missing with avg
for t in teams:
    if t not in base_2024:
        base_2024[t]=3200

# tweak to ensure GSW duplicate fix already
base_2024['GSW']=9140

# Growth model: 2014-15 to 2025-26
# Use annual growth 10-15% earlier, 8-12% later, plus market modifiers
market_mod = {
'GSW': 1.25, 'NYK':1.2,'LAL':1.2,'CHI':1.1,'BKN':1.08,'LAC':1.08,'HOU':1.05,'BOS':1.1,
'DAL':1.05,'PHI':1.02,'TOR':1.0,'PHX':1.03,'MIA':1.04,'WAS':0.98,'DET':0.92,'MIN':0.92,
'CHA':0.9,'MEM':0.89,'NOP':0.88,'ORL':0.91,'ATL':0.95,'POR':0.94,'UTA':0.93,'OKC':0.94,
'IND':0.96,'SAC':0.97,'CLE':0.99,'MIL':1.0,'DEN':1.01,'SAS':0.99
}

seasons = [f"{y}-{str(y+1)[-2:]}" for y in range(2014,2026)]  # 2014-15 to 2025-26 inclusive -> 12
# Actually need 2014-15 .. 2025-26 inclusive = 12 seasons? 2014->2015 is 1, up to 2025->2026 = 12 yes

# growth per year base
# We will compute valuation per season by reverse engineering from 2024-25
# 2024-25 is index where y=2024
results = []
# We'll forward project 2025-26 as +8-13%
for y,season in enumerate(seasons):
    for abbr in teams:
        # valuation for this season
        base = base_2024[abbr]
        # distance from 2024-25
        # 2024-25 is y where season == "2024-25" => y=10 (2014=0)
        dist = 10 - y  # positive if earlier
        # growth rate per year inverse
        # earlier years smaller valuation => discount
        # annual historical growth factor ~ 1.11 average modulated
        annual = 1.11 * market_mod.get(abbr,1.0)*0.95 + 0.05  # rough 10-15%
        # but for earlier years reduce a bit volatility
        # Compute valuation_m = base / (annual^(dist)) with some noise
        if dist>=0:
            # earlier
            val = base / ( (1.10 + (market_mod[abbr]-1)*0.15) ** dist )
        else:
            # 2025-26 future: + growth
            growth_future = 0.09 + (market_mod[abbr]-0.9)*0.04  # 0.09-0.13
            val = base * (1+growth_future) ** abs(dist)
            # add champion boost 2025-26 NYK slightly higher
            if season=="2025-26" and abbr=="NYK":
                val *=1.08
            if season=="2025-26" and abbr=="SAS":
                val *=1.04

        # round to nearest 10
        val = round(val/10)*10
        # revenue approx 10-13% of valuation
        revenue = round(val * (0.10 + random.uniform(-0.015,0.015)) )
        # operating income ~ 15-25% of revenue
        op_inc = round(revenue * (0.18 + random.uniform(-0.06,0.08)) )
        # growth pct vs prior season computed later
        results.append({
            "season": season,
            "team": abbr,
            "abbr": abbr,
            "valuation_m": int(val),
            "revenue_m": int(revenue),
            "operating_income_m": int(op_inc),
            "source": "forbes_synth_estimated_for_training",
            "note": "historical training not gambling - synthesized from 2024 Forbes published with 10-13% growth and market mod"
        })

# compute yoy growth
from collections import defaultdict
prev = {}
# sort by season asc then team
results_sorted = sorted(results, key=lambda x: (x["season"], x["team"]))
final=[]
for r in results_sorted:
    key=r["team"]
    s=r["season"]
    cur_val=r["valuation_m"]
    if key in prev:
        growth = round((cur_val - prev[key])/prev[key]*100,2)
    else:
        growth = None
    r["year_over_year_growth_pct"]=growth
    r["yoy_growth_pct"]=growth
    prev[key]=cur_val
    final.append(r)

# Write team_valuations.json flat array
out_path = "~/workspace/vector-hoops/assets/data/team_valuations.json"
os.makedirs(os.path.dirname(os.path.expanduser(out_path)), exist_ok=True)
with open(os.path.expanduser(out_path),"w") as f:
    json.dump(final,f,indent=2)
print(f"Wrote {len(final)} entries to {out_path}")

# valuation_history.json wide
wide={}
for r in final:
    abbr=r["abbr"]
    if abbr not in wide:
        wide[abbr]=[]
    wide[abbr].append({"season":r["season"],"valuation_m":r["valuation_m"],"revenue_m":r["revenue_m"],"operating_income_m":r["operating_income_m"],"yoy":r["year_over_year_growth_pct"]})

with open(os.path.expanduser("~/workspace/vector-hoops/assets/data/valuation_history.json"),"w") as f:
    json.dump(wide,f,indent=2)
print("Wrote valuation_history")

# quick sample
print(json.dumps([x for x in final if x["team"]=="NYK"][-3:],indent=2))
print(json.dumps([x for x in final if x["team"]=="GSW"][-3:],indent=2))
