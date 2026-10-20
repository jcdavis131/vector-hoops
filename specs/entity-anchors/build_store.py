#!/usr/bin/env python3
"""Build the atlas SQLite store from completed v2 layers + v1.
Stdlib only. Idempotent: drops and rebuilds tables each run.
"""

import json
import sqlite3
from pathlib import Path

D = (Path(__file__).resolve().parent) / "v2"
V1 = (Path(__file__).resolve().parent) / "v1"
DB = D / "atlas.db"


def main():
    if DB.exists():
        DB.unlink()
    db = sqlite3.connect(DB)
    db.execute("""CREATE TABLE entities(
        entity_id TEXT PRIMARY KEY, qid TEXT, layer TEXT, name TEXT,
        time_date TEXT, time_precision TEXT, place_name TEXT,
        country TEXT, lat REAL, lon REAL, provenance_json TEXT)""")
    db.execute("""CREATE TABLE edges(
        src TEXT, dst TEXT, rel TEXT, start_date TEXT, end_date TEXT, provenance_json TEXT)""")
    n = 0

    def add(rec, layer):
        nonlocal n
        ta = rec.get("time_anchor") or {}
        pa = rec.get("place_anchor") or {}
        pv = rec.get("provenance") or {}
        qid = rec.get("qid")
        if not qid and str(pv.get("source", "")).startswith("wikidata:"):
            qid = pv["source"].split(":", 1)[1]
        db.execute(
            "INSERT OR REPLACE INTO entities VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                rec["entity_id"],
                qid,
                layer,
                rec["name"],
                ta.get("date"),
                ta.get("precision"),
                pa.get("name"),
                pa.get("country"),
                pa.get("lat"),
                pa.get("lon"),
                json.dumps(pv),
            ),
        )
        n += 1

    for fn in sorted(_p.name for _p in D.iterdir()):
        if fn.startswith("layer_") and fn.endswith(".jsonl"):
            layer = fn[6:-6]
            for line in open(D / fn):
                add(json.loads(line), layer)
        elif fn == "franchises.jsonl":
            for line in open(D / fn):
                add(json.loads(line), "franchises")
    for fn in ("players.jsonl", "teams.jsonl"):
        for line in open(V1 / fn):
            add(json.loads(line), "nba_" + fn[:-6])
    db.commit()
    for idx in ("qid", "layer", "place_name", "time_date"):
        db.execute(f"CREATE INDEX idx_e_{idx} ON entities({idx})")
    m = 0
    for fn in sorted(_p.name for _p in D.iterdir()):
        if fn.startswith("edges_") and fn.endswith(".jsonl"):
            for line in open(D / fn):
                r = json.loads(line)
                db.execute(
                    "INSERT INTO edges VALUES (?,?,?,?,?,?)",
                    (r["src"], r["dst"], r["rel"], r.get("start"), r.get("end"), "{}"),
                )
                m += 1
    db.execute("CREATE INDEX idx_edges_src ON edges(src)")
    db.execute("CREATE INDEX idx_edges_dst ON edges(dst)")
    db.execute("CREATE INDEX idx_edges_rel ON edges(rel)")
    db.commit()
    sz = DB.stat().st_size
    n = db.execute("SELECT COUNT(*) FROM entities").fetchone()[0]
    print(f"store: {n} entities, {m} edges, {sz / 1e6:.1f} MB")
    db.close()


if __name__ == "__main__":
    main()
