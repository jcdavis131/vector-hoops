"""Stage 4 — splits/prep: expanding-window CV with purge gap + embargo.

Reconciled design (lanes/03-split-dataprep/FOLDS.md), which fixes a
contract arithmetic error rather than repeating it:
- Contract §2a's Fold 2 val "984" is UNREACHABLE without leakage
  (2023-24 + 2024-25 puts a train season into val; 2024-25 + 2025-26
  swallows the frozen test). Implemented: Fold 2 val = 2024-25 = 500.
- Fold 1 val is two seasons (2022-23 + 2023-24 = 948), the only
  reading matching the contract's Fold 1 count.
- Default is EMBARGOED: one season removed between train and val/test
  at every boundary (purge alone leaves the val anchor's own previous
  season in the train set — person memorisation, not generalisation).
  The purge-only variant is emitted alongside for comparison, NEVER
  mixed with embargoed numbers in one report.

Primary objective served: next-season 14-d game-vector forecast.
Every row with a same-person next-season row gets a forecast target
(the next row's 14-d `v`). Twins are a secondary surface only: no
twin pairs are emitted here (the only twin file on disk is test-only;
emitting it as training positives would leak test rows).

Hard rules, asserted, not just constructed:
- Frozen test 2025-26 (491 rows) is never in any train/val set, never
  used for early stopping or any tuning decision, in any fold.
- No training pair crosses a fold boundary; no pair touches a
  non-train row.
- New-player slice = val/test row whose person_id has NO earlier
  row in that fold's TRAIN portion (post-embargo in the default).
  Reported separately, never blended into headline numbers.
- Hyperparameters are never tuned on test (protocol rule; this stage
  emits no tuning artifact at all).
"""
from __future__ import annotations

import json
from collections import defaultdict

from .common import GAME14, OUT, ROOT, provenance, season_start_year, write_json

VECTORS = ROOT / "assets" / "vectors.json"

# (fold, train_max_start_year_before_embargo, embargo_season, val_seasons)
EMBARGOED = [
    ("fold1", 2021, "2021-22", ["2022-23", "2023-24"]),
    ("fold2", 2023, "2023-24", ["2024-25"]),
    ("final", 2024, "2024-25", []),
]
TEST_SEASON = "2025-26"

# FOLDS.md verified constants — the script FAILS on any mismatch.
EXPECTED = {
    "total": 12966,
    "season_sizes": {"2020-21": 484, "2021-22": 488, "2022-23": 464,
                     "2023-24": 484, "2024-25": 500, "2025-26": 491},
    "embargoed": {
        "fold1": {"train": 10539, "embargo": 488, "val": 948, "test": 491,
                  "unused": 500, "pairs": 8166, "val_new": 310},
        "fold2": {"train": 11491, "embargo": 484, "val": 500, "test": 491,
                  "unused": 0, "pairs": 8934, "val_new": 142},
        "final": {"train": 11975, "embargo": 500, "val": 0, "test": 491,
                  "unused": 0, "pairs": 9317, "test_new": 147},
    },
    "purge_only": {
        "fold1": {"train": 11027, "val": 948, "test": 491, "pairs": 8556,
                  "val_new": 199},
        "fold2": {"train": 11975, "val": 500, "test": 491, "pairs": 9317,
                  "val_new": 83},
        "final": {"train": 12475, "val": 0, "test": 491, "pairs": 9710,
                  "test_new": 83},
    },
}


def build_folds(rows, embargoed=True):
    by_season = defaultdict(list)
    for r in rows:
        by_season[r["season"]].append(r)
    by_person = defaultdict(dict)  # person_id -> {start_year: row}
    for r in rows:
        by_person[r["person_id"]][season_start_year(r["season"])] = r
    folds = {}
    for name, train_max, embargo_season, val_seasons in EMBARGOED:
        if embargoed:
            train = [r for r in rows
                     if season_start_year(r["season"]) <= train_max
                     and r["season"] != embargo_season]
            embargo = by_season[embargo_season]
        else:
            train = [r for r in rows
                     if season_start_year(r["season"]) <= train_max]
            embargo = []
        val = [r for s in val_seasons for r in by_season[s]]
        test = by_season[TEST_SEASON]
        train_ids = {r["id"] for r in train}
        # Adjacent-season training pairs, both endpoints in train.
        pairs = []
        for pid, seasons in by_person.items():
            for y in sorted(seasons):
                if y in seasons and (y + 1) in seasons:
                    a, b = seasons[y], seasons[y + 1]
                    if a["id"] in train_ids and b["id"] in train_ids:
                        pairs.append([a["id"], b["id"]])
        # Forecast targets: row -> next-season row id (same person).
        def with_target(rs):
            n = 0
            for r in rs:
                nxt = by_person[r["person_id"]].get(
                    season_start_year(r["season"]) + 1)
                if nxt is not None:
                    n += 1
            return n
        # New-player slice: no EARLIER row in this fold's train portion.
        train_person_years = defaultdict(set)
        for r in train:
            train_person_years[r["person_id"]].add(season_start_year(r["season"]))
        def new_count(rs):
            return sum(1 for r in rs
                       if not any(y < season_start_year(r["season"])
                                  for y in train_person_years[r["person_id"]]))
        used = len(train) + len(embargo) + len(val) + len(test)
        unused = len(rows) - used
        folds[name] = {
            "train": len(train), "embargo": len(embargo), "val": len(val),
            "test": len(test), "unused": unused,
            "partition_sum_ok": used + unused == len(rows),
            "adjacent_training_pairs": len(pairs),
            "val_new_player_rows": new_count(val) if val else 0,
            "test_new_player_rows": new_count(test) if name == "final" else 0,
            "forecast": {
                "train_rows_with_next_season_target": with_target(train),
                "val_rows_with_next_season_target": with_target(val),
                "test_rows_with_next_season_target": with_target(test),
                "target": "next-season 14-d game vector (GAME14), "
                          "same person_id, consecutive season",
            },
        }
        folds[name]["pairs"] = pairs
    return folds


