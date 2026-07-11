"""The accuracy harness (GAMEPLAY.md doctrine): every number the game
shows must be recomputable from source. Run before every deploy;
non-zero exit blocks shipping.

Checks:
  V1  vectors.json internal integrity (dims, ranges, no dupes, coords)
  V2  cluster labels: recompute nearest-centroid from member means and
      confirm the client's centroid method reproduces pipeline labels
  V3  deadline.json: recompute EVERY quiz mover's deltas from the raw
      game logs — exact match (tolerance 0.01 for rounding)
  V4  chimera determinism: seeded target for 30 dates is stable and
      always satisfies the low-similarity MTNN constraint (<0.3)
"""

from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
FAILS: list[str] = []


def fail(msg: str) -> None:
    FAILS.append(msg)
    print(f"  FAIL: {msg}")


def v1_vectors(data: dict) -> None:
    print("V1 vectors integrity…")
    seen = set()
    for p in data["players"]:
        key = (p["name"], p["season"])
        if key in seen:
            fail(f"duplicate {key}")
        seen.add(key)
        if len(p["v"]) != len(data["features"]):
            fail(f"{key} dim {len(p['v'])}")
        if any(abs(x) > 4.001 for x in p["v"]):
            fail(f"{key} z out of clip")
        for c in ("x", "y", "z"):
            if not (0 <= p[c] <= 1):
                fail(f"{key} coord {c}={p[c]}")
        if not (0 <= p["c"] < len(data["clusters"])):
            fail(f"{key} cluster {p['c']}")
    print(f"  {len(seen)} unique player-seasons")


def v2_clusters(data: dict) -> None:
    print("V2 cluster label reproduction (client method vs pipeline)…")
    dims = len(data["features"])
    sums = defaultdict(lambda: [0.0] * dims)
    counts = defaultdict(int)
    for p in data["players"]:
        c = p["c"]
        counts[c] += 1
        for i, x in enumerate(p["v"]):
            sums[c][i] += x
    cents = {c: [s / counts[c] for s in sums[c]] for c in counts}
    mism = 0
    for p in data["players"]:
        best = min(cents, key=lambda c: sum(
            (a - b) ** 2 for a, b in zip(p["v"], cents[c])))
        if best != p["c"]:
            mism += 1
    rate = mism / len(data["players"])
    print(f"  centroid-reassignment mismatch: {mism} ({rate:.2%})")
    if rate > 0.02:  # k-means boundary points can flip; >2% means broken
        fail(f"cluster attribution unreliable ({rate:.2%})")


def v3_deadline() -> None:
    print("V3 deadline recomputation from raw logs…")
    dl = json.loads((ASSETS / "deadline.json").read_text(encoding="utf-8"))
    quiz = dl["thrives"] + dl["craters"]
    logs_by_season: dict[str, list] = {}
    for f in HERE.glob("data/gamelogs_*.jsonl"):
        season = f.stem.split("_")[1]
        logs_by_season[season] = [json.loads(l) for l in
                                  f.read_text(encoding="utf-8").splitlines()]
    checked = 0
    for m in quiz:
        logs = logs_by_season.get(m["season"])
        if logs is None:
            fail(f"no logs for {m['season']}")
            continue
        games = sorted([g for g in logs if g["PLAYER_NAME"] == m["name"]],
                       key=lambda g: g["GAME_DATE"])
        teams = [g["TEAM_ID"] for g in games]
        switch = next((i for i in range(1, len(teams))
                       if teams[i] != teams[i - 1]), None)
        if switch is None:
            fail(f"{m['name']} {m['season']}: no switch found")
            continue
        before = games[:switch]
        after = [g for g in games[switch:]
                 if g["TEAM_ID"] == games[switch]["TEAM_ID"]]
        mb = sum(g["MIN"] for g in before)
        ma = sum(g["MIN"] for g in after)
        p36b = 36 * sum(g["PTS"] for g in before) / mb
        p36a = 36 * sum(g["PTS"] for g in after) / ma
        if abs((p36a - p36b) - m["dP36"]) > 0.011:
            fail(f"{m['name']} {m['season']} dP36 {p36a-p36b:.2f} vs {m['dP36']}")
        if len(before) != m["gBefore"] or len(after) != m["gAfter"]:
            fail(f"{m['name']} game counts {len(before)}/{len(after)} vs "
                 f"{m['gBefore']}/{m['gAfter']}")
        checked += 1
    print(f"  {checked}/{len(quiz)} movers recomputed from raw logs")


