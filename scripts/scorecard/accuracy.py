"""Accuracy: site values against official stats.nba.com values on wave 1's fixed seeded sample.

Sample (seed 20261021, the populations of evidence/B-ACC/sample.py, drawn in the order A, B, D from one
random.Random over lists sorted by stable keys):
  A  rendered: players.html "Next-season stats" Actual column, realFromZ(clip(z, -4, 4)) * sd + mu with
     assets/season_norms.json, 5 values per season, against Base Per100Possessions Regular Season.
  B  rendered: assets/playoff-swings.json rs_pts100, po_pts100, po_gp, 40 rows, against Per100 RS / PO.
  D  served, not rendered: assets/vectors.json gp, mpg, total_min, 4 player-seasons per season, against
     Base Totals Regular Season (GP, MIN/GP, MIN).
Tolerances are B-ACC's tolerances.json. A value whose player-season has no official row is "missing", never a
mismatch. Official values come only from a cache of leaguedashplayerstats responses (--acc-cache, files
lds_<MeasureType>_<PerMode>_<RS|PO>_<season>.json). Without one, every number here is null "no-fetch-this-wave".
"""

from __future__ import annotations

import json
import math
import random

from . import common as c

SEED = 20261021
PER_SEASON_A = 5
N_ROWS_B = 40
PER_SEASON_D = 4
EPS = 1e-9
STATED_GATE_MIN = 450
SITE_FILES = ("assets/vectors.json", "assets/season_norms.json", "assets/next_profile_eval.json", "assets/playoff-swings.json")


def wilson(k: int, n: int, z: float = 1.959963984540054) -> list:
    if n == 0:
        return [None, None]
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [round(max(0.0, centre - half), 4), round(min(1.0, centre + half), 4)]


def _clip(z: float) -> float:
    return max(-4.0, min(4.0, z))


def draw_sample(root) -> tuple[list[dict], dict]:
    """The seeded sample. Populations whose input file is absent are empty (named in the second value)."""
    files = {rel: (c.load_json(root / rel) if (root / rel).is_file() else None) for rel in SITE_FILES}
    absent = [rel for rel, d in files.items() if d is None]
    vec = files["assets/vectors.json"]
    if vec is None:
        return [], {"absent": absent}
    norms, nxt, swings = files["assets/season_norms.json"], files["assets/next_profile_eval.json"], files["assets/playoff-swings.json"]
    by_ns = {(p["name"], p["season"]): p for p in vec["players"]}
    rng = random.Random(SEED)
    out: list[dict] = []
    if nxt is not None and norms is not None:
        feats, prim = nxt["features"], nxt["primaryFeatures"]
        pop: dict[str, list] = {}
        for key in sorted(nxt["rows"]):
            row = nxt["rows"][key]
            if row.get("status") != "scored" or not row.get("actual"):
                continue
            name, season_from = key.rsplit("|", 1)
            to = row["to"]
            sn = norms["seasons"].get(to, {}).get("features", {})
            pv = by_ns.get((name, to))
            for k in prim:
                if k not in sn:
                    continue
                z = row["actual"][feats.index(k)]
                if z is None:
                    continue
                mu, sd = sn[k]["mu"], sn[k]["sd"]
                pop.setdefault(to, []).append(
                    {"pop": "A", "season": to, "name": name, "pid": pv["pid"] if pv else None, "stat": k,
                     "site_value": _clip(z) * sd + mu, "sd": sd, "profile_season": season_from}
                )  # fmt: skip
        for s in sorted(pop):
            items = sorted(pop[s], key=lambda r: (r["pid"] if r["pid"] is not None else -1, r["name"], r["stat"]))
            out.extend(rng.sample(items, min(PER_SEASON_A, len(items))))
    if swings is not None:
        rows_b = sorted(swings["rows"], key=lambda r: (r["season"], r["player"]))
        pick = sorted(rng.sample(rows_b, min(N_ROWS_B, len(rows_b))), key=lambda r: (r["season"], r["player"]))
        for r in pick:
            pv = by_ns.get((r["player"], r["season"]))
            for stat in ("rs_pts100", "po_pts100", "po_gp"):
                out.append({"pop": "B", "season": r["season"], "name": r["player"], "pid": pv["pid"] if pv else None,
                            "stat": stat, "site_value": r[stat]})  # fmt: skip
    byseason: dict[str, list] = {}
    for p in vec["players"]:
        byseason.setdefault(p["season"], []).append(p)
    for s in sorted(byseason):
        items = sorted(byseason[s], key=lambda p: (p["pid"], p["name"]))
        for p in sorted(rng.sample(items, min(PER_SEASON_D, len(items))), key=lambda p: p["pid"]):
            for stat in ("gp", "mpg", "total_min"):
                out.append({"pop": "D", "season": s, "name": p["name"], "pid": p["pid"], "stat": stat, "site_value": p[stat]})
    return out, {"absent": absent}


