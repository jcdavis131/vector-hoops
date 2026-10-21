#!/usr/bin/env python3
"""cdn.nba.com shot-chart source -- GATED (honest 503).

GATE_REASON:
  Probed 2026-10-21 (recon): GET https://cdn.nba.com/static/json/liveData/*
  returns HTTP 403 "Access Denied" served by Akamai Bot Manager. The block is
  fingerprint/behavior-based edge enforcement, not a transient error and not
  a missing resource. Per the no-evasion rule, probing stopped here -- no
  header rotation, residential egress, or headless-browser workaround was
  attempted, and none will be.

RETRY_PROCEDURE:
  Re-probe ONLY if the access posture changes (e.g. NBA publishes an open
  data endpoint or grants this project's egress). The probe is a single
  plain GET with a standard UA; if it ever returns 200 with JSON, this stub
  may be promoted to a real source module behind the same 5-stage contract.
  Cadence: re-probe at most quarterly, or on a concrete announcement -- not
  on a timer. Until then this module stays a stub; the dispatcher exits 3.
"""

from common.errors import GateError

SOURCE = "nba_cdn"
GATED = True

GATE_REASON = __doc__.split("RETRY_PROCEDURE:")[0].split("GATE_REASON:")[1].strip()
RETRY_PROCEDURE = __doc__.split("RETRY_PROCEDURE:")[1].strip()

_GAP = f"{GATE_REASON}\n\nRETRY: {RETRY_PROCEDURE}"


def _blocked(stage: str):
    raise GateError(f"[{SOURCE}] {stage}: gated (honest 503).\n{_GAP}")


def fetch(date, resume, dirs):
    _blocked("fetch")


def validate(date, dirs):
    _blocked("validate")


def normalize(date, dirs):
    _blocked("normalize")


def snapshot(date, dirs, records, qa):
    _blocked("snapshot")


def publish(date, dirs):
    _blocked("publish")