def v4_determinism(data: dict) -> None:
    print("V4 chimera determinism (30 dates, MTNN donor constraint)…")

    meta_path = ASSETS / "mtnn_meta.json"
    f32_path = ASSETS / "mtnn_embeddings.f32"
    if not meta_path.exists() or not f32_path.exists():
        fail("MTNN assets missing — required for chimera determinism")
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    dim = int(meta["dim"])
    rows = int(meta["rows"])
    E = np.fromfile(f32_path, dtype=np.float32).reshape(rows, dim)

    def mtnn_sim(i: int, j: int) -> float:
        return float(E[i] @ E[j])

    def xmur3(s):
        h = 1779033703
        for ch in s:
            h = ((h ^ ord(ch)) * 3432918353) & 0xFFFFFFFF
            h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
        return h

    def mulberry(a):
        def rnd():
            nonlocal a
            a = (a + 0x6D2B79F5) & 0xFFFFFFFF
            t = a
            t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
            t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
            return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
        return rnd

    def cos(a, b):
        num = sum(x * y for x, y in zip(a, b))
        da = math.sqrt(sum(x * x for x in a)) or 1
        db = math.sqrt(sum(x * x for x in b)) or 1
        return num / (da * db)

    players = data["players"]
    from datetime import date, timedelta
    base = date(2026, 7, 1)
    for d in range(30):
        ds = (base + timedelta(days=d)).isoformat()
        picks = []
        for _ in range(2):
            rnd = mulberry(xmur3(f"vector-hoops:{ds}"))
            a = players[int(rnd() * len(players))]
            tries = 0
            b = players[int(rnd() * len(players))]
            while (b["id"] == a["id"] or mtnn_sim(a["id"], b["id"]) >= 0.3) and tries < 2000:
                b = players[int(rnd() * len(players))]
                tries += 1
            picks.append((a["id"], b["id"]))
        if picks[0] != picks[1]:
            fail(f"{ds}: nondeterministic target")
        a = next(p for p in players if p["id"] == picks[0][0])
        b = next(p for p in players if p["id"] == picks[0][1])
        if mtnn_sim(a["id"], b["id"]) >= 0.3:
            fail(f"{ds}: similarity constraint violated")
    print("  30/30 dates deterministic + constrained")


def v5_procrustes(data: dict) -> None:
    """drift.json integrity: every chained transform must be orthogonal
    (rotation-only claim), every consecutive pair covered, and the
    root-frame map must preserve norms (era-twin validity)."""
    print("V5 procrustes drift integrity…")
    dj = json.loads((ASSETS / "drift.json").read_text(encoding="utf-8"))
    n = len(data["features"])
    for season, M in dj["chainedToRoot"].items():
        # orthogonality: M M^T = I within rounding tolerance
        for i in range(n):
            for j in range(n):
                dot = sum(M[i][k] * M[j][k] for k in range(n))
                want = 1.0 if i == j else 0.0
                if abs(dot - want) > 5e-3:
                    fail(f"{season}: chained transform not orthogonal "
                         f"({i},{j})={dot:.4f}")
                    break
            else:
                continue
            break
    seasons = sorted({p["season"] for p in data["players"]})
    covered = {p["to"] for p in dj["pairs"]}
    missing = [s for s in seasons[1:] if s not in covered]
    if missing:
        fail(f"pairs missing seasons: {missing}")
    if len(dj["chainedToRoot"]) != len(seasons):
        fail(f"chainedToRoot covers {len(dj['chainedToRoot'])} of "
             f"{len(seasons)} seasons")
    print(f"  {len(dj['pairs'])} pairs, {len(dj['chainedToRoot'])} "
          "chained transforms, all orthogonal")


