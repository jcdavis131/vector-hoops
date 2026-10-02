# Vector Hoops — Cohesion Pass QA Checklist (2026-10-01)

Branch: `scout/cohesion-pass` off master 4083a841. Verifier: static analysis only.

## Changes (8 files, all mirrored root ↔ public/)

| File | Change |
|---|---|
| playoff-runs.html | + `<link rel="stylesheet" href="/assets/atlas.css?v=2"/>` after legacy sheets (LAST, per atlas.css's own rule); sticky tabs `top:0` → `top:var(--nav-h,60px)` |
| insights.html | `11` → `12` Findings in title-card meta |
| leaderboard.html | `atlas.css?v=1` → `v=2` cache-buster |
| assets/atlas.css | + `--gold` token: `#D4AF69` (dark), `#8A6D1F` (both light-theme blocks, deepened for paper contrast) |
| public/ ×4 | byte-identical mirrors of the above |

## Checks performed — all PASS

- [x] CSS brace balance: assets/atlas.css 210/210, balanced
- [x] `--gold` defined exactly 3× (dark `:root`, light media query, `[data-theme="light"]`) — no accidental print-block pollution
- [x] Asset reference audit: every `href/src="/assets/…"` on the 3 changed pages resolves to an existing file — 0 missing
- [x] Stylesheet order on playoff-runs.html: atlas.css is the last stylesheet before the font link — tokens and component restatements win the cascade
- [x] `node --check` on assets/playoff-runs.js, assets/insights.js, assets/site-nav.js — all parse clean
- [x] Root ↔ public/ byte parity on all 4 changed files (`cmp` clean)
- [x] Git scope: only the 8 intended files modified; untracked `pipeline/timesfm/*` and `research/build_stats.py` are pre-existing stubs, untouched
- [x] playoff-runs.html markup already used `class="main"` + `title-card` — with atlas.css loaded these resolve to the same definitions every other page uses; inline `vh-runs__*` styles reference only tokens now defined (`--surface`, `--line`, `--void`, `--gold`)
- [x] No other branches touched; `scout/insights`, the three research branches, and master are unmodified

## Explicitly NOT verified (no browser binary on this VM)

- [ ] **Visual render**: no Chromium/Chrome available (`which` returned nothing; node v24 only). Could not confirm zero console errors or pixel-level appearance of playoff-runs.html under the dark Atlas system, nor the sticky-tab docking offset.
- [ ] **Phone/small-viewport behavior** of the changed pages.

Static analysis is complete and clean, but per Cameron's hard-block rule ("stop the pipeline on any QA failure") and the merge authorization's explicit condition, **this pass must NOT merge** until a real browser or phone check confirms the render. The static work is done; the visual confirmation is the open item.

## Post-visual-verification merge steps (for the main agent)

1. Live-check (browser/phone): playoff-runs.html header/nav match insights.html; tabs dock below nav; no console errors; insights meta reads "12 Findings".
2. `git add -A && git commit` on `scout/cohesion-pass`, merge to master, push origin.
3. Confirm merge commit hash + clean working tree.
4. Optional follow-up: refresh MEMORY.md's stale japandi v4 spec to the live Atlas "court at night" system (60px nav, --accent #FF7A33) so future work targets the right tokens.
