#!/usr/bin/env python3
"""Build twin-explainer assets — plain-words "why they're twins".

Inputs : assets/eratwins.json (signature-season pairs + twin + similarity)
         assets/vectors.json (players[].v 14-d serving vectors, featureLabels)
         assets/vectors_search_lite.json (row ids n/s), assets/honors.json (asg)
Outputs: assets/twin_explainer.json
           { "<name>|<season>": {"shared": [3 chips], "differ": "<label>",
                                 "sim": 0.853, "thin": false},
             ... (both directions of every pair) ...,
             "_meta": {"threshold": 0.60, "method": ..., "labels": {...}, "chips": {...}} }
         assets/twin_explainer_vectors.json
           { "<lite id>": [14 floats] } for the Daily Court past+modern pools,
           so the client can explain ANY reveal pair live (same algorithm).

Method per pair (A, B) in the 14-d serving space:
  shared dims  = 3 closest |a_d - b_d|, stable-partitioned so shared PRESENCES
                 (mean z >= 0.25) lead, then average traits, then shared
                 ABSENCES (mean z <= -0.25)  [v4 presence-preference, 2026-10-19]
  differentiator = largest |a_d - b_d|    -> "biggest difference: X"
  sim_se       = bootstrap se of the 64-d cosine under resampling of the
                 64 embedding dims (reps=100, seed=20261019)
  pct          = percentile of sim within the twin sim distribution
  absence_only = all 3 chips are shared absences -> strong-band pairs get a
                 shown qualifier ("strong twin, mostly in what they don't do")
The MATCH itself was found in the full 64-d MTNN embedding (see eratwins.json
method); the explainer only decomposes observable style overlap in 14-d.

Stdlib only. Real data only. Any QA failure is a hard failure (non-zero exit).
"""

import json
import math
import os
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)  # noqa: E731

ERATWINS = A("assets", "eratwins.json")
VEC = A("assets", "vectors.json")
LITE = A("assets", "vectors_search_lite.json")
HONORS = A("assets", "honors.json")
OUT_PAIRS = A("assets", "twin_explainer.json")
OUT_VEC = A("assets", "twin_explainer_vectors.json")

# per-dim chip copy: code -> (high chip, low chip). Plain everyday English.
CHIP = {
    "PTS": ("both fill it up scoring", "both score sparingly"),
    "AST": ("both run the offense", "both rarely create for others"),
    "OREB": ("both crash the offensive glass", "both stay off the offensive glass"),
    "DREB": ("both clean the defensive glass", "both cede the defensive glass"),
    "STL": ("both pick pockets", "both rarely gamble for steals"),
    "BLK": ("both protect the rim", "both rarely block shots"),
    "TOV": ("both turn it over a lot", "both take care of the ball"),
    "FG3A": ("both let it fly from three", "both rarely shoot threes"),
    "FGA": ("both take a ton of shots", "both shoot sparingly"),
    "FTA": ("both live at the line", "both rarely get to the line"),
    "FG3_PCT": ("both snipe from deep", "both struggle from deep"),
    "FG_PCT": ("both finish everything inside", "both struggle to finish"),
    "FT_PCT": ("both automatic at the stripe", "both shaky at the stripe"),
    "PLUS_MINUS": ("both outscore opponents on court", "both get outscored on court"),
}


def season_year(s):
    return int(s[:4])


def explain(va, vb, labels, dim_codes):
    """Same algorithm the client runs live.

    Returns (shared_chips[3], chip_kinds[3], differ_label).

    Presence-preference (2026-10-19, v4 panel): the 3 closest dims are
    stable-partitioned so shared PRESENCES (mean z >= 0.25) lead, then
    average traits, then shared ABSENCES (mean z <= -0.25). A twin story
    should say what two players DO, not what they don't.
    chip_kinds entries are 'presence' | 'average' | 'absence'.
    """
    order = sorted(range(14), key=lambda k: abs(va[k] - vb[k]))
    # stable partition: presences first, then average, then absences
    pres, avg, absn = [], [], []
    for k in order:
        mean = (va[k] + vb[k]) / 2
        (pres if mean >= 0.25 else avg if mean > -0.25 else absn).append(k)
    ranked = pres + avg + absn
    shared, kinds = [], []
    for k in ranked[:3]:
        mean = (va[k] + vb[k]) / 2
        if mean >= 0.25:
            shared.append(CHIP[dim_codes[k]][0])
            kinds.append("presence")
        elif mean <= -0.25:
            shared.append(CHIP[dim_codes[k]][1])
            kinds.append("absence")
        else:
            shared.append(f"both average {labels[dim_codes[k]]}")
            kinds.append("average")
    differ = labels[dim_codes[order[-1]]]
    return shared, kinds, differ