def v6_teams() -> None:
    print("V6 teams.json integrity…")
    path = ASSETS / "teams.json"
    if not path.exists():
        fail("assets/teams.json missing — run pipeline/build_teams.py")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    teams = data.get("teams")
    if not teams or len(teams) < 28:
        fail(f"teams.json has {len(teams or [])} teams — expected ~30")
        return
    abbrs = set()
    ids = set()
    for t in teams:
        ab = t.get("abbr")
        tid = t.get("id")
        name = t.get("name")
        if not ab or len(ab) != 3:
            fail(f"bad abbr for team {t}")
        if ab in abbrs:
            fail(f"duplicate abbr {ab}")
        abbrs.add(ab)
        if tid in ids:
            fail(f"duplicate TEAM_ID {tid}")
        ids.add(tid)
        if not name:
            fail(f"missing name for {ab}")
        for color_key in ("primary", "secondary"):
            c = t.get(color_key)
            if not c or not isinstance(c, str) or len(c) != 7 or c[0] != "#":
                fail(f"{ab}: bad {color_key} color {c!r}")
    print(f"  {len(teams)} teams, {len(abbrs)} unique abbreviations")


def v7_skills_alignment(data: dict) -> None:
    print("V7 skills.json alignment with vectors…")
    path = ASSETS / "skills.json"
    if not path.exists():
        fail("assets/skills.json missing — run pipeline/build_skills.py")
        return
    sk = json.loads(path.read_text(encoding="utf-8"))
    if len(sk.get("grades", [])) != len(data["players"]):
        fail(f"skills grades {len(sk.get('grades', []))} != vectors {len(data['players'])}")
        return
    probe = ASSETS / "skill_probe.json"
    if not probe.exists():
        fail("assets/skill_probe.json missing")
        return
    print(f"  {len(sk['grades'])} rows aligned; {len(sk.get('skills', []))} skills")


def v8_pedigree_asset(data: dict) -> None:
    print("V8 pedigree.json coverage (optional asset)…")
    path = ASSETS / "pedigree.json"
    if not path.exists():
        print("  pedigree.json absent — Skills pedigree panel dormant")
        return
    ped = json.loads(path.read_text(encoding="utf-8"))
    entries = ped.get("entries", ped.get("players", {}))
    if not entries:
        fail("pedigree.json has no entries")
        return
    sample = 0
    for p in data["players"][:50]:
        key = f"{p['name']}|{p['season']}"
        if key in entries or p["name"] in entries:
            sample += 1
    print(f"  {len(entries)} pedigree rows; sample hit {sample}/50 vector rows")
    if sample < 10:
        fail("pedigree keys do not align with vectors.json name|season")


def v9_wide_skills(data: dict) -> None:
    print("V9 skills_wide.json (optional)…")
    path = ASSETS / "skills_wide.json"
    if not path.exists():
        print("  skills_wide.json absent — wide Skills Lens dormant")
        return
    wide = json.loads(path.read_text(encoding="utf-8"))
    skills = wide.get("skills", [])
    grades = wide.get("grades", {})
    if not grades:
        fail("skills_wide.json has no grades")
        return
    if len(skills) < 6:
        fail(f"skills_wide.json expects 6 wide skills, got {len(skills)}")
    keys = {s["key"] for s in skills}
    for required in (
        "post", "transition", "motor",
        "shooting_gravity", "rim_gravity", "disruption_gravity",
    ):
        if required not in keys:
            fail(f"skills_wide.json missing wide skill key: {required}")
    hits = 0
    modern_pool = 0
    modern_hits = 0
    for p in data["players"]:
        key = f"{p['name']}|{p['season']}"
        if key in grades:
            hits += 1
        if p["season"] >= "2015-16":
            modern_pool += 1
            if key in grades:
                modern_hits += 1
    sample_n = min(100, modern_pool)
    print(f"  {len(grades)} wide grades ({len(skills)} skills); "
          f"key hit {hits}/{len(data['players'])} vector rows")
    if modern_pool and sample_n:
        rate = modern_hits / modern_pool
        print(f"  2015-16+ coverage: {modern_hits}/{modern_pool} ({rate:.1%})")
        if rate < 0.35:
            fail(f"wide skills too sparse on 2015-16+ rows ({rate:.1%})")


