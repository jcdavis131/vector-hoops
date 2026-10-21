# Incident runbook — Vector Hoops

Owner: Pillar 7 (platform plumbing). Last reviewed: 2026-10-20.

## What counts as an incident

- The site or a core surface (`/`, `/play`, `/live`, `/insights`) is down or broken.
- `/status` shows `incident` (served-model lineage check failing) or stays `degraded`
  past one scheduled refresh.
- Data is wrong in a way players can see (stale labeled fresh, invented numbers,
  wrong scores on `/live`).
- A cost budget blows through its kill-switch threshold.
- A security issue: CSP violations spiking, XSS report, leaked secret.

Not an incident: a single flaky cron run, a budget-gate failure on a PR branch,
pre-launch review findings.

## Severity

| Level | Meaning | Response |
|---|---|---|
| S1 | Site down / data wrong for all visitors | Drop everything; rollback first, diagnose second |
| S2 | Degraded (feature broken, site up) | Fix forward or rollback within the day |
| S3 | Cosmetic / single-surface issue | Normal PR flow |

## Detection

1. **`/status`** — the public page; `scripts/build_status.py --check` in CI-adjacent
   automation. Overall `incident`/`degraded` is the first signal.
2. **CI gates** — ruff, budget gates, site smoke tests, served-model lineage check.
   A red gate on master is an S2 until proven otherwise.
3. **Heartbeat checks** — the standing 30-minute checklist watches origin/master parity
   and the served surface.
4. **User reports** — inbox/Slack #agent-ops; every report gets a reply, even "known issue".

## Response

1. **Assess (5 min):** open `/status`, check the failing check's detail. S1 or S2?
2. **Communicate:** one message in #agent-ops: what's broken, severity, who's on it.
   Update `/status` incident history (add to `build_status.py`'s incidents list —
   currently empty by design).
3. **Mitigate before root-causing:**
   - Bad deploy → **Vercel instant rollback** to the last good deployment (dashboard →
     Deployments → Promote previous). No code fix needed to stop the bleeding.
   - Bad data push → revert the data commit; the site's `check_site_facts` /
     `stamp_assets --check` gates will tell you which commit moved.
   - ESPN feed down → nothing to do; `/live` degrades to last-known by design
     (honest 503 philosophy). Confirm the degraded card is showing, not invented scores.
   - CSP blocking legit traffic → widen the directive minimally, re-verify with the
     audit (`csp-inline-audit.md` pattern), redeploy.
4. **Fix forward** on a `scout/` branch with the normal gates; **never push to master
   outside the rollback path** without his word.
5. **Close the loop:** resolve the `/status` incident entry, write the what/why/fix/prevents
   note, and link it from the incident history.

## Known sharp edges (documented, not resolved here)

- **Served-model lineage is a forced adoption.** `check_served_model.py` passes, but with
  override warnings: the July 2026 v5 incumbent was adopted with `--force`, and the
  original `promote.py` run files are not in this repo. If this check ever FAILS, do not
  "fix" it by re-forcing — that destroys the audit trail. **Cameron's decision:** find
  the original run files or order a deliberate replacement champion (mandala open
  decision 4). Pillar 1 owns the registry work; this runbook only says: surface it,
  don't paper over it.
- **Single-model serving policy is unchanged.** No challenger may be promoted to the
  served slot without a held-out win and his word.
- **Deployment Protection (SSO) is ON for `*.vercel.app`.** Never claim "live" until a
  cache-busted fetch of the production URL confirms the new bytes.

## Contacts / escalation

- Primary: Scout (this repo's operator) via #agent-ops.
- Final call on rollbacks, promotions, and anything touching money or reputation:
  **Cameron** — his word required (merges, releases, redeployments, production
  promotions need explicit approval; standing rule).
- Claude seat sessions are tracked read-only; do not task them in an incident.

## After-action

Within 48h of an S1/S2: one page — timeline, what/why/fix/prevents, and which gate or
check would have caught it earlier. If the answer is "a new gate", the gate ships with
the writeup.
