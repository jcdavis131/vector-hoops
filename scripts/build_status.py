#!/usr/bin/env python3
"""build_status.py -- regenerate the public /status page snapshot from repo evidence.

Reads only facts the repo can prove (git state, site_facts.json, the
served-model check, vercel.json headers). Unknowns are reported as
"unknown", stale as "last known" -- never invented.

Writes:
  assets/status.json   machine-readable snapshot
  status.html          replaces the <!--STATUS-SNAPSHOT--> marker with the
                       rendered snapshot (hand-written template above/below it)

Usage:
  python scripts/build_status.py            # regenerate
  python scripts/build_status.py --check     # fail if snapshot is stale

Stdlib only. ruff clean.
"""

from __future__ import annotations

import argparse
import html
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_MARKER = "<!--STATUS-SNAPSHOT-->"


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return ""


def served_model_state() -> dict:
    """Run the repo's own lineage check; capture pass/fail + warning lines."""
    try:
        proc = subprocess.run(
            [sys.executable, "scripts/check_served_model.py"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as exc:
        return {"state": "unknown", "detail": f"check could not run: {exc}"}
    out = (proc.stdout + proc.stderr).strip()
    warnings = [line for line in out.splitlines() if "warning" in line.lower() or "forced" in line.lower()]
    if proc.returncode == 0:
        return {
            "state": "pass",
            "detail": out.splitlines()[-1] if out else "check passed",
            "warnings": warnings[:4],
        }
    return {
        "state": "fail",
        "detail": out[-800:] if out else "check failed with no output",
        "warnings": warnings[:4],
    }


def site_facts() -> dict:
    path = ROOT / "assets" / "site_facts.json"
    if not path.exists():
        return {}
    try:
        return json.load(path.open(encoding="utf-8")).get("facts", {})
    except Exception:
        return {}


def csp_enforcing() -> str:
    try:
        cfg = json.load((ROOT / "vercel.json").open(encoding="utf-8"))
    except Exception:
        return "unknown"
    for rule in cfg.get("headers", []):
        for h in rule.get("headers", []):
            if h.get("key") == "Content-Security-Policy":
                return "enforcing"
            if h.get("key") == "Content-Security-Policy-Report-Only":
                return "report-only"
    return "unknown"


def build() -> dict:
    facts = site_facts()
    model = served_model_state()
    commit = git("rev-parse", "--short", "HEAD") or "unknown"
    commit_date = git("log", "-1", "--format=%ci") or "unknown"

    checks = []
    if model["state"] == "fail":
        checks.append(("Model serving", "bad", "lineage check failing"))
    elif model["state"] == "unknown":
        checks.append(("Model serving", "na", "check could not run"))
    elif model.get("warnings"):
        checks.append(("Model serving", "warn", "pass with lineage override flags"))
    else:
        checks.append(("Model serving", "ok", "lineage check passing"))
    checks.append(("Site facts", "ok" if facts else "na", f"{len(facts)} facts" if facts else "not built"))

    overall = "operational"
    if any(s == "bad" for _, s, _ in checks):
        overall = "incident"
    elif any(s in ("warn", "na") for _, s, _ in checks):
        overall = "degraded"

    return {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "overall": overall,
        "deploy": {
            "commit": commit,
            "commit_date": commit_date,
            "csp": csp_enforcing(),
        },
        "data": {
            "model_name": facts.get("model_name", "unknown"),
            "model_built": facts.get("model_built", "unknown"),
            "seasons": f"{facts.get('season_first', '?')}–{facts.get('season_last', '?')}" if facts else "unknown",
            "player_seasons": facts.get("player_seasons", "unknown"),
            "players": facts.get("players", "unknown"),
        },
        "model_serving": {
            "state": model["state"],
            "detail": model.get("detail", "unknown"),
            "flags": model.get("warnings", []),
            "note": (
                "Lineage records a forced adoption of the July 2026 v5 "
                "incumbent; the original promote.py run files are not in "
                "this repo. Find the run files or order a replacement "
                "champion — Cameron's decision."
            ),
        },
        "feed_health": {
            "state": "unknown",
            "detail": "No feed-health source wired yet (Pillar 2 realtime plane owns this).",
        },
        "incidents": [],
        "checks": [{"name": n, "state": s, "note": note} for n, s, note in checks],
    }


def render(snapshot: dict) -> str:
    e = html.escape

    def pill(state: str, label: str) -> str:
        return f'<span class="st__pill st__pill--{state}">{e(label)}</span>'

    dot = {"operational": "ok", "degraded": "warn", "incident": "bad"}[snapshot["overall"]]
    banner_label = {
        "operational": "All systems operational",
        "degraded": "Degraded — see flags below",
        "incident": "Incident — see below",
    }[snapshot["overall"]]

    d = snapshot["deploy"]
    data = snapshot["data"]
    ms = snapshot["model_serving"]
    fh = snapshot["feed_health"]

    def row(k: str, v: object) -> str:
        v = "unknown" if v is None else v
        return f'<div class="st__row"><span class="st__k">{e(k)}</span><span class="st__v">{e(str(v))}</span></div>'

    model_pill = {"pass": pill("ok", "pass"), "fail": pill("bad", "fail"), "unknown": pill("na", "unknown")}[
        ms["state"]
    ]
    flags = "".join(f"<li><code>{e(w[:160])}</code></li>" for w in ms.get("flags", []))
    flags_html = f"<ul>{flags}</ul>" if flags else ""
    incidents = snapshot["incidents"]
    inc_html = (
        "<p>No incidents recorded.</p>"
        if not incidents
        else "".join(f"<p><b>{e(i.get('date', ''))}</b> — {e(i.get('summary', ''))}</p>" for i in incidents)
    )

    return f"""
  <div class="st__banner" role="status">
    <span class="st__dot st__dot--{dot}" aria-hidden="true"></span>
    <div>
      <strong>{e(banner_label)}</strong><br/>
      <span style="color:var(--muted);font-size:13px">Snapshot {e(snapshot["generated_at"])} UTC</span>
    </div>
  </div>
  <div class="st__grid">
    <section class="st__card" aria-label="Site and deploy">
      <h2>Site &amp; deploy</h2>
      {row("Commit", d["commit"])}
      {row("Commit date", d["commit_date"])}
      {row("CSP", d["csp"])}
    </section>
    <section class="st__card" aria-label="Data freshness">
      <h2>Data</h2>
      {row("Model", data["model_name"])}
      {row("Model built", data["model_built"])}
      {row("Seasons", data["seasons"])}
      {row("Player-seasons", data["player_seasons"])}
      {row("Players", data["players"])}
    </section>
    <section class="st__card" aria-label="Model serving">
      <h2>Model serving</h2>
      <div class="st__row"><span class="st__k">Lineage check</span>
        <span class="st__v">{model_pill}</span></div>
      {row("Champion", "MTNN v5 (single-model policy)")}
      {flags_html}
      <p style="color:var(--muted);font-size:13px">{e(ms["note"])}</p>
    </section>
    <section class="st__card" aria-label="Feed health">
      <h2>Feed health</h2>
      <div class="st__row"><span class="st__k">Realtime feeds</span>
        <span class="st__v">{pill("na", fh["state"])}</span></div>
      <p style="color:var(--muted);font-size:13px">{e(fh["detail"])}</p>
    </section>
    <section class="st__card" aria-label="Incident history">
      <h2>Incidents</h2>
      {inc_html}
    </section>
  </div>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if the rendered snapshot is stale")
    args = ap.parse_args()

    page = ROOT / "status.html"
    if SNAPSHOT_MARKER not in page.read_text(encoding="utf-8"):
        print("FAIL status.html lost its snapshot marker")
        return 1

    snapshot = build()

    if args.check:
        stored_path = ROOT / "assets" / "status.json"
        current = page.read_text(encoding="utf-8")
        m = current.partition("Snapshot ")[2].split(" UTC")[0].strip()
        if not stored_path.exists() or not m:
            print("FAIL status snapshot missing — run scripts/build_status.py")
            return 1
        stored = json.load(stored_path.open(encoding="utf-8")).get("generated_at", "")
        if m != stored:
            print(
                f"FAIL status snapshot stale (page: {m or 'none'}, "
                f"status.json: {stored or 'none'}) — run scripts/build_status.py"
            )
            return 1
        print("OK   status snapshot current —", snapshot["generated_at"])
        return 0

    rendered = render(snapshot)

    (ROOT / "assets" / "status.json").write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    text = page.read_text(encoding="utf-8")
    head, _, tail = text.partition(SNAPSHOT_MARKER)
    # drop any previously rendered snapshot between marker and the footer paragraph
    rest = tail
    foot = '<p class="st__foot">'
    fi = rest.find(foot)
    rest = rest[fi:] if fi != -1 else rest
    page.write_text(head + SNAPSHOT_MARKER + rendered + rest, encoding="utf-8")
    print("wrote assets/status.json + status.html snapshot —", snapshot["generated_at"], f"({snapshot['overall']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
