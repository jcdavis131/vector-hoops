"""Cut the end-to-end smoke slice out of a real prepared tree.

    python tests/fixtures/e2e_slice/cut_slice.py --src <prepared tree> [--served assets] [--out DIR]

--src is a tree laid out like the repo after the herdmux prepare chain
(build_vectors --offline, enrich_vectors, integrate_context): it needs
pipeline/data/{train_matrix.npz, feature_manifest.json, skill_labels.npz,
wide_skill_labels.npz, role_context.json} and assets/{vectors.json,
drift.json}, the seven files train_mtnn hashes into lineage.inputs. The repo
itself works right after the prepare chain, before assets/vectors.json is
checked out again. --served is the directory holding the served files the
exporters read beside them (skills.json, current_rosters.json,
vectors_search_lite.json, honors.json); default: this repo's assets/.

Nothing here computes a value. Every number in the slice is a cell of the
source files, kept or dropped whole. What changes is which rows are present,
and the row-index fields that have to follow them: vectors.json players[i].id
and vectors_search_lite.json players[i].i are the slice row i, as they are
the source row i in the source (the browser and project_next_season index
skills.json grades by them). README.md says what was kept and why.

Deterministic: players are ranked by sha256 of their PLAYER_ID, and
np.savez_compressed stamps every zip member 1980-01-01, so the same source
gives the same bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]

# The modern group gives train (2020-21, 2021-22), val (2022-23, 2023-24) and
# test (2024-25, 2025-26) rows and next-season pairs into every split; the
# old group gives <=2012 rows, without which composite_v2 has no regime slice
# to mask (it masks the columns that are unobserved before 2013).
MODERN_FROM = 2020
MODERN_NEED = {2021, 2022, 2023, 2024, 2025}
OLD_LAST = 2012
OLD_MIN_SEASONS = 4
N_MODERN = 50
N_OLD = 50


def _rank(pid: int) -> str:
    return hashlib.sha256(str(int(pid)).encode()).hexdigest()


def _year(season: str) -> int:
    return int(str(season)[:4])


def _dump(path: Path, doc) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def cut(src: Path, served: Path, out: Path) -> dict:
    data = src / "pipeline" / "data"
    z = np.load(data / "train_matrix.npz", allow_pickle=False)
    pid, season, name = z["player_id"], z["season"].astype(str), z["name"].astype(str)
    vec = json.loads((src / "assets" / "vectors.json").read_text(encoding="utf-8"))
    players = vec["players"]
    lite = json.loads((served / "vectors_search_lite.json").read_text(encoding="utf-8"))
    skills = json.loads((served / "skills.json").read_text(encoding="utf-8"))
    rosters = json.loads((served / "current_rosters.json").read_text(encoding="utf-8"))
    honors = json.loads((served / "honors.json").read_text(encoding="utf-8"))
    n = len(pid)
    if not (len(players) == len(lite["players"]) == len(skills["grades"]) == n):
        raise SystemExit("source files disagree on the row count")

    # A row is usable only when the matrix, the prepared vectors.json and the
    # served row-indexed files name the same (player_id, season) at that index.
    # On 2026-10-10 three rows differ (4673, 6564, 7329: the served files
    # predate the PLAYER_ID repair), so those players are left out.
    bad_players = set()
    for i in range(n):
        key = (int(pid[i]), season[i])
        if (players[i].get("pid"), players[i]["season"]) != key or (
            lite["players"][i].get("pid"),
            lite["players"][i]["s"],
        ) != key:
            bad_players.add(int(pid[i]))

    years = defaultdict(set)
    for p, s in zip(pid.tolist(), season.tolist(), strict=True):
        years[int(p)].add(_year(s))
    active = {r["name"] for r in rosters.get("activePlayers", []) if r.get("charted")}
    last = max(season.tolist())
    name_last = {int(pid[i]): name[i] for i in range(n) if season[i] == last}

    modern = sorted(
        (p for p, ys in years.items() if MODERN_NEED <= ys and p not in bad_players and name_last.get(p) in active),
        key=_rank,
    )[:N_MODERN]
    old = sorted(
        (p for p, ys in years.items() if max(ys) <= OLD_LAST and len(ys) >= OLD_MIN_SEASONS and p not in bad_players),
        key=_rank,
    )[:N_OLD]
    modern_set, old_set = set(modern), set(old)
    keep = np.array(
        [
            i
            for i in range(n)
            if (int(pid[i]) in modern_set and _year(season[i]) >= MODERN_FROM) or int(pid[i]) in old_set
        ],
        dtype=np.int64,
    )
    keys = {(name[i], season[i]) for i in keep}

    out_data = out / "pipeline" / "data"
    out_data.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_data / "train_matrix.npz", **{k: z[k][keep] for k in z.files})
    (out_data / "feature_manifest.json").write_bytes((data / "feature_manifest.json").read_bytes())

    sk = np.load(data / "skill_labels.npz", allow_pickle=False)
    rows = [
        i
        for i, (a, b) in enumerate(zip(sk["name"].astype(str), sk["season"].astype(str), strict=True))
        if (a, b) in keys
    ]
    np.savez_compressed(out_data / "skill_labels.npz", **{k: (sk[k] if k == "keys" else sk[k][rows]) for k in sk.files})
    wk = np.load(data / "wide_skill_labels.npz", allow_pickle=False)
    rows = [
        i
        for i, (a, b) in enumerate(zip(wk["name"].astype(str), wk["season"].astype(str), strict=True))
        if (a, b) in keys
    ]
    np.savez_compressed(
        out_data / "wide_skill_labels.npz", **{k: (wk[k] if k == "keys" else wk[k][rows]) for k in wk.files}
    )

    role = json.loads((data / "role_context.json").read_text(encoding="utf-8"))
    role["entries"] = [e for e in role.get("entries", []) if (str(e["name"]), str(e["season"])) in keys]
    _dump(out_data / "role_context.json", role)

    out_assets = out / "assets"
    vec_out = dict(vec)
    vec_out["players"] = [{**players[i], "id": k} for k, i in enumerate(keep.tolist())]
    _dump(out_assets / "vectors.json", vec_out)
    (out_assets / "drift.json").parent.mkdir(parents=True, exist_ok=True)
    (out_assets / "drift.json").write_bytes((src / "assets" / "drift.json").read_bytes())

    lite_rows = [{**lite["players"][i], "i": k} for k, i in enumerate(keep.tolist())]
    _dump(out_assets / "vectors_search_lite.json", {**lite, "count": len(lite_rows), "players": lite_rows})
    _dump(out_assets / "skills.json", {**skills, "grades": [skills["grades"][i] for i in keep.tolist()]})
    lite_keys = {f"{r['n']}|{r['s']}" for r in lite_rows}
    by_season = honors.get("bySeason", {})
    _dump(out_assets / "honors.json", {**honors, "bySeason": {k: v for k, v in by_season.items() if k in lite_keys}})
    names_last = {name[i] for i in keep if season[i] == last}
    kept_roster = [r for r in rosters.get("activePlayers", []) if r["name"] in names_last]
    # teams and summary describe the whole league; they are dropped rather
    # than left saying 649 players beside a list of 50.
    _dump(
        out_assets / "current_rosters.json",
        {k: rosters[k] for k in ("built", "season", "nextSeason", "method") if k in rosters}
        | {"activePlayers": kept_roster},
    )

    split = defaultdict(int)
    for i in keep:
        y = _year(season[i])
        split["train" if y <= 2021 else "val" if y <= 2023 else "test"] += 1
    return {
        "rows": len(keep),
        "players": len(modern_set | old_set),
        "modern": len(modern),
        "old": len(old),
        "split_rows": dict(split),
        "roster_rows": len(kept_roster),
        "excluded_players": sorted(bad_players),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--src", type=Path, required=True, help="a prepared tree (see the module docstring)")
    ap.add_argument("--served", type=Path, default=REPO / "assets")
    ap.add_argument("--out", type=Path, default=HERE)
    args = ap.parse_args()
    print(json.dumps(cut(args.src, args.served, args.out), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
