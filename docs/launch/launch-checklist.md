# Launch Checklist

Every launch surface gets one checklist. Copy this file to
`docs/launch/<surface>-<date>.md`, fill every line, attach the security
audit, get his word, ship, then verify against the served bytes.

Rules: unknown fields are "unknown" — never invented. A data QA failure
hard-blocks the launch, no exceptions.

## How to use

1. Copy this file: `docs/launch/<surface>-<date>.md`
2. Fill every checkbox. Leave none unchecked without a named reason.
3. Run the security ritual ([security-review.md](security-review.md)) — paste its verdicts below.
4. Fill the provenance rows ([provenance-ledger.md](provenance-ledger.md)) for every headline number.
5. His word to merge. PR body carries "DO NOT MERGE without Cameron's word".
6. After merge: Vercel deploy → cache-busted live verification → close the checklist.

## The four bars

### FAST — the QUICK bar
- [ ] Budget gates pass (CI budget check green).
- [ ] No layout shift; data below the fold loads lazy.
- [ ] Mobile-first: legible and tappable on a phone.
- [ ] Offline build passes (PWA surfaces).

### CORRECT — honest numbers
- [ ] Every headline number has a provenance row (see provenance-ledger.md).
- [ ] Stale numbers marked "last known" with their as-of. Nothing ships as fresh that isn't.
- [ ] Data QA hard-block: pipeline QA failures stop this launch.
- [ ] Root ↔ public mirrors byte-identical (`python3 scripts/sync_public.py --check`).
- [ ] Served bytes verified cache-busted (commit SHA vs fetched asset) — the live HTML, not the dashboard.

### EXPLAINED — a reader can understand it
- [ ] Plain-words "how it works" on-page or one hop away (→ dumbmodel.com methodology).
- [ ] Model/data facts named exactly — no asset conflation (64-d embedding vs 14-d stats).
- [ ] Known limits printed on the page, not hidden.
- [ ] Changelog entry written.

### SHAREABLE — built to travel
- [ ] Share card / snapshot / linkable state works.
- [ ] Social meta (og/twitter) present and honest.
- [ ] No dead ends: no placeholder pages, no dead links, no served `.bak` files.

## Sign-off
- [ ] His word to merge.
- [ ] Merged → deployed → cache-busted live verification → checklist closed.

## Security verdicts (from security-review.md)
<paste the five-lane verdicts here>

---

## Worked example: the #126 pre-launch audit

**Context.** PR #126 — "Pre-launch cleanup: dead links, served .bak, HTML
escaping, path scrub". A read-only security & reputation audit with safe
fixes only. This is the checklist above, filled in for a real surface.

**What the audit did — the five lanes:**
1. **Secrets — CLEAN.** No live secrets; history skim clean.
2. **PII — CLEAN.** 6 LOW internal-path mentions in served docs left as-is
   for his call (recorded, not silently fixed, not silently dropped).
3. **Injection — no vulnerable sinks.** Hardening only, using the in-file
   `esc()` helpers:
   - `assets/live.js`: escape ESPN team abbreviation in innerHTML
   - `assets/insights.js`: escape `ins.slug` in id/data-slug attributes
     (no-op on real slugs)
   - `assets/shared-map.js`: less-than-only escaping → full
     ampersand/bracket chain
   - `assets/arc-projections.js`: escape season string interpolated into HTML
4. **Reputation — fixed.** Dead footer links to retired `/trends` and
   `/model` pages removed (root + public mirrors). `teams.html.bak`
   (30KB stale copy served publicly at `/teams.html.bak`) deleted.
   `/home/hatch` absolute paths in
   `data/timesfm_transformer_v2_report.json` → repo-relative.
5. **Config — static site, no env leakage.** Notable standing item: the CSP
   header is report-only — recommended: enforce post-launch after an
   inline-script review.

**How it maps to the four bars:**
- **FAST** — all touched JS passes `node --check`; no behavior or perf changes.
- **CORRECT** — root↔public mirrors patched identically; no data claims changed.
- **EXPLAINED** — the PR body carries lane-by-lane verdicts, so anyone
  reading it knows exactly what was checked and found.
- **SHAREABLE** — the reputation lane removed dead links and a served
  backup file so nothing embarrasses us when shared.

**Checklist discipline it demonstrates:**
- Read-only audit first, fixes second — never audit and fix in one blind pass.
- The 6 LOW PII mentions: left for his call, named in the open, not buried.
- The CSP notable is a standing recommendation with an owner (Pillar 7),
  not a launch blocker and not forgotten.
- Verdicts are public in the PR body: honest-503-over-fake-success applies
  to security too — report what you found, fix what's safe, flag the rest.

**Outcome.** OPEN, awaiting his word ("DO NOT MERGE without Cameron's word"
in the PR body). The checklist stays open until he decides.
