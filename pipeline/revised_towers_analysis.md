# Vector Hoops — Revised Towers Analysis (Company → Hoops Bridge)

> Solo personal project, no connection to employer, built with public/free-tier only  
> Date: 2026-07-24 — mirrors equities 5-bucket analysis for universal MTNN

## Context

- **Company corpus:** `~/workspace/bigbang-cli/docs/llm-wiki/companies/` contains 7,366 markdown files (e.g., `company_AAPL.md`). Each file is derived from SEC 10-K Item 1 (Business Model), Item 1A (Risk Factors), Item 7 (MD&A), plus XBRL metadata. Verified fields:
  - Ticker, CIK, Sector, Industry (e.g., Technology | Computer Manufacturing)
  - Marketcap snapshot (e.g., $2411.1B), has_financials / has_business / has_risk booleans
  - Business Model text (V2 HTML-aware chunks, 500-1000 tokens each)
  - Risk Factors text
  - Geographic segments (Americas, Europe, Greater China, Japan, Rest of Asia Pacific for Apple-like; similar for others)
  - Filing priority tags

- **Hoops current state (leakfree v5):**
  - 12,966 player-seasons (1996–2026), 79 features grouped into **11 families**:
    - `shotmix` (13), `tracking` (13), `playmaking` (12), `efficiency` (10), `volume` (5), `rebounding` (5), `honors` (5), `career` (5), `bio` (4), `market` (4: SALARY_LOG, SALARY_CAP_PCT, SALARY_TEAM_PCT, SALARY_RANK_POS), `defense` (3)
  - MTNN v5: residual towers per family → gated attention fusion → 48-d L2-normalized embedding. Heads: archetype (8), position (5), profile (14), next_profile (14), salary, team_fit, etc. Composite CQS = 0.7937 leakfree.
  - `train.sh` rebuilds train_matrix.npz → MTNN → assets via torch, offline-cache safe.

- **Equities 5-bucket categorization done earlier:**
  1. What they do (business model)
  2. Peer group (sector/industry)
  3. Size/health (marketcap + has_financials)
  4. Risk profile
  5. Where/how they earn (geo segments)

Goal here: propose 5 new **Hoops-specific towers** that mirror those buckets but are adapted to basketball economics and fanbase, enabling a universal embedding where team sponsorship and location signals bridge equities ↔ hoops ↔ gridiron without full retrain for new sports.

---

## Mapping Principles

Per handoff: do not fabricate, inspect real pipeline, keep HOME-only free-tier.

- No paid LLM embeddings for tower. Use keyword hashing, one-hot buckets, TF-style counts, all local.
- Missing-mask friendly: every new tower must produce a float tensor + mask (like existing FAMILY_OF towers) so datacenter-IP fetch failures don't block training.
- Universal idea: shared latent dimensions for **money + location** — contract/revenue/ticket/sponsorship/fanbase signals exist in all three sports, so a tower that activates on "tech sponsor in Bay Area" should be useful whether it's AAPL, Warriors, or 49ers.

## Proposed 5 New Towers for Hoops

### Tower 1: SPONSORSHIP_AFFINITY — mirrors "What they do"

- **Equities origin:** Business Model text (e.g., "designs smartphones, App Store, AppleCare, payment services").
- **Hoops adaptation:** What kind of company would want to sponsor this player/team/archetype?

- **Input signals from company files:**
  - Industry keyword sets: `Computer Manufacturing` → tech sponsor bucket; `Beverages` → beverage; `Apparel`, `Automotive`, `Airlines`, `Finance: Major Banks`, `Real Estate Investment Trusts`, etc. Observed top sectors in sample: Health Care (13/50), Finance (9), Consumer Services (8), Technology (5).
  - Business model noun-phrase hashing: e.g., "wireless headphones", "cloud services", "advertising platforms" → TF hash buckets (32-d).

- **Featurization (free-tier):**
  - One-hot sector (11 sectors from manifest: Technology, Finance, Health Care, Consumer Services, etc.) → 11-d
  - Industry keyword hash → 16-d hashed bag
  - Business model bigram hash (top 500 terms TF-IDF style, offline from company corpus) → 32-d L2-normalized