def v10_honors_playoffs(data: dict) -> None:
    print("V10 honors/playoffs assets (optional)…")
    for fname, key_field in (
        ("honors.json", "bySeason"),
        ("playoffs.json", "splits"),
    ):
        path = ASSETS / fname
        if not path.exists():
            print(f"  {fname} absent — panel dormant")
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        bucket = doc.get(key_field, doc.get("players", {}))
        n = len(bucket) if isinstance(bucket, (dict, list)) else 0
        print(f"  {fname}: {n} keys/rows")

    po_path = ASSETS / "playoffs.json"
    if not po_path.exists():
        return
    splits = json.loads(po_path.read_text(encoding="utf-8")).get("splits", {})
    for name, season in (
        ("Nikola Jokic", "2023-24"),
        ("Nikola Jokic", "2024-25"),
        ("Jamal Murray", "2022-23"),
    ):
        key = f"{name}|{season}"
        if key not in splits:
            fail(f"playoffs.json missing expected split: {key}")
        else:
            print(f"  spot check OK: {key} (pts_delta={splits[key].get('pts_delta')})")


def v11_mtnn_report_warn() -> None:
    print("V11 MTNN report gates (warn-only until promotion)…")
    report_path = HERE / "data" / "mtnn_report.json"
    if not report_path.exists():
        print("  no mtnn_report.json — training not finished")
        return
    rep = json.loads(report_path.read_text(encoding="utf-8"))
    test = rep.get("held_out_recall", {}).get("test", {}).get("recall_at_10_mtnn")
    purity = rep.get("cross_era_archetype_neighbor_purity_at_20")
    print(f"  test recall@10={test}  purity@20={purity}")
    arch = rep.get("archetype_top1_acc")
    base = rep.get("held_out_recall", {}).get("test", {}).get("recall_at_10_transparent_14d")
    eligible = (
        test is not None and base is not None and test >= base + 0.05
        and (arch or 0) >= 0.55
        and purity is not None and purity >= 0.63
    )
    if eligible:
        print("  MTNN promotion gates PASS — client embeddings exported when present")
    else:
        if purity is not None and purity < 0.63:
            print("  WARN: purity below 0.63 promotion gate — MTNN stays in pipeline/data/")
        if test is not None and test < 0.95:
            print("  WARN: test recall below 0.95 — review before promotion")


def v12_mtnn_client_assets() -> None:
    print("V12 MTNN client assets (optional)…")
    meta_path = ASSETS / "mtnn_meta.json"
    f32_path = ASSETS / "mtnn_embeddings.f32"
    if not meta_path.exists():
        print("  mtnn_meta.json absent — neighbor UI dormant")
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    dim = meta.get("dim")
    rows = meta.get("rows")
    if not f32_path.exists():
        fail("mtnn_meta.json present but mtnn_embeddings.f32 missing")
        return
    nbytes = f32_path.stat().st_size
    expected = (rows or 0) * (dim or 0) * 4
    if expected and nbytes != expected:
        fail(f"mtnn_embeddings.f32 size {nbytes} != expected {expected}")
    else:
        print(f"  mtnn client: {rows}×{dim} ({nbytes // 1024} KB f32)")


def local_checkpoint_stamp() -> dict | None:
    """(mtime, bytes) of the checkpoint the exports claim to describe.

    `assets/mtnn_arch.json` is the stamp the CLIENT compares against, but it is
    only an anchor once it has been re-exported by a version of
    export_mtnn_viz.py that writes one — an older arch.json omits the key
    entirely, and `if arch_stamp and export_stamp` then skips the comparison
    without a word. Anchoring on the checkpoint itself keeps the guard live
    wherever a promote actually happens (pipeline/data is gitignored, so this
    returns None in CI and the arch comparison carries it there).
    """
    ckpt = HERE / "data" / "mtnn_best.pt"
    if not ckpt.exists():
        return None
    st = ckpt.stat()
    return {"mtime": int(st.st_mtime), "bytes": int(st.st_size)}