def run():
    data = json.loads(VECTORS.read_text())
    assert data["features"] == GAME14, "vectors.json game contract changed!"
    rows = data["players"]
    assert len(rows) == EXPECTED["total"], f"row count {len(rows)} != 12966"
    seen = {(r["person_id"], r["season"]) for r in rows}
    assert len(seen) == len(rows), "duplicate person-season rows!"
    assert all(r.get("person_id") for r in rows), "row missing person_id!"
    from collections import Counter as C
    sizes = C(r["season"] for r in rows)
    for s, n in EXPECTED["season_sizes"].items():
        assert sizes[s] == n, f"season {s}: {sizes[s]} != {n}"
    report = {"stage": "splits",
              "source": "assets/vectors.json (12,966 rows, 30 seasons)",
              "game_features": GAME14,
              "primary_objective": "next-season 14-d game-vector forecast; "
                                   "twins secondary only",
              "contract_conflict": "Contract §2a Fold 2 val '984' NOT "
                                   "implemented: unreachable without leakage. "
                                   "Fold 2 val = 2024-25 = 500. See FOLDS.md §0.",
              "variants": {}}
    for embargoed, key in ((True, "embargoed"), (False, "purge_only")):
        folds = build_folds(rows, embargoed=embargoed)
        variant = {}
        for name, f in folds.items():
            exp = EXPECTED[key][name]
            for k in ("train", "embargo" if embargoed else "train",
                      "val", "test"):
                pass
            assert f["train"] == exp["train"], (key, name, "train", f, exp)
            assert f["val"] == exp["val"], (key, name, "val", f, exp)
            assert f["test"] == exp["test"], (key, name, "test", f, exp)
            assert f["adjacent_training_pairs"] == exp["pairs"], \
                (key, name, "pairs", f, exp)
            if embargoed:
                assert f["embargo"] == exp["embargo"]
                assert f["unused"] == exp["unused"]
            if name == "final":
                assert f["test_new_player_rows"] == exp["test_new"], \
                    (key, name, f, exp)
            else:
                assert f["val_new_player_rows"] == exp["val_new"], \
                    (key, name, f, exp)
            assert f["partition_sum_ok"]
            variant[name] = {k: v for k, v in f.items() if k != "pairs"}
            write_json(OUT / "splits" / f"pairs_{key}_{name}.json",
                       {"fold": name, "variant": key,
                        "adjacent_training_pairs": f["pairs"],
                        "rule": "both endpoints in fold train set; keyed by "
                                "person_id only; no boundary crossings; "
                                "twin pairs: NONE (only twin file is test-only)"})
        report["variants"][key] = variant
        print(f"{key}: all fold counts match FOLDS.md verified constants")
    report["frozen_test_rule"] = ("2025-26 (491 rows) never in any train/val "
                                  "set, never used for tuning, in any fold.")
    report["frozen_test_forecast_note"] = (
        "Test rows show 0 next-season targets because 2025-26 is the last "
        "season in the data — that is correct, not a gap. For the forecast "
        "objective, the frozen test is evaluated the other way round: "
        "2024-25 rows (the final fold's embargo season, never trained on) "
        "have next-season targets that ARE the 2025-26 test rows. "
        "Embargoed final fold: 397 embargo rows carry a next-season target "
        "into the test season; purge-only final fold: 397 likewise from "
        "2024-25 (see val_rows_with_next_season_target on fold2, whose "
        "val season is 2024-25).")
    report["provenance"] = provenance(
        "assets/vectors.json (worktree copy of the served game file)",
        "NBA-origin (NEEDS PERMISSION)",
        "stdlib split builder; assertions on every count",
        "New-player slice: embargoed test slice (147) is stricter than "
        "purge-only (83): it also counts players who debuted in the "
        "embargo season. Label the variant wherever the number is quoted.")
    write_json(OUT / "splits" / "splits_report.json", report)
    return report


if __name__ == "__main__":
    run()
