#!/usr/bin/env python3
"""Hard-fail QA gate for the player-identity fix.

Verifies, from assets/player-identity.json and the working tree:
  1. Every vectors.json row has exactly one non-empty person_id.
  2. person_id -> exactly one display name (no silent merges).
  3. Registry split persons resolve to their registered person_id/display.
  4. Suffix-stripped name collisions: any stripped display name mapping to
     2+ person_ids must have ALL of them registered (reviewed splits).
  5. No unexplained >=4-year career gap per person_id (allowlisted only).
  6. No duplicate person_id|season.
  7. Row count == 12,966 and row `id`s unique (embedding alignment tripwire).
  8. No stale standalone old dataset names in remapped assets
     (except the 4 birth-year pairs whose display == dataset name).
  9. public/ mirrors byte-identical for every served asset.

Any failure exits non-zero. Stdlib only.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)  # noqa: E731

FAILURES = []


def fail(msg):
    FAILURES.append(msg)
    print(f"FAIL: {msg}")


def strip_suffix(name):
    return re.sub(r"\s+(Jr\.|Sr\.|II|III|IV)\.?$", "", name).strip()


def norm(name):
    return re.sub(r"\s+", " ", name.strip().lower())


def season_start(s):
    return int(s[:4])


def main():
    reg = json.load(open(A("assets", "player-identity.json"), encoding="utf-8"))
    vec = json.load(open(A("assets", "vectors.json"), encoding="utf-8"))
    players = vec["players"]

    # ---- 1. every row has exactly one person_id ----
    for p in players:
        if not p.get("person_id") or not isinstance(p["person_id"], str):
            fail(f"row id={p.get('id')} missing person_id")
    if FAILURES:
        return 1

    # ---- 2. person_id -> one display name ----
    pid_to_names = {}
    for p in players:
        pid_to_names.setdefault(p["person_id"], set()).add(p["name"])
    for pid, names in pid_to_names.items():
        if len(names) > 1:
            fail(
                f"person_id {pid} maps to {len(names)} display names: {sorted(names)[:4]}"
            )

    # ---- 3. registry coverage ----
    split_map = {}
    for person in reg["persons"]:
        for s in person["seasons"]:
            split_map[(person["dataset_name"], s)] = person
    vec_lookup = {(p["person_id"], p["season"]): p for p in players}
    for (ds_name, season), person in split_map.items():
        got = vec_lookup.get((person["person_id"], season))
        if got is None:
            fail(f"registry season missing from vectors: {ds_name}|{season}")
        elif got["name"] != person["display_name"]:
            fail(
                f"name mismatch {ds_name}|{season}: vectors={got['name']!r} "
                f"registry={person['display_name']!r}"
            )

    # ---- 4. suffix-stripped collisions must all be registered ----
    registered_pids = {p["person_id"] for p in reg["persons"]}
    stripped = {}
    for p in players:
        stripped.setdefault(norm(strip_suffix(p["name"])), set()).add(p["person_id"])
    for sname, pids in stripped.items():
        if len(pids) > 1 and not pids <= registered_pids:
            fail(
                f"unregistered collision on stripped name {sname!r}: "
                f"{sorted(pids - registered_pids)}"
            )

    # ---- 5. no unexplained >=4y gaps ----
    allow = {norm(strip_suffix(n)) for n in reg["comeback_allowlist"]}
    allow |= {norm(strip_suffix(p["display_name"])) for p in reg["persons"]}
    allow |= {norm(strip_suffix(p["dataset_name"])) for p in reg["persons"]}
    by_pid = {}
    for p in players:
        by_pid.setdefault(p["person_id"], []).append(p)
    for pid, rows in by_pid.items():
        yrs = sorted({season_start(r["season"]) for r in rows})
        name = rows[0]["name"]
        for a, b in zip(yrs, yrs[1:]):
            if b - a >= 4 and norm(strip_suffix(name)) not in allow:
                fail(f"unexplained {b - a}y gap for {name} ({pid}): {a}-{b}")

    # ---- 6. no duplicate person_id|season ----
    seen = set()
    for p in players:
        key = (p["person_id"], p["season"])
        if key in seen:
            fail(f"duplicate person_id|season: {key}")
        seen.add(key)

    # ---- 7. row count + id uniqueness (embedding alignment tripwire) ----
    if len(players) != 12966:
        fail(f"row count {len(players)} != 12966")
    ids = [p["id"] for p in players]
    if len(set(ids)) != len(ids):
        fail("duplicate row ids")

    # ---- 8. no stale old names (b-pairs exempt: display == dataset name) ----
    fix_map = {k: v for k, v in reg["display_fixes"].items() if not k.startswith("_")}
    split_names = {p["dataset_name"] for p in reg["persons"]}
    bpair_names = {
        p["dataset_name"]
        for p in reg["persons"]
        if p["dataset_name"] == p["display_name"]
    }
    stale_names = (split_names | set(fix_map)) - bpair_names
    check_files = [
        "assets/vectors.json",
        "assets/playoffs.json",
        "assets/honors.json",
        "assets/next_profile_eval.json",
        "assets/player_meta.json",
        "assets/player_team_season.json",
        "assets/playoff_paths.json",
        "assets/skills_wide.json",
        "assets/players_lite.json",
        "assets/vectors_search_lite.json",
        "assets/vectors_search_lite_pos.json",
        "assets/eratwins.json",
        "assets/current_rosters.json",
        "assets/pedigree.json",
        "assets/career_surplus.json",
        "assets/projections.json",
    ]
    for rel in check_files:
        path = A(rel)
        if not os.path.exists(path):
            continue
        raw = open(path, encoding="utf-8").read()
        for old in stale_names:
            if re.search(r'"' + re.escape(old) + r'"', raw):
                fail(f"stale old name {old!r} in {rel}")
                break

    # ---- 9. public/ mirror parity ----
    for rel in check_files + [
        "assets/player-identity.json",
        "assets/pid_ambiguous.json",
        "assets/trajectories.json",
        "assets/timesfm_forecasts.json",
        "assets/trails.json",
        "assets/trails_index.json",
        "assets/insights.json",
        "assets/twin_explainer.json",
    ]:
        src, dst = A(rel), A("public", rel)
        if not os.path.exists(src):
            continue
        if not os.path.exists(dst):
            fail(f"public mirror missing: {rel}")
        elif open(src, "rb").read() != open(dst, "rb").read():
            fail(f"public mirror differs: {rel}")

    if FAILURES:
        print(f"\nQA FAILED: {len(FAILURES)} failures")
        return 1
    print(
        f"QA OK: {len(players)} rows, {len(pid_to_names)} person_ids, "
        f"{len(split_map)} registered split seasons, mirrors parity"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