- **Hoops integration:**
  - Augments existing `market` tower (salary) + new `sponsorship` family. For each player-season, join team-city corporate HQ overlap: e.g., if player is GSW, sponsorship affinity weighted by presence of tech companies in SF Bay Area corpus (count of Technology files with "Greater China"/"Americas" etc not directly, but via headquarters proxy — use sector count per geo).

- **Universal embedding link:**
  - Same tower exists in equities (business model → sponsorship category). In universal model, shared projection layer `sponsor_proj` (e.g., 32→24) aligns company business embedding with player marketability embedding via contrastive loss: a high marketable player near Nike (Consumer Non-Durables: Apparel) should be close.

### Tower 2: OWNERSHIP_PEER — mirrors "Peer group (sector/industry)"

- **Equities origin:** Sector + Industry clustering (e.g., Technology sector peers, Computer Manufacturing industry peers).

- **Hoops adaptation:** Team ownership groups / investor archetypes. NBA teams owned by tech billionaires (Warriors), private equity (recent stakes), media conglomerates.

- **Input signals:**
  - Sector/Industry as peer proxy: e.g., `Major Banks` + `Investment Managers` → financial ownership cluster; `Technology` → founder-led ownership.
  - Universe size: 3,371 common CIK + 7,336 full — provides prior for how crowded a sector is (diversification).

- **Featurization:**
  - Sector one-hot (11) + Industry cluster id via offline k-means on industry name hashing (e.g., 24 clusters) → 24-d embedding lookup (local, random-init, learned with MTNN).
  - Ownership concentration: count of companies in same industry (from 7366 files) → log-normalized scalar.

- **Hoops integration:**
  - New family `ownership_peer` (size 6 features). Joins to player via team → team financial context file `pipeline/data/salary_market.json` already exists (salary cap pct). Ownership peer health augments `team_fit` and `roster_lift` heads: teams with wealthy ownership peers can sustain luxury tax → affects player career trajectory.

- **Universal link:**
  - In equities, peer group drives sector-relative valuation (sector coherence eval already in `eval_sector_coherence.py`). In hoops, ownership peer drives franchise valuation coherence. Shared loss: sector/ownership contrastive — players on teams whose ownership peer group overlaps with strong-performing equities sectors should share embedding neighborhood.

### Tower 3: FRANCHISE_HEALTH — mirrors "Size/health (marketcap + has_financials)"

- **Equities origin:** Marketcap snapshot ($2411.1B Apple) + boolean flags has_financials, has_business, has_risk, has_mda.

- **Hoops adaptation:** Team financial health proxies — revenue, attendance-driven market size, salary cap flexibility.

- **Current hoops gap:** `market` family has only 4 salary features (SALARY_LOG, CAP_PCT, TEAM_PCT, RANK_POS). No team revenue, ticket sales proxy, luxury tax health.

- **Input signals:**
  - Marketcap bucketed into 5 quintiles (from company corpus: mega-cap > $100B, large $10-100B, mid, small, micro) — provides prior for financial health strength.
  - has_financials boolean → proxy for disclosure quality → maps to franchise financial transparency (public vs private).
  - v2 chunks count (42 for Apple, 47 for Microsoft) → disclosure depth → proxy for market attention.

- **Featurization:**
  - Marketcap quintile one-hot (5) + log marketcap z-scored within sector (1) + has_financials (1) + chunks count normalized (1) = 8-d.

- **Hoops integration:**
  - Family `franchise_health` (8 features). For each team-season, join average marketcap of sponsors headquartered in that city (using company files geographic hint — tech-heavy SF → higher franchise health prior). Augments `salary_market.json` → new feature `TEAM_SPONSOR_HEALTH`.

- **Universal link:**
  - Directly aligns with equities towers `valuation`, `health`, `payout` (from equities MTNN). In universal model, project franchise_health ↔ equities health into shared 16-d money-health subspace. Enables transfer: a downturn in tech marketcap (equities) predicts reduced franchise health for tech-owned teams (hoops) without retraining hoops from scratch.

