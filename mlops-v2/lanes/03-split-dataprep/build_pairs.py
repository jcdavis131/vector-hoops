#!/usr/bin/env python3
"""Lane 3 (draft) — expanding-window fold manifests + pair lists.

Reads a vectors-style metadata file (players list with id / person_id /
season / name) and a v5 twin file (anchor row id -> [twin row ids]) and
writes, per fold, a manifest entry plus adjacent pairs, twin pairs, and
the per-anchor positives map used by SupCon training.

DRAFT ONLY. Train gate is CLOSED. This script builds data-prep artefacts;
it does not train, does not touch a GPU, and needs no packages beyond
the standard library.

Fail-loud guarantees (non-zero exit with an explicit message):
  * total row count or recent-season counts mismatch the verified table
    (unless --no-count-check);
  * any row missing person_id, or any duplicate person-season row;
  * any emitted pair with an endpoint outside the fold's train set;
  * any emitted pair crossing a fold boundary;
  * any training pair touching a frozen-test row;
  * any fold partition (train + embargo + val + test + unused) not
    summing to the file total;
  * any era-stratified batch missing an era.

Twin-file rule: a twin pair is emitted ONLY if anchor AND target are
both in the fold's train set, the target is a different person, and the
pair is not already an adjacent pair. The shipped
champion_twins_test.json contains ONLY test anchors (991 anchors, all
2024-25/2025-26), so it correctly yields ZERO training twin pairs; the
drop ledger is printed and recorded, not hidden. There is deliberately
NO flag that permits training on test twins. Use --fail-on-zero-twins
to turn a zero-twin result into a hard failure.

Usage:
  python3 build_pairs.py --features vectors.json --twins champion_twins_test.json --out DIR
      [--no-embargo] [--fail-on-zero-twins] [--emit-batches] [--no-count-check]
"""

import argparse
import json
import random
import sys
from collections import Counter, defaultdict

# ---------------------------------------------------------------- constants

# Verified against ~/workspace/vector-hoops-mlops-v2/assets/vectors.json.
EXPECTED_TOTAL_ROWS = 12966
EXPECTED_SEASON_COUNTS = {
    "2022-23": 464,
    "2023-24": 484,
    "2024-25": 500,
    "2025-26": 491,
}

TEST_SEASON = "2025-26"
MAX_POSITIVES_PER_ANCHOR = 12  # 2 adjacent + 10 twins, adjacent first.
BATCH_ANCHORS = 1024
MIN_PER_ERA_PER_BATCH = 64
SEED = 7

# Era bins by season-start-year. No bin straddles the 2012/2013
# tracking-mask boundary. The 2013-2019 bin straddles the 2015 form-mask
# boundary; accepted (see FOLDS.md section 5d).
ERA_BINS = [
    ("1996-2004", 1996, 2004),
    ("2005-2012", 2005, 2012),
    ("2013-2019", 2013, 2019),
    ("2020+", 2020, 9999),
]


def fail(msg):
    print("build_pairs.py: ERROR: %s" % msg, file=sys.stderr)
    raise SystemExit(2)


def season_start_year(season):
    try:
        return int(season[:4])
    except (TypeError, ValueError):
        fail("unparseable season key %r (expected YYYY-YY)" % (season,))


def era_of(season):
    y = season_start_year(season)
    for label, lo, hi in ERA_BINS:
        if lo <= y <= hi:
            return label
    fail("season %r falls outside every era bin" % (season,))


# ---------------------------------------------------------------- loading


def load_rows(features_path):
    """Return the list of row dicts from a vectors.json-style file.

    Accepts either {"players": [...]} or a flat JSON list of rows.
    Only id / person_id / season / name are used; feature values are
    never read, so this works before Lane 1 resolves the 120-feature
    matrix question. Lane 4 joins pairs to the feature matrix by id.
    """
    try:
        with open(features_path) as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        fail("cannot read features file %r: %s" % (features_path, exc))
    if isinstance(data, dict):
        rows = data.get("players")
        if rows is None:
            fail("features file %r is a dict without a 'players' list"
                 % features_path)
    elif isinstance(data, list):
        rows = data
    else:
        fail("features file %r: unexpected top-level type %s"
             % (features_path, type(data).__name__))
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            fail("row %d is not an object" % i)
        if "person_id" not in row or row["person_id"] is None:
            fail("row %d (id=%r) is missing person_id" % (i, row.get("id")))
        if "season" not in row:
            fail("row %d (id=%r) is missing season" % (i, row.get("id")))
        if "id" not in row:
            # Fall back to list position; the shipped file uses id == index.
            row["id"] = i
    return rows


