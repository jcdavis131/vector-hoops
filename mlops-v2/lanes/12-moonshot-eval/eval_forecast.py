#!/usr/bin/env python3
"""Moonshot forecast eval harness -- LANE 12 DRAFT.

Status: DRAFT ONLY. Spec finalization waits for the panel's moonshot
verdict (CONTRACT.md SS11, SS13). This file is a draft: it was verified
by ``python3 -m py_compile`` only. It was NEVER executed on real data
in this pass, and no training run, merge, or production write is
authorized by it.

HEADLINE FRAMING (user-directed 2026-10-26 22:32 CDT, PENDING PANEL
RATIFICATION -- label kept on purpose, see CONTRACT.md SS11):
forecast accuracy is the headline. Twin metrics are secondary /
diagnostic, never the gate. If the panel rules otherwise, this header
and the report's headline block are amended at spec finalization;
the metric code itself does not change, only which block is headlined.

What this harness scores
------------------------
The NEXT-SEASON 14-d game-vector forecast, one fold per invocation:

    python3 eval_forecast.py --rows <rows.json> \
        --fold-manifest <fold_manifest.json> --fold fold2 \
        --forecasts <forecasts.json> --out <dir>

The 14 stats, in fixed order (CONTRACT.md SS0; the game vector is
z-scored within season in the served vectors file):

    PTS, AST, OREB, DREB, STL, BLK, TOV, FG3A, FGA, FTA,
    FG3_PCT, FG_PCT, FT_PCT, PLUS_MINUS

Per scored cohort the harness reports, per stat AND as the mean
across stats: MAE and R-squared. It reports per fold (fold1 val,
fold2 val) and, for --fold final, on the frozen test -- never pooled
across folds into one headline. The new-player-only slice is reported
as a separate block, never blended into the headline.

Folds consumed, not redefined (Lane 3, FOLDS.md, embargoed default):

    fold1: train 10,539 / embargo 2021-22 (488) / val 948 (2022-23, 2023-24)
    fold2: train 11,491 / embargo 2023-24 (484) / val 500 (2024-25)
    final: train 11,975 / embargo 2024-25 (500) / frozen test 491 (2025-26)

The manifest's own season lists are authoritative. This harness
validates the manifest against the rows file and FAILS LOUD on any
mismatch; it never substitutes the contract's printed counts
(in particular it never substitutes the contract SS2a "984" for
Fold 2 val -- see the contract-conflict note in BASELINES.md and
FLOOR_CONSTRAINT.md; Lane 3 implements 500).

Same code path, every model and baseline
----------------------------------------
One function, ``score_cohort()``, scores every forecast file:
champion-side baselines (carry-forward, age-curve, stats-only MLP),
the forecast model, and any challenger. There is no per-model branch
in the metric code. A baseline is just a forecast file in the format
below, produced per BASELINES.md, and scored by this same script.

Input formats
-------------
Rows file (--rows): JSON object with a ``players`` list, or a bare
JSON list. Every row MUST carry ``person_id`` (non-empty string) and
``season`` (``YYYY-YY``), plus all 14 stat fields as finite numbers.
A row missing ``person_id`` is a hard failure -- name fallback is
banned (CONTRACT.md SS0; Lane 5 protocol SS14 C3: the served
vectors.json carries no person_id field, so the operator must supply
a person_id-enriched rows file, e.g. vectors.json after
``pipeline/apply_player_identity.py``).

Fold manifest (--fold-manifest): Lane 3's ``fold_manifest.json``
(schema: ``fold_manifest_schema.json``). Required per fold:
``fold``, ``train_seasons``, ``val_seasons``, ``test_seasons``,
``n_train_rows``, ``n_val_rows``, ``n_test_rows``,
``n_pairs_adjacent``, ``n_pairs_twin``,
``n_pairs_dropped_cross_boundary``, ``n_val_new_player_rows``.

Forecast file (--forecasts): JSON object::

    {
      "model": "carry-forward",
      "space": "z-scored within season",
      "train_seasons": ["1996-97", "..."],
      "forecasts": [
        {"person_id": "...", "target_season": "2024-25",
         "forecast": {"PTS": ..., "AST": ..., ...},
         "neighbors": ["<person_id>", ...] }
      ]
    }

Rules enforced on the forecast file (fail loud, exit non-zero):
  * ``model``, ``space``, ``train_seasons`` present. ``space`` is a
    label, not a conversion: forecasts and actuals MUST be in the
    same space. The harness never un-z-scores, re-z-scores, or
    converts silently. If forecasts are raw per-100 values, the
    actuals file must be raw per-100 too, and ``space`` must say so.
  * Declared ``train_seasons`` must be a SUBSET of the manifest's
    train seasons for the scored fold. Training on an embargo, val,
    test, or future season is test leakage and fails. (Each fold's
    model is retrained from scratch, so each fold needs its own
    forecast file scored with its own --fold invocation.)
  * Every scored row (val rows for fold1/fold2, test rows for
    final) must have exactly one forecast. Missing forecasts fail:
    silently dropping hard rows would flatter MAE. Duplicate
    (person_id, target_season) forecasts fail. Forecasts for rows
    outside the scored seasons fail (a file scored for one fold
    must not smuggle another fold's or the frozen test's rows in).
  * Every forecast carries exactly the 14 stats, all finite.
  * ``neighbors`` is OPTIONAL and applies only to retrieval-built
    forecasts (e.g. a twin-average forecast). When present it lists
    the person_ids whose rows built the forecast. The harness then
    verifies whole-person exclusion: no neighbor may share the
    target row's person_id (the PR #194 lesson -- a reveal or a
    forecast built from the player himself is invalid). When
    absent, the report records ``retrieval_exclusion`` as
    "not_verifiable_from_file" -- provenance must attest it; the
    harness never claims an exclusion it did not check.

New-player slice (definition used HERE -- read carefully)
--------------------------------------------------------
A scored row is in the new-player (cold-start) slice when its
person_id has NO row in the fold's training portion (the manifest's
post-embargo train seasons). This is Lane 3's slice definition
(FOLDS.md SS6), which is the right slice for forecasting: every such
row still needs a forecast, and the model genuinely never saw that
player. It DIFFERS from Lane 5's retrieval slice mapping
(EVAL_PROTOCOL.md SS4.6), which additionally requires the row to be
the person's earliest season (a retrieval slice needs a predecessor
pair; a forecast slice does not). The two slice numbers must never
be compared as if they were the same slice; the report states which
definition it used. Under the embargo, the slice is larger than the
true-debutant count (it includes embargo-season debutants returning
in val/test) and is labelled "embargoed cold-start" in the report.
The harness recomputes the slice counts from the rows file and
fails if they disagree with the manifest's ``n_val_new_player_rows``
/ ``n_test_new_player_rows`` (final fold: test slice).

Metric definitions
------------------
For a cohort of n rows, per stat s with actual a_i and forecast f_i:
  MAE(s) = mean |f_i - a_i|.
  R2(s)  = 1 - sum (f_i - a_i)^2 / sum (a_i - mean(a))^2.
  Mean MAE = arithmetic mean of the 14 per-stat MAEs.
  Mean R2  = arithmetic mean of the per-stat R2 values that are
             not null.
R2 is null (never 0) when n < 2 or the actuals have zero variance
in the cohort. An empty cohort reports null with a reason, never 0.
No metric is ever computed on a pooled multi-fold cohort.

Optional paired comparison (--compare <other-forecast-file>):
the second file is validated identically on the same fold and
cohort, and a paired bootstrap (seed 7, default 1000 resamples of
the scored rows, same resample for both files) reports the mean-MAE
difference (this file minus the comparison file) with a 95%
percentile interval. A difference whose interval excludes 0 is the
"beats" evidence used by BASELINES.md; a point win inside the
interval is noise, not a win.

Output: ``forecast_eval_report.json`` in --out, plus a stdout
summary. The script writes nothing anywhere else: no repo checkout,
no registry, no production asset.

Stdlib only. No torch, no numpy, no installs.
"""