### Tower 4: VOLATILITY_RISK — mirrors "Risk profile"

- **Equities origin:** Risk Factors Item 1A text (e.g., Apple: global supply chain, consumer confidence, inflation, currency fluctuations).

- **Hoops adaptation:** Market volatility affecting attendance, lockout risk, injury insurance risk, local economic sensitivity.

- **Input signals from company files:**
  - Risk keyword presence: `supply chain`, `inflation`, `currency`, `regulatory`, `competition`, `recession`, `litigation`.
  - Has_risk boolean.
  - Risk text length / chunk count.

- **Featurization (free-tier, no LLM):**
  - Keyword hash bank of 20 risk themes (supply_chain, macro, regulatory, competition, litigation, talent, cybersecurity, etc.) → presence score 0/1 → 20-d.
  - Risk sentiment proxy: count of "materially adversely" phrases (common in filings) → risk intensity scalar.

- **Hoops integration:**
  - Family `volatility_risk` (21 features). Joins via team location economic sensitivity: e.g., Detroit teams (auto industry risk) → higher volatility prior; Bay Area tech concentration → tech-sector risk correlation.
  - Improves `form_recon` and `career_slope` heads: players in high-volatility markets show higher variance in next-season performance (attendance/travel stress).

- **Universal link:**
  - In equities, risk tower already predicts volatility (vol). In universal model, share `risk_proj` layer: company risk embedding ↔ team volatility embedding. Enables ImageBind-style cross-modal retrieval: query "high macro-risk franchises" returns both risk-heavy companies and NBA teams in economically sensitive markets.

### Tower 5: FANBASE_GEO — mirrors "Where/how they earn (geographic segments)"

- **Equities origin:** Geographic segment breakdowns in Business Model: Americas, Europe, Greater China, Japan, Rest of Asia Pacific (Apple), similar for others. Also mentions of "location of customers and distribution partners".

- **Hoops adaptation:** Fanbase location and team location alignment — most direct bridge for universal embedding per user request "location (fanbases), etc tie these together".

- **Current hoops gap:** No explicit geographic tower. `bio` has height/weight/age/draft, but not fan geography. `teams.json` has team city, but not corporate geo overlap.

- **Input signals:**
  - Company geo mentions: parse segment phrases from business model text (Americas, Europe, China, Japan, Asia Pacific, plus "India, Middle East, Africa").
  - Sector × geo prior: e.g., Technology → global; Consumer Services → local Americas heavy.
  - Count of geo mentions per company → geo distribution vector (5-d: Americas, Europe, China, Japan, RoW).

- **Featurization:**
  - Geo distribution sum-normalized to 1 → 5-d.
  - Dominant geo one-hot (5) + entropy (1) measuring geographic concentration = 6-d total.
  - For hoops, construct city-to-geo affinity matrix: NBA team city → corporate HQ density in that metro from company corpus (e.g., NYC has many Finance + Consumer Services; SF has Technology). Use simple metro buckets: NYC, SF Bay, LA, Chicago, etc. (10 metros) → 10-d overlap score.

- **Hoops integration:**
  - Family `fanbase_geo` (6 + 10 = 16 features, but can compress to 8 via PCA for tower width 32). Each player-season gets team-city geo affinity: e.g., Giannis on Bucks → Milwaukee geo affinity low tech, high consumer durables? Actually Milwaukee has less corporate density, so fanbase_geo captures small-market penalty/bonus.
  - Augments `team_fit` head and `competition` (SOS_NET_RTG) with market context.

- **Universal link:**
  - This is the keystone for universal MTNN. In equities, geo tower captures where revenue comes from. In hoops, fanbase_geo captures where fans/revenue come from. In gridiron, same. Shared projection `geo_proj` (e.g., 16→16) trained with contrastive alignment: companies earning heavily in "Greater China" should be near NBA teams with China fanbase (e.g., Rockets historically). This lets insights transfer and new sports don't need full retrain — just learn geo mapping.

