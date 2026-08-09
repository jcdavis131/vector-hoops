#!/usr/bin/env python3
"""
Zero-deps baseline player season props from prior-season averages.

Builds assets/data/player_season_props.json

Structure:
{
  built: iso,
  source: "baseline prior-year avg rounded 0.5 as prop",
  seasons: {
    "2025-26": {
        "victorwembanyama": {
           name: "Victor Wembanyama",
           pts_prop: 22.5, reb_prop: 10.5, ast_prop: 3.5,
           pts_actual: 25.0, reb_actual: 12.1, ast_actual: 4.2,
           pts_delta: 2.5, reb_delta: 1.6, ast_delta: 0.7,
           delta: 2.5,
           gp: 64
        }
    }
  }
}

Seasons covered: 2020-21 .. 2025-26 (plus 2026-27 stub)
Prev-season logic: prop = round(prev_actual*2)/2 clipped at 0.5 steps.
If no prev, fallback to actual rounded.
"""
import json, re, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT/"pipeline"/"cache"
OUT = ROOT/"assets"/"data"/"player_season_props.json"

def norm_name(s: str)->str:
    return re.sub(r'[^a-z0-9]', '', s.lower())

def round_half(x):
    if x is None:
        return None
    try:
        f=float(x)
    except:
        return None
    return round(f*2)/2.0

seasons = ["2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"]
# include 2026-27 as empty copy-forward
seasons_all = seasons + ["2026-27"]

season_actuals = {}  # season -> dict norm -> {name, pts, reb, ast, gpish}
for seas in seasons:
    p = CACHE/f"base_{seas}.json"
    if not p.exists():
        print(f"missing base {seas}")
        season_actuals[seas] = {}
        continue
    try:
        doc = json.loads(p.read_text())
    except Exception as e:
        print(f"fail {seas} {e}")
        season_actuals[seas]={}
        continue
    mp={}
    # doc is dict name->stats
    for name, st in doc.items():
        if not isinstance(st, dict):
            continue
        n = norm_name(name)
        pts = st.get("PTS")
        ast = st.get("AST")
        oreb = st.get("OREB",0)
        dreb = st.get("DREB",0)
        reb = None
        if oreb is not None and dreb is not None:
            try:
                reb = float(oreb)+float(dreb)
            except:
                reb = None
        # try gp from matchup_enriched if available for count filter
        mp[n] = {"name": name, "pts": pts, "reb": reb, "ast": ast, "oreb": oreb, "dreb": dreb}
        # handle duplicate norm collision: keep entry with highest pts to favor real NBA minutes
        # duplicate handling done via max pts strategy separate pass - simple second iteration max
    # dedup maximization
    dedup={}
    for n,v in mp.items():
        if n not in dedup:
            dedup[n]=v
        else:
            # keep higher pts
            try:
                if float(v.get("pts") or 0) > float(dedup[n].get("pts") or 0):
                    dedup[n]=v
            except:
                pass
    season_actuals[seas]=dedup
    print(f"{seas} {len(dedup)} unique norms")

# Now enrich with gp from matchup_enriched for filtering counts but optional
gp_map = {} # season -> norm -> gp
for seas in seasons:
    ep = CACHE/f"matchup_enriched_{seas}.json"
    if not ep.exists():
        continue
    try:
        ej=json.loads(ep.read_text())
        players=ej.get("players",[])
        if isinstance(players, dict):
            # unlikely
            players=list(players.values())
        for pl in players:
            if not isinstance(pl, dict):
                continue
            n=pl.get("norm")
            if not n:
                n=norm_name(pl.get("name",""))
            gp=pl.get("gp")
            if n and gp is not None:
                gp_map.setdefault(seas,{})[n]=gp
    except Exception as e:
        print(f"gp enrich fail {seas} {e}")

# Build props
out_seasons={}
prev_map=None
for idx,seas in enumerate(seasons):
    cur = season_actuals.get(seas,{})
    prev = season_actuals.get(seasons[idx-1], {}) if idx>0 else {}
    out={}
    for n, cur_v in cur.items():
        pts_actual = cur_v.get("pts")
        reb_actual = cur_v.get("reb")
        ast_actual = cur_v.get("ast")
        if pts_actual is None and reb_actual is None and ast_actual is None:
            continue
        # prev lookup
        prev_v = prev.get(n)
        if prev_v:
            pts_prop = round_half(prev_v.get("pts"))
            reb_prop = round_half(prev_v.get("reb"))
            ast_prop = round_half(prev_v.get("ast"))
        else:
            # rookie or no prev: use current rounded as prop = market expectation = slightly below actual? We'll use current rounded
            pts_prop = round_half(pts_actual)
            reb_prop = round_half(reb_actual)
            ast_prop = round_half(ast_actual)
        # deltas
        def delta(a,p):
            if a is None or p is None:
                return None
            try:
                return round(float(a)-float(p),2)
            except:
                return None
        pts_d = delta(pts_actual, pts_prop)
        reb_d = delta(reb_actual, reb_prop)
        ast_d = delta(ast_actual, ast_prop)
        # overall delta = pts delta as primary
        overall = pts_d
        entry={
            "name": cur_v.get("name"),
            "pts_prop": pts_prop,
            "reb_prop": reb_prop,
            "ast_prop": ast_prop,
            "pts_actual": pts_actual,
            "reb_actual": round(float(reb_actual),2) if reb_actual is not None else None,
            "ast_actual": ast_actual,
            "pts_delta": pts_d,
            "reb_delta": round(float(reb_d),2) if isinstance(reb_d,float) else reb_d,
            "ast_delta": ast_d,
            "delta": overall,
        }
        gp = gp_map.get(seas,{}).get(n)
        if gp is not None:
            entry["gp"]=gp
        out[n]=entry
    out_seasons[seas]=out
    print(f"built {seas} {len(out)} props, sample {list(out.values())[:1]}")

# 2026-27 stub: copy forward from 2025-26 as projection (props = 2025-26 actual)
if "2025-26" in out_seasons:
    proj={}
    for n, v in out_seasons["2025-26"].items():
        proj[n]={
            "name": v["name"],
            "pts_prop": v["pts_actual"] and round_half(v["pts_actual"]),
            "reb_prop": v["reb_actual"] and round_half(v["reb_actual"]),
            "ast_prop": v["ast_actual"] and round_half(v["ast_actual"]),
            "pts_actual": None,
            "reb_actual": None,
            "ast_actual": None,
            "pts_delta": None,
            "reb_delta": None,
            "ast_delta": None,
            "delta": None,
            "proj": True
        }
    out_seasons["2026-27"]=proj

final={
    "built": datetime.datetime.utcnow().isoformat()+"Z",
    "source": "baseline prior-season avg rounded to 0.5 as prop; fallback current rounded if rookie",
    "coverage": {k: len(v) for k,v in out_seasons.items()},
    "seasons": out_seasons
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(final, indent=2))
print(f"Wrote {OUT} coverage {final['coverage']}")
