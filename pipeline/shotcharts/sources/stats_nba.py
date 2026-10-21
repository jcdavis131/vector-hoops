#!/usr/bin/env python3
"""stats.nba.com shot-chart source -- GATED (honest 503).

GATE_REASON:
  Probed 2026-10-21 (recon): every request under /stats/* (incl.
  /stats/shotchartdetail) tarpits to HTTP 000 -- the TCP/TLS handshake never
  completes from this environment. This is path-level bot-drop, not a generic
  outage: the site root (stats.nba.com/) returns HTTP 200 fine while /stats/*
  hangs until client timeout. Per the no-evasion rule, probing stopped here.

  LEGAL/ToS POSTURE: stats.nba.com's terms of use restrict automated access
  to the stats endpoints. Even a working technical path needs a ToS review
  before any fetch is wired -- a technical fix alone does not clear the gate.

RETRY_PROCEDURE:
  Re-probe ONLY if the access posture changes (e.g. an approved API key or
  an official data feed). Technical path worth trying then: extend
  pipeline/nba_http.py (warmed session + browser headers + jittered backoff)
  to the shotchartdetail endpoint and re-run the recon probe. Do NOT rotate
  IPs, spoof fingerprints, or otherwise evade the bot-drop -- the gate is
  deliberate. Until then this module stays a stub and the dispatcher exits 3.
"""

from common.errors import GateError

SOURCE = "stats_nba"
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