EMB_F32 = A("assets", "mtnn_embeddings.f32")


def load_embedding_rows():
    """Full 64-d MTNN embedding (f32 row = vectors.json player id). Loaded once."""
    from array import array

    emb = array("f")
    with open(EMB_F32, "rb") as f:
        emb.fromfile(f, 12966 * 64)
    return emb


def pair_rows(emb, a_id, b_id):
    out = []
    for pid in (a_id, b_id):
        i = pid * 64
        out.append([emb[i + k] for k in range(64)])
    return out


def bootstrap_sim_se(va64, vb64, seed=20261019, reps=100):
    """Bootstrap se of the 64-d cosine under resampling of embedding dims.

    Deterministic (fixed seed). This is the honest uncertainty on the twin
    similarity number the surfaces display: how stable the cosine is to
    which of the 64 embedding dims you keep.
    """
    import math
    import random

    ab = [x * y for x, y in zip(va64, vb64)]
    aa = [x * x for x in va64]
    bb = [x * x for x in vb64]
    rng = random.Random(seed)
    R = range(64)
    cs = []
    for _ in range(reps):
        s = rng.choices(R, k=64)
        d = sum(ab[i] for i in s)
        na = math.sqrt(sum(aa[i] for i in s))
        nb = math.sqrt(sum(bb[i] for i in s))
        cs.append(d / (na * nb) if na and nb else 0.0)
    m = sum(cs) / len(cs)
    var = sum((c - m) ** 2 for c in cs) / (len(cs) - 1)
    return math.sqrt(var)


