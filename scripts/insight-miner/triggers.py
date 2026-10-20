#!/usr/bin/env python3
"""Realtime insight triggers (Pillar 5).

Trigger types (see docs/insights-engine/TRIGGERS.md for the full design):

  twin_network_shift -- a player's live twin set diverges from the served
                        baseline: "SGA's twin network just shifted."
  uniqueness_move   -- a player's era-uniqueness score moves past threshold
  drift_spike       -- a new season-pair rotation exceeds the historical p95
  archetype_emergence -- an archetype's share moves past threshold

Architecture: triggers are PURE functions over (old_snapshot, new_snapshot).
Snapshots are plain dicts; the realtime data plane (Pillar 2, scripts/realtime/*)
is responsible for producing them. This module only defines the trigger math,
the event record format, and the adapter contract -- so triggers stay testable
without a live feed and honest when the feed is down.

Feed contract (Pillar 2 provides, when it lands):
  assets/realtime/snapshot-<ts>.json  -- {"twins": {pid: [neighbor pids]},
                                          "uniqueness": {pid: score}, ...}
  If the snapshot file is absent or stale, load_live_snapshot() returns
  (None, "feed unavailable: <reason>") and the CLI exits 0 reporting that --
  a missing feed is an honest 503, never a silent zero.

The --demo mode evaluates triggers on real historical snapshots (last two
archetype seasons, last two drift pairs) so the math is verifiable today.
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import sys
from pathlib import Path

import provenance
from schema import (
    REALTIME_TTL_DAYS,
    SCHEMA_VERSION,
    UNKNOWN,
    dedupe_key_for,
    validate_trigger_event,
)

REPO = Path(__file__).resolve().parents[2]
REALTIME_DIR = REPO / "assets" / "realtime"
STALE_AFTER_MIN = 60  # snapshot older than this is "last known", not live

DEFAULT_THRESHOLDS = {
    "twin_network_shift": {"jaccard_below": 0.5, "min_overlap_drop": 0.2},
    "uniqueness_move": {"abs_move": 8.0},  # era-uniqueness is 0-100
    "drift_spike": {"percentile": 95},
    "archetype_emergence": {"abs_share_move": 0.02},  # 2 percentage points
}


def _now() -> str:
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _event(trigger_type, trigger_id, entities, delta, vintage, inputs, dedupe_entities) -> dict:
    expires = dt.datetime.now(dt.UTC) + dt.timedelta(days=REALTIME_TTL_DAYS)
    ev = {
        "schema": SCHEMA_VERSION,
        "trigger_id": trigger_id,
        "type": trigger_type,
        "detected_at": _now(),
        "entities": entities,
        "delta": delta,
        "provenance": provenance.build(vintage, inputs),
        "dedupe_key": dedupe_key_for("trigger_event", trigger_type, dedupe_entities),
        "expires_at": expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "decay_class": "realtime",
    }
    problems = validate_trigger_event(ev)
    if problems:
        raise ValueError(f"invalid trigger event: {problems}")
    return ev


# ---------------------------------------------------------------------------
# Pure trigger evaluations: (old_snapshot, new_snapshot) -> [TriggerEvent]
# ---------------------------------------------------------------------------

def eval_twin_network_shift(old_twins: dict, new_twins: dict, thresholds: dict, vintage: str) -> list[dict]:
    """Fire when a player's twin set overlap drops below threshold.

    old_twins / new_twins: {player_key: [neighbor keys]}. Overlap measured by
    Jaccard similarity of the neighbor sets. Fires only when the set got
    *smaller in overlap* (a genuinely shifted network), not when it merely
    reordered.
    """
    jb = thresholds.get("jaccard_below", 0.5)
    events = []
    for pid, new_set in new_twins.items():
        old_set = old_twins.get(pid)
        if old_set is None:
            continue  # new player in the feed: not a shift, skip (no false fire)
        sim = jaccard(set(old_set), set(new_set))
        if sim < jb:
            events.append(
                _event(
                    "twin_network_shift",
                    f"twin-network-shift-{pid}-{_now()}",
                    [{"kind": "player", "name": str(pid)}],
                    {
                        "jaccard": round(sim, 3),
                        "threshold": jb,
                        "old_size": len(old_set),
                        "new_size": len(new_set),
                    },
                    vintage,
                    [],
                    [f"player:{pid}"],
                )
            )
    return events


def eval_uniqueness_move(old_u: dict, new_u: dict, thresholds: dict, vintage: str) -> list[dict]:
    """Fire when a player's era-uniqueness (0-100) moves past threshold."""
    thr = thresholds.get("abs_move", 8.0)
    events = []
    for pid, new_score in new_u.items():
        old_score = old_u.get(pid)
        if old_score is None or not isinstance(new_score, (int, float)):
            continue
        move = abs(new_score - old_score)
        if move >= thr:
            events.append(
                _event(
                    "uniqueness_move",
                    f"uniqueness-move-{pid}-{_now()}",
                    [{"kind": "player", "name": str(pid)}],
                    {
                        "old": round(old_score, 2),
                        "new": round(new_score, 2),
                        "move": round(move, 2),
                        "threshold": thr,
                    },
                    vintage,
                    [],
                    [f"player:{pid}"],
                )
            )
    return events