def load_twins(twins_path):
    """Return the anchor-id -> [twin-id] map, or {} if no file given."""
    if twins_path is None:
        return {}, None
    try:
        with open(twins_path) as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        fail("cannot read twin file %r: %s" % (twins_path, exc))
    twins = data.get("twins") if isinstance(data, dict) else None
    if twins is None:
        fail("twin file %r: expected a dict with a 'twins' map"
             % twins_path)
    out = {}
    for anchor, targets in twins.items():
        try:
            a = int(anchor)
        except ValueError:
            fail("twin file anchor key %r is not a row id" % (anchor,))
        if not isinstance(targets, list):
            fail("twin file anchor %r: targets are not a list" % (anchor,))
        out[a] = [int(t) for t in targets]
    meta = data.get("meta") if isinstance(data, dict) else None
    return out, meta


def validate_counts(rows, check=True):
    if not check:
        return
    if len(rows) != EXPECTED_TOTAL_ROWS:
        fail("total row count %d != verified %d"
             % (len(rows), EXPECTED_TOTAL_ROWS))
    counts = Counter(r["season"] for r in rows)
    for season, expected in EXPECTED_SEASON_COUNTS.items():
        if counts.get(season, 0) != expected:
            fail("season %s has %d rows, verified count is %d"
                 % (season, counts.get(season, 0), expected))
    seen = set()
    for row in rows:
        key = (row["person_id"], row["season"])
        if key in seen:
            fail("duplicate person-season row: %r" % (key,))
        seen.add(key)


# ---------------------------------------------------------------- folds

# Each fold is defined by its pre-embargo train cutoff (season-start-year),
# its val seasons, and (for the final protocol) an empty val list. The
# embargo season is the last season of the pre-embargo train window.
# Fold 1 val is two seasons (2022-23 + 2023-24 = 948, the contract's
# Fold 1 count); Fold 2 val is one season because the next season is
# the frozen test. See FOLDS.md section 0 for the contract conflict
# (Fold 2 val is 500, NOT the contract's unreconcilable 984).
FOLD_DEFS = [
    {
        "fold": "fold1",
        "train_cutoff": 2021,
        "val_seasons": ["2022-23", "2023-24"],
    },
    {
        "fold": "fold2",
        "train_cutoff": 2023,
        "val_seasons": ["2024-25"],
    },
    {
        "fold": "final",
        "train_cutoff": 2023,
        "val_seasons": [],
    },
]
# NOTE: fold2 and final share the pre-embargo train window (through
# 2023-24) but differ in purpose: fold2 tunes on val 2024-25, while
# final treats 2024-25 as the embargo season before the frozen test.
# They are therefore NOT the same protocol, and their pair lists differ
# in the embargo season only via the final fold's embargo handling
# below (final embargoes 2024-25; fold2 embargoes 2023-24).


