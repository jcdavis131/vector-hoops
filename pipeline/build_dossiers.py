#!/usr/bin/env python3
"""Build per-player data dossiers from the embedding model + derived research assets.

Stdlib only. Output: assets/dossiers.json keyed by player slug
(same slug rule as VHDossier.playerSlug in assets/dossier.js).

Inputs:
  assets/vectors.json            12,966 player-seasons, 14-d serving vectors, clusters, labels
  assets/player_team_season.json team per "Name|season"
  assets/eratwins.json           signature-season era twins + top-5
  assets/twin_explainer.json     plain-words shared/differ traits per canonical pair
  assets/player_meta.json        honors per "Name|season" (asg, allNbaTeam, finalsMvp)

Each dossier is a career aggregate: style fingerprint (minutes-weighted 14-d),
archetype path, era twins, career movement (first->last season, plain words),
5 nearest player-seasons ("the neighborhood"), honors, and a map-position read.
No synthetic data: players missing from inputs get empty sections, never invented ones.

Compact schema (indices point into _meta.traits / _meta.clusters):
  {n:name, sp:[first,last], ns:n_seasons, pos:[], tm:[teams],
   an:archetype_now_idx, ap:[archetype path idx],
   fp:[14 floats 1dp], fh:[top3 trait idx], fl:[bottom3 trait idx],
   ss:signature season, mu:[trait idx up], md:[trait idx down],
   tw:{s:season, t:{n,s,sim}, t5:[{n,s,sim}], why:{sh:[sentences], d:label, th:bool}}|null,
   nb:[{n,s,sim} x5], hn:{asg,nba,fmvp}|null, mr:[3 map-read strings]}
"""

import json
import math
import os
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(REPO, "assets")

BUDGET_BYTES = 2_500_000