class _Official:
    def __init__(self, cache):
        self.cache = cache
        self.tables: dict[str, dict | None] = {}
        self.inputs: dict[str, dict] = {}
        self.log_times = _log_times(cache)

    def get(self, kind: str, season: str) -> dict | None:
        key = f"lds_{kind}_{season}"
        if key not in self.tables:
            p = self.cache / f"{key}.json"
            if not p.is_file():
                self.tables[key] = None
            else:
                rs = c.load_json(p)["resultSets"][0]
                h = rs["headers"]
                self.tables[key] = {r[h.index("PLAYER_ID")]: dict(zip(h, r)) for r in rs["rowSet"]}
                self.inputs[key] = {"path": p.as_posix(), "sha256": c.sha256_file(p), "fetched_at": self.log_times.get(key)}
        return self.tables[key]


def _log_times(cache) -> dict[str, str]:
    """key -> time of its last HTTP 200, from a fetch_log.jsonl beside the cache (B-ACC layout), if one exists."""
    out: dict[str, str] = {}
    log = cache.parent / "fetch_log.jsonl"
    if not log.is_file():
        return out
    for line in log.read_text(encoding="utf-8").splitlines():
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("status") == 200 and rec.get("key"):
            out[rec["key"]] = rec.get("at")
    return out


def compare(sample: list[dict], off: _Official) -> list[dict]:
    rows = []
    for it in sample:
        pop, season, pid, stat, site = it["pop"], it["season"], it["pid"], it["stat"], it["site_value"]
        rec = {"pop": pop, "season": season, "name": it["name"], "pid": pid, "stat": stat, "site_value": site,
               "official": None, "abs_diff": None, "tol": None, "verdict": None, "reason": ""}  # fmt: skip
        if pop == "A":
            kind, field = "Base_Per100Possessions_RS", stat
            rec["tol"] = 0.025 * it["sd"] + 0.05 + 0.0003
        elif pop == "B":
            kind = "Base_Per100Possessions_" + ("RS" if stat == "rs_pts100" else "PO")
            field = "GP" if stat == "po_gp" else "PTS"
            rec["tol"] = 0.0 if stat == "po_gp" else 0.1
        else:
            kind, field = "Base_Totals_RS", {"gp": "GP", "mpg": "MIN", "total_min": "MIN"}[stat]
            rec["tol"] = {"gp": 0.0, "mpg": 0.05}.get(stat)
        table = off.get(kind, season)
        if pid is None:
            rec["verdict"], rec["reason"] = "missing", "site name|season has no vectors.json pid"
        elif table is None:
            rec["verdict"], rec["reason"] = "missing", f"no cached lds_{kind}_{season}"
        elif pid not in table:
            rec["verdict"], rec["reason"] = "missing", f"PLAYER_ID {pid} has no row in {kind} {season}"
        elif site is None:
            rec["verdict"], rec["reason"] = "missing", "site value is null"
        else:
            o = table[pid]
            if pop == "D" and stat == "mpg":
                val = o["MIN"] / o["GP"] if o["GP"] else None
            elif pop == "D" and stat == "total_min":
                val = o["MIN"]
                rec["tol"] = 0.5 + 0.05 * o["GP"]
            else:
                val = o[field]
            if val is None:
                rec["verdict"], rec["reason"] = "missing", f"official {field} is null"
            else:
                rec["official"] = round(val, 4)
                rec["abs_diff"] = round(abs(site - val), 4)
                rec["verdict"] = "match" if abs(site - val) <= rec["tol"] + EPS else "mismatch"
        if rec["tol"] is not None:
            rec["tol"] = round(rec["tol"], 4)
        rows.append(rec)
    return rows


