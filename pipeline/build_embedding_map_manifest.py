import json, os, glob
from collections import defaultdict

base="."
vec=json.load(open(os.path.join(base,"assets/vectors.json")))
by_pid=defaultdict(list)
for p in vec['players']:
    by_pid[p['pid']].append(p)

# honors
honors=json.load(open(os.path.join(base,"assets/data/honors_extended.json")))
allstar_norms=set(k.split('|')[0].strip().lower() for k in honors.get('players',{}).keys())

def norm_name(s): return s.lower().strip()

# current pids from bio 2025-26
cur_bio=json.load(open("pipeline/cache/bio_2025-26.json"))
current_pids=set(r.get('PLAYER_ID') for r in cur_bio if r.get('PLAYER_ID') is not None)

recent_set={"2023-24","2024-25","2025-26"}
pid_to_names=defaultdict(list)
for pid,lst in by_pid.items():
    for rec in lst:
        pid_to_names[pid].append(rec['name'])

pid_to_display={}
pid_to_norm={}
for pid, names in pid_to_names.items():
    disp=names[0]
    pid_to_display[pid]=disp
    pid_to_norm[pid]=norm_name(disp)

three_plus=set(pid for pid,lst in by_pid.items() if len(lst)>=3)
allstar_pids=set(pid for pid,norm in pid_to_norm.items() if norm in allstar_norms)
recent_pids=set(pid for pid,lst in by_pid.items() if min(x['season'] for x in lst) in recent_set)

# qualifying union, but limited to pids that exist in vectors for coords availability, plus keep missing currents separately logged
qualifying=set()
qualifying|= (current_pids & set(by_pid.keys()))  # intersection to avoid missing
qualifying|= allstar_pids
qualifying|= three_plus
qualifying|= recent_pids

print(f"total pids {len(by_pid)} 3+ {len(three_plus)} current intersection {len(current_pids & set(by_pid.keys()))} raw current {len(current_pids)} allstar {len(allstar_pids)} recent {len(recent_pids)} qualifying {len(qualifying)}")

manifest=[]
for pid in qualifying:
    lst=by_pid.get(pid)
    if not lst:
        continue
    seasons_sorted=sorted(lst, key=lambda x: x['season'])
    seasons_list=[x['season'] for x in seasons_sorted]
    if not seasons_list:
        continue
    latest=seasons_list[-1]
    def score(e):
        tm=e.get('total_min') or 0
        if tm: return tm
        return e.get('gp',0)*(e.get('mpg',0) or 0)
    best_entry=max(seasons_sorted, key=score)
    best=best_entry['season']
    manifest.append({
        "player_id": pid,
        "norm": pid_to_norm.get(pid,""),
        "display_name": pid_to_display.get(pid,""),
        "seasons": seasons_list,
        "seasons_count": len(seasons_list),
        "is_current": pid in current_pids,
        "is_allstar": pid in allstar_pids,
        "is_recent_rookie": pid in recent_pids,
        "is_3plus": pid in three_plus,
        "best_season": best,
        "latest_season": latest,
        "best_score": score(best_entry)
    })

manifest_sorted=sorted(manifest, key=lambda x: (not x['is_current'], -x['seasons_count'], x['display_name']))

# Additional: include current players missing from vectors as entries with no coords, flagged missing_vector true, to satisfy "all current players" spec
missing_current = current_pids - set(by_pid.keys())
print(f"missing current vectors {len(missing_current)}")
# Try synthesize placeholder entries from bio for them (for manifest completeness)
# Load names for missing
bio_id_to_name={r['PLAYER_ID']: r.get('PLAYER_NAME') for r in cur_bio}
for pid in missing_current:
    name=bio_id_to_name.get(pid,f"PID {pid}")
    manifest_sorted.append({
        "player_id": pid,
        "norm": norm_name(name),
        "display_name": name,
        "seasons": ["2025-26"],
        "seasons_count":1,
        "is_current": True,
        "is_allstar": False,
        "is_recent_rookie": True,
        "is_3plus": False,
        "best_season":"2025-26",
        "latest_season":"2025-26",
        "missing_vector": True
    })

out_dir="assets"
with open(os.path.join(out_dir,"embedding_map_manifest.json"),"w") as f:
    json.dump({"built":"2026-08-10 embed v7.1.5","total_players":len(manifest_sorted),"filters":{"current":len(current_pids),"allstar":len(allstar_pids),"three_plus":len(three_plus),"recent":len(recent_pids),"qualifying_vectors":len(qualifying)},"players":manifest_sorted}, f, indent=2)
print("wrote manifest", len(manifest_sorted))

points=[]
for entry in manifest_sorted:
    pid=entry['player_id']
    if entry.get('missing_vector'):
        continue
    lst=by_pid.get(pid)
    if not lst: continue
    target = entry['latest_season'] if entry['is_current'] else entry['best_season']
    rec=next((r for r in lst if r['season']==target), lst[-1])
    points.append({
        "pid": pid,
        "season": rec['season'],
        "x": rec['x'],
        "y": rec['y'],
        "z": rec.get('z',0),
        "c": rec.get('c',0),
        "display_name": entry['display_name'],
        "is_current": entry['is_current'],
        "is_allstar": entry['is_allstar'],
    })

with open(os.path.join(out_dir,"embedding_map_points_limited.json"),"w") as out:
    json.dump({"built":"limited 1 per player","count":len(points),"points":points}, out)
print("wrote points", len(points))

trajectories={}
for entry in manifest_sorted:
    pid=entry['player_id']
    if entry.get('missing_vector'): continue
    lst=sorted(by_pid[pid], key=lambda x: x['season'])
    trajectories[str(pid)]=[{"season":r['season'],"x":r['x'],"y":r['y'],"z":r.get('z',0),"c":r.get('c',0),"gp":r.get('gp'),"mpg":r.get('mpg')} for r in lst]

with open(os.path.join(out_dir,"embedding_map_trajectories.json"),"w") as f:
    json.dump({"built":"trajectories","count":len(trajectories),"trajectories":trajectories}, f)
print("wrote trajectories", len(trajectories))