def load(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return json.load(f)


def slug(name):
    s = unicodedata.normalize("NFD", name)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.lower()
    out = []
    for ch in s:
        out.append(ch if ch.isalnum() else "-")
    s = "".join(out)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


def normkey(name):
    # join key for assets that spell names differently ("A.C. Green" vs "AC Green")
    return "".join(ch for ch in name.lower() if ch.isalnum())


# Display-name corrections: upstream vectors.json drops the space/hyphen in a few
# hyphenated surnames ("Shai GilgeousAlexander"). Keys/slugs stay on the raw names
# so lookups keep working; only human-visible "n" fields are prettified.
NAME_FIXES = {
    "AlFarouq Aminu": "Al-Farouq Aminu",
    "Bryce DejeanJones": "Bryce Dejean-Jones",
    "Chris DouglasRoberts": "Chris Douglas-Roberts",
    "Collin MurrayBoyles": "Collin Murray-Boyles",
    "Dorian FinneySmith": "Dorian Finney-Smith",
    "Jalen HoodSchifino": "Jalen Hood-Schifino",
    "Javon FreemanLiberty": "Javon Freeman-Liberty",
    "Jeremiah RobinsonEarl": "Jeremiah Robinson-Earl",
    "Juan ToscanoAnderson": "Juan Toscano-Anderson",
    "KarlAnthony Towns": "Karl-Anthony Towns",
    "Keita BatesDiop": "Keita Bates-Diop",
    "Kentavious CaldwellPope": "Kentavious Caldwell-Pope",
    "Khalid ElAmin": "Khalid El-Amin",
    "Mahmoud AbdulRauf": "Mahmoud Abdul-Rauf",
    "Marcus GeorgesHunt": "Marcus Georges-Hunt",
    "Michael CarterWilliams": "Michael Carter-Williams",
    "Michael KiddGilchrist": "Michael Kidd-Gilchrist",
    "Naz MitrouLong": "Naz Mitrou-Long",
    "Nickeil AlexanderWalker": "Nickeil Alexander-Walker",
    "Nigel HayesDavis": "Nigel Hayes-Davis",
    "OlivierMaxence Prosper": "Olivier-Maxence Prosper",
    "Pops MensahBonsu": "Pops Mensah-Bonsu",
    "Rondae HollisJefferson": "Rondae Hollis-Jefferson",
    "Ruben BoumtjeBoumtje": "Ruben Boumtje-Boumtje",
    "Shai GilgeousAlexander": "Shai Gilgeous-Alexander",
    "Shareef AbdurRahim": "Shareef Abdur-Rahim",
    "Talen HortonTucker": "Talen Horton-Tucker",
    "Tariq AbdulWahad": "Tariq Abdul-Wahad",
    "Timothe LuwawuCabarrot": "Timothe Luwawu-Cabarrot",
    "Trayce JacksonDavis": "Trayce Jackson-Davis",
    "Willie CauleyStein": "Willie Cauley-Stein",
}


def pretty(name):
    return NAME_FIXES.get(name, name)


def main():
    vec = load("vectors.json")
    players = vec["players"]
    labels = vec["featureLabels"]
    features = vec["features"]
    clusters = vec["clusters"]
    positions = vec["positions"]

    team_of = load("player_team_season.json")
    team_map = {}
    for k, v in team_of.items():
        if "|" in k:
            nm, season = k.rsplit("|", 1)
            team_map[(normkey(nm), season)] = v

    eratwins = load("eratwins.json")
    twin_by_name = {}
    for p in eratwins["players"]:
        twin_by_name.setdefault(p["name"], p)

    te = load("twin_explainer.json")
    expl_by_ns = {}
    for key, entry in te.items():
        for side in ("a", "b"):
            ns = entry.get(side)
            if ns and "|" in ns:
                nm, season = ns.rsplit("|", 1)
                expl_by_ns.setdefault((normkey(nm), season), entry)

    meta = load("player_meta.json")
    honors_map = meta.get("honors", {})
    honors_by_player = {}
    for k, h in honors_map.items():
        if "|" not in k:
            continue
        nm, season = k.rsplit("|", 1)
        nk = normkey(nm)
        agg = honors_by_player.setdefault(
            nk, {"asg": 0, "allNba": 0, "finalsMvp": 0, "seasons": set()}
        )
        agg["asg"] += int(h.get("asg") or 0)
        agg["allNba"] += int(h.get("allNbaTeam") or 0)
        agg["finalsMvp"] += int(h.get("finalsMvp") or 0)
        if h.get("asg") or h.get("allNbaTeam") or h.get("finalsMvp"):
            agg["seasons"].add(season)

    # group seasons per player
    by_name = {}
    for p in players:
        by_name.setdefault(p["name"], []).append(p)

    # precompute norms + normalized vectors for neighbor search
    norms = {}
    by_id = {}
    nv = []  # (id, normed 14-d list); parallel to players order
    for p in players:
        v = p["v"]
        n = math.sqrt(sum(x * x for x in v))
        norms[p["id"]] = n
        by_id[p["id"]] = p
        nv.append((p["id"], [x / n for x in v] if n else [0.0] * 14))

    dossiers = {}
    for name, seasons in by_name.items():
        seasons = sorted(seasons, key=lambda p: p["season"])
        first, last = seasons[0], seasons[-1]
        nk = normkey(name)

        # minutes-weighted career fingerprint
        wsum = [0.0] * 14
        wtot = 0.0
        for p in seasons:
            w = p.get("total_min") or 0
            wtot += w
            for i, x in enumerate(p["v"]):
                wsum[i] += x * w
        fp = [round(x / wtot, 1) if wtot else 0.0 for x in wsum]
        order = sorted(range(14), key=lambda i: fp[i])
        hi = order[-3:][::-1]
        lo = order[:3]

        # signature season = most minutes
        sig = max(seasons, key=lambda p: p.get("total_min") or 0)

        # positions / teams
        pos = sorted(
            set(positions[p["p"]] for p in seasons if 0 <= p["p"] < len(positions))
        )
        teams = []
        for p in seasons:
            t = team_map.get((nk, p["season"]))
            if t and (not teams or teams[-1] != t):
                teams.append(t)

        # archetype path (ordered unique cluster indices)
        apath = []
        for p in seasons:
            ci = p["c"]
            if not apath or apath[-1] != ci:
                apath.append(ci)

        # career movement: last vs first season -> trait indices
        deltas = []
        for i in range(14):
            d = last["v"][i] - first["v"][i]
            if abs(d) >= 0.5:
                deltas.append((d, i))
        deltas.sort(key=lambda t: -abs(t[0]))
        up = [i for d, i in deltas if d > 0][:2]
        down = [i for d, i in deltas if d < 0][:2]

        # era twins
        tw = twin_by_name.get(name)
        twins = None
        if tw:
            twins = {
                "s": tw["season"],
                "t": {
                    "n": pretty(tw["twin"]["name"]),
                    "s": tw["twin"]["season"],
                    "sim": round(tw["twin"]["similarity"], 3),
                },
                "t5": [
                    {
                        "n": pretty(c["name"]),
                        "s": c["season"],
                        "sim": round(c["sim"], 3),
                    }
                    for c in tw.get("top5", [])
                ],
            }
            ex = expl_by_ns.get((nk, tw["season"]))
            if ex:
                twins["why"] = {
                    "sh": ex.get("shared", []),
                    "d": ex.get("differ"),
                    "th": bool(ex.get("thin")),
                }

        # the neighborhood: 5 nearest other-player seasons to the signature season
        # (exact 14-d cosine; unrolled dot + manual top-5 for speed)
        sig_nv = None
        for pid, q in nv:
            if pid == sig["id"]:
                sig_nv = q
                break
        own_ids = set(p["id"] for p in seasons)
        a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13 = sig_nv
        t5 = [(-2.0, -1), (-2.0, -1), (-2.0, -1), (-2.0, -1), (-2.0, -1)]
        tmin = -2.0
        for pid, qv in nv:
            if pid in own_ids:
                continue
            s = (
                a0 * qv[0]
                + a1 * qv[1]
                + a2 * qv[2]
                + a3 * qv[3]
                + a4 * qv[4]
                + a5 * qv[5]
                + a6 * qv[6]
                + a7 * qv[7]
                + a8 * qv[8]
                + a9 * qv[9]
                + a10 * qv[10]
                + a11 * qv[11]
                + a12 * qv[12]
                + a13 * qv[13]
            )
            if s > tmin:
                mi = 0
                for k in range(1, 5):
                    if t5[k][0] < t5[mi][0]:
                        mi = k
                t5[mi] = (s, pid)
                tmin = t5[0][0]
                for k in range(1, 5):
                    if t5[k][0] < tmin:
                        tmin = t5[k][0]
        neighbors = [
            {"n": pretty(by_id[i]["name"]), "s": by_id[i]["season"], "sim": round(s, 3)}
            for s, i in sorted(t5, reverse=True)
        ]

        # map-position read from the signature season xyz + axes
        x, y, z = sig["x"], sig["y"], sig["z"]
        reads = []
        reads.append(
            "perimeter side (shooters)"
            if x >= 0.6
            else "paint side (bigs)"
            if x <= 0.4
            else "between paint and perimeter"
        )
        reads.append(
            "high-usage engine"
            if y <= 0.4
            else "low-usage role player"
            if y >= 0.6
            else "medium usage"
        )
        reads.append(
            "ball in his hands"
            if z >= 0.6
            else "off-ball"
            if z <= 0.4
            else "mixed on/off ball"
        )

        honors = honors_by_player.get(nk)
        honors_out = None
        if honors and (honors["asg"] or honors["allNba"] or honors["finalsMvp"]):
            honors_out = {
                "asg": honors["asg"],
                "nba": honors["allNba"],
                "fmvp": honors["finalsMvp"],
            }

        dossiers[slug(name)] = {
            "n": pretty(name),
            "sp": [first["season"], last["season"]],
            "ns": len(seasons),
            "pos": pos,
            "tm": teams,
            "an": last["c"],
            "ap": apath,
            "fp": fp,
            "fh": hi,
            "fl": lo,
            "ss": sig["season"],
            "mu": up,
            "md": down,
            "tw": twins,
            "nb": neighbors,
            "hn": honors_out,
            "mr": reads,
        }

    out = {
        "_meta": {
            "built": "build_dossiers.py",
            "n": len(dossiers),
            "clusters": clusters,
            "traits": [labels[f] for f in features],
            "method": (
                "career aggregates from the house embedding model (MTNN v5, 14-d "
                "serving vectors) + derived research assets (era twins, trails, "
                "archetypes, honors)"
            ),
        },
        "dossiers": dossiers,
    }
    path = os.path.join(ASSETS, "dossiers.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    size = os.path.getsize(path)
    print("wrote %s (%d players, %.2f MB)" % (path, len(dossiers), size / 1e6))

    # ---- QA (hard-block) ----
    errs = []
    if size > BUDGET_BYTES:
        errs.append("over size budget: %d > %d" % (size, BUDGET_BYTES))
    if len(out["_meta"]["clusters"]) != 8 or len(out["_meta"]["traits"]) != 14:
        errs.append("bad _meta lookup tables")
    seen_slugs = set()
    for s, d in dossiers.items():
        if s in seen_slugs:
            errs.append("dup slug " + s)
        seen_slugs.add(s)
        if len(d["fp"]) != 14:
            errs.append("bad fp " + s)
        if len(d["nb"]) != 5 or any(n["n"] == d["n"] for n in d["nb"]):
            errs.append("bad nb " + s)
        for n in d["nb"]:
            if not (-1.0 <= n["sim"] <= 1.0):
                errs.append("bad sim " + s)
        if not (0 <= d["an"] < 8) or any(not (0 <= c < 8) for c in d["ap"]):
            errs.append("bad archetype idx " + s)
    ag = dossiers.get("aaron-gordon")
    if (
        not ag
        or ag["ns"] != 12
        or not (ag["tw"] and ag["tw"]["t"]["n"] == "Blake Griffin")
    ):
        errs.append("aaron-gordon spot check failed")
    mj = dossiers.get("michael-jordan")
    if not mj or mj["ns"] != 4 or mj["sp"] != ["1996-97", "2002-03"]:
        errs.append("michael-jordan spot check failed")
    lj = dossiers.get("lebron-james")
    if not lj or lj["ns"] != 23 or lj["tm"][:4] != ["CLE", "MIA", "CLE", "LAL"]:
        errs.append("lebron-james spot check failed")
    if errs:
        print("QA FAILED:")
        for e in errs[:10]:
            print(" -", e)
        raise SystemExit(1)
    print("QA passed: %d dossiers, spot checks ok" % len(dossiers))


if __name__ == "__main__":
    main()