def build_fold(rows_by_id, rows, fold_def, embargo, twins):
    name = fold_def["fold"]
    cutoff = fold_def["train_cutoff"]
    val_seasons = list(fold_def["val_seasons"])

    # Season partition. For the final fold, the embargo season is the
    # season immediately before the test season (2024-25), not the last
    # train-window season — because its train window already ends at
    # 2023-24 and its boundary to protect is the test boundary. In
    # purge-only mode (--no-embargo) the final train set extends through
    # 2024-25 and there is no embargo season.
    all_seasons = sorted({r["season"] for r in rows},
                         key=season_start_year)
    if name == "final" and embargo:
        embargo_seasons = ["2024-25"]
        train_seasons = [s for s in all_seasons
                         if season_start_year(s) <= cutoff]
    elif name == "final" and not embargo:
        embargo_seasons = []
        train_seasons = [s for s in all_seasons
                         if season_start_year(s) <= cutoff + 1]
    elif embargo:
        embargo_seasons = [s for s in all_seasons
                           if season_start_year(s) == cutoff]
        train_seasons = [s for s in all_seasons
                         if season_start_year(s) < cutoff]
    else:
        embargo_seasons = []
        train_seasons = [s for s in all_seasons
                         if season_start_year(s) <= cutoff]
    val_set = set(val_seasons)
    test_seasons = [TEST_SEASON]
    train_set = set(train_seasons)
    embargo_set = set(embargo_seasons)

    # The train set must be disjoint from embargo / val / test.
    overlap = train_set & (embargo_set | val_set | set(test_seasons))
    if overlap:
        fail("%s: train seasons overlap embargo/val/test: %s"
             % (name, sorted(overlap)))

    def season_of(row_id):
        return rows_by_id[row_id]["season"]

    train_rows = [r for r in rows if r["season"] in train_set]
    embargo_rows = [r for r in rows if r["season"] in embargo_set]
    val_rows = [r for r in rows if r["season"] in val_set]
    test_rows = [r for r in rows if r["season"] in set(test_seasons)]
    unused_rows = [r for r in rows
                   if r["season"] not in
                   (train_set | embargo_set | val_set | set(test_seasons))]
    total = (len(train_rows) + len(embargo_rows) + len(val_rows)
             + len(test_rows) + len(unused_rows))
    if total != len(rows):
        fail("%s: partition sums to %d, file has %d rows"
             % (name, total, len(rows)))

    train_ids = {r["id"] for r in train_rows}
    train_person_season = defaultdict(dict)  # person_id -> year -> row id
    for r in train_rows:
        train_person_season[r["person_id"]][season_start_year(r["season"])] = r["id"]

    # --- adjacent-season positives (both endpoints in train) --------
    adjacent_pairs = []
    for person_id, by_year in train_person_season.items():
        for year in sorted(by_year):
            if year + 1 in by_year:
                adjacent_pairs.append([by_year[year], by_year[year + 1]])
    adjacent_pairs.sort()
    adjacent_set = {tuple(p) for p in adjacent_pairs}
    adjacent_set |= {(b, a) for (a, b) in adjacent_set}

    # Cross-boundary pairs DROPPED (counted, never emitted):
    #   * n_cross_boundary: the adjacent pair that crosses INTO the
    #     first held-out season (embargo->val in embargoed mode,
    #     train->val/test in purge-only mode — the same physical pair
    #     either way: 378 / 393 / 397 per fold);
    #   * n_embargo_only: train->embargo pairs withheld solely by the
    #     embargo (390 / 383 / 393; zero in purge-only mode).
    by_person_all = defaultdict(dict)
    for r in rows:
        by_person_all[r["person_id"]][season_start_year(r["season"])] = r
    n_cross_boundary = 0
    n_embargo_only = 0
    held_out_first = ({min(val_seasons, key=season_start_year)}
                      if val_seasons else set(test_seasons))
    for person_id, by_year in by_person_all.items():
        for year in sorted(by_year):
            if year + 1 not in by_year:
                continue
            s1 = by_year[year]["season"]
            s2 = by_year[year + 1]["season"]
            if s2 in held_out_first and s1 not in held_out_first:
                # The pair crossing into the held-out set. In embargoed
                # mode s1 is the embargo season; in purge-only mode s1
                # is the last train season. Either way it is dropped.
                # (For fold1 the held-out set starts at 2022-23, so the
                # counted pair is 2021-22 -> 2022-23 = 378.)
                if s1 in embargo_set or s1 in train_set:
                    n_cross_boundary += 1
            elif s1 in train_set and s2 in embargo_set:
                n_embargo_only += 1

    # --- twin positives (both endpoints in train, different person) --
    twin_pairs = []
    twin_ledger = Counter()
    for anchor, targets in twins.items():
        if anchor not in rows_by_id:
            twin_ledger["anchor_not_in_file"] += len(targets)
            continue
        for target in targets:
            twin_ledger["seen"] += 1
            if anchor == target:
                twin_ledger["dropped_self"] += 1
                continue
            if anchor not in train_ids:
                twin_ledger["dropped_anchor_not_in_train"] += 1
                continue
            if target not in train_ids:
                twin_ledger["dropped_target_not_in_train"] += 1
                continue
            if rows_by_id[anchor]["person_id"] == rows_by_id[target]["person_id"]:
                twin_ledger["dropped_same_person"] += 1
                continue
            if (anchor, target) in adjacent_set:
                twin_ledger["dropped_duplicate_adjacent"] += 1
                continue
            twin_pairs.append([anchor, target])
    # Dedupe twin pairs (same unordered pair listed twice).
    twin_pairs = sorted({tuple(sorted(p)) for p in twin_pairs})
    twin_pairs = [list(p) for p in twin_pairs]

    # --- positives map (adjacent first, then twins, cap 12) ----------
    positives = defaultdict(list)
    for a, b in adjacent_pairs:
        positives[a].append(b)
        positives[b].append(a)
    for a, b in twin_pairs:
        if b not in positives[a]:
            positives[a].append(b)
        if a not in positives[b]:
            positives[b].append(a)
    positives = {str(k): sorted(set(v))[:MAX_POSITIVES_PER_ANCHOR]
                 for k, v in positives.items()}

    # --- fail-loud invariants on everything emitted -------------------
    for a, b in adjacent_pairs + twin_pairs:
        if a not in train_ids or b not in train_ids:
            fail("%s: emitted pair (%r, %r) touches a non-train row"
                 % (name, a, b))
        if season_of(a) in set(test_seasons) or season_of(b) in set(test_seasons):
            fail("%s: emitted pair (%r, %r) touches the frozen test"
                 % (name, a, b))
    for anchor, poss in positives.items():
        if int(anchor) not in train_ids:
            fail("%s: positives anchor %r is not a train row" % (name, anchor))
        for p in poss:
            if p not in train_ids:
                fail("%s: positive %r for anchor %r is not a train row"
                     % (name, p, anchor))

    # --- new-player slice ---------------------------------------------
    # Val/test row whose person_id has NO earlier-season row in the
    # fold's train set. (Train seasons are all earlier than val/test
    # seasons by construction, so absence from train == no earlier row.)
    def n_new(rows_slice):
        train_persons = {r["person_id"] for r in train_rows}
        train_years = defaultdict(set)
        for r in train_rows:
            train_years[r["person_id"]].add(season_start_year(r["season"]))
        n = 0
        for r in rows_slice:
            if not any(y < season_start_year(r["season"])
                       for y in train_years.get(r["person_id"], set())):
                n += 1
        return n

    manifest = {
        "fold": name,
        "train_seasons": train_seasons,
        "val_seasons": val_seasons,
        "test_seasons": test_seasons,
        "n_train_rows": len(train_rows),
        "n_val_rows": len(val_rows),
        "n_test_rows": len(test_rows),
        "n_pairs_adjacent": len(adjacent_pairs),
        "n_pairs_twin": len(twin_pairs),
        "n_pairs_dropped_cross_boundary": n_cross_boundary,
        "n_val_new_player_rows": n_new(val_rows),
        # Extra (non-contract) fields, documented in the schema file.
        "embargo_seasons": embargo_seasons,
        "n_embargo_rows": len(embargo_rows),
        "unused_seasons": sorted({r["season"] for r in unused_rows},
                                 key=season_start_year),
        "n_unused_rows": len(unused_rows),
        "n_pairs_dropped_embargo_only": n_embargo_only if embargo else 0,
        "n_test_new_player_rows": n_new(test_rows),
        "n_twin_pairs_seen": twin_ledger["seen"],
        "n_twin_pairs_dropped": (
            twin_ledger["dropped_anchor_not_in_train"]
            + twin_ledger["dropped_target_not_in_train"]
            + twin_ledger["dropped_same_person"]
            + twin_ledger["dropped_self"]
            + twin_ledger["dropped_duplicate_adjacent"]
            + twin_ledger["anchor_not_in_file"]),
        "twin_drop_ledger": dict(twin_ledger),
    }
    pairs = {
        "fold": name,
        "adjacent_pairs": adjacent_pairs,
        "twin_pairs": twin_pairs,
        "positives": positives,
    }
    return manifest, pairs, train_rows