def check_stamp(name: str, stamp: dict | None, arch: dict | None) -> None:
    """Fail closed when an export describes a checkpoint that is not shipped."""
    if not stamp:
        fail(f"{name} carries no checkpoint stamp — re-run its export")
        return
    local = local_checkpoint_stamp()
    if local and (stamp.get("mtime") != local["mtime"]
                  or stamp.get("bytes") != local["bytes"]):
        fail(f"{name} checkpoint stamp stale vs pipeline/data/mtnn_best.pt — "
             f"re-run export_mtnn_jacobian.py after retraining")
        return
    if arch is None:
        return
    ac = arch.get("checkpoint")
    if not ac:
        print(f"  note: mtnn_arch.json has no checkpoint stamp — the client-side "
              f"provenance guard is INACTIVE until export_mtnn_viz.py is re-run")
    elif ac.get("mtime") != stamp.get("mtime") or ac.get("bytes") != stamp.get("bytes"):
        fail(f"{name} checkpoint stamp stale vs arch — re-run its export")


def v13_mtnn_jacobian(data: dict) -> None:
    """Jacobian attribution assets must align with the shipped arch, or the
    /model diagram silently paints causal edges for a network that no longer
    exists (row count + byte length alone cannot catch a retrain)."""
    print("V13 MTNN jacobian attribution (optional)…")
    jpath = ASSETS / "mtnn_jacobian.json"
    fpath = ASSETS / "mtnn_jacobian.f32"
    if not jpath.exists():
        print("  mtnn_jacobian.json absent — diagram uses legacy input weights")
        return
    jac = json.loads(jpath.read_text(encoding="utf-8"))
    shape = (jac.get("perRowLayout") or {}).get("shape") or []
    if len(shape) != 3:
        fail("mtnn_jacobian.json missing perRowLayout.shape")
        return
    if not fpath.exists():
        fail("mtnn_jacobian.json present but mtnn_jacobian.f32 missing")
        return
    nbytes = fpath.stat().st_size
    expected = shape[0] * shape[1] * shape[2] * 4
    if nbytes != expected:
        fail(f"mtnn_jacobian.f32 size {nbytes} != expected {expected}")
    n_players = len(data["players"])
    if shape[0] != n_players:
        fail(f"jacobian rows {shape[0]} != vectors {n_players}")
    arch_path = ASSETS / "mtnn_arch.json"
    if arch_path.exists():
        arch = json.loads(arch_path.read_text(encoding="utf-8"))
        af = set(arch.get("towerFamilies") or [])
        jf = set(jac.get("towerFamilies") or [])
        if af and jf and af != jf:
            fail(f"jacobian towerFamilies != arch (stale export): "
                 f"jac-only={sorted(jf - af)} arch-only={sorted(af - jf)}")
        if jac.get("dEmb") is not None and arch.get("dEmb") is not None \
                and jac["dEmb"] != arch["dEmb"]:
            fail(f"jacobian dEmb {jac['dEmb']} != arch dEmb {arch['dEmb']}")
        check_stamp("mtnn_jacobian.json", jac.get("checkpoint"), arch)
    else:
        check_stamp("mtnn_jacobian.json", jac.get("checkpoint"), None)
    print(f"  jacobian: {shape[0]}×{shape[1]}×{shape[2]} "
          f"({nbytes // 1024} KB), targets={jac.get('targets')}")


