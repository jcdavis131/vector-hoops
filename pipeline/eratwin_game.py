"""ERA TWIN game artifact. Packaged for play in the promoted MTNN embedding
space (same 48-d vectors as Chimera scoring), index-aligned with
vectors.json.

- For each QUIZ-ELIGIBLE player (career with >=4 charted seasons), the
  signature season (max |v| norm, same convention as build_wiki) maps to
  its MTNN row by player-season id.
- TWIN = nearest other-decade career by MTNN cosine, plus top-5 candidates
  (for warmth feedback).
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


def load_mtnn_embeddings() -> np.ndarray:
    meta = json.loads((ASSETS / "mtnn_meta.json").read_text(encoding="utf-8"))
    dim = int(meta["dim"])
    rows = int(meta["rows"])
    f32 = ASSETS / "mtnn_embeddings.f32"
    if not f32.exists():
        raise SystemExit(f"missing {f32} — run export_mtnn_embeddings.py")
    E = np.fromfile(f32, dtype=np.float32)
    if E.size != rows * dim:
        raise SystemExit(f"mtnn f32 size {E.size} != {rows}×{dim}")
    return E.reshape(rows, dim)


def main() -> None:
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    E = load_mtnn_embeddings()
    clusters = data["clusters"]

    careers = defaultdict(list)
    for p in data["players"]:
        careers[p["name"]].append(p)

    sigs = {}
    for name, rows in careers.items():
        sig = max(rows, key=lambda r: float(np.linalg.norm(r["v"])))
        sigs[name] = sig

    names = list(sigs)
    ids = [sigs[n]["id"] for n in names]
    if max(ids) >= E.shape[0]:
        raise SystemExit("vectors.json id exceeds MTNN row count — re-export embeddings")

    Mn = E[ids]  # already L2-normalized at export

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
        "method": ("signature seasons matched in the promoted MTNN embedding "
                   "(48-d, L2-normalized, index-aligned with vectors.json); "
                   "twin = nearest OTHER-DECADE career by embedding cosine; "
                   "quiz pool = careers with >=4 charted seasons; top-5 "
                   "candidates shipped for warmth feedback; similarity shown "
                   "so thin matches can be weighed"),
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