import argparse
import hashlib
import json
import math
import random
import re
import sys

STATS = [
    "PTS", "AST", "OREB", "DREB", "STL", "BLK", "TOV",
    "FG3A", "FGA", "FTA", "FG3_PCT", "FG_PCT", "FT_PCT",
    "PLUS_MINUS",
]

SEASON_RE = re.compile(r"^\d{4}-\d{2}$")
FROZEN_TEST_SEASON = "2025-26"

REQUIRED_FOLD_FIELDS = [
    "fold", "train_seasons", "val_seasons", "test_seasons",
    "n_train_rows", "n_val_rows", "n_test_rows",
    "n_pairs_adjacent", "n_pairs_twin",
    "n_pairs_dropped_cross_boundary", "n_val_new_player_rows",
]


class FailLoud(Exception):
    """Raised for every validation failure. Main turns it into exit 2."""


def fail(msg):
    raise FailLoud(msg)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path, what):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        fail("%s not found: %s" % (what, path))
    except json.JSONDecodeError as e:
        fail("%s is not valid JSON (%s): %s" % (what, e, path))


def season_start_year(season):
    return int(season[:4])


def validate_rows(doc, path):
    """Return a list of validated row dicts. Fails loud, in order."""
    if isinstance(doc, dict):
        rows = doc.get("players")
        if rows is None:
            fail("rows file %s: object form must carry a 'players' list" % path)
    elif isinstance(doc, list):
        rows = doc
    else:
        fail("rows file %s: expected a JSON list or an object with 'players'" % path)
    if not isinstance(rows, list) or not rows:
        fail("rows file %s: empty or non-list row set" % path)
    seen = set()
    out = []
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            fail("rows file %s: row %d is not an object" % (path, i))
        pid = row.get("person_id")
        if not isinstance(pid, str) or not pid:
            fail("rows file %s: row %d is missing person_id "
                 "(name fallback is banned; supply a person_id-enriched "
                 "rows file)" % (path, i))
        season = row.get("season")
        if not isinstance(season, str) or not SEASON_RE.match(season):
            fail("rows file %s: row %d has a bad season %r "
                 "(expected YYYY-YY)" % (path, i, season))
        key = (pid, season)
        if key in seen:
            fail("rows file %s: duplicate person-season row %r" % (path, key))
        seen.add(key)
        stats = {}
        for s in STATS:
            v = row.get(s)
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                fail("rows file %s: row %d (%s, %s) is missing stat %s "
                     "or it is not a number" % (path, i, pid, season, s))
            if not math.isfinite(v):
                fail("rows file %s: row %d (%s, %s) has a non-finite "
                     "value for %s" % (path, i, pid, season, s))
            stats[s] = float(v)
        out.append({"person_id": pid, "season": season, "stats": stats})
    return out


