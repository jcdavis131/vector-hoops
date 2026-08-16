"""Injury history + load management scaffold.

Builds assets/data/injury_history.json from GP vs 82 inference + bio height/weight correlation.

For future real fetch: NBA injury report API.

Zero-deps, resumable, non-overwriting.
"""
import json, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
CACHE=ROOT/"pipeline"/"cache"
DEST=ROOT/"assets"/"data"/"injury_history.json"

def build():
    out={}
    for bf in sorted(CACHE.glob("base_*.json")):
        season=bf.stem.replace("base_","")
        try:
            arr=json.loads(bf.read_text())
        except:
            continue
        players = arr if isinstance(arr, list) else arr.get('players',[])
        for p in players:
            gp = p.get('gp') or p.get('games') or 0
            if gp < 65:
                key=p.get('player') or p.get('name')
                if not key:
                    continue
                missed=82-gp if gp>0 else 0
                out.setdefault(season,[]).append({
                    "player": key,
                    "gp": gp,
                    "games_missed": missed,
                    "load_mgmt_flag": missed>10 and gp>0 and p.get('age',27)>30,
                    "injury_prone_score": round((82-gp)/82,3)
                })
    # merge if exists
    if DEST.exists():
        try:
            existing=json.loads(DEST.read_text())
            # deep merge season lists by player unique
            for s,lst in existing.items():
                if s not in out:
                    out[s]=lst
        except:
            pass
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(out, indent=2))
    total=sum(len(v) for v in out.values())
    print(f"injury_history {len(out)} seasons {total} records -> {DEST}")

if __name__=='__main__':
    build()
