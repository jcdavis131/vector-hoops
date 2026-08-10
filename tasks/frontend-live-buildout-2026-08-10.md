# Frontend buildout — the LIVE hoops.dumbmodel.com (2026-08-10)

> **This board replaces `tasks/frontend-buildout-2026-08-10.md`**, which was
> written against a checkout 244 commits stale whose files are not deployed.
> This one is based on `origin/master` @ `d5763925` — the tree that actually
> serves https://hoops.dumbmodel.com.
>
> Worktree: `.claude/worktrees/frontend-live`, branch `frontend-live`.
> The main checkout is NOT touched — another agent trains models there.

## Operator ask

Frontend only, end to end. All pages free and accessible. World-class UX/UI.
Order: **1** gameplay centred on the embedding map · **2** trends /
change-over-time · **3** model explainability · **4** player cards +
dictionary · **5** team / front office.

## Rules of engagement

- `COORDINATION.md` is a live claim board. **Write a claim row before editing**,
  clear it when done. My row: `Claude-frontend-a11y`.
- Never run a pipeline fetcher or trainer (ledger: two shipped-artifact
  clobbers from "just a smoke run"). Committed `assets/*.json` only.
- Own branch only. `master` is Scout's and pushing it deploys live.
- Repo doctrine (`docs/HANDOFF.md`): **never fabricate a value**, proxies stay
  labelled proxies, never show >2 decimals to a user.
- Every animation gated behind `prefers-reduced-motion: reduce`.

## Live baseline, measured 2026-08-10

| page | bytes | state |
|---|---|---|
| `index.html` | 31,600 | v7.3 retheme |
| `play.html` | 27,938 | 4 canvases, map from `embedding_map_manifest.json` (1,814 players) |
| `players.html` | 14,723 | — |
| `teams.html` | 15,182 | already built (the old board's Phase 5 is moot) |
| `methods.html` | 11,806 | — |
| `leaderboard.html` | 11,008 | — |
| `model.html` | 5,943 | **fabricated SHAP chart** — see F1 |
| `trends.html` | 1,822 | **4-line stub, no content at all** |

Accessibility across the live site is effectively zero — scanned
`https://hoops.dumbmodel.com/play`: `aria-live` ×0, `tabindex` ×0,
`prefers-reduced-motion` ×0, `role=` ×0, `aria-` ×1.

## Findings that are bugs, not features

- **F1 — `model.html` draws a fake SHAP chart.** Its script is literally
  commented `// tiny SHAP placeholder canvas draw` and hardcodes
  `vals=[0.92,0.81,0.74,0.68,0.51,0.49,0.42,0.35]`, rendered under the heading
  "SHAP • tm / mpg / closing_risk / playoff_impact_proxy" and a "glass-box
  SHAP" pill. Those numbers come from nowhere. Real attributions are committed
  — `assets/mtnn_attr_pop.json` (41,247 b), `mtnn_attr_topk.bin`,
  `mtnn_jacobian.f32`. This contradicts the repo's own no-fabrication rule and
  is live to the public. **Fix before adding any explainability feature.**
- **F2 — external font dependency.** `model.html` and `play.html` load
  `fonts.googleapis.com`, render-blocking and third-party, while the claim
  board asserts "zero-deps true stdlib only".
- **F3 — nav is inconsistent per page.** `trends.html` links Model + Play only;
  `model.html` links Teams + Players + Trends + Play. No shared nav component
  is used, so pages are reachable only by luck.

## Board

### Phase 1 — gameplay on the map
- [ ] P1.1 Keyboard + screen-reader access to the play map (`#c`): focusable
      canvas, arrow-key orbit, zoom, live-region mirror of target/guess state.
      Proven implementation exists on branch `frontend-buildout`
      (`assets/shared-map.js`) — port the behaviour, not the file.
- [ ] P1.2 Archetype colour key. The map colours points and nothing says what a
      colour means. Names must come from `assets/mtnn_arch.json gameArchetypes`,
      asserted equal at validation time — never transcribed.
- [ ] P1.3 `prefers-reduced-motion` gate on the trajectory animation.

### Phase 2 — trends
- [ ] P2.1 `trends.html` is a stub. Build a real change-over-time page from
      committed assets (`drift.json`, `archetypes_time.json`,
      `trajectories.json`, `season_norms.json`). Follow the `dataviz` skill.

### Phase 3 — explainability
- [ ] P3.1 **F1 first** — replace the fabricated SHAP canvas with real
      attributions from `mtnn_attr_pop.json`, or delete the chart. Fabricated
      beats nothing only in the wrong direction.
- [ ] P3.2 End-to-end narrative: stat → tower → fusion → 64-d → head.

### Phase 4 — player cards + dictionary
- [ ] P4.1 Audit `players.html` (14,723 b) against `knowledge/` wiki + `skills.json`.
- [ ] P4.2 Dictionary of every term the site uses.

### Phase 5 — team / front office
- [ ] P5.1 `teams.html` already exists at 15,182 b — **audit before building**.
      The prior board assumed a stub; that was the stale tree.

### Cross-cutting
- [ ] F2 self-host or drop the Google Fonts link.
- [ ] F3 one shared nav across all pages.

## Validation

No frontend test harness and **no headless browser on this box** — layout is
reasoned from the cascade, then confirmed on a Vercel preview deploy of this
branch. Static gate:

```powershell
cd C:\Users\jcdav\vector-hoops\.claude\worktrees\frontend-live
Start-Process python -ArgumentList '-m','http.server','8099' -WindowStyle Hidden
Invoke-WebRequest http://localhost:8099/<page>.html -UseBasicParsing
```