def validate_manifest(doc, rows, path):
    """Return the folds dict. Fails loud on any manifest mismatch."""
    if not isinstance(doc, dict):
        fail("fold manifest %s: expected a JSON object" % path)
    folds = doc.get("folds")
    if not isinstance(folds, list) or not folds:
        fail("fold manifest %s: missing or empty 'folds' list" % path)
    total_rows = doc.get("total_rows")
    if total_rows is not None and total_rows != len(rows):
        fail("fold manifest %s: total_rows %r does not match rows file "
             "row count %d" % (path, total_rows, len(rows)))
    by_season = {}
    for r in rows:
        by_season.setdefault(r["season"], []).append(r)
    out = {}
    for fold in folds:
        if not isinstance(fold, dict):
            fail("fold manifest %s: a fold entry is not an object" % path)
        for field in REQUIRED_FOLD_FIELDS:
            if field not in fold:
                fail("fold manifest %s: fold %r is missing required "
                     "field %r" % (path, fold.get("fold"), field))
        name = fold["fold"]
        train = fold["train_seasons"]
        val = fold["val_seasons"]
        test = fold["test_seasons"]
        embargo = fold.get("embargo_seasons", [])
        unused = fold.get("unused_seasons", [])
        for label, lst in (("train_seasons", train), ("val_seasons", val),
                           ("test_seasons", test), ("embargo_seasons", embargo),
                           ("unused_seasons", unused)):
            if not isinstance(lst, list) or any(
                    not isinstance(s, str) or not SEASON_RE.match(s) for s in lst):
                fail("fold manifest %s: fold %s has a malformed %s"
                     % (path, name, label))
        all_lists = train + val + test + embargo + unused
        if len(all_lists) != len(set(all_lists)):
            fail("fold manifest %s: fold %s has overlapping season lists "
                 "(train/val/test/embargo/unused must be disjoint)"
                 % (path, name))
        if FROZEN_TEST_SEASON not in test:
            fail("fold manifest %s: fold %s test_seasons %r does not "
                 "contain the frozen test season %s"
                 % (path, name, test, FROZEN_TEST_SEASON))
        counts = {
            "n_train_rows": sum(len(by_season.get(s, [])) for s in train),
            "n_val_rows": sum(len(by_season.get(s, [])) for s in val),
            "n_test_rows": sum(len(by_season.get(s, [])) for s in test),
        }
        for field, actual in counts.items():
            if fold[field] != actual:
                fail("fold manifest %s: fold %s %s is %r but the rows "
                     "file gives %d for seasons %r (manifest mismatch)"
                     % (path, name, field, fold[field], actual,
                        train if field == "n_train_rows"
                        else val if field == "n_val_rows" else test))
        # Reconcile the partition against the rows file total.
        extra = {
            "n_embargo_rows": sum(len(by_season.get(s, [])) for s in embargo),
            "n_unused_rows": sum(len(by_season.get(s, [])) for s in unused),
        }
        for field, actual in extra.items():
            if field in fold and fold[field] != actual:
                fail("fold manifest %s: fold %s %s is %r but the rows "
                     "file gives %d" % (path, name, field, fold[field], actual))
        if all(k in fold for k in
               ("n_train_rows", "n_embargo_rows", "n_val_rows",
                "n_test_rows", "n_unused_rows")):
            part = (fold["n_train_rows"] + fold["n_embargo_rows"]
                    + fold["n_val_rows"] + fold["n_test_rows"]
                    + fold["n_unused_rows"])
            if part != len(rows):
                fail("fold manifest %s: fold %s partition sums to %d, "
                     "not the rows file total %d"
                     % (path, name, part, len(rows)))
        # Recompute the new-player slice and check it against the manifest.
        train_persons = set()
        for s in train:
            for r in by_season.get(s, []):
                train_persons.add(r["person_id"])
        val_new = sum(1 for s in val for r in by_season.get(s, [])
                      if r["person_id"] not in train_persons)
        if fold["n_val_new_player_rows"] != val_new:
            fail("fold manifest %s: fold %s n_val_new_player_rows is %r "
                 "but recomputation from the rows file gives %d "
                 "(new-player = person_id absent from the fold's train "
                 "seasons)" % (path, name, fold["n_val_new_player_rows"], val_new))
        test_new = sum(1 for s in test for r in by_season.get(s, [])
                       if r["person_id"] not in train_persons)
        if ("n_test_new_player_rows" in fold
                and fold["n_test_new_player_rows"] != test_new):
            fail("fold manifest %s: fold %s n_test_new_player_rows is %r "
                 "but recomputation gives %d"
                 % (path, name, fold["n_test_new_player_rows"], test_new))
        out[name] = fold
    return out


