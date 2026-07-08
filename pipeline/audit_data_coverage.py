"""Cross-source data coverage audit — finds join gaps like missing playoffs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from name_utils import norm_name

ASSETS = ROOT / "assets"
DATA = ROOT / "pipeline" / "data"
CACHE = ROOT / "pipeline" / "cache"

STAR_CHECKS = (
    ("Nikola Jokic", "2023-24"),
    ("Nikola Jokic", "2024-25"),
    ("LeBron James", "2015-16"),
    ("Stephen Curry", "2022-23"),
    ("Kevin Durant", "2016-17"),
)


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def playoff_cache_has(season: str, nk: str) -> bool:
    p = CACHE / f"playoffs_{season}.json"
    if not p.exists():
        return False
    doc = json.loads(p.read_text(encoding="utf-8"))
    rec = doc.get("players", {}).get(nk)
    return bool(rec and (rec.get("po", {}).get("GP") or 0) > 0)


def count_labeled(npz_path: Path, manifest_path: Path, feat: str, name: str) -> tuple[int, int]:
    import numpy as np

    if not npz_path.exists() or not manifest_path.exists():
        return 0, 0
    npz = np.load(npz_path, allow_pickle=False)
    manifest = load_json(manifest_path)
    feats = manifest.get("features", [])
    if feat not in feats:
        return 0, 0
    j = feats.index(feat)
    M = npz["mask"]
    names = npz["name"]
    labeled = sum(1 for i, n in enumerate(names) if str(n) == name and M[i, j] > 0.5)
    total = sum(1 for n in names if str(n) == name)
    return labeled, total


def audit_family(
    label: str,
    players: list[dict],
    lookup: dict[tuple[str, str], object],
    *,
    optional: bool = False,
) -> dict:
    hits = sum(1 for p in players if (p["name"], p["season"]) in lookup)
    miss = len(players) - hits
    print(f"\n=== {label} ===")
    print(f"covered: {hits}/{len(players)} ({100 * hits / max(1, len(players)):.1f}%)")
    if optional:
        print("(absence is masked upstream — not every row expected)")
    return {"label": label, "hits": hits, "miss": miss, "total": len(players)}


def main() -> None:
    vec = load_json(ASSETS / "vectors.json")
    players = vec["players"]
    po_asset = load_json(ASSETS / "playoffs.json")
    po_data = load_json(DATA / "playoffs.json")
    roster = load_json(DATA / "roster_context.json")
    pedigree = load_json(DATA / "pedigree.json")
    honors = load_json(DATA / "honors.json")
    honors_asset = load_json(ASSETS / "honors.json")

    roster_lookup = {
        (e["name"], e["season"]): e for e in (roster or {}).get("entries", [])
    }
    po_splits = set((po_asset or {}).get("splits", {}))
    po_rows = {(r["name"], r["season"]) for r in (po_data or {}).get("players", [])}
    ped_rows = {(r["name"], r["season"]) for r in (pedigree or {}).get("players", [])}
    hon_rows = {(r["name"], r["season"]) for r in (honors or {}).get("players", [])}
    hon_asset = (honors_asset or {}).get("bySeason", {})

    print("=== Star spot checks ===")
    for name, season in STAR_CHECKS:
        nk = norm_name(name)
        k = f"{name}|{season}"
        print(
            f"  {k}: playoffs_cache={playoff_cache_has(season, nk)} "
            f"playoffs_asset={k in po_splits} "
            f"playoffs_data={(name, season) in po_rows} "
            f"roster={(name, season) in roster_lookup}"
        )
        po_l, po_t = count_labeled(DATA / "train_matrix.npz", DATA / "feature_manifest.json", "PO_GP", name)
        if name == STAR_CHECKS[0][0]:
            print(f"    train_matrix PO_GP for {name}: {po_l}/{po_t}")

    # Playoff join failures: cache has player, vectors has row, asset missing
    print("\n=== Playoff join failures (cache hit, asset miss) ===")
    misses = []
    for p in players:
        season = p["season"]
        nk = norm_name(p["name"])
        if not playoff_cache_has(season, nk):
            continue
        k = f"{p['name']}|{season}"
        if k not in po_splits:
            misses.append((p["name"], season))
    print(f"count: {len(misses)}")
    for row in misses[:15]:
        print(" ", row)
    if len(misses) > 15:
        print(f"  ... +{len(misses) - 15} more")

    audit_family("Roster context (recent gamelog)", players, roster_lookup, optional=True)
    audit_family("Playoffs data (pipeline)", players, {(n, s): 1 for n, s in po_rows}, optional=True)
    audit_family("Playoffs asset splits", players, {(k.split("|")[0], k.split("|")[1]): 1 for k in po_splits}, optional=True)
    audit_family("Pedigree", players, {(n, s): 1 for n, s in ped_rows})
    audit_family("Honors data", players, {(n, s): 1 for n, s in hon_rows}, optional=True)
    audit_family("Honors asset", players, {(k.split("|")[0], k.split("|")[1]): 1 for k in hon_asset}, optional=True)

    # train matrix tower coverage
    tm = DATA / "train_matrix.npz"
    manifest = load_json(DATA / "feature_manifest.json")
    if tm.exists() and manifest:
        import numpy as np

        npz = np.load(tm, allow_pickle=False)
        M = npz["mask"]
        feats = manifest.get("features", [])
        towers = {
            "playoffs": [f for f in feats if f.startswith("PO_")],
            "honors": [f for f in feats if f.startswith("HON_")],
            "pedigree": [f for f in feats if f.startswith("PED_")],
            "roster": [f for f in feats if f.startswith("ROSTER_")],
        }
        print("\n=== train_matrix tower label rates ===")
        for tower, cols in towers.items():
            if not cols:
                continue
            idx = [feats.index(c) for c in cols]
            any_labeled = (M[:, idx].max(axis=1) > 0.5).sum()
            print(f"  {tower}: {int(any_labeled)}/{len(M)} rows with any label")


if __name__ == "__main__":
    main()