def eval_drift_spike(pairs: list[dict], thresholds: dict, vintage: str) -> list[dict]:
    """Fire when the newest season-pair rotation exceeds the historical p95.

    Pure function over the drift.json pairs list -- usable the moment a new
    season pair is appended, no live feed required.
    """
    if len(pairs) < 4:
        return []  # not enough history for a percentile; honest no-fire
    pct = thresholds.get("percentile", 95)
    rots = sorted(p.get("rotationDeg", 0) or 0 for p in pairs[:-1])
    idx = min(len(rots) - 1, int(pct / 100 * len(rots)))
    cutoff = rots[idx]
    newest = pairs[-1]
    if (newest.get("rotationDeg", 0) or 0) > cutoff:
        return [
            _event(
                "drift_spike",
                f"drift-spike-{newest.get('to', UNKNOWN)}-{_now()}",
                [
                    {
                        "kind": "season_pair",
                        "name": f"{newest.get('from')} to {newest.get('to')}",
                        "season": newest.get("to", UNKNOWN),
                    }
                ],
                {
                    "rotation_deg": round(newest.get("rotationDeg", 0), 2),
                    "p95_cutoff": round(cutoff, 2),
                    "history_pairs": len(rots),
                },
                vintage,
                ["assets/drift.json"],
                [f"pair:{newest.get('from')}>{newest.get('to')}"],
            )
        ]
    return []


def eval_archetype_emergence(prev: dict, last: dict, thresholds: dict, vintage: str) -> list[dict]:
    """Fire when any archetype's share moved past threshold between seasons."""
    thr = thresholds.get("abs_share_move", 0.02)
    names = last.get("names", [])
    events = []
    shares_prev = prev.get("shares", [])
    shares_last = last.get("shares", [])
    for i, (o, n) in enumerate(zip(shares_prev, shares_last)):
        move = abs(n - o)
        if move >= thr:
            label = names[i] if i < len(names) else f"archetype {i}"
            events.append(
                _event(
                    "archetype_emergence",
                    f"archetype-emergence-{i}-{last.get('season', UNKNOWN)}",
                    [
                        {"kind": "archetype", "name": str(label)},
                        {
                            "kind": "season_pair",
                            "name": f"{prev.get('season')} to {last.get('season')}",
                            "season": last.get("season", UNKNOWN),
                        },
                    ],
                    {
                        "old_share": round(o, 4),
                        "new_share": round(n, 4),
                        "move_pp": round(move * 100, 2),
                        "threshold_pp": round(thr * 100, 2),
                    },
                    vintage,
                    ["assets/archetypes_time.json"],
                    [f"arch:{label}", f"season:{last.get('season')}"],
                )
            )
    return events


# ---------------------------------------------------------------------------
# Feed adapter (Pillar 2 contract). Honest when the feed is absent.
# ---------------------------------------------------------------------------