def main():
    vec = json.load(open(VEC, encoding="utf-8"))
    players = vec["players"]
    labels = vec["featureLabels"]
    dim_codes = list(labels.keys())
    assert len(dim_codes) == 14 and set(dim_codes) == set(CHIP), "dim/chip mismatch"

    # vectors are z-scored per season: per-dim mean over all rows should be ~0
    for k in range(14):
        m = statistics.fmean(p["v"][k] for p in players)
        assert abs(m) < 0.05, f"dim {dim_codes[k]} mean {m:.3f} — not standardized?"

    v_by_key = {}
    pid_by_key = {}
    for p in players:
        key = f"{p['name']}|{p['season']}"
        assert "|" not in p["name"], f"pipe in name: {p['name']}"
        assert all(math.isfinite(v) for v in p["v"]) and len(p["v"]) == 14
        # identity fix 2026-10-01: name|season must resolve to exactly one person
        pid = p.get("person_id")
        assert pid, f"row missing person_id: {key}"
        assert key not in v_by_key, f"duplicate name|season: {key}"
        v_by_key[key] = p["v"]
        pid_by_key[key] = pid

    twins = json.load(open(ERATWINS, encoding="utf-8"))["players"]
    # Pair count is a function of vectors.json careers (>=4 charted seasons):
    # 1,308 in the retired 48-d-era data, 1,313 after the v5 regeneration on
    # the identity-fixed vectors.json. Assert a sanity floor, not a count.
    assert len(twins) >= 1000, f"expected 1000+ pairs, got {len(twins)}"

    # thin-match threshold from the sim distribution (bottom decile = genuinely thin)
    sims = sorted(p["twin"]["similarity"] for p in twins)
    p10 = sims[len(sims) // 10]
    threshold = round(p10, 2)
    print(
        f"  sim: min {sims[0]:.3f} p10 {p10:.3f} median {sims[len(sims)//2]:.3f} "
        f"max {sims[-1]:.3f} -> thin threshold {threshold}"
    )

    # percentile lookup table for the client (sim at each percentile 0..100),
    # so every surface can headline the percentile from the sim alone.
    pct_table = []
    srt = sims
    for q in range(101):
        i = (len(srt) - 1) * q / 100
        lo = int(i)
        pct_table.append(
            round(srt[lo] + (srt[lo + 1] - srt[lo]) * (i - lo), 4)
            if lo + 1 < len(srt)
            else round(srt[lo], 4)
        )
    print(f"  percentile table: {len(pct_table)} entries written to _meta")

    def percentile_rank(s):
        # Defined by the SAME rule the client uses (twin-bands.js
        # pctFromTable): count of percentile-table entries strictly below s.
        # One definition everywhere — no surface can contradict another.
        return sum(1 for t in pct_table if t < s)

    def pair_key(a_key, b_key):
        # canonical pair key: twin seasons repeat across pairs (e.g. AC Green
        # 1999-00 is the twin in 7 pairs), so a single-season key is ambiguous.
        x, y = sorted((a_key, b_key))
        return f"{x} ~ {y}"

    out = {}
    missing = []
    se_cache = {}
    emb64 = load_embedding_rows()
    id_by_key = {
        f"{p['name']}|{p['season']}": p["id"] for p in players
    }
    for p in twins:
        a_key = f"{p['name']}|{p['season']}"
        t = p["twin"]
        b_key = f"{t['name']}|{t['season']}"
        va, vb = v_by_key.get(a_key), v_by_key.get(b_key)
        if va is None or vb is None:
            missing.append((a_key, b_key))
            continue
        shared, kinds, differ = explain(va, vb, labels, dim_codes)
        sim = t["similarity"]
        assert 0 < sim <= 1, f"bad sim {sim}"
        pair_ids = tuple(sorted((id_by_key[a_key], id_by_key[b_key])))
        if pair_ids not in se_cache:
            va64, vb64 = pair_rows(emb64, *pair_ids)
            se_cache[pair_ids] = bootstrap_sim_se(va64, vb64)
        rec = {
            "a": a_key,
            "b": b_key,
            "a_pid": pid_by_key[a_key],
            "b_pid": pid_by_key[b_key],
            "shared": shared,
            "kinds": kinds,
            "differ": differ,
            "sim": round(sim, 3),
            "sim_se": round(se_cache[pair_ids], 3),
            "pct": percentile_rank(sim),
            "absence_only": all(k == "absence" for k in kinds),
            "thin": bool(sim < threshold),
        }
        out[pair_key(a_key, b_key)] = rec
    assert not missing, f"{len(missing)} pairs missing vectors, e.g. {missing[:3]}"
    # Unordered pairs repeat when twins are mutual (A's twin is B and B's is
    # A); cosine is symmetric, so their sims are identical and the dict
    # overwrite dedup is lossless. (138 such repeats in the v5 data.)
    n_unique = len(
        {
            tuple(
                sorted(
                    (
                        f"{p['name']}|{p['season']}",
                        f"{p['twin']['name']}|{p['twin']['season']}",
                    )
                )
            )
            for p in twins
        }
    )
    assert len(out) == n_unique, f"expected {n_unique} unique pairs, got {len(out)}"

    out["_meta"] = {
        "threshold": threshold,
        "match_space": "64-d MTNN embedding cosine (see eratwins.json method)",
        "explainer_space": "14-d era-normalised serving vectors (vectors.json)",
        "labels": labels,
        "chips": {c: list(v) for c, v in CHIP.items()},
        "chip_rule": (
            "2026-10-19 presence-preference: the 3 closest of the 14 style dims "
            "are stable-partitioned so shared PRESENCES (mean z >= 0.25) lead, "
            "then average traits, then shared ABSENCES (mean z <= -0.25). "
            "absence_only = all 3 chips are shared absences; a strong-band twin "
            "with absence_only gets a shown qualifier."
        ),
        "sim_interval_method": (
            "sim_se: bootstrap standard error of the 64-d cosine under "
            "resampling of the 64 embedding dims (reps=100, seed=20261019); "
            "displayed as '<sim> ± <se>' on tap-through only."
        ),
        "pct_table": pct_table,
        "pct_note": (
            "percentile = number of percentile-table entries strictly below "
            "the sim (0..100); the client uses the identical rule, so every "
            "surface headlines the same percentile. Headline as "
            "'more similar than N% of pairs'."
        ),
    }

    # ---- QA: 5-pair sanity (spec acceptance) ----
    # NOTE (2026-10-19): archetype labels do NOT predict the top-3 shared dims
    # (verified: sharpshooter archetype pairs share a 3pt dim only 28% of the
    # time), because pre-presence-preference "shared" usually meant shared
    # absences (both similarly low). The v4 chip rule now surfaces shared
    # presences first; the checks below use concrete, hand-verified pairs.
    def key_of(p):
        return pair_key(
            f"{p['name']}|{p['season']}", f"{p['twin']['name']}|{p['twin']['season']}"
        )

    ah = next(
        p for p in twins if p["name"] == "Allan Houston" and p["season"] == "2002-03"
    )
    # v5 pairings (2026-10-12 regen): Houston's twin is Reggie Miller (was
    # JJ Redick in the retired 48-d space); chips hand-verified for this pair.
    assert ah["twin"]["name"] == "Reggie Miller", "Houston twin changed?"
    assert (
        "both fill it up scoring" in out[key_of(ah)]["shared"]
    ), "shooter pair chips wrong"
    print(
        f"  sharpshooter: Allan Houston <-> Reggie Miller: {out[key_of(ah)]['shared']}"
    )

    ag = next(p for p in twins if p["name"] == "AC Green" and p["season"] == "1999-00")
    ag_rec = out[key_of(ag)]
    # v4 presence-preference (2026-10-19): chips must LEAD with presences.
    # AC Green ~ Horace Grant (0.775, strong band) was evidenced by three
    # shared absences; it now leads with presences and is NOT absence_only.
    assert ag_rec["shared"][0] == "both outscore opponents on court", (
        f"AC Green pair chips wrong: {ag_rec['shared']}"
    )
    assert not ag_rec["absence_only"], "AC Green pair wrongly flagged absence_only"
    assert ag_rec["differ"] == "rim protection", "AC Green differ wrong"
    assert ag_rec["pct"] > 66, f"AC Green pct wrong: {ag_rec['pct']}"
    assert 0 < ag_rec["sim_se"] < 0.2, f"AC Green sim_se implausible: {ag_rec['sim_se']}"
    print(
        f"  bigs: AC Green <-> Horace Grant: {ag_rec['shared']} | differ: {ag_rec['differ']} "
        f"| pct {ag_rec['pct']} | se {ag_rec['sim_se']}"
    )

    # v5 pairings (2026-10-12 regen): Grant Hill's twin is now Paul Pierce
    # (was LeBron James in the retired 48-d space), so the playmaker sanity
    # pair is Stockton <-> Rondo — hand-verified pass-first point guards.
    pm = next(
        p for p in twins if p["name"] == "John Stockton" and p["season"] == "2000-01"
    )
    assert pm["twin"]["name"] == "Rajon Rondo", "Stockton twin changed?"
    assert (
        "both run the offense" in out[key_of(pm)]["shared"]
    ), "playmaker pair chips wrong"
    print(f"  playmaker: John Stockton <-> Rajon Rondo: {out[key_of(pm)]['shared']}")

    thin_pair = min(twins, key=lambda p: p["twin"]["similarity"])
    ta = f"{thin_pair['name']}|{thin_pair['season']}"
    tb = f"{thin_pair['twin']['name']}|{thin_pair['twin']['season']}"
    assert out[pair_key(ta, tb)]["thin"], "thinnest pair not flagged"
    print(
        f"  thin: {thin_pair['name']} <-> {thin_pair['twin']['name']} "
        f"sim {thin_pair['twin']['similarity']:.3f} -> flagged"
    )

    def decade_gap(p):
        da = int(p["decade"][:4])
        db = int(p["twin"]["decade"][:4])
        return abs(da - db)

    odd = max(twins, key=decade_gap)
    oa = f"{odd['name']}|{odd['season']}"
    ob = f"{odd['twin']['name']}|{odd['twin']['season']}"
    ok = out.get(pair_key(oa, ob))
    assert ok and ok["differ"] in labels.values(), "cross-era oddity broken"
    print(
        f"  cross-era: {odd['name']} ({odd['decade']}) <-> {odd['twin']['name']} "
        f"({odd['twin']['decade']}): differ = {ok['differ']}"
    )

    # QA: live-compute path (client algorithm) must agree with precomputed on every pair
    for p in twins:
        a_key = f"{p['name']}|{p['season']}"
        b_key = f"{p['twin']['name']}|{p['twin']['season']}"
        s2, k2, d2 = explain(v_by_key[a_key], v_by_key[b_key], labels, dim_codes)
        rec = out[pair_key(a_key, b_key)]
        assert (
            s2 == rec["shared"] and k2 == rec["kinds"] and d2 == rec["differ"]
        ), f"algo drift: {a_key}"
    print(f"  live-compute agreement: {len(twins)}/{len(twins)} pairs")

    # QA: strong-band twins evidenced ONLY by absences must be flagged for the
    # shown qualifier (manners before errors: presence precedes absence).
    strong_absence = [
        k for k, r in out.items()
        if not k.startswith("_") and r["sim"] >= 0.727 and r["absence_only"]
    ]
    print(f"  strong-band absence_only pairs (get the shown qualifier): {len(strong_absence)}")
    for k in strong_absence[:5]:
        print(f"    {k}: {out[k]['shared']}")

    def emit(path, obj):
        # mirror to public/ (Vercel serves public/ at the site root)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, separators=(",", ":"))
        pub = path.replace(A("assets"), A("public", "assets"), 1)
        os.makedirs(os.path.dirname(pub), exist_ok=True)
        with open(pub, "w", encoding="utf-8") as f:
            json.dump(obj, f, separators=(",", ":"))

    emit(OUT_PAIRS, out)
    json.load(open(OUT_PAIRS, encoding="utf-8"))  # round-trip
    print(f"OK: {OUT_PAIRS}: {len(out)} pairs, {os.path.getsize(OUT_PAIRS)//1024} KB")

    # ---- pool vectors for live client compute (any Daily Court reveal pair) ----
    lite = json.load(open(LITE, encoding="utf-8"))["players"]
    hon = json.load(open(HONORS, encoding="utf-8"))
    honors = hon.get("bySeason", hon)
    past_ids, modern_rows = set(), {}
    for p in lite:
        yr = season_year(p["s"])
        if (
            1996 <= yr <= 2023
            and (honors.get(f"{p['n']}|{p['s']}", {}) or {}).get("asg") == 1
        ):
            past_ids.add(p["i"])
        if yr >= 2025:
            # keyed by person_id, never display name (identity fix 2026-10-01):
            # two persons can share a display name (e.g. Reggie Williams).
            ex = modern_rows.get(p["pid"])
            if (
                ex is None
                or season_year(ex["s"]) < yr
                or (season_year(ex["s"]) == yr and p["s"] > ex["s"])
            ):
                modern_rows[p["pid"]] = p
    pool_ids = past_ids | {p["i"] for p in modern_rows.values()}
    v_by_id = {(p["name"], p["season"]): p["v"] for p in players}
    # Display names drift between files (lite still carries the unhyphenated
    # "GilgeousAlexander" while vectors.json is hyphenated); person_id is the
    # stable join key, same principle as the 2026-10-01 identity fix above.
    v_by_pid = {(p["person_id"], p["season"]): p["v"] for p in players}
    id_to_ns = {p["i"]: (p["n"], p["s"]) for p in lite}
    id_to_pid = {p["i"]: p["pid"] for p in lite}
    vec_out, missing_ids = {}, []
    for i in pool_ids:
        ns = id_to_ns.get(i)
        v = v_by_id.get(ns) if ns else None
        if v is None and ns:
            pid = id_to_pid.get(i)
            v = v_by_pid.get((pid, ns[1])) if pid else None
        if v is None:
            missing_ids.append(i)
        else:
            vec_out[str(i)] = [round(x, 4) for x in v]
    assert not missing_ids, f"{len(missing_ids)} pool ids missing vectors"
    emit(OUT_VEC, vec_out)
    print(
        f"OK: {OUT_VEC}: {len(vec_out)} rows "
        f"(past {len(past_ids)}, modern {len(modern_rows)}), "
        f"{os.path.getsize(OUT_VEC)//1024} KB"
    )


if __name__ == "__main__":
    main()