# ---------------------------------------------------------------- batching

def epoch_batches(train_rows, epoch=0, batch_size=BATCH_ANCHORS, seed=SEED):
    """Era-stratified batches for one epoch (seed varies by epoch).

    Re-shuffles within each era bin with seed + epoch. Lane 4 calls this
    once per epoch; hard negatives are recomputed per epoch from the
    current embeddings (see hardest_in_batch), never reused across epochs.
    """
    by_era = defaultdict(list)
    id_to_era = {}
    for r in train_rows:
        e = era_of(r["season"])
        by_era[e].append(r["id"])
        id_to_era[r["id"]] = e
    labels = [label for label, _, _ in ERA_BINS]
    rng = random.Random(seed + epoch)
    for label in labels:
        rng.shuffle(by_era[label])
    total = sum(len(by_era[l]) for l in labels)
    quotas = {}
    for label in labels:
        share = len(by_era[label]) / total if total else 0
        quotas[label] = min(max(MIN_PER_ERA_PER_BATCH,
                                round(batch_size * share)),
                            len(by_era[label]))
    while sum(quotas.values()) > batch_size:
        biggest = max(labels, key=lambda l: quotas[l])
        if quotas[biggest] <= 1:
            break
        quotas[biggest] -= 1
    while sum(quotas.values()) < batch_size:
        biggest = max(labels, key=lambda l: len(by_era[l]))
        quotas[biggest] += 1
    pointers = {label: 0 for label in labels}
    remaining = total
    while remaining > 0:
        batch = []
        for label in labels:
            take = min(quotas[label], len(by_era[label]) - pointers[label])
            batch.extend(by_era[label][pointers[label]:pointers[label] + take])
            pointers[label] += take
        if not batch:
            break
        present = {id_to_era[i] for i in batch}
        missing = [l for l in labels
                   if by_era[l] and l not in present and len(batch) >= batch_size]
        if missing:
            fail("batch of %d anchors is missing eras %s (quotas %s)"
                 % (len(batch), missing, quotas))
        remaining -= len(batch)
        yield batch