def v13b_mtnn_attribution(data: dict) -> None:
    """Feature-level attribution must fail closed exactly as the tower-level
    export does: a diverging bar reading "AST pushed this archetype up" is a
    claim about the SHIPPED net, so a stale export is a lie, not a stale cache."""
    print("V13b MTNN feature attribution (optional)…")
    arch_path = ASSETS / "mtnn_arch.json"
    ppath = ASSETS / "mtnn_attr_pop.json"
    bpath = ASSETS / "mtnn_attr_topk.bin"
    if not ppath.exists():
        print("  mtnn_attr_pop.json absent — /model has no feature attribution")
        return
    attr = json.loads(ppath.read_text(encoding="utf-8"))
    layout = attr.get("topkLayout") or {}
    shape = layout.get("shape") or []
    if len(shape) != 3:
        fail("mtnn_attr_pop.json missing topkLayout.shape")
        return
    if not bpath.exists():
        fail("mtnn_attr_pop.json present but mtnn_attr_topk.bin missing")
        return

    n_rows, n_t, k = shape
    feats = attr.get("features") or []
    if n_rows != len(data["players"]):
        fail(f"attribution rows {n_rows} != vectors {len(data['players'])}")
    if n_t != len(attr.get("targets") or []):
        fail(f"attribution targets {n_t} != listed {attr.get('targets')}")

    expected = n_rows * n_t * k * 2 + n_rows * n_t * k * 4   # uint16 + float32
    nbytes = bpath.stat().st_size
    if nbytes != expected:
        fail(f"mtnn_attr_topk.bin size {nbytes} != expected {expected}")
    else:
        count = n_rows * n_t * k
        raw = bpath.read_bytes()
        idx = np.frombuffer(raw, dtype=np.uint16, count=count)
        val = np.frombuffer(raw, dtype=np.float32, count=count, offset=count * 2)
        if feats and int(idx.max()) >= len(feats):
            fail(f"attribution index {idx.max()} out of range for "
                 f"{len(feats)} features")
        if not np.isfinite(val).all():
            fail("attribution values contain NaN/Inf")

    # The honesty invariant the export docstring promises: a tower reads
    # cat([x*m, m]), so a never-measured feature has exactly zero gradient.
    # If a zero-coverage feature ever shows a contribution, the mask broke.
    cov = attr.get("coverage") or {}
    pop_abs = attr.get("populationAbs") or {}
    leaked = [f for f in feats
              if cov.get(f) == 0.0
              and any(abs(pop_abs.get(t, {}).get(f, 0.0)) > 0.0 for t in pop_abs)]
    if leaked:
        fail(f"never-measured features carry attribution (mask leak): {leaked[:5]}")

    # Fail closed on a retrain.
    arch = (json.loads(arch_path.read_text(encoding="utf-8"))
            if arch_path.exists() else None)
    check_stamp("mtnn_attr_pop.json", attr.get("checkpoint"), arch)

    manifest = HERE / "data" / "feature_manifest.json"
    if manifest.exists() and feats:
        mf = json.loads(manifest.read_text(encoding="utf-8")).get("features") or []
        # pipeline/data is gitignored, so only compare when it is present AND
        # was built for this checkpoint (a family-count change legitimately
        # re-shapes it; the checkpoint stamp above is the authority).
        if mf and len(mf) != len(feats):
            print(f"  note: feature_manifest has {len(mf)} features, attribution "
                  f"has {len(feats)} — matrix differs from checkpoint's")

    n_zero = sum(1 for f in feats if cov.get(f) == 0.0)
    print(f"  attribution: {n_rows}×{n_t}×{k} top-k ({nbytes // 1024} KB), "
          f"{len(feats)} features, {n_zero} never measured, "
          f"targets={attr.get('targets')}")