def scored_seasons(fold):
    """Val seasons for tuning folds; test seasons for the final fold."""
    if fold["fold"] == "final":
        return list(fold["test_seasons"]), "frozen_test"
    return list(fold["val_seasons"]), "val"


def validate_forecasts(doc, rows_by_key, scored, fold, path):
    """Return (model, space, forecast map). Fails loud, incl. leakage."""
    if not isinstance(doc, dict):
        fail("forecast file %s: expected a JSON object" % path)
    model = doc.get("model")
    space = doc.get("space")
    train_seasons = doc.get("train_seasons")
    entries = doc.get("forecasts")
    if not isinstance(model, str) or not model:
        fail("forecast file %s: missing 'model' name" % path)
    if not isinstance(space, str) or not space:
        fail("forecast file %s: missing 'space' label (forecasts and "
             "actuals must share one declared space; the harness never "
             "converts silently)" % path)
    if (not isinstance(train_seasons, list) or not train_seasons
            or any(not isinstance(s, str) or not SEASON_RE.match(s)
                   for s in train_seasons)):
        fail("forecast file %s: missing or malformed 'train_seasons' "
             "(needed to check for test leakage)" % path)
    manifest_train = set(fold["train_seasons"])
    forbidden = (set(fold["val_seasons"]) | set(fold["test_seasons"])
                 | set(fold.get("embargo_seasons", []))
                 | set(fold.get("unused_seasons", [])))
    for s in train_seasons:
        if s not in manifest_train:
            if s in forbidden:
                fail("forecast file %s: TEST LEAKAGE -- declared train "
                     "season %s is a val/test/embargo/unused season for "
                     "fold %s" % (path, s, fold["fold"]))
            fail("forecast file %s: declared train season %s is not in "
                 "fold %s's manifest train seasons %r"
                 % (path, s, fold["fold"], fold["train_seasons"]))
    if not isinstance(entries, list):
        fail("forecast file %s: missing 'forecasts' list" % path)
    scored_keys = set()
    for r in rows_by_key.values():
        if r["season"] in scored:
            scored_keys.add((r["person_id"], r["season"]))
    fmap = {}
    retrieval_checked = True
    retrieval_notes = []
    for i, e in enumerate(entries):
        if not isinstance(e, dict):
            fail("forecast file %s: entry %d is not an object" % (path, i))
        pid = e.get("person_id")
        season = e.get("target_season")
        if not isinstance(pid, str) or not pid:
            fail("forecast file %s: entry %d is missing person_id" % (path, i))
        if not isinstance(season, str) or not SEASON_RE.match(season):
            fail("forecast file %s: entry %d has a bad target_season %r"
                 % (path, i, season))
        key = (pid, season)
        if season not in scored:
            fail("forecast file %s: entry %d forecasts %r, which is "
                 "outside the scored seasons %r for fold %s (score one "
                 "fold per file; do not smuggle other folds' or the "
                 "frozen test's rows in)"
                 % (path, i, key, scored, fold["fold"]))
        if key not in scored_keys:
            fail("forecast file %s: entry %d forecasts %r, but no such "
                 "person-season row exists in the rows file" % (path, i, key))
        if key in fmap:
            fail("forecast file %s: duplicate forecast for %r" % (path, key))
        fc = e.get("forecast")
        if not isinstance(fc, dict):
            fail("forecast file %s: entry %d has no 'forecast' object"
                 % (path, i))
        vals = {}
        for s in STATS:
            v = fc.get(s)
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                fail("forecast file %s: entry %d (%r) is missing stat "
                     "%s or it is not a number" % (path, i, key, s))
            if not math.isfinite(v):
                fail("forecast file %s: entry %d (%r) has a non-finite "
                     "value for %s" % (path, i, key, s))
            vals[s] = float(v)
        if set(fc.keys()) != set(STATS):
            fail("forecast file %s: entry %d (%r) forecast keys must be "
                 "exactly the 14 stats, got %r"
                 % (path, i, key, sorted(fc.keys())))
        neighbors = e.get("neighbors")
        if neighbors is not None:
            if not isinstance(neighbors, list) or any(
                    not isinstance(n, str) for n in neighbors):
                fail("forecast file %s: entry %d 'neighbors' must be a "
                     "list of person_ids" % (path, i))
            if pid in neighbors:
                fail("forecast file %s: entry %d (%r) builds its "
                     "forecast from the target player himself "
                     "(whole-person self exclusion violated)"
                     % (path, i, key))
        else:
            retrieval_checked = False
        fmap[key] = vals
    missing = sorted(scored_keys - set(fmap.keys()))
    if missing:
        fail("forecast file %s: %d scored rows have no forecast "
             "(missing forecasts fail loud; dropping hard rows would "
             "flatter MAE). First missing: %r"
             % (path, len(missing), missing[:5]))
    if retrieval_checked:
        retrieval_notes.append("whole-person self exclusion verified "
                               "from neighbors lists on all entries")
    else:
        retrieval_notes.append("not_verifiable_from_file: some entries "
                               "carry no neighbors list, so retrieval "
                               "exclusion (if any retrieval was used) "
                               "must be attested by provenance, not "
                               "claimed from this file")
    return model, space, fmap, retrieval_notes


