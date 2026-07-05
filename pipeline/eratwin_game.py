"""ERA TWIN game artifact. Same math as the dossier era-twins (chained
Procrustes root frame), packaged for play. Method (stated):

- Every charted career's signature season mapped to the 1996-97 root
  frame (v_root = chain[season] @ v — orientation as verified in
  build_wiki).
- For each QUIZ-ELIGIBLE player (signature season >=2000 minutes-proxy:
  we use careers with >=4 charted seasons for name recognition), the
  TWIN = nearest other-decade player by root-frame cosine, plus the
  top-5 candidates (for warmth feedback).
- eratwins.json: {method, players:[{name, season, decade, archetype,
  twin:{name,season,decade,similarity}, top5:[{name,season,sim}]}]}.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
MIN_SEASONS = 4


def decade_of(season: str) -> str:
    y = int(season[:4])
    return f"{y // 10 * 10}s"


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    drift = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    chain = {s: np.array(m) for s, m in drift["chainedToRoot"].items()}
    clusters = data["clusters"]

    careers = defaultdict(list)
    for p in data["players"]:
        careers[p["name"]].append(p)

    # signature season = max |v| (same convention as build_wiki)
    sigs = {}
    for name, rows in careers.items():
        sig = max(rows, key=lambda r: float(np.linalg.norm(r["v"])))
        sigs[name] = sig

    roots = {name: chain[sig["season"]] @ np.array(sig["v"])
             for name, sig in sigs.items()}
    names = list(roots)
    M = np.stack([roots[n] for n in names])
    norms = np.linalg.norm(M, axis=1)
    norms[norms == 0] = 1
    Mn = M / norms[:, None]

    eligible = [n for n in names if len(careers[n]) >= MIN_SEASONS]
    out = []
    for name in eligible:
        i = names.index(name)
        sig = sigs[name]
        dec = decade_of(sig["season"])
        sims = Mn @ Mn[i]
        order = np.argsort(-sims)
        cands = []
        for j in order:
            other = names[j]
            if other == name:
                continue
            if decade_of(sigs[other]["season"]) == dec:
                continue
            cands.append({"name": other,
                          "season": sigs[other]["season"],
                          "sim": round(float(sims[j]), 3)})
            if len(cands) == 5:
                break
        if not cands:
            continue
        t = cands[0]
        out.append({
            "name": name, "season": sig["season"], "decade": dec,
            "archetype": clusters[sig["c"]],
            "twin": {"name": t["name"], "season": t["season"],
                     "decade": decade_of(t["season"]),
                     "similarity": t["sim"]},
            "top5": cands,
        })

    (ASSETS / "eratwins.json").write_text(json.dumps({
        "method": ("signature seasons mapped to the 1996-97 root frame "
                   "via chained Procrustes transforms; twin = nearest "
                   "OTHER-DECADE player by root-frame cosine; quiz pool "
                   "= careers with >=4 charted seasons; top-5 candidates "
                   "shipped for warmth feedback; similarity shown so "
                   "thin matches can be weighed"),
        "players": out,
    }, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} quiz-eligible players with era twins")
    for name in ("LeBron James", "Stephen Curry", "Shaquille O'Neal"):
        e = next((x for x in out if x["name"] == name), None)
        if e:
            print(f"  {e['name']} ({e['season']}, {e['decade']}) -> "
                  f"{e['twin']['name']} '{e['twin']['season']} "
                  f"({e['twin']['similarity']:.0%})")


if __name__ == "__main__":
    main()
