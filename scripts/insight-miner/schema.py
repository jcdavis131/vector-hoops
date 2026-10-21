#!/usr/bin/env python3
"""Shared record schemas for the insight-mining pipeline (Pillar 5).

All records are plain JSON-serializable dicts. Validation here is stdlib-only
and intentionally shallow: it checks shapes and required fields, not semantics.
The editorial bar (docs/insights-engine/FRAMING.md) is enforced by humans in the
curation queue, not by this code.

Records:
  CandidateInsight -- one mined observation, with numbers + provenance + scores
  Provenance       -- model run + data vintage + input hashes behind a claim
  QueueEntry       -- a candidate inside the curation queue, with state machine
  TriggerEvent     -- a realtime trigger firing, with the delta that fired it

A note on honesty: every field that would normally be "filled in" with a guess
uses the literal string "unknown" or is omitted. "unknown" is always preferable
to an invented value. Downstream consumers must treat "unknown" as missing.
"""

from __future__ import annotations

SCHEMA_VERSION = 1

UNKNOWN = "unknown"

# Insight archetypes the miner is allowed to emit. Add new ones here + a
# mining function in miner.py; the queue and dedupe logic key off this list.
CANDIDATE_TYPES = (
    "twin_centrality",  # embedding twin-network centrality outliers
    "drift",  # season-pair embedding drift (rotation/residual spikes)
    "archetype_shift",  # archetype prevalence moves across seasons
    "playoff_swing",  # RS vs playoff performance outliers
    "trigger_event",  # fired by triggers.py, not by the batch miner
)

# Decay classes: how long a candidate stays shippable once approved.
#   realtime  -- tied to live data; expires fast (REALTIM_TTL_DAYS).
#   seasonal  -- valid until the data vintage rolls (new season lands).
#   evergreen -- historically anchored; never expires, but must be revalidated
#                whenever the serving model changes (new run_id -> re-mine).
DECAY_CLASSES = ("realtime", "seasonal", "evergreen")
REALTIME_TTL_DAYS = 7

# Curation queue states. Transitions: pending -> approved | rejected;
# approved -> retired (decayed) | retired (manual). Rejected is terminal.
QUEUE_STATES = ("pending", "approved", "rejected", "retired", "expired")

TRIGGER_TYPES = (
    "twin_network_shift",  # live twin set diverged from served baseline
    "uniqueness_move",  # era-uniqueness score moved past threshold
    "drift_spike",  # new season-pair rotation past historical p95
    "archetype_emergence",  # archetype share moved past threshold
)


def _req(d: dict, *keys: str) -> list[str]:
    return [k for k in keys if k not in d]


def validate_provenance(p: dict) -> list[str]:
    """Return a list of problems with a Provenance record (empty = valid)."""
    if not isinstance(p, dict):
        return ["provenance must be a dict"]
    problems = _req(p, "schema", "model", "inputs", "computed_at")
    model = p.get("model")
    if isinstance(model, dict):
        problems += [f"model.{k}" for k in _req(model, "model_id", "run_id")]
    else:
        problems.append("model must be a dict")
    for i, inp in enumerate(p.get("inputs", [])):
        if not isinstance(inp, dict) or "path" not in inp or "sha256" not in inp:
            problems.append(f"inputs[{i}] must have path + sha256")
    return problems


def validate_candidate(c: dict) -> list[str]:
    """Return a list of problems with a CandidateInsight record (empty = valid)."""
    if not isinstance(c, dict):
        return ["candidate must be a dict"]
    problems = _req(
        c,
        "schema",
        "id",
        "type",
        "question_draft",
        "numbers",
        "method",
        "entities",
        "provenance",
        "scores",
        "dedupe_key",
        "decay_class",
        "status",
    )
    if c.get("type") not in CANDIDATE_TYPES:
        problems.append(f"type must be one of {CANDIDATE_TYPES}")
    if c.get("decay_class") not in DECAY_CLASSES:
        problems.append(f"decay_class must be one of {DECAY_CLASSES}")
    numbers = c.get("numbers", [])
    if not isinstance(numbers, list) or not numbers:
        problems.append("numbers must be a non-empty list")
    for i, n in enumerate(numbers if isinstance(numbers, list) else []):
        if not isinstance(n, dict) or "value" not in n or "label" not in n:
            problems.append(f"numbers[{i}] must have value + label")
    if isinstance(c.get("provenance"), dict):
        problems += [f"provenance.{p}" for p in validate_provenance(c["provenance"])]
    return problems


def validate_queue_entry(e: dict) -> list[str]:
    if not isinstance(e, dict):
        return ["queue entry must be a dict"]
    problems = _req(e, "id", "state", "state_history", "candidate")
    if e.get("state") not in QUEUE_STATES:
        problems.append(f"state must be one of {QUEUE_STATES}")
    if isinstance(e.get("candidate"), dict):
        problems += [f"candidate.{p}" for p in validate_candidate(e["candidate"])]
    return problems


def validate_trigger_event(t: dict) -> list[str]:
    if not isinstance(t, dict):
        return ["trigger event must be a dict"]
    problems = _req(
        t, "schema", "trigger_id", "type", "detected_at", "entities", "delta", "provenance", "dedupe_key", "expires_at"
    )
    if t.get("type") not in TRIGGER_TYPES:
        problems.append(f"type must be one of {TRIGGER_TYPES}")
    if isinstance(t.get("provenance"), dict):
        problems += [f"provenance.{p}" for p in validate_provenance(t["provenance"])]
    return problems


def dedupe_key_for(insight_type: str, metric: str, entity_keys: list[str]) -> str:
    """Stable dedupe key: type + metric + sorted entity keys.

    entity_keys are caller-chosen stable identifiers, e.g. "ps:8752"
    (player-season id) or "season:1996-97>1997-98". Two records with the
    same key describe the same claim and must dedupe against each other.
    """
    return f"{insight_type}:{metric}:{','.join(sorted(entity_keys))}"
