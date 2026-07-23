"""Emit assets/scoring_lite.{f32,_index.json}: the embedding rows the play page
actually needs for scoring — past all-stars (1996..PAST_MAX, asg==1) plus every
2024+ season. ~1/6 the size of mtnn_embeddings.f32, so the game can load real
scoring eagerly on mobile instead of deferring the full matrix.

Filters mirror past-modern-game.js init() exactly; rerun after update_dataset.py
or whenever mtnn_embeddings.f32 / honors.json / vectors_search_lite.json change.
"""
import json
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PAST_MIN, PAST_MAX = 1996, 2023  # keep in sync with PAST_MAX in past-modern-game.js
MODERN_MIN = 2024


def parse_year(season):
    try:
        return int(str(season).split("-")[0])
    except (ValueError, TypeError):
        return 0


def main():
    meta = json.loads((ASSETS / "mtnn_meta.json").read_text(encoding="utf-8"))
    dim, rows = meta["dim"], meta["rows"]
    lite = json.loads((ASSETS / "vectors_search_lite.json").read_text(encoding="utf-8"))
    players = lite["players"] if isinstance(lite, dict) else lite
    honors = json.loads((ASSETS / "honors.json").read_text(encoding="utf-8"))
    by_season = honors.get("bySeason", honors)

    ids = set()
    for p in players:
        i, yr = p.get("i"), parse_year(p.get("s"))
        if i is None or not (0 <= i < rows):
            continue
        if yr >= MODERN_MIN:
            ids.add(i)
        elif PAST_MIN <= yr <= PAST_MAX:
            h = by_season.get(f"{p.get('n')}|{p.get('s')}")
            if h and h.get("asg") == 1:
                ids.add(i)
    ids = sorted(ids)

    emb = array("f")
    with open(ASSETS / "mtnn_embeddings.f32", "rb") as f:
        emb.fromfile(f, rows * dim)
    out = array("f")
    for i in ids:
        out.extend(emb[i * dim:(i + 1) * dim])

    (ASSETS / "scoring_lite.f32").write_bytes(out.tobytes())
    index = {
        "built": meta.get("built"),
        "dim": dim,
        "rows": len(ids),
        "source": "mtnn_embeddings.f32",
        "note": "L2-normalized rows for past all-stars 1996-2023 + all 2024+ seasons; dot=cosine; ids[k] = global row id of lite row k",
        "ids": ids,
    }
    (ASSETS / "scoring_lite_index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"scoring_lite: {len(ids)} rows, {len(out) * 4} bytes f32")


if __name__ == "__main__":
    main()