# ---------------------------------------------------------------- hard negatives

def hardest_in_batch(similarities, anchor_pos, excluded_positions):
    """Hardest in-batch negative for one anchor (reference selector).

    similarities: square list-of-lists of cosine similarities over the
    batch's rows (Lane 4 computes this from current embeddings each
    epoch). anchor_pos: the anchor's position in the batch. Returns the
    position of the highest-similarity row that is not the anchor and
    not in excluded_positions. Excluded positions must already cover
    the anchor's positives and same-person rows (see exclusion_mask).
    Returns None if no candidate exists.
    """
    best, best_sim = None, None
    row = similarities[anchor_pos]
    for pos, sim in enumerate(row):
        if pos == anchor_pos or pos in excluded_positions:
            continue
        if best_sim is None or sim > best_sim:
            best, best_sim = pos, sim
    return best


def exclusion_mask(batch_row_ids, rows_by_id, positives):
    """For each batch position, the set of positions never to mine as a
    hard negative: the anchor itself, its positives, and every other
    season of the same person. Returns {position: set(positions)}.
    """
    person_of = {rid: rows_by_id[rid]["person_id"] for rid in batch_row_ids}
    pos_of_id = {rid: pos for pos, rid in enumerate(batch_row_ids)}
    pos_of_person = defaultdict(set)
    for pos, rid in enumerate(batch_row_ids):
        pos_of_person[person_of[rid]].add(pos)
    masks = {}
    for pos, rid in enumerate(batch_row_ids):
        excluded = {pos}
        excluded |= pos_of_person[person_of[rid]]
        for p in positives.get(str(rid), []):
            if p in pos_of_id:
                excluded.add(pos_of_id[p])
        masks[pos] = excluded
    return masks


