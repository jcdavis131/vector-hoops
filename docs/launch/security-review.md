# Security review — the ritual

Run before every launch surface ships. Read-only audit first, safe fixes
second, verdicts public in the PR. The #126 audit is the template —
see the worked example in [launch-checklist.md](launch-checklist.md).

## The five lanes

### 1. Secrets
- Look: committed keys, tokens, credentials in code, data files, docs;
  skim history for anything that slipped in earlier.
- Verdict: `CLEAN` / `FOUND` (file + redaction plan).
- #126: CLEAN — no live secrets; history skim clean.

### 2. PII
- Look: emails, phone numbers, real names in served pages/docs; internal
  absolute paths (`/home/hatch/…`) in served files.
- Verdict: `CLEAN` / `LOW(n)` listed for his call / `FOUND`.
- #126: CLEAN — 6 LOW internal-path mentions in served docs left as-is
  for his call (named in the open, not buried). Absolute paths in
  `data/timesfm_transformer_v2_report.json` scrubbed → repo-relative.

### 3. Injection
- Look: `innerHTML` / `document.write` / `eval` sinks; first-party data
  interpolated into HTML unescaped; URL params reflected into the DOM.
- Fix rule: harden first-party interpolations with the in-file `esc()`
  helpers. Audit first — if no vulnerable sinks exist, say so; hardening
  without a found sink is still worth doing, but label it honestly.
- All touched JS must pass `node --check`.
- #126: no vulnerable sinks found. Hardened 4 files: `assets/live.js`
  (escape ESPN team abbreviation), `assets/insights.js` (escape `ins.slug`
  in id/data-slug attributes), `assets/shared-map.js` (less-than-only →
  full escaping chain), `assets/arc-projections.js` (escape season string).

### 4. Reputation
- Look: placeholder pages, dead links, dead-end routes, served `.bak` /
  `.orig` / backup copies, stale copy contradicting served data (the
  v6/128-d problem — the site must never say two things at once).
- #126: dead footer links to retired `/trends` and `/model` pages removed
  (root + public mirrors); `teams.html.bak` (30KB stale copy served
  publicly at `/teams.html.bak`) deleted.

### 5. Config
- Look: headers (CSP, HSTS, Referrer-Policy, Permissions-Policy), env
  leakage, cache rules on assets.
- **Standing item:** the CSP header is report-only
  (`Content-Security-Policy-Report-Only`: `default-src 'self'`;
  `script-src 'self' 'unsafe-inline'`; …). Recommended: enforce
  post-launch after an inline-script review. Owner: Pillar 7 (CSP
  enforcement is action 5 of the plumbing pillar).
- #126: static site, no env leakage. HSTS
  `max-age=31536000; includeSubDomains` present; Permissions-Policy locks
  camera/mic/geolocation.

## The ritual, step by step

1. **Freeze the surface.** Note the commit SHA under review.
2. **Read-only pass.** Run all five lanes; write verdicts before touching anything.
3. **Safe fixes only.** XSS escaping, dead-link removal, path scrubbing,
   deleting served backups. No behavior changes, no feature work in a
   security PR.
4. **Mirror rule.** Patch root ↔ public byte-identical; verify with
   `python3 scripts/sync_public.py --check`.
5. **`node --check`** every touched JS file.
6. **PR with verdicts in the body** (template below). "DO NOT MERGE without
   Cameron's word."
7. **Close the loop.** Standing items (like CSP enforcement) get owners and
   dates — never silently buried.

## Verdict template (copy into the PR body)

```
Security (<what was hardened> — audit found no vulnerable sinks; hardening only):
- <file>: <what changed> (esc() already in-file)

Reputation:
- <what was removed and why>

Audit verdicts (5 lanes): secrets <CLEAN|…>, PII <CLEAN|…>, injection: <…>,
reputation: <…>, config: <…>. Notable: <standing items + owner>.
```

## When to re-run

- Before every launch surface (per the launch checklist).
- After any PR that touches served JS, headers, or footers.
- On a schedule only if a surface goes quiet for a quarter — stale
  audits are how `.bak` files get served.
