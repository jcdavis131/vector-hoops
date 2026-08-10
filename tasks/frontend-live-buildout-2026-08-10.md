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

## The pattern this branch keeps finding

Three separate places shipped numbers that no committed file supports, and one
of them was mine. This is the dominant defect class on this site — not layout,
not performance. **Before adding a figure to any page, find the file it comes
from; if there isn't one, say so on the page.**

| where | what | fixed |
|---|---|---|
| `model.html` SHAP canvas | `vals=[0.92,0.81,…]`, comment said "placeholder" | `fba1b234` |
| `play.html` `parityLab` | `(0.71+Math.random()*0.18)` labelled "convergent parity", re-rolled every result | `cc052ccb` |
| `play.html` ×4 + `model.html` ×2 | `purity@10 0.7057` / `lift 6.32` — absent from `eval_scoreboard.json`, and one copy rode the exported share PNG | `cc052ccb`, `dda2b107` |
| **my own** `play.html` aria-label | claimed the canvas showed "1,814 NBA players placed by the model"; it is a 140-dot `Math.random()` starfield | `cc052ccb` |

**What `assets/eval_scoreboard.json` actually says** (computed 2026-07-25,
10,104 eligible pairs, ties counted against the target): overall top-1 0.5081 /
top-5 0.9339; held-out test n=790 top-1 0.438 / top-5 0.757; transparent 14-d
baseline test top-5 0.1962. Use these; cite the file.

Still unsourced and now labelled as such: the `model.html` model-zoo table.

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
- [x] P1.1 Screen-reader access to the play map — **done `f520c19e`**. The
      canvas `aria-label` was `"game canvas karaoke trajectory orange rings"`;
      it now describes what is on screen. The result panel appeared via
      `style.display='block'` + `innerHTML` — neither is an event AT hears, so
      the payoff of every guess was silent; a `MutationObserver` mirrors it
      into a live region. Season chips were bare `<span>` + `.onclick`,
      unreachable by Tab; now `role=button tabindex=0` with Enter/Space. Skip
      link added past the 8 nav links. Focus ring added — there was none.
      Shipped as an appended block: **the first 27,701 chars of `play.html`
      are byte-identical to `HEAD`**, 5,162 appended before `</body>`.
- [x] P1.3 `prefers-reduced-motion` — **done `f520c19e`**. The page shipped 4
      `@keyframes` + 4 `animation:` rules (1200 ms trajectory sweep, card
      spike, 12-star confetti) and gated none of them.
- [ ] P1.1b Keyboard *orbit* of the map. Not done and not cheap: rotation state
      lives inside the page's minified IIFE closure, unreachable from an
      appended script. Needs an edit inside the generated file, or the map
      rewritten against `assets/shared-map.js` (which is still committed at
      27,161 b but no longer referenced by `play.html`).
- [ ] P1.2 Archetype colour key. **Blocked on data, not effort** —
      `embedding_map_manifest.json` rows carry `player_id, norm, display_name,
      seasons, seasons_count, is_current, is_allstar, is_recent_rookie,
      is_3plus, best_season, latest_season, best_score`. No archetype field,
      so the live map's colours cannot be decoded from what it loads. Either
      join against `assets/archetype_assignments.json` client-side or add the
      field to the manifest (pipeline lane — not mine).
- [ ] P1.4 `resMeta` renders `cos` to **3 decimals**, against the repo rule of
      never showing a user more than 2. Left alone deliberately: fixing it from
      my appended layer means a re-entrant observer rewriting another agent's
      render, which is more fragile than the bug. One-character fix for
      whoever owns the generated `play.html`.

### Phase 2 — trends
- [x] P2.1 `trends.html` rebuilt — **done `f5d7f4d3`**, 1,822 b → 25,250 b.
      Was a nav plus one card of jargon, sitting on `drift.json` (122,561 b)
      and `archetypes_time.json` (25,147 b) that nothing read.
      **The stub's headline was wrong**: it claimed `drift 6.2°/yr`; the mean of
      the 29 measured pairs is **8.38°**. Nothing is hardcoded now — every
      figure computes from the JSON at load and the validation step greps for
      the old constants to keep it that way.
      Rotation line (single series, no legend); archetype shares as 8 small
      multiples on one shared y-scale rather than a stacked area; diverging
      blue/orange validated at ΔE 24.7 protan / 33.6 normal on `#fafaf8`.
      Table view, arrow-key stepping, live region, skip link, reduced-motion.
- [x] P2.2a Era twins shipped — **`0f834911`**. `eratwins.json` (618 KB,
      1,308 careers) had never been fetched by any page. Now a section on
      `/trends`, deferred behind an `IntersectionObserver` so initial page
      weight is unchanged. Measured: median similarity **0.70**, best 0.91,
      worst 0.49. Strongest/weakest lists are the ends of a client-side sort,
      not a curated pick — said so on the page.
      **The file's own method says 48-d**; `eval_scoreboard.json` says the
      shipped model is 64-d. The page states that rather than quietly reusing
      an older space's output.
      Invariants asserted in the smoke test: 0 same-decade twins, 0 duplicate
      names (the lookup keys on name), 0 missing `top5`/`archetype`.
- [ ] P2.2b `trajectories.json` (90,730 b) is still unread by any page.
      `play.html` uses `embedding_map_trajectories.json` instead; check whether
      the smaller file is redundant or carries something the big one lacks.
