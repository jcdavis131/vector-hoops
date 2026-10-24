"""Build the Twenty Questions game data from shipped repo assets.

Reads only committed files (no network, no models, no pipeline cache):
  assets/vectors.json                12,966 player-seasons (x/y/z, p=position,
                                     c=cluster, person_id, name, season)
  assets/archetype_assignments.json  Skills Lens eraTags per season
  assets/honors.json                 All-Star / All-NBA by season

Writes:
  assets/twenty-questions-tree.json  decision tree + compact player table
  assets/twenty-questions-map.json   career index per player-season, in
                                     vectors.json row order (12,966 ints): row i
                                     is Embed3D point i, so the page dims the
                                     shared 3D map with setDim()

Method: players are grouped by person_id (2,426 careers). Each career gets
human-answerable boolean attributes (position, era span, style cluster,
Skills Lens tags, honors, name letters). A greedy maximum-information-gain
tree is built over 25 candidate questions; leaves with <=5 players resolve
by direct "Is your player X?" name questions. The build ASSERTS every
player resolves within 20 questions and prints a depth histogram.

    python scripts/build_twenty_questions.py
    python scripts/build_twenty_questions.py --check   # verify shipped files
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VECTORS = ROOT / "assets" / "vectors.json"
ARCHETYPES = ROOT / "assets" / "archetype_assignments.json"
HONORS = ROOT / "assets" / "honors.json"
TREE_OUT = ROOT / "assets" / "twenty-questions-tree.json"
MAP_OUT = ROOT / "assets" / "twenty-questions-map.json"

POSITIONS = ["PG", "SG", "SF", "PF", "C"]  # vectors.json "positions"
GUARD = {0, 1}
BIG = {3, 4}

# Cluster names as the site's own map uses them (assets/atlas-map.js).
CLUSTERS = [
    "Offensive glass + rim protection",
    "Offensive glass, low shot volume",
    "Three-point volume, quiet elsewhere",
    "Defensive glass + rim pressure",
    "Shot volume + three-point volume",
    "Three-point accuracy + volume",
    "Playmaking + steals",
    "Scoring volume + shot volume",
]

TAG_KEYS = [
    "three_and_d",
    "stretch_big",
    "traditional_big",
    "spacing_role",
    "two_way_perimeter",
    "primary_creator",
    "volume_scorer",
]
TAG_LABELS = {
    "three_and_d": "3-and-D wing",
    "stretch_big": "Stretch big",
    "traditional_big": "Traditional big",
    "spacing_role": "Spacing role",
    "two_way_perimeter": "Two-way perimeter",
    "primary_creator": "Primary creator",
    "volume_scorer": "Volume scorer",
}

MAX_QUESTIONS = 20
TIE_LEAF_SIZE = 5  # <=5 players left: ask "Is your player X?" directly


def season_year(season: str) -> int:
    return int(season.split("-")[0])


def short_year(y: int) -> str:
    return f"'{y % 100:02d}"


class Player:
    __slots__ = (
        "allnba",
        "allstar",
        "cluster",
        "first",
        "idx",
        "last",
        "name",
        "person_id",
        "pos",
        "tags",
    )

    def __init__(self, idx: int, name: str, person_id: str) -> None:
        self.idx = idx
        self.name = name
        self.person_id = person_id
        self.first = 9999
        self.last = 0
        self.pos = -1  # modal position index, -1 = unknown
        self.cluster = -1  # modal cluster
        self.tags = 0  # bitmask over TAG_KEYS (union of seasons)
        self.allstar = False
        self.allnba = False

    def display(self) -> str:
        return f"{self.name} ({short_year(self.first)}-{short_year(self.last)})"


def load_players() -> tuple[list[Player], list[int]]:
    """Aggregate the 12,966 seasons into careers.

    Returns (players, career_of_row): career_of_row[i] is the career index of
    vectors.json row i, which is also point i of assets/projections/embed3d.json.
    """
    v = json.loads(VECTORS.read_text())
    rows = v["players"]
    aa = json.loads(ARCHETYPES.read_text())
    tag_by_id = {a["id"]: a.get("eraTags", []) for a in aa["assignments"]}
    honors = json.loads(HONORS.read_text())["bySeason"]

    by_person: dict[str, list[dict]] = defaultdict(list)
    row_of: dict[int, int] = {}
    for i, r in enumerate(rows):
        by_person[r["person_id"]].append(r)
        row_of[id(r)] = i

    players: list[Player] = []
    career_of_row: list[int] = [-1] * len(rows)
    for person_id in sorted(by_person):
        rs = by_person[person_id]
        pl = Player(len(players), rs[0]["name"], person_id)
        pos_votes: dict[int, float] = defaultdict(float)
        clu_votes: dict[int, float] = defaultdict(float)
        for r in rs:
            y = season_year(r["season"])
            pl.first = min(pl.first, y)
            pl.last = max(pl.last, y)
            mins = r.get("total_min") or 0
            if r.get("p") not in (None, -1):
                pos_votes[r["p"]] += mins or 1.0
            if r.get("c") is not None:
                clu_votes[r["c"]] += mins or 1.0
            for t in tag_by_id.get(r["id"], []):
                if t in TAG_KEYS:
                    pl.tags |= 1 << TAG_KEYS.index(t)
            key = f"{r['name']}|{r['season']}"
            hz = honors.get(key)
            if hz:
                if hz.get("asg", 0) >= 1:
                    pl.allstar = True
                if hz.get("allNbaTeam", 0) >= 1:
                    pl.allnba = True
            career_of_row[row_of[id(r)]] = pl.idx
        if pos_votes:
            pl.pos = max(pos_votes, key=lambda k: pos_votes[k])
        if clu_votes:
            pl.cluster = max(clu_votes, key=lambda k: clu_votes[k])
        players.append(pl)
    assert min(career_of_row) >= 0, "every row belongs to a career"
    return players, career_of_row


def last_name(p: Player) -> str:
    return p.name.strip().split()[-1].lower()


def first_name(p: Player) -> str:
    return p.name.strip().split()[0].lower()


def played_in(p: Player, lo: int, hi: int) -> bool:
    return p.first <= hi and p.last >= lo


# (question_id, question_text, answer_fn or None-if-dynamic)
def question_pool() -> list[tuple[str, str, object]]:
    def tag_fn(i: int):
        return lambda p: bool(p.tags & (1 << i))

    qs: list[tuple[str, str, object]] = [
        (
            "q_pos_guard",
            "Is your player a guard (point guard or shooting guard)?",
            lambda p: p.pos in GUARD if p.pos != -1 else None,
        ),
        (
            "q_pos_big",
            "Is your player a big (power forward or center)?",
            lambda p: p.pos in BIG if p.pos != -1 else None,
        ),
        ("q_pos_center", "Is your player a center?", lambda p: p.pos == 4 if p.pos != -1 else None),
        ("q_pos_pg", "Is your player a point guard?", lambda p: p.pos == 0 if p.pos != -1 else None),
        ("q_debut_pre90", "Did your player's NBA career start before 1990?", lambda p: p.first < 1990),
        ("q_played_90s", "Did your player play in the 1990s?", lambda p: played_in(p, 1990, 1999)),
        ("q_played_00s", "Did your player play in the 2000s?", lambda p: played_in(p, 2000, 2009)),
        ("q_played_10s", "Did your player play in the 2010s?", lambda p: played_in(p, 2010, 2019)),
        ("q_active_20s", "Has your player played in the 2020s?", lambda p: p.last >= 2020),
        (
            "q_rim",
            "Is rim protection / shot-blocking part of your player's game?",
            lambda p: p.cluster in (0, 3) if p.cluster != -1 else None,
        ),
        (
            "q_glass",
            "Is rebounding a signature part of your player's game?",
            lambda p: p.cluster in (0, 1, 3) if p.cluster != -1 else None,
        ),
        (
            "q_three",
            "Is your player a three-point shooter?",
            lambda p: p.cluster in (2, 4, 5) if p.cluster != -1 else None,
        ),
        ("q_volume", "Is your player a high-volume scorer?", lambda p: p.cluster == 7 if p.cluster != -1 else None),
        ("q_playmake", "Is your player a playmaker?", lambda p: p.cluster == 6 if p.cluster != -1 else None),
        ("q_last_a_m", "Does your player's LAST name start with A through M?", lambda p: last_name(p)[:1] <= "m"),
        ("q_first_a_m", "Does your player's FIRST name start with A through M?", lambda p: first_name(p)[:1] <= "m"),
        ("q_allstar", "Was your player ever an NBA All-Star?", lambda p: p.allstar),
        ("q_allnba", "Was your player ever All-NBA?", lambda p: p.allnba),
    ]
    for i, key in enumerate(TAG_KEYS):
        qs.append(
            (
                f"q_tag_{key}",
                f"Would you call your player a {TAG_LABELS[key].lower()}?",
                tag_fn(i),
            )
        )
    return qs


def entropy(n: int) -> float:
    return math.log2(n) if n > 0 else 0.0


def build_tree(players: list[Player]) -> tuple[list[dict], list[dict]]:
    qs = question_pool()
    qids = [q[0] for q in qs]
    qtext = {q[0]: q[1] for q in qs}
    qfn = {q[0]: q[2] for q in qs}

    # Precompute answers: qid -> {player_idx: True/False/None}
    ans: dict[str, dict[int, bool | None]] = {}
    for qid in qids:
        fn = qfn[qid]
        ans[qid] = {p.idx: fn(p) for p in players}

    nodes: list[dict] = []
    depths: list[int] = []
    paths: list[str] = [""] * len(players)

    def pivot_question(idxs: list[int]) -> tuple[str, str, dict[int, bool]]:
        """Dynamic alphabetical split — always divides while names differ."""
        ordered = sorted(idxs, key=lambda i: (players[i].name.lower(), i))
        mid = ordered[len(ordered) // 2]
        pivot_name = players[mid].name
        key = (players[mid].name.lower(), mid)
        mapping = {i: (players[i].name.lower(), i) < key for i in idxs}
        return (
            f"q_dyn_lt_{mid}",
            f"Does your player's name come before \u201c{pivot_name}\u201d alphabetically?",
            mapping,
        )

    def rec(idxs: list[int], depth: int, used: frozenset[str], path: str) -> int:
        if len(idxs) == 1:
            nodes.append({"p": idxs[0]})
            depths.append(depth)
            paths[idxs[0]] = path
            return len(nodes) - 1
        if len(idxs) <= TIE_LEAF_SIZE and depth + len(idxs) - 1 <= MAX_QUESTIONS:
            nodes.append({"tie": sorted(idxs, key=lambda i: players[i].name.lower())})
            depths.append(depth + len(idxs) - 1)  # worst case: all but last say no
            for i in idxs:
                paths[i] = path
            return len(nodes) - 1

        best_qid: str | None = None
        best_text = ""
        best_map: dict[int, bool] | None = None
        best_gain = -1.0
        base = entropy(len(idxs))
        for qid in qids:
            if qid in used:
                continue
            a = ans[qid]
            yes = [i for i in idxs if a[i] is True]
            no = [i for i in idxs if a[i] is False]
            if any(a[i] is None for i in idxs):
                continue  # question must be answerable for everyone here
            if not yes or not no:
                continue
            gain = base - (len(yes) / len(idxs)) * entropy(len(yes)) - (len(no) / len(idxs)) * entropy(len(no))
            if gain > best_gain:
                best_gain = gain
                best_qid = qid
                best_text = qtext[qid]
                best_map = {i: (i in set(yes)) for i in idxs}

        if best_qid is None:
            # No static question splits: fall back to a dynamic name pivot,
            # which always divides while names differ.
            dqid, dtext, dmap = pivot_question(idxs)
            yes = [i for i in idxs if dmap[i]]
            no = [i for i in idxs if not dmap[i]]
            if not yes or not no:
                # Identical names (distinct persons, same spelling): tie leaf.
                nodes.append({"tie": sorted(idxs, key=lambda i: i)})
                depths.append(depth + len(idxs) - 1)
                for i in idxs:
                    paths[i] = path
                return len(nodes) - 1
            node_idx = len(nodes)
            nodes.append({"q": dqid, "t": dtext, "y": -1, "n": -1})
            nodes[node_idx]["y"] = rec(yes, depth + 1, used, path + "y")
            nodes[node_idx]["n"] = rec(no, depth + 1, used, path + "n")
            return node_idx

        assert best_map is not None
        yes = [i for i in idxs if best_map[i]]
        no = [i for i in idxs if not best_map[i]]
        node_idx = len(nodes)
        nodes.append({"q": best_qid, "t": best_text, "y": -1, "n": -1})
        new_used = used | {best_qid}
        nodes[node_idx]["y"] = rec(yes, depth + 1, new_used, path + "y")
        nodes[node_idx]["n"] = rec(no, depth + 1, new_used, path + "n")
        return node_idx

    rec([p.idx for p in players], 0, frozenset(), "")
    questions = [{"id": q[0], "text": q[1]} for q in qs]
    return nodes, questions, depths, paths


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify shipped files match a fresh build")
    args = ap.parse_args()

    players, career_of_row = load_players()
    dupes = defaultdict(list)
    for p in players:
        dupes[p.name].append(p.idx)
    dup_names = {k: v for k, v in dupes.items() if len(v) > 1}
    print(f"players: {len(players)}  map rows: {len(career_of_row)}")
    print(f"duplicate display names: {len(dup_names)}" + (f" e.g. {list(dup_names)[:3]}" if dup_names else ""))

    nodes, questions, depths, paths = build_tree(players)
    worst = max(depths)
    print(f"tree nodes: {len(nodes)}  worst-case questions: {worst}")
    hist = defaultdict(int)
    for d in depths:
        hist[d] += 1
    print("depth histogram (questions -> players resolved):")
    for d in sorted(hist):
        print(f"  {d:2d}: {hist[d]}")
    assert worst <= MAX_QUESTIONS, f"FAIL: worst case {worst} > {MAX_QUESTIONS}"

    # Compact player table: [name, first, last, pos, cluster, tagMask,
    #                        allstar, allnba, display]
    # pos/cluster "unknown" (-1) ships as null — never invented.
    ptab = [
        [
            p.name,
            p.first,
            p.last,
            p.pos if p.pos != -1 else None,
            p.cluster if p.cluster != -1 else None,
            p.tags,
            p.allstar,
            p.allnba,
            p.display(),
        ]
        for p in players
    ]
    tree_doc = {
        "built": "2026-10-20",
        "lineage": {
            "sources": ["assets/vectors.json", "assets/archetype_assignments.json", "assets/honors.json"],
            "method": "greedy max-information-gain over 25 human-answerable "
            "booleans (position/era/style/Skills-Lens-tags/honors/"
            "name-letters); <=5-player leaves resolve by direct "
            "name questions; dynamic alphabetical pivots guarantee "
            "progress",
            "n_players": len(players),
            "max_questions": MAX_QUESTIONS,
            "worst_case": worst,
            "note": "The page dims the shared 3D map (assets/projections/"
            "embed3d.json, the 64-d embedding's projection) by eliminated "
            "careers, joined through twenty-questions-map.json.",
        },
        "questions": questions,
        "players": ptab,
        "paths": paths,
        "tree": nodes,
    }
    map_doc = {
        "built": "2026-10-24",
        "lineage": {
            "source": "assets/vectors.json",
            "fields": ["career"],
            "note": "career[i] = index into twenty-questions-tree.json players for "
            "vectors.json row i (== Embed3D point i); careers are person_id groups "
            "in sorted person_id order",
        },
        "career": career_of_row,
    }

    def dump(doc: object) -> str:
        return json.dumps(doc, separators=(",", ":"), ensure_ascii=False)

    if args.check:
        ok = True
        for path, doc in ((TREE_OUT, tree_doc), (MAP_OUT, map_doc)):
            want = dump(doc).encode()
            if not path.exists():
                print(f"FAIL: {path.name} missing")
                ok = False
                continue
            have = path.read_bytes()
            if hashlib.sha256(have).digest() != hashlib.sha256(want).digest():
                print(f"FAIL: {path.name} differs from fresh build")
                ok = False
            else:
                print(f"OK: {path.name}")
        return 0 if ok else 1

    TREE_OUT.write_text(dump(tree_doc))
    MAP_OUT.write_text(dump(map_doc))
    print(f"wrote {TREE_OUT.name} ({TREE_OUT.stat().st_size} bytes)")
    print(f"wrote {MAP_OUT.name} ({MAP_OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
