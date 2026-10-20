#!/usr/bin/env python3
"""Pin a versioned snapshot of the atlas store. Stdlib only.
Creates v2/snapshots/<name>/ with atlas.db copy + manifest.json.
Usage: python3 snapshot.py [name]  (default: atlas-YYYYMMDD-<shorthash>)
"""
import hashlib, json, os, shutil, sys, time

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "v2")
DB = os.path.join(D, "atlas.db")

def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

def main():
    if not os.path.exists(DB):
        sys.exit("no atlas.db — run build_store.py first")
    manifest = {"created": time.strftime("%Y-%m-%dT%H:%M:%S"), "layers": {}, "edges": {}}
    for fn in sorted(os.listdir(D)):
        if fn.startswith("layer_") and fn.endswith(".jsonl"):
            p = os.path.join(D, fn)
            manifest["layers"][fn] = {"rows": sum(1 for _ in open(p)), "sha256": sha256_file(p)[:16]}
        elif fn.startswith("edges_") and fn.endswith(".jsonl"):
            p = os.path.join(D, fn)
            manifest["edges"][fn] = {"rows": sum(1 for _ in open(p)), "sha256": sha256_file(p)[:16]}
        elif fn == "franchises.jsonl":
            p = os.path.join(D, fn)
            manifest["layers"][fn] = {"rows": sum(1 for _ in open(p)), "sha256": sha256_file(p)[:16]}
    manifest["store"] = {"sha256": sha256_file(DB)[:16],
                         "bytes": os.path.getsize(DB)}
    import sqlite3
    db = sqlite3.connect(DB)
    manifest["entities"] = db.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    manifest["edge_rows"] = db.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
    db.close()
    name = sys.argv[1] if len(sys.argv) > 1 else (
        f"atlas-{time.strftime('%Y%m%d')}-{manifest['store']['sha256'][:8]}")
    snap = os.path.join(D, "snapshots", name)
    os.makedirs(snap, exist_ok=True)
    shutil.copy2(DB, os.path.join(snap, "atlas.db"))
    json.dump(manifest, open(os.path.join(snap, "manifest.json"), "w"), indent=1)
    print(f"snapshot {name}: {manifest['entities']} entities, {manifest['edge_rows']} edges")

if __name__ == "__main__":
    main()