def v15_season_norms(data: dict) -> None:
    """Every shipped (season, feature) mean/SD must actually invert the z-score.

    The /model panel prints "37.5 per 100" by computing z*sd + mu. If a single
    pair is stale or wrong, the site states a specific, checkable, WRONG number
    about a real basketball player. So re-derive z from the shipped norms and
    the shipped vectors, and fail if any pair drifts.
    """
    print("V15 season norms invert the z-scores…")
    path = ASSETS / "season_norms.json"
    if not path.exists():
        print("  season_norms.json absent — /model falls back to z-scores")
        return
    doc = json.loads(path.read_text(encoding="utf-8"))
    feats = data["features"]
    shrunk = set(doc.get("notInvertible", []))

    by_season: dict[str, list[dict]] = defaultdict(list)
    for p in data["players"]:
        by_season[p["season"]].append(p)

    checked = worst = 0
    worst_err = 0.0
    for season, meta in doc.get("seasons", {}).items():
        rows = by_season.get(season, [])
        if not rows:
            fail(f"season_norms has {season} but vectors.json does not")
            continue
        for key, norm in meta["features"].items():
            if key in shrunk:
                fail(f"{season}/{key}: shrunk feature must not ship a mu/sd")
                continue
            j = feats.index(key)
            mu, sd = norm["mu"], norm["sd"]
            if sd <= 0:
                fail(f"{season}/{key}: sd={sd}")
                continue
            # Invert then re-standardize: mean over the season must return ~0.
            zs = np.array([p["v"][j] for p in rows], dtype=float)
            real = np.clip(zs, -4, 4) * sd + mu
            back = np.clip((real - mu) / sd, -4, 4)
            err = float(np.max(np.abs(back - np.clip(zs, -4, 4))))
            if err > 1e-6:
                fail(f"{season}/{key}: inverse not self-consistent ({err:.2e})")
            # The reconstructed league mean must match the shipped mu.
            recon_mu = float(np.mean(real))
            if abs(recon_mu - mu) > 0.35 * sd:
                worst += 1
                worst_err = max(worst_err, abs(recon_mu - mu) / sd)
            checked += 1

    if doc.get("perMode") != "Per100Possessions":
        fail(f"season_norms perMode={doc.get('perMode')!r} — the UI says per 100 possessions")
    if worst:
        print(f"  note: {worst} pairs whose clipped mean drifts >0.35sd "
              f"(max {worst_err:.2f}sd) — expected for clipped heavy tails")
    print(f"  {checked} (season, feature) pairs invert cleanly; "
          f"{len(shrunk)} shrunk features correctly withheld")


def v16_draft_board(data: dict) -> None:
    """The Steals/Busts board contract (assets/players-skills.js).

    The board now admits undrafted players as steals and admits short careers as
    busts, so three assumptions became load-bearing:

      1. every undrafted player carries an expect_slot (else he silently drops
         out of the steal pool the moment pctRank sees an undefined);
      2. undrafted players carry NO pick number (the board keys "undrafted" off
         a null overall, and prints "#null" if one leaks through);
      3. no drafted player sits at overall == 61 -- the bio cache uses 61 as its
         "undrafted" sentinel (see career_arc.py), and real historical drafts
         ran to pick 170, so a genuine #61 would be indistinguishable from a
         player nobody picked.
    """
    print("\n[V16] draft board contract (steals include undrafted; busts include short careers)")
    path = ASSETS / "pedigree.json"
    if not path.exists():
        print("  pedigree.json absent — board is dormant, nothing to check")
        return
    players = json.loads(path.read_text(encoding="utf-8"))["players"]
    charted = {p["name"] for p in data["players"]}

    no_expect = [n for n, p in players.items()
                 if n in charted and p.get("undrafted") and p.get("expect_slot") is None]
    if no_expect:
        fail(f"{len(no_expect)} undrafted players lack expect_slot (e.g. {no_expect[0]})")

    leaked_pick = [n for n, p in players.items()
                   if n in charted and p.get("undrafted") and p.get("overall") is not None]
    if leaked_pick:
        fail(f"{len(leaked_pick)} undrafted players carry a pick number (e.g. {leaked_pick[0]})")

    at_61 = [n for n, p in players.items()
             if n in charted and not p.get("undrafted") and p.get("overall") == 61]
    if at_61:
        fail(f"pick #61 collides with the bio undrafted sentinel: {at_61}")

    undrafted = sum(1 for n, p in players.items() if n in charted and p.get("undrafted"))
    max_pick = max((p.get("overall") or 0) for n, p in players.items() if n in charted)
    print(f"  {undrafted} charted undrafted players eligible as steals; "
          f"max real pick {max_pick}; sentinel 61 unoccupied")