def summarize(rows: list[dict]) -> dict:
    k = sum(1 for r in rows if r["verdict"] == "mismatch")
    m = sum(1 for r in rows if r["verdict"] == "match")
    n = k + m
    return {"compared": n, "mismatch": k, "match": m, "missing": sum(1 for r in rows if r["verdict"] == "missing"),
            "mismatch_rate": round(k / n, 4) if n else None, "wilson95": wilson(k, n)}  # fmt: skip


def measure(ctx: c.Ctx) -> dict:
    cmd = ctx.cmd
    names = ("rendered_mismatches", "served_mismatches", "served_rows_under_stated_minutes_gate")
    site_inputs = [c.file_input(ctx.root, rel) for rel in SITE_FILES]
    if ctx.acc_cache is None:
        return {n: c.null("values", c.NO_FETCH, command=cmd(f"accuracy.{n}"), inputs=site_inputs) for n in names}
    sample, info = draw_sample(ctx.root)
    off = _Official(ctx.acc_cache)
    rows = compare(sample, off)
    inputs = [i for i in site_inputs if not i.get("missing")] + [off.inputs[k] for k in sorted(off.inputs)]
    times = [i.get("fetched_at") for i in off.inputs.values()]
    fetched = c.latest_time(times)
    common_detail = {"seed": SEED, "sample_n": len(rows), "absent_site_files": info["absent"],
                     "fetched_at_source": "fetch_log.jsonl beside the cache" if off.log_times else "not recorded in the cache"}  # fmt: skip
    out: dict = {}
    rendered = [r for r in rows if r["pop"] in ("A", "B")]
    served = [r for r in rows if r["pop"] == "D"]
    for name, rr in (("rendered_mismatches", rendered), ("served_mismatches", served)):
        s = summarize(rr)
        by_stat = {st: summarize([r for r in rr if r["stat"] == st]) for st in sorted({r["stat"] for r in rr})}
        detail = {**common_detail, **s, "by_stat": by_stat}
        if name == "served_mismatches":
            detail["rows"] = rr
        else:
            detail["mismatch_rows"] = [r for r in rr if r["verdict"] == "mismatch"][:20]
        if s["compared"] == 0:
            why = "no sampled value has an official row in the cache" if rr else "population empty (site inputs absent)"
            out[name] = c.null("values", why, command=cmd(f"accuracy.{name}"), inputs=inputs, detail=detail)
        else:
            out[name] = c.metric(s["mismatch"], f"mismatched values of {s['compared']} compared",
                                 command=cmd(f"accuracy.{name}"), inputs=inputs, fetched_at=fetched, detail=detail)  # fmt: skip
    tm = [r for r in served if r["stat"] == "total_min" and r["official"] is not None]
    under = [r for r in tm if r["official"] < STATED_GATE_MIN]
    if not tm:
        out["served_rows_under_stated_minutes_gate"] = c.null(
            "player-seasons", "no sampled total_min has an official value", command=cmd("accuracy.served_rows_under_stated_minutes_gate")
        )
    else:
        out["served_rows_under_stated_minutes_gate"] = c.metric(
            len(under), f"sampled player-seasons of {len(tm)}", command=cmd("accuracy.served_rows_under_stated_minutes_gate"),
            inputs=inputs, fetched_at=fetched,
            detail={"wilson95": wilson(len(under), len(tm)), "gate_minutes": STATED_GATE_MIN,
                    "rows": [{k: r[k] for k in ("season", "name", "pid", "site_value", "official")} for r in under]},
        )  # fmt: skip
    return out