def load_live_snapshot() -> tuple[dict | None, str | None]:
    """Return (snapshot, None) or (None, reason). Never raises on feed issues."""
    pattern = str(REALTIME_DIR / "snapshot-*.json")
    files = sorted(glob.glob(pattern))
    if not files:
        return None, "feed unavailable: no snapshots in assets/realtime/ (Pillar 2 lane pending)"
    latest = Path(files[-1])
    try:
        mtime = dt.datetime.fromtimestamp(latest.stat().st_mtime, tz=dt.UTC)
    except OSError as e:
        return None, f"feed unavailable: cannot stat {latest}: {e}"
    age_min = (dt.datetime.now(dt.UTC) - mtime).total_seconds() / 60
    if age_min > STALE_AFTER_MIN:
        return None, f"feed stale: newest snapshot is {age_min:.0f} min old (> {STALE_AFTER_MIN} min)"
    try:
        with open(latest, encoding="utf-8") as f:
            return json.load(f), None
    except (OSError, json.JSONDecodeError) as e:
        return None, f"feed unreadable: {latest}: {e}"


def load_baseline_snapshot() -> tuple[dict | None, str | None]:
    """Served baseline twins, from the last miner run's twin tables if present."""
    path = REPO / "assets" / "twin_baseline_snapshot.json"
    if not path.exists():
        return None, "no served baseline snapshot (assets/twin_baseline_snapshot.json)"
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f), None
    except (OSError, json.JSONDecodeError) as e:
        return None, f"baseline unreadable: {e}"


# ---------------------------------------------------------------------------
# Demo: evaluate drift/archetype triggers on real historical data.
# ---------------------------------------------------------------------------

def demo() -> dict:
    """Run drift_spike + archetype_emergence on real repo data. Returns report."""
    report: dict = {"events": [], "notes": []}
    drift_path = REPO / "assets" / "drift.json"
    try:
        with open(drift_path, encoding="utf-8") as f:
            drift = json.load(f)
        pairs = drift.get("pairs", [])
        report["events"] += eval_drift_spike(
            pairs, DEFAULT_THRESHOLDS["drift_spike"], "demo: drift.json through latest pair"
        )
        report["notes"].append(f"drift_spike: evaluated {len(pairs)} season pairs")
    except (OSError, json.JSONDecodeError) as e:
        report["notes"].append(f"drift_spike skipped: {e}")

    arch_path = REPO / "assets" / "archetypes_time.json"
    try:
        with open(arch_path, encoding="utf-8") as f:
            arch = json.load(f)
        prev_list = arch.get("prevalence", [])
        if len(prev_list) >= 2:
            prev = dict(prev_list[-2], names=arch.get("globalArchetypes", []))
            last = dict(prev_list[-1], names=arch.get("globalArchetypes", []))
            report["events"] += eval_archetype_emergence(
                prev, last, DEFAULT_THRESHOLDS["archetype_emergence"], "demo: archetypes_time.json latest seasons"
            )
            report["notes"].append(
                f"archetype_emergence: evaluated {prev_list[-2]['season']} -> {prev_list[-1]['season']}"
            )
        else:
            report["notes"].append("archetype_emergence skipped: <2 seasons")
    except (OSError, json.JSONDecodeError) as e:
        report["notes"].append(f"archetype_emergence skipped: {e}")
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Evaluate realtime insight triggers.")
    ap.add_argument("--demo", action="store_true", help="evaluate on real historical data (no live feed needed)")
    ap.add_argument("--out", default=None, help="write fired events as JSON here")
    args = ap.parse_args(argv)

    if args.demo:
        report = demo()
        print(f"demo: {len(report['events'])} events fired")
        for n in report["notes"]:
            print(f"  note: {n}")
        for e in report["events"]:
            print(f"  FIRED {e['type']}: {e['trigger_id']} delta={json.dumps(e['delta'])}")
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(report["events"], f, indent=2)
            print(f"  wrote {args.out}")
        return 0

    live, reason = load_live_snapshot()
    if live is None:
        print(reason)
        print("status: no triggers evaluated -- honest 503 path, not a silent zero")
        return 0
    baseline, reason = load_baseline_snapshot()
    if baseline is None:
        print(reason)
        print("status: no baseline to compare against -- cannot evaluate twin shifts")
        return 0
    events = eval_twin_network_shift(
        baseline.get("twins", {}), live.get("twins", {}), DEFAULT_THRESHOLDS["twin_network_shift"], "live feed"
    ) + eval_uniqueness_move(
        baseline.get("uniqueness", {}), live.get("uniqueness", {}), DEFAULT_THRESHOLDS["uniqueness_move"], "live feed"
    )
    print(f"live: {len(events)} events fired")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(events, f, indent=2)
        print(f"  wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