---

## Summary Table

| # | Equities Bucket | Hoops Tower Name | Hoops Features | Input Signals from 7366 Company Files | Hoops Existing Family It Extends |
|---|----------------|------------------|----------------|----------------------------------------|----------------------------------|
| 1 | What they do | SPONSORSHIP_AFFINITY | 11+16+32=59 → compressed to 12 via hashing trick | Sector one-hot, Industry hash, Business model bigram TF hash | market, team_fit |
| 2 | Peer group | OWNERSHIP_PEER | 6 | Sector one-hot, Industry cluster id (24 clusters), industry count log | team_fit, roster_lift |
| 3 | Size/health | FRANCHISE_HEALTH | 8 | Marketcap quintile, log marketcap z, has_financials, chunks count | market, salary_market.json |
| 4 | Risk profile | VOLATILITY_RISK | 21 | 20 risk keywords + intensity scalar, has_risk | form_recon, career_slope |
| 5 | Where/how earn | FANBASE_GEO | 16 → 8 | Geo distribution (5-d), dominant geo, entropy, metro affinity (10-d) | fanbase, competition, bio |

Total new features if added naively: ~92 features, bringing total from 79 → 171. With tower width 32, hidden 160, fusion hidden 256, param increase ~ (5 towers * (2*width*hidden)) ≈ 5*~10K=50K extra, still under 300K total (within v5 budget 224K + 50K = 274K, well under v6 1.2M). All masks handle missing.

## How They Connect to Universal Embedding (ImageBind-style)

- **Architecture proposal:** Keep per-domain towers (Hoops 11+5, Equities ~18, Gridiron similar). Add **shared projection adapters**: `sponsor_proj`, `peer_proj`, `health_proj`, `risk_proj`, `geo_proj` — each is a small MLP (e.g., 32→24) shared across domains, trained with cross-domain contrastive loss where paired examples are same geo or same sector.

- **Example universal queries enabled:**
  - "Find companies similar to Warriors sponsorship profile" → nearest neighbors in sponsor_proj include tech apparel companies (Nike) + Warriors player archetypes.
  - "Which NBA teams are most exposed to tech-sector downturn?" → use franchise_health tower correlated with marketcap quintile of tech companies.
  - "Transfer learning to new sport (e.g., soccer)": freeze universal projectors, only train new sport-specific towers (5-10) + fine-tune fusion, not full retrain.

- **Free-tier training:** Use existing `train_mtnn.py` with added families, no new dependencies beyond numpy/torch (already in pyproject). Company file parsing is offline Python only, no APIs. Training stays on Alienware or CPU, WANDB offline per equities `run_real_train.sh` (export OMP_NUM_THREADS=1 etc).

## Next Steps (Concrete)

1. Write parser `pipeline/build_company_wiki_v3.py` that reads 7366 markdown files, extracts the 5 buckets into `pipeline/data/company_signals.npz` (arrays: ticker, sector_id, industry_cluster, marketcap_q, geo_dist[5], risk_keywords[20]).
2. Update `pipeline/build_vectors.py` to load company_signals and merge into train_matrix per team-city mapping (need mapping team → metro → company density — create `teams_metro.json`).
3. Extend `FAMILY_OF` dict with 5 new families, regenerate `feature_manifest.json`.
4. Retrain via `./train.sh --quick --epochs 20` to validate no regression, then `--full`.
5. For universal: after hoops and equities towers are aligned, train shared projectors in separate step using paired metro/sector data (not in hoops train.sh, but as second stage).

---

> Verification: Inspected real pipeline code (`train.sh`, `train_mtnn.py`, `build_vectors.py`, `feature_manifest.json` showing 11 families, 79 features, market 4 feats), and real company corpus (7366 files, sample AAPL 42 chunks $2411B marketcap, sector/industry, geo segments). No fabrication — counts from `ls ... | wc -l` and Counter prints. Proposal uses only local free-tier ops, preserves mask logic, stays under param budget.

