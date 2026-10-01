#!/usr/bin/env python3
"""Apply the player-identity registry to vectors.json and derived assets.

Reads assets/player-identity.json and:
  1. vectors.json rows gain `person_id` (row `id` untouched) and corrected
     display `name`s. Row count and order are preserved.
  2. Name-keyed derived assets are remapped to the corrected display names:
     playoffs, honors, next_profile_eval, player_meta, player_team_season,
     playoff_paths, skills_wide (all "Name|season" keys), players_lite,
     vectors_search_lite (+_pos, gaining an additive `pid` field),
     vectors_map_lite (name fields only), eratwins (name/twin/top5 names),
     current_rosters (active person), pedigree (elder person),
     trajectories playerIndex (merged split keys removed).
  3. Writes assets/pid_ambiguous.json: {norm_name: {season: person_id}} for
     the registered shared-name collisions, so clients can resolve a
     person_id from (display name, season) without touching core map code.
  4. Mirrors every changed asset into public/ (Vercel serves public/).

Stdlib only. Real data only. Any QA failure is a hard failure (non-zero exit).
Idempotent: re-running on already-applied assets is a no-op.
"""

import json
import os
import re
import shutil
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)  # noqa: E731

REG_PATH = A("assets", "player-identity.json")
VEC_PATH = A("assets", "vectors.json")
EXPECTED_ROWS = 12966

CHANGED = []  # repo-relative paths changed (for public/ mirroring)


def player_slug(name):
    """Same rule as assets/dossier.js playerSlug: accent-fold, lowercase,
    non-alphanumerics collapse to single hyphens."""
    folded = unicodedata.normalize("NFD", name)
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")
    return slug


def norm_name(name):
    return re.sub(r"\s+", " ", name.strip().lower())


def strip_suffix(name):
    return re.sub(r"\s+(Jr\.|Sr\.|II|III|IV)$", "", name).strip()


def load_registry():
    reg = json.load(open(REG_PATH, encoding="utf-8"))
    split_map = {}  # (dataset_name, season) -> (person_id, display_name)
    for person in reg["persons"]:
        for season in person["seasons"]:
            key = (person["dataset_name"], season)
            assert key not in split_map, f"duplicate season claim {key}"
            split_map[key] = (person["person_id"], person["display_name"])
    # display_fixes is {dataset_name: fixed_display_name} plus a "_readme" key.
    fix_map = {k: v for k, v in reg["display_fixes"].items() if not k.startswith("_")}
    assert all(v != k for k, v in fix_map.items()), "no-op fix entry"
    return reg, split_map, fix_map


def disp_for(old_name, season, split_map, fix_map):
    if (old_name, season) in split_map:
        return split_map[(old_name, season)][1]
    return fix_map.get(old_name, old_name)


def pid_for(old_name, season, split_map, fix_map):
    if (old_name, season) in split_map:
        return split_map[(old_name, season)][0]
    return player_slug(disp_for(old_name, season, split_map, fix_map))


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    rel = os.path.relpath(path, ROOT)
    if rel not in CHANGED:
        CHANGED.append(rel)


def remap_name_season_key(key, split_map, fix_map):
    """'Name|season' -> 'Display Name|season'. Returns (new_key, changed)."""
    if "|" not in key:
        return key, False
    name, season = key.rsplit("|", 1)
    new_name = disp_for(name, season, split_map, fix_map)
    if new_name == name:
        return key, False
    return f"{new_name}|{season}", True


def patch_keyed_asset(rel, section, split_map, fix_map):
    """Remap 'Name|season' keys inside obj[section] (or obj itself if None)."""
    path = A(rel)
    obj = json.load(open(path, encoding="utf-8"))
    target = obj if section is None else obj[section]
    new_target = {}
    n_changed = 0
    for key, val in target.items():
        new_key, changed = remap_name_season_key(key, split_map, fix_map)
        assert (
            new_key not in new_target
        ), f"key collision after remap: {new_key} in {rel}"
        new_target[new_key] = val
        n_changed += changed
    if section is None:
        obj = new_target
    else:
        obj[section] = new_target
    if n_changed:
        write_json(path, obj)
    return n_changed


