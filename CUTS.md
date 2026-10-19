# CUTS.md — Lane D: Subtraction (Jobs's list, panel-ratified)
**Branch:** `scout/v4-cut`. **Status: PR-ready draft — NOTHING HERE SHIPS without his explicit word. Deletion is a product decision, not a worker decision.**

Source: panel review v4 (`specs/panel-review-awesome-product-v4-2026-10-19.md`, Tier 3 item 15) + Harada goal 8 ("Subtraction" in `specs/harada-product-goals-v4-2026-10-19.md`). One commit per cut, each independently revertible.

## What was removed, by name

### 1. Pack Battle — retired publicly
Pack Battle had no standalone URL/nav/sitemap entry (it was a mode inside `/play` reached via `?pack=` URLs). Its public surface was:
- The Pack Battle mode render path in `play.html` / `assets/play-engine.js` (pack header, pack summary, invalid-pack cards)
- Onboarding steps 2–3 explaining Pack Battle
- Pack share cards (`assets/viral-share.js` `drawPackCard`/`sharePack`)
- Pack-mode state functions in `assets/past-modern-game.js` (`generateRandomPack`, `startPackFromIds`, `advancePack`, `getPackState`, `getPackBattleSummary`, `packShareUrl`, `packChallengeUrl`, `parseIdList`, `parseScores`, pack persistence)
- The "battle friends with a shared pack" meta descriptions

**Retirement:** any `?pack=...` URL now renders an honest short note on `/play` ("Pack Battle has been retired — Daily Court is the game now") instead of launching pack mode. `VHPastModern`'s daily-slot state infrastructure (Daily Court's engine) is untouched.

### 2. Props Lab — removed entirely
Reviewed per the panel's test ("its one honest output folds into Daily Court's post-game reveal if it earns it"): Props Lab is a PrizePicks paper-trading lab (walk-forward backtest + paper trades). Nothing in it belongs in a player-guessing game's post-game reveal, so it was removed entirely:
- `props-lab.html` deleted (root + served `public/` mirror)
- Explore drawer entry, footer sitemap links, sitemap.xml entry, service-worker precache, `vercel.json` header/rewrite rules, `budgets.json` budget entry, OG image
- The `/dfs` and `/oracle` redirect aliases (which pointed at `/props-lab`) now point at `/insights` — the closest surviving surface for data-driven NBA findings

### 3. Insights 28 → the held 8
Kept the 8 cards Cameron approved in the 2026-10-07 review pack (`git 5a513e86`): the money/sacrifice track the panel's subtraction list was built around — `the-summer-the-cap-broke`, `paid-to-not-play`, `max-money-bargains`, `invisible-stardom`, `love-vs-bosh`, `same-jersey-smaller-role`, `hometown-discount`, and `the-188-million-win-share`. Note: `the-188-million-win-share` (Rashard Lewis $187.9M/WS) was **already retired on 2026-10-12** (`git e89c0542`) for dishonest math — a denominator artifact no dataset in the repo could recompute. The surviving keep-set is therefore 7 cards. Cut by name (20):
- `most-unique`, `most-average`, `transformed`, `time-capsule`, `dead-styles`, `three-point-takeover`, `careful-era`, `contender-chemistry`, `matchup-nightmares`, `playoff-swings`, `contenders-pretenders`, `know-your-role`, `payroll-per-win`, `fan-cost-per-win`, `ticket-price-gap`, `clippers-nothing-to-show`, `cheapest-ring`, `warriors-repeater-record`, `apron-casualties`, `most-cited-players`

Removed from `assets/insights.json`, deleted each card's crawler stub (`insights/<slug>.html`) and OG image, and updated the Methods page's Insights section which described the cut cards. The hub page renders from `insights.json`, so it follows automatically.

Honest discrepancy to flag: the 2026-10-18 walkthrough transcripts contain no specific Insights cards the walkers named as delights (their route was homepage → Daily Court → Atlas → dossier → share → methods; they never visited Insights). The "8" above is the documented, owner-approved group the panel ratified — kept as named, with the Lewis card's earlier retirement recorded. He should confirm this is the right 8 (or 7) before merge.

### 4. Twin Explainer — standalone surface retired
The Twin Explainer had no standalone URL — its standalone surface was the documentation section in `methods.html` (`#twin-explainer`). Removed that section (renumbered 04·d → 04·c, 04·e → 04·d). The chips themselves (`assets/twin-explainer.js`) remain exactly where the panel wants them: inside the Daily Court twin reveal (`play.html`); the panel's "Career Trails" placement is a future wiring, not a removal.

### 5. Nav / footer / sitemap sync
- Footer sitemap columns updated on all pages (Props Lab link removed everywhere)
- `sitemap.xml` regenerated via `scripts/build_sitemap.py` (Props Lab URL removed)
- Dead-link crawl: every internal link in root + `public/` HTML resolves (see verification below)

## Verification
- `node --check` on all edited JS files: pass
- Internal-link crawl (stdlib, root + public HTML): all internal links resolve
- `python3 scripts/stamp_assets.py` + `python3 scripts/sync_public.py` run per commit; root↔public mirror verified
- pytest: could not run — no pytest on this VM and no package installs without his approval (standing rule). Test files touching these surfaces were grep-checked for hard-coded references (none found)
- `assets/mtnn_embeddings.f32` untouched

## What survives, defended in one line each
- **Daily Court** — the product: guess today's player, feel how basketball works.
- **Atlas** — the map behind the ritual; the product's moat.
- **Insights (7)** — the money/sacrifice findings track he approved; the model's receipts.
- **Career Trails** — the emotional payoff of the game (Goldsberry: the thesis demonstrated, not stated).
- **Share/streak loop** — the only acquisition engine; now uncluttered.