# ---------------------------------------------------------------- main


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Lane 3 draft: build fold manifests + pair lists.")
    ap.add_argument("--features", required=True,
                    help="vectors.json-style file (players list).")
    ap.add_argument("--twins", default=None,
                    help="v5 twin file (anchor id -> [twin ids]).")
    ap.add_argument("--out", required=True, help="output directory.")
    ap.add_argument("--no-embargo", action="store_true",
                    help="Purge-only variant: no embargo season removed. "
                         "NOT the default; see FOLDS.md section 4.")
    ap.add_argument("--fail-on-zero-twins", action="store_true",
                    help="Exit non-zero if any fold yields 0 twin pairs.")
    ap.add_argument("--emit-batches", action="store_true",
                    help="Also write epoch-0 era-stratified batches.")
    ap.add_argument("--no-count-check", action="store_true",
                    help="Skip the verified-count checks (coordinator "
                         "approval required if the source file changes).")
    args = ap.parse_args(argv)

    rows = load_rows(args.features)
    validate_counts(rows, check=not args.no_count_check)
    rows_by_id = {r["id"]: r for r in rows}
    if len(rows_by_id) != len(rows):
        fail("duplicate row ids in features file")
    twins, twin_meta = load_twins(args.twins)
    if args.twins and twin_meta:
        print("twin file meta: %s" % json.dumps(twin_meta), file=sys.stderr)

    import os
    os.makedirs(args.out, exist_ok=True)
    manifests = []
    for fold_def in FOLD_DEFS:
        manifest, pairs, train_rows = build_fold(
            rows_by_id, rows, fold_def, embargo=not args.no_embargo,
            twins=twins)
        manifests.append(manifest)
        with open(os.path.join(args.out, "pairs_%s.json" % manifest["fold"]),
                  "w") as fh:
            json.dump(pairs, fh)
        if args.emit_batches:
            batches = list(epoch_batches(train_rows, epoch=0))
            with open(os.path.join(args.out,
                                   "batches_%s.json" % manifest["fold"]),
                      "w") as fh:
                json.dump({"fold": manifest["fold"], "seed": SEED,
                           "batch_size_anchors": BATCH_ANCHORS,
                           "batches": batches}, fh)
        print("%s: train=%d embargo=%d val=%d test=%d adjacent=%d twin=%d "
              "dropped_cross_boundary=%d dropped_embargo_only=%d "
              "val_new=%d test_new=%d"
              % (manifest["fold"], manifest["n_train_rows"],
                 manifest["n_embargo_rows"], manifest["n_val_rows"],
                 manifest["n_test_rows"], manifest["n_pairs_adjacent"],
                 manifest["n_pairs_twin"],
                 manifest["n_pairs_dropped_cross_boundary"],
                 manifest["n_pairs_dropped_embargo_only"],
                 manifest["n_val_new_player_rows"],
                 manifest["n_test_new_player_rows"]), file=sys.stderr)
        if manifest["n_pairs_twin"] == 0:
            print("%s: WARNING: 0 training twin pairs — twin file "
                  "contributes no train-split anchors (seen=%d, dropped=%d; "
                  "ledger=%s). Training positives are adjacent-season "
                  "only until a train twin file exists."
                  % (manifest["fold"], manifest["n_twin_pairs_seen"],
                     manifest["n_twin_pairs_dropped"],
                     json.dumps(manifest["twin_drop_ledger"])),
                  file=sys.stderr)
            if args.fail_on_zero_twins:
                fail("%s: --fail-on-zero-twins set and twin pairs == 0"
                     % manifest["fold"])

    manifest_doc = {
        "schema_version": 1,
        "generated_by": "lanes/03-split-dataprep/build_pairs.py (draft)",
        "embargo": not args.no_embargo,
        "features_file": args.features,
        "twin_file": args.twins,
        "total_rows": len(rows),
        "folds": manifests,
    }
    with open(os.path.join(args.out, "fold_manifest.json"), "w") as fh:
        json.dump(manifest_doc, fh, indent=2)
    print("wrote %s/fold_manifest.json + pairs_*.json"
          % args.out, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