- [ ] P2.4 Data-quality nit for the pipeline lane: `eratwins.json` contains
      `"Nigel HayesDavis"` — a dropped hyphen from name normalization. Cosmetic
      but user-visible now that the file is rendered.
- [ ] P2.3 `season_norms.json` documents `notInvertible` features
      (`FG3_PCT` and two others: empirical-Bayes shrunk before z-scoring, so
      the raw rate is not what was normalized — it says to show a percentile
      instead of a fabricated rate). Nothing surfaces that caveat yet.

### Phase 3 — explainability
- [x] P3.1 **F1 fixed — `fba1b234`.** The chart now reads
      `assets/mtnn_attr_pop.json` (12,966 seasons, 120 features, 4 targets).
      It is also not SHAP: the file states the method as *signed gradient ×
      input*, a local linearization, so the label changed too. `method` and
      `maskedNote` print verbatim, not paraphrased. 70 of 120 features are not
      measured in every season — those bars are hatched and carry coverage in
      their accessible name, because a zero bar means NEVER MEASURED. DOM bars,
      not canvas, so values are selectable and readable by AT. On fetch failure
      it says so; there is no fallback chart on purpose.
      Real top attributions, for reference: position is dominated by
      `PLAYER_HEIGHT_INCHES` 1.93 then `PLAYER_WEIGHT` 1.24; archetype by
      `PLAYER_HEIGHT_INCHES` 0.86 then `USG_PCT` 0.76.
- [ ] P3.2 End-to-end narrative: stat → tower → fusion → 64-d → head.
- [ ] P3.3 Audit the rest of `model.html` for the same failure mode. The model
      zoo numbers (`DeepMLP 4450.09`, `MTNN v3 loss 0.6641`, `purity@10
      0.7057`, `lift 6.32`) are hardcoded in markup. They may well be true —
      `assets/eval_scoreboard.json` exists — but **none of them is sourced**,
      and F1 proves this page has shipped invented numbers before.

### Phase 4 — player cards + dictionary
- [x] P4.2 **Dictionary shipped — `01d81134`.** `/dictionary.html`, 19 entries:
      plain meaning, exact definition, then the committed file each comes from.
      Archetype names and every accuracy figure are fetched, never typed; on
      fetch failure the page says so instead of showing a number.
      Its last section — **"Terms this site uses that have no file behind
      them"** — names `purity@10 0.7057` and `lift 6.32` as claims with no
      committed source. That closes the loop on the defect class above: the
      site now documents its own unsourced numbers instead of repeating them.
      Caveats promoted to entries rather than footnotes: zero attribution means
      NEVER MEASURED; era twins are 48-d; three era-z features are not
      invertible to a raw rate; train-split retrieval is inflated by
      construction; attribution is not SHAP. Linked from trends + model navs.
- [x] P4.1a `players.html` was the **third** file carrying `purity@10 0.7057`
      as a visible pill — replaced with the sourced `held-out top-5 0.76`,
      linked to its dictionary entry. Its one `toFixed(3)` is a canvas rgba
      alpha, which `docs/HANDOFF.md` explicitly exempts as internal; left alone.
- [ ] P4.1b `players.html` still scans `aria-live` ×0, `tabindex` ×0, `role=`
      ×0, `prefers-reduced-motion` ×0. Needs the same appended a11y layer
      `play.html` got in `f520c19e`.
- [x] P4.3 **Player cards shipped — `11c1a0d4`.** `/player.html` searches
      2,293 generated wiki pages and renders them. `knowledge/` is 7.9 MB that
      **nothing on the site linked**, and `knowledge/INDEX.md` is a 515-byte
      stub listing none of them, so `scripts/build_wiki_index.py` emits
      `assets/wiki_index.json` (2,293 entries, 419 KB) from the frontmatter
      each page already carries. Committed markdown only — no network, no
      model, no pipeline cache. Asset-clobber guard: all 117 existing assets
      snapshotted by name+size before and after; **nothing else changed**.
      `--check` mode proves the index current.
      Two bugs the tests caught, neither visible by reading:
      1. the frontmatter regex required LF, but there is **no `.gitattributes`
         and `core.autocrlf` is true** — the YAML block leaked into the card on
         a Windows tree. Every line-ending regex is `\r?\n` now and the test
         renders each page under both.
      2. wikilinks come in three shapes, **counted** across all 2,293 pages:
         29,809 slug+label, 2,293 bare slug, and **6,750 relative paths**
         (`../archetypes/…`) that rendered as raw `[[…]]`. Normalising them
         also made the 8 archetype and 5 position hubs reachable.
      Gate: 0 unresolved wikilinks across all 2,293 pages; 10 structural
      assertions on 5 pages × both line endings; escaping holds against an
      injected `<img onerror>`.
- [ ] P4.4 `/players.html` (the old canvas explorer) and `/player.html` now
      overlap. Decide: fold the explorer into the card page, or make
      `players.html` redirect. Nav currently points at `/player.html`.
- [ ] P4.5 **No `.gitattributes` in the repo.** Line endings are per-clone,
      which is what caused bug 1 above. A `* text=auto` + `*.md text` file would
      close the whole class. Repo-wide change, so flagged not done.

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