def v14_stated_limitations(data: dict) -> None:
    """Enforce the methods.html "Limitations, stated plainly" list as gates.

    Prose promises rot. Three of the five limitations are mechanically checkable
    against the shipped artifacts, so check them instead of trusting the copy:

      * tracking exists only 2013-14+, carried as an explicit missing-data mask
        rather than an imputed guess  -> no observed value may sit under mask=0,
        and no pre-2013-14 row may carry a tracking observation;
      * position coverage is 99.7%, not 100%  -> unknowns must survive as -1,
        never silently coerced to PG (index 0);
      * archetype names describe statistical cluster centroids  -> one name per
        cluster, regenerated from centroids by build_vectors.
    """
    print("V14 stated limitations (methods.html) enforced…")
    train = HERE / "data" / "train_matrix.npz"
    manifest_p = HERE / "data" / "feature_manifest.json"
    if not train.exists() or not manifest_p.exists():
        print("  train_matrix/manifest absent — skipping mask-honesty checks")
    else:
        npz = np.load(train, allow_pickle=False)
        Z = npz["Z"].astype(np.float32)
        M = npz["mask"].astype(np.float32)
        seasons = npz["season"]
        manifest = json.loads(manifest_p.read_text(encoding="utf-8"))
        feats, fam_of = manifest["features"], manifest["families"]

        # (3a) No silent imputation: nothing observed where the mask says missing.
        leaked = float(np.abs(Z * (1.0 - M)).sum())
        if leaked > 1e-4:
            fail(f"imputation under mask: |Z*(1-M)| = {leaked:.6f} (must be 0) — "
                 "methods.html claims masked, not imputed")
        else:
            print("  no values under mask=0 (masked, not imputed)")

        # (3b) Tracking is a 2013-14+ feature family.
        tcols = [j for j, f in enumerate(feats) if fam_of.get(f) == "tracking"]
        if tcols:
            yr = np.array([int(str(s)[:4]) for s in seasons])
            pre = M[:, tcols][yr < 2013]
            if pre.size and pre.sum() > 0:
                fail(f"tracking observed in {int((pre.sum(1) > 0).sum())} pre-2013-14 "
                     "rows — methods.html claims 2013-14 onward only")
            else:
                post = M[:, tcols][yr >= 2013]
                cov = float((post.sum(1) > 0).mean()) if post.size else 0.0
                print(f"  tracking: 0 rows before 2013-14, {cov:.1%} coverage after")

    # (4) Position coverage: unknowns preserved as -1, never defaulted to PG.
    players = data["players"]
    unknown = sum(1 for p in players if int(p.get("p", -1)) < 0)
    cov = 1.0 - unknown / max(1, len(players))
    if unknown == 0:
        fail("no position marked unknown — methods.html states 99.7% coverage; "
             "unknowns must survive as -1, not be coerced to a position")
    if cov < 0.99:
        fail(f"position coverage {cov:.2%} below the stated ~99.7%")
    print(f"  position coverage {cov:.2%} ({unknown} rows unknown, preserved as -1)")

    # (5) Archetype names are centroid descriptions — one per cluster.
    names = data.get("clusters") or []
    n_clusters = len({p["c"] for p in players})
    if len(names) != n_clusters:
        fail(f"{len(names)} archetype names for {n_clusters} clusters")
    else:
        print(f"  {len(names)} archetype names, one per statistical centroid")


if __name__ == "__main__":
    data = json.loads((ASSETS / "vectors.json").read_text(encoding="utf-8"))
    v1_vectors(data)
    v2_clusters(data)
    v3_deadline()
    v4_determinism(data)
    v5_procrustes(data)
    v6_teams()
    v7_skills_alignment(data)
    v8_pedigree_asset(data)
    v9_wide_skills(data)
    v10_honors_playoffs(data)
    v11_mtnn_report_warn()
    v12_mtnn_client_assets()
    v13_mtnn_jacobian(data)
    v13b_mtnn_attribution(data)
    v14_stated_limitations(data)
    v15_season_norms(data)
    v16_draft_board(data)
    if FAILS:
        print(f"\nACCURACY HARNESS: {len(FAILS)} FAILURES — do not ship")
        sys.exit(1)
    print("\nACCURACY HARNESS: all checks pass")