def score_cohort(pairs):
    """Score one cohort. pairs = list of (actual dict, forecast dict).

    Single code path for every model and baseline. Returns the
    per-stat block plus mean MAE / mean R2, or a null block with a
    reason when the cohort is empty.
    """
    if not pairs:
        return {"n": 0, "per_stat": {}, "mean_mae": None, "mean_r2": None,
                "reason": "empty cohort: null, never 0"}
    per_stat = {}
    for s in STATS:
        errs = [abs(f[s] - a[s]) for a, f in pairs]
        mae = sum(errs) / len(errs)
        actuals = [a[s] for a, f in pairs]
        mean_a = sum(actuals) / len(actuals)
        ss_tot = sum((a - mean_a) ** 2 for a in actuals)
        ss_res = sum((f[s] - a[s]) ** 2 for a, f in pairs)
        if len(pairs) < 2 or ss_tot == 0:
            r2 = None
        else:
            r2 = 1.0 - ss_res / ss_tot
        per_stat[s] = {"mae": mae, "r2": r2, "n": len(pairs)}
    mean_mae = sum(v["mae"] for v in per_stat.values()) / len(STATS)
    r2s = [v["r2"] for v in per_stat.values() if v["r2"] is not None]
    mean_r2 = sum(r2s) / len(r2s) if r2s else None
    return {"n": len(pairs), "per_stat": per_stat,
            "mean_mae": mean_mae, "mean_r2": mean_r2}