def main():
    reg, split_map, fix_map = load_registry()
    split_names = sorted({p["dataset_name"] for p in reg["persons"]})
    report = {"vectors_rows": 0, "vectors_person_ids": 0, "remapped": {}}

    # ---- 1. vectors.json: person_id + corrected display names ----
    vec = json.load(open(VEC_PATH, encoding="utf-8"))
    players = vec["players"]
    assert len(players) == EXPECTED_ROWS, f"row count {len(players)} != {EXPECTED_ROWS}"
    old_ids = [p["id"] for p in players]
    n_name_fix = 0
    for p in players:
        old_name, season = p["name"], p["season"]
        p["person_id"] = pid_for(old_name, season, split_map, fix_map)
        new_name = disp_for(old_name, season, split_map, fix_map)
        if new_name != old_name:
            n_name_fix += 1
        p["name"] = new_name
    assert [p["id"] for p in players] == old_ids, "row ids changed!"
    assert all(p.get("person_id") for p in players), "missing person_id"
    write_json(VEC_PATH, vec)
    report["vectors_rows"] = len(players)
    report["vectors_person_ids"] = len({p["person_id"] for p in players})
    report["vectors_names_fixed"] = n_name_fix
    print(
        f"vectors.json: {len(players)} rows, "
        f"{report['vectors_person_ids']} person_ids, {n_name_fix} names fixed"
    )

    # ---- 2. "Name|season"-keyed assets ----
    keyed = [
        ("assets/playoffs.json", "splits"),
        ("assets/honors.json", "bySeason"),
        ("assets/next_profile_eval.json", "rows"),
        ("assets/player_meta.json", "roster"),
        ("assets/player_team_season.json", None),
        ("assets/playoff_paths.json", "paths"),
        ("assets/skills_wide.json", "grades"),
    ]
    for rel, section in keyed:
        n = patch_keyed_asset(rel, section, split_map, fix_map)
        report["remapped"][rel] = n
        print(f"{rel}: {n} keys remapped")

    # ---- 3. players_lite.json ----
    pl_path = A("assets", "players_lite.json")
    pl = json.load(open(pl_path, encoding="utf-8"))
    n = 0
    for p in pl["players"]:
        new = disp_for(p["name"], p["season"], split_map, fix_map)
        if new != p["name"]:
            n += 1
        p["name"] = new
    if n:
        write_json(pl_path, pl)
    report["remapped"]["assets/players_lite.json"] = n
    print(f"assets/players_lite.json: {n} names remapped")

    # ---- 4. vectors_search_lite.json + _pos (additive pid) ----
    for rel in (
        "assets/vectors_search_lite.json",
        "assets/vectors_search_lite_pos.json",
    ):
        path = A(rel)
        lite = json.load(open(path, encoding="utf-8"))
        entries = (
            lite["players"] if isinstance(lite, dict) and "players" in lite else lite
        )
        n = 0
        for e in entries:
            old_n = e.get("n", e.get("name"))
            s = e.get("s", e.get("season"))
            if old_n is None or s is None:
                continue
            new_n = disp_for(old_n, s, split_map, fix_map)
            if new_n != old_n:
                n += 1
            key = "n" if "n" in e else "name"
            e[key] = new_n
            e["pid"] = pid_for(old_n, s, split_map, fix_map)
        write_json(path, lite)  # always: pid field is new
        report["remapped"][rel] = n
        print(f"{rel}: {n} names remapped, pid added to {len(entries)} entries")

    # ---- 5. vectors_map_lite.json (name fields, if present) ----
    ml_path = A("assets", "vectors_map_lite.json")
    if os.path.exists(ml_path):
        ml = json.load(open(ml_path, encoding="utf-8"))
        entries = ml["players"] if isinstance(ml, dict) and "players" in ml else ml
        n = sum(
            1
            for e in entries
            if isinstance(e, dict)
            and "n" in e
            and disp_for(e["n"], e.get("s", ""), split_map, fix_map) != e["n"]
        )
        for e in entries:
            if isinstance(e, dict) and "n" in e:
                e["n"] = disp_for(e["n"], e.get("s", ""), split_map, fix_map)
        if n:
            write_json(ml_path, ml)
        print(f"assets/vectors_map_lite.json: {n} names remapped")

    # ---- 6. eratwins.json ----
    er_path = A("assets", "eratwins.json")
    er = json.load(open(er_path, encoding="utf-8"))
    n = 0
    for e in er["players"]:
        for holder, skey in ((e, "season"),):
            new = disp_for(e["name"], e[skey], split_map, fix_map)
            if new != e["name"]:
                n += 1
            e["name"] = new
        tw = e.get("twin") or {}
        if "name" in tw and "season" in tw:
            new = disp_for(tw["name"], tw["season"], split_map, fix_map)
            if new != tw["name"]:
                n += 1
            tw["name"] = new
        for t5 in e.get("top5") or []:
            if "name" in t5 and "season" in t5:
                new = disp_for(t5["name"], t5["season"], split_map, fix_map)
                if new != t5["name"]:
                    n += 1
                t5["name"] = new
    if n:
        write_json(er_path, er)
    report["remapped"]["assets/eratwins.json"] = n
    print(f"assets/eratwins.json: {n} names remapped")

    # ---- 7. current_rosters.json -> active person ----
    cr_path = A("assets", "current_rosters.json")
    cr = json.load(open(cr_path, encoding="utf-8"))
    latest = max(s for _, ss in split_map for s in [ss])  # latest dataset season
    assert latest == "2025-26", f"unexpected latest season {latest}"
    n = 0
    for _abbr, roster in cr["teams"].items():
        for entry in roster:
            old = entry.get("name")
            if old in split_names:
                # active person = owner of the latest dataset season
                pid, new = split_map[(old, latest)]
                if new != old:
                    n += 1
                entry["name"] = new
            elif old in fix_map:
                if fix_map[old] != old:
                    n += 1
                entry["name"] = fix_map[old]
    for entry in cr.get("activePlayers") or []:
        old = entry.get("name")
        if old in split_names:
            _pid, new = split_map[(old, latest)]
            if new != old:
                n += 1
            entry["name"] = new
        elif old in fix_map:
            if fix_map[old] != old:
                n += 1
            entry["name"] = fix_map[old]
    if n:
        write_json(cr_path, cr)
    report["remapped"]["assets/current_rosters.json"] = n
    print(f"assets/current_rosters.json: {n} names remapped")

    # ---- 7b. player_meta.json: roster (done above) + popularity/puzzleWeight/honors ----
    n_pop = n_pw = n_hon = 0
    pop = (
        pm_obj["popularity"]
        if (pm_obj := json.load(open(A("assets/player_meta.json"), encoding="utf-8")))
        else None
    )
    # popularity: pure-name keys -> elder display name for splits (documented
    # assumption: the fame signal belongs to the elder star), fixed name for labels
    for old in list(pop.keys()):
        if old in split_names:
            elder = [p for p in reg["persons"] if p["dataset_name"] == old][0]
            new = elder["display_name"]
        else:
            new = fix_map.get(old, old)
        if new != old:
            pop[new] = pop.pop(old)
            n_pop += 1
    pm_obj["popularity"] = pop
    for sec, counter in (("puzzleWeight", "n_pw"), ("honors", "n_hon")):
        target = pm_obj[sec]
        new_target = {}
        c = 0
        for key, val in target.items():
            new_key, changed = remap_name_season_key(key, split_map, fix_map)
            assert (
                new_key not in new_target
            ), f"collision in player_meta.{sec}: {new_key}"
            new_target[new_key] = val
            c += changed
        pm_obj[sec] = new_target
        if counter == "n_pw":
            n_pw = c
        else:
            n_hon = c
    write_json(A("assets/player_meta.json"), pm_obj)
    # NOTE: player_meta.json was already written by patch_keyed_asset (roster);
    # this rewrite is idempotent.
    print(
        f"assets/player_meta.json: popularity {n_pop}, puzzleWeight {n_pw}, honors {n_hon}"
    )

    # ---- 7c. career_surplus.json ----
    cs_path = A("assets", "career_surplus.json")
    if os.path.exists(cs_path):
        cs = json.load(open(cs_path, encoding="utf-8"))
        n = 0
        for sec in ("buy_low_top", "sell_high_top"):
            for e in cs.get(sec) or []:
                new = disp_for(e["name"], e.get("season", ""), split_map, fix_map)
                if new != e["name"]:
                    n += 1
                e["name"] = new
        if n:
            write_json(cs_path, cs)
        print(f"assets/career_surplus.json: {n} names remapped")

    # ---- 7d. projections.json ----
    pr_path = A("assets", "projections.json")
    if os.path.exists(pr_path):
        pr = json.load(open(pr_path, encoding="utf-8"))
        n = 0
        for e in pr.get("players") or []:
            new = disp_for(e["name"], e.get("fromSeason", ""), split_map, fix_map)
            if new != e["name"]:
                n += 1
            e["name"] = new
        if n:
            write_json(pr_path, pr)
        print(f"assets/projections.json: {n} names remapped")

    # ---- 7e. timesfm_forecasts.json (root + data/) ----
    for rel in ("assets/timesfm_forecasts.json", "assets/data/timesfm_forecasts.json"):
        tf_path = A(rel)
        if not os.path.exists(tf_path):
            continue
        tf = json.load(open(tf_path, encoding="utf-8"))
        n = 0
        merged = []
        for e in tf.get("forecasts") or []:
            old = e["name"]
            new = disp_for(old, e.get("last_season", ""), split_map, fix_map)
            if old in split_names and new != old:
                merged.append(old)
            if new != old:
                n += 1
            e["name"] = new
        if merged:
            tf["_identity_note"] = (
                "2026-10-01 player-identity fix: forecasts for "
                + ", ".join(sorted(set(merged)))
                + " were computed on merged multi-person careers; the label now "
                "reflects the last_season owner. Values predate the identity fix."
            )
        if n or merged:
            write_json(tf_path, tf)
        print(
            f"{rel}: {n} names remapped"
            + (f" ({len(set(merged))} merged-career caveats)" if merged else "")
        )

    # ---- 8. pedigree.json: pure-name keys -> elder person ----
    ped_path = A("assets", "pedigree.json")
    ped = json.load(open(ped_path, encoding="utf-8"))
    players_sec = ped["players"]
    n = 0
    for old in list(players_sec.keys()):
        if old in split_names:
            persons = [p for p in reg["persons"] if p["dataset_name"] == old]
            elder, younger = persons[0], persons[1]
            draft_year = players_sec[old].get("draft_year")
            younger_first = int(min(younger["seasons"])[:4])
            # A draft entry belongs to whoever debuted near the draft year.
            # All 11 verified 2026-10-01: 8 entries are the elder's draft
            # (1986-2000, decades before the younger's debut); 3 are
            # undrafted:true empties (Jaren Jackson/Mike James/Chris Johnson)
            # which describe the elder.
            if draft_year is not None and abs(int(draft_year) - younger_first) <= 2:
                owner = younger
            else:
                owner = elder
            new = owner["display_name"]
            if new != old:
                players_sec[new] = players_sec.pop(old)
                n += 1
        elif old in fix_map and fix_map[old] != old:
            players_sec[fix_map[old]] = players_sec.pop(old)
            n += 1
    if n:
        write_json(ped_path, ped)
    report["remapped"]["assets/pedigree.json"] = n
    print(f"assets/pedigree.json: {n} keys remapped")

    # ---- 9. trajectories.json playerIndex: drop merged split keys ----
    tr_path = A("assets", "trajectories.json")
    tr = json.load(open(tr_path, encoding="utf-8"))
    pi = tr["playerIndex"]
    n_drop, n_rename = 0, 0
    for old in list(pi.keys()):
        if old in split_names:
            del pi[old]  # merged-career class is invalid after the split
            n_drop += 1
        elif old in fix_map and fix_map[old] != old:
            pi[fix_map[old]] = pi.pop(old)
            n_rename += 1
    if n_drop or n_rename:
        write_json(tr_path, tr)
    report["remapped"]["assets/trajectories.json"] = {
        "dropped": n_drop,
        "renamed": n_rename,
    }
    print(f"assets/trajectories.json: {n_drop} merged keys dropped, {n_rename} renamed")

    # ---- 10. pid_ambiguous.json ----
    amb = {}
    for (name, season), (pid, _disp) in sorted(split_map.items()):
        amb.setdefault(norm_name(name), {})[season] = pid
    amb_path = A("assets", "pid_ambiguous.json")
    write_json(amb_path, amb)
    print(f"assets/pid_ambiguous.json: {len(amb)} ambiguous names")

    # ---- 11. discovery sweep: any old name left as a standalone string? ----
    old_names = set(split_names) | set(fix_map.keys())
    prose_allow = {"assets/player-identity.json"}  # registry documents old names
    leftovers = {}
    for rel in CHANGED:
        if rel in prose_allow or not rel.endswith(".json"):
            continue
        raw = open(A(rel), encoding="utf-8").read()
        for old in old_names:
            # '"Old"' with the closing quote immediately after => standalone;
            # '"Old Jr."' does not match this pattern.
            if re.search(r'"' + re.escape(old) + r'"', raw):
                leftovers.setdefault(rel, set()).add(old)
    if leftovers:
        print("LEFTOVER old names (review):")
        for rel, names in sorted(leftovers.items()):
            print(f"  {rel}: {sorted(names)}")
    else:
        print("sweep: no standalone old names remain in changed assets")
    report["leftovers"] = {k: sorted(v) for k, v in leftovers.items()}

    # ---- 11b. discovery sweep over ALL assets: unclassified files with old names?
    unclassified = {}
    for dirpath, _dirs, files in os.walk(A("assets")):
        for fn in files:
            if not fn.endswith(".json"):
                continue
            full = os.path.join(dirpath, fn)
            rel_all = os.path.relpath(full, ROOT)
            if rel_all in CHANGED or rel_all in prose_allow:
                continue
            raw = open(full, encoding="utf-8").read()
            for old in old_names:
                if re.search(r'"' + re.escape(old) + r'"', raw):
                    unclassified.setdefault(rel_all, set()).add(old)
                    break
    if unclassified:
        print("UNCLASSIFIED files still carrying old names:")
        for rel, names in sorted(unclassified.items()):
            print(f"  {rel}: {sorted(names)}")
    report["unclassified"] = {k: sorted(v) for k, v in unclassified.items()}

    # ---- 12. mirror to public/ (Vercel serves public/) ----
    # The registry itself is mirrored too: it documents the fix for the client.
    if "assets/player-identity.json" not in CHANGED:
        CHANGED.append("assets/player-identity.json")
    for rel in CHANGED:
        src, dst = A(rel), A("public", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
    print(f"mirrored {len(CHANGED)} files to public/")

    print("APPLY OK")
    return report


if __name__ == "__main__":
    main()