def paired_bootstrap(pairs_a, pairs_b, samples, seed=7):
    """Paired bootstrap on mean-MAE difference (A minus B).

    pairs_a / pairs_b are aligned lists of (actual, forecast) for the
    SAME rows in the SAME order. Returns mean difference, 95%
    percentile interval, and the fraction of resamples where A wins.
    """
    if len(pairs_a) != len(pairs_b):
        fail("paired bootstrap: compared files cover different row sets")
    n = len(pairs_a)
    if n < 2:
        fail("paired bootstrap: need at least 2 rows, got %d" % n)

    def mean_mae(pairs, idx):
        tot = 0.0
        for s in STATS:
            tot += sum(abs(pairs[i][1][s] - pairs[i][0][s]) for i in idx) / n
        return tot / len(STATS)

    rng = random.Random(seed)
    diffs = []
    for _ in range(samples):
        idx = [rng.randrange(n) for _ in range(n)]
        diffs.append(mean_mae(pairs_a, idx) - mean_mae(pairs_b, idx))
    diffs.sort()
    lo = diffs[int(0.025 * len(diffs))]
    hi = diffs[int(0.975 * len(diffs)) - 1] if len(diffs) > 1 else diffs[0]
    frac_a_wins = sum(1 for d in diffs if d < 0) / len(diffs)
    return {"mean_diff": sum(diffs) / len(diffs),
            "ci_95": [lo, hi],
            "frac_resamples_a_wins": frac_a_wins,
            "samples": samples, "seed": seed,
            "excludes_zero": lo > 0 or hi < 0}


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Moonshot forecast eval harness (DRAFT -- py_compile "
                    "only in this pass; never run on real data here).")
    ap.add_argument("--rows", required=True, help="person_id-enriched rows file")
    ap.add_argument("--fold-manifest", required=True, help="Lane 3 fold manifest")
    ap.add_argument("--fold", required=True, choices=["fold1", "fold2", "final"],
                    help="one fold per invocation")
    ap.add_argument("--forecasts", required=True, help="forecast file to score")
    ap.add_argument("--compare", default=None,
                    help="second forecast file for a paired comparison")
    ap.add_argument("--bootstrap-samples", type=int, default=1000,
                    help="paired bootstrap resamples (only with --compare)")
    ap.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args(argv)
    try:
        rows = validate_rows(load_json(args.rows, "rows file"), args.rows)
        manifest = validate_manifest(
            load_json(args.fold_manifest, "fold manifest"), rows, args.fold_manifest)
        fold = manifest.get(args.fold)
        if fold is None:
            fail("fold manifest %s has no fold %r (has %r)"
                 % (args.fold_manifest, args.fold, sorted(manifest.keys())))
        scored, cohort_name = scored_seasons(fold)
        rows_by_key = {(r["person_id"], r["season"]): r for r in rows}
        train_persons = set()
        for s in fold["train_seasons"]:
            for r in rows:
                if r["season"] == s:
                    train_persons.add(r["person_id"])
        scored_rows = [r for r in rows if r["season"] in scored]
        model, space, fmap, retrieval_notes = validate_forecasts(
            load_json(args.forecasts, "forecast file"), rows_by_key,
            scored, fold, args.forecasts)
        pairs = [(r["stats"], fmap[(r["person_id"], r["season"])])
                 for r in scored_rows]
        new_pairs = [(r["stats"], fmap[(r["person_id"], r["season"])])
                     for r in scored_rows
                     if r["person_id"] not in train_persons]
        report = {
            "status": "DRAFT -- spec finalization waits for the panel's "
                      "moonshot verdict (CONTRACT.md SS11, SS13)",
            "headline_framing": "forecast accuracy is the headline; twin "
                                "metrics are secondary/diagnostic, never "
                                "the gate (user-directed 2026-10-26 22:32 "
                                "CDT, pending panel ratification)",
            "model": model,
            "space": space,
            "fold": args.fold,
            "cohort": cohort_name,
            "scored_seasons": scored,
            "manifest": {"path": args.fold_manifest,
                         "sha256": sha256_file(args.fold_manifest),
                         "embargo": load_json(args.fold_manifest,
                                              "fold manifest").get("embargo"),
                         "embargo_seasons": fold.get("embargo_seasons", [])},
            "rows_file": {"path": args.rows, "sha256": sha256_file(args.rows),
                          "n_rows": len(rows)},
            "forecast_file": {"path": args.forecasts,
                              "sha256": sha256_file(args.forecasts)},
            "headline": score_cohort(pairs),
            "new_player_slice": score_cohort(new_pairs),
            "new_player_definition": "person_id absent from the fold's "
                                    "post-embargo train seasons (Lane 3 "
                                    "definition); labelled embargoed "
                                    "cold-start when the manifest is "
                                    "embargoed; never blended into the "
                                    "headline",
            "retrieval_exclusion": retrieval_notes,
        }
        if args.compare:
            model2, space2, fmap2, _ = validate_forecasts(
                load_json(args.compare, "comparison forecast file"),
                rows_by_key, scored, fold, args.compare)
            if space2 != space:
                fail("comparison file space %r does not match forecast "
                     "file space %r (same space required)"
                     % (space2, space))
            pairs2 = [(r["stats"], fmap2[(r["person_id"], r["season"])])
                      for r in scored_rows]
            report["paired_comparison"] = {
                "model_a": model, "model_b": model2,
                "mean_mae_a": report["headline"]["mean_mae"],
                "mean_mae_b": score_cohort(pairs2)["mean_mae"],
                "bootstrap": paired_bootstrap(
                    pairs, pairs2, args.bootstrap_samples),
                "reading": "A beats B only when the bootstrap interval "
                           "excludes 0 on the A-wins side; a point win "
                           "inside the interval is noise, not a win.",
            }
        import os
        os.makedirs(args.out, exist_ok=True)
        out_path = os.path.join(args.out, "forecast_eval_report.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, sort_keys=True)
        print("fold=%s cohort=%s model=%s n=%d mean_mae=%.6g mean_r2=%s "
              "new_player_n=%d new_player_mean_mae=%s"
              % (args.fold, cohort_name, model,
                 report["headline"]["n"], report["headline"]["mean_mae"],
                 report["headline"]["mean_r2"],
                 report["new_player_slice"]["n"],
                 report["new_player_slice"]["mean_mae"]))
        print("report written: %s" % out_path)
        return 0
    except FailLoud as e:
        print("FAIL: %s" % e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
