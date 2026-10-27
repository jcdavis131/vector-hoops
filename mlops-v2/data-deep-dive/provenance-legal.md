# Provenance & Legal — Vector Hoops MTNN data collection

**Scope and status line (read first): this section is NOT legal advice; a legal read is still needed.**
Nothing here is a legal opinion. It is a terms-and-evidence inventory: what each
source's published pages actually say, what is still unverified, and what the
program must stop doing under a strict reading of the pages that were found.
Prior lane ground truths are carried forward, not re-decided:

- No `LICENSE*` file exists in either checkout (re-confirmed 2026-10-26 for
  `~/workspace/vector-hoops-mlops-v2` and `~/workspace/vector-hoops`); no rights
  statement exists in `docs/PIPELINE.md` or pipeline docstrings.
- The shipped product is derived: 64-d learned embeddings + 14-stat per-100
  z-scored profiles + names/seasons. No photos, video, audio, logos, or
  trademarks are served. Player names and game statistics are facts — the
  favorable half of the argument, but not a legal opinion, and it does not
  cover the collection layer.
- Read before this file: `lanes/01-data-collection/SOURCES.md` §7 (licensing
  notes), `lanes/07-pipeline-overhaul/SHOT_POSITION.md` §6 (per-source posture),
  `lanes/07-pipeline-overhaul/INVENTORY.md` §5 (licensing note carried forward).

**Headline finding.** Sports Reference's current Terms of Use — read in full
this run — contain an express ban on using its content for training AI models
(§5, item 11, quoted below). Under a strict reading, that clause reaches the
MTNN training pipeline itself insofar as it trains on Basketball-Reference
derived features, not just republication of tables. This is the single largest
legal exposure in the program, it is new relative to the earlier lanes (which
recorded BBRef terms as merely "UNCONFIRMED"), and it needs a legal read
before any further BBRef-fed training run. Everything else in this file is
ranked below it.

**Method note.** Web search + page reads only; at most tiny page fetches.
No bulk fetching, no writes to any live checkout, no training, no prod writes.
One fetch attempt (the NBA terms page) was blocked by tool policy in this
environment — that block is about this environment's fetch tool, not about
nba.com, and it is recorded as UNVERIFIED-from-primary-source below rather
than as evidence about NBA's site.

---

## 1. Per-source terms / robots / data-use statements

Rules applied throughout: robots.txt compliance is never upgraded into a
license; a terms summary is never presented as a legal opinion; anything not
read from the publisher's own page is marked UNVERIFIED with the exact page
that would verify it.

| Source | What its published pages actually say | Status |
|---|---|---|
| stats.nba.com endpoints (incl. `shotchartdetail`, `playergamelog`, `commonplayerinfo`, draft/combine endpoints) | In-repo stub (`pipeline/shotcharts/sources/stats_nba.py`) records: "stats.nba.com's terms of use restrict automated access to the stats endpoints. Even a working technical path needs a ToS review before any fetch is wired." The primary NBA terms text was NOT read from nba.com in this run (fetch blocked by tool policy; see method note). Secondary mirrors quoting NBA's standard terms language say, in close paraphrase: content is provided "for your personal, non-commercial use only"; you may not use it "in any manner that (i) is a source of or substitute for the Service or the content; (ii) affects our ability to earn money in connection with the Service or the content; or (iii) competes with the Service"; the restrictions "apply to any robot, spider, scraper, web crawler, or other automated means"; and you agree "not to … bypass or circumvent other measures employed to prevent or limit access to the Service by automated means." Mirror quotations are consistent across several unrelated mirror pages, but they are NOT the primary text and may be stale. | PARTIALLY VERIFIED via secondary quotation; PRIMARY TEXT UNVERIFIED. Verifying page: `nba.com/news/termsofuse` (NBA Terms of Use), read directly, plus any stats-specific terms if NBA publishes them separately. |
| cdn.nba.com / api.nba.com capture feed (`api.nba.com/statscapture/games/<id>/playbyplay`) | No published terms, data-use grant, or public API documentation for the statscapture capture feed was found. It is an internal live-capture feed, not a published public API: the 5 PBP files on disk (2026-10-20/21, SHOT_POSITION.md §2.2) were obtained through it, but no page grants reuse. The CDN host (`cdn.nba.com/static/json/liveData/*`) is separately edge-blocked by Akamai Bot Manager (HTTP 403, SHOT_POSITION.md §2.3) — a technical enforcement fact, not a license. Do not conflate the two hosts. | UNVERIFIED. Verifying pages: any NBA published terms covering `api.nba.com` / capture feeds (none located); absent that, treat as NBA-terms-governed by default and get a legal read. |
| Basketball-Reference / Sports Reference LLC (advanced, awards, positions, contracts, shot charts, draft pages) | Terms of Use read in full this run (`sports-reference.com/termsofuse.html`, fetched 2026-10-26). Key passages, quoted: §5 guiding principles — "(1) sharing, using, modifying, repackaging, or publishing data found on individual SRL webpages is welcomed, whether for commercial or non-commercial purposes, but (2) any such sharing, use, modification, repackaging, or publication should explicitly credit SRL as the source of the data to the maximum extent possible and (3) any such sharing, use, modification, repackaging, or publication must not violate any express restrictions set forth in this Section 5, especially … 5(i) and 5(j)." §5 item 9 — "without our express written permission, use any automated means to access or use the Site, including scripts, bots, scrapers, data miners, or similar software, in a manner that adversely impacts site performance or access." §5 item 10 — "use any material or Content from the Site, including without limitation any statistics or data, (i) to create any database, archive, or other data store that competes with or constitutes a material substitute for the services or data stores offered on the Site or by the Site's Data Providers or (ii) to provide any service that competes with or constitutes a material substitute for the services or data stores offered on the Site or by the Site's Data Providers." §5 item 11 — "copy or use any material or Content from the Site, including without limitation any statistics, data, text, graphics, or images, for purposes of training, fine-tuning, prompting, or instructing artificial intelligence models or technologies in any manner, including without limitation for purposes of (i) generating answers, text, scores, statistics, notes, graphics, images, or any other output; or (ii) supporting machine learning methods used to predict, classify, label, or score inputs into the models." §6 — the search-engine robot exception is for search engines only ("for the sole purpose of creating publicly available searchable indexes"), and "search engines are not permitted to cache, copy, or archive any material or Content … for purposes of offering a competing or substitute product." Bot Traffic page (`ssref.com/bot-traffic.html`, updated 2024-05-29): "we will block users sending requests to: FBref and Stathead sites more often than ten requests in a minute [and] our other sites more often than twenty requests in a minute … If you violate this rule your session will be in jail for up to a day." Also: "Most of our data comes from third parties who sell the data to us. As part of our agreements with them we can not provide the data available as a download on our site." Sharing page: "You are free to use this data anywhere, we would just ask that you include the citation at the bottom of the table as a courtesy." The sharing page's friendliness does NOT override §5 items 10–11. | VERIFIED from publisher's own pages (terms + bot page + sharing page), fetched 2026-10-26. Remaining gap: SRL's separate "data use and licensing guidelines" page referenced in §5 was not separately read; it cannot soften §5 items 10–11 without a legal read. |
| Basketball-Reference robots.txt | In-repo module claim (`pipeline/shotcharts/sources/bbr.py`, header): "robots.txt: /boxscores/ not disallowed." That claim was NOT independently re-verified against the live robots.txt file in this run (no direct robots.txt fetch was returned). It is a robots fact at most: even if true, it grants no license, and SRL §6 confines robot permission to search-engine indexing. | MODULE-CLAIMED, NOT INDEPENDENTLY RE-VERIFIED. Verifying page: `basketball-reference.com/robots.txt` (and `sports-reference.com/robots.txt`), read directly. |
| ESPN core API (`sports.core.api.espn.com`) + site API (`site.api.espn.com`) | No current ESPN data-use grant for the core API was found. Facts established: the endpoints are public and no-auth, and responses carry `Access-Control-Allow-Origin: *` — a CORS header, NOT a license and NOT permission to redistribute. The old ESPN Developer Center program (2012-era terms quoted in contemporary press: apps must carry an approved ESPN mark, no advertising/sponsorship except ESPN-approved, apps free of charge, ~1 call/sec / 2,500 calls/day for basic users) is retired; those terms cannot be assumed to govern the current undocumented endpoints, and the current ESPN.com Terms of Use were not read from a primary ESPN page in this run. Third-party guides describe the API as "unofficial, undocumented … ESPN publishes no rate limits or guarantees." | UNVERIFIED for current terms. Verifying pages: current ESPN.com Terms of Use, and any ESPN developer/API terms page if one is published. Until read, "public and no-auth" must not be written up as "least-encumbered" without the qualifier that no grant was found. (SHOT_POSITION.md §6 / INVENTORY.md §5 called ESPN a "least-encumbered candidate" — that characterization is now downgraded to UNVERIFIED-grant; it remains true only in the narrow technical sense of no-auth access.) |
| Kaggle salary export (`salaries_history.csv`) | Upstream is undocumented: `pipeline/fetch_salaries.py` says only to "search for 'NBA player salaries' or 'nba_salaries' datasets" on Kaggle, or use HoopsHype / BBRef / Spotrac / RealGM. No dataset name, URL, uploader, or license is recorded in the file or its schema (SOURCES.md §7; INVENTORY.md §5). Kaggle licenses are per-dataset (CC0, CC BY, CC BY-NC, custom "no redistribution without consent" terms all occur on the platform) — so no platform-level statement can clear this file. | UNVERIFIED. Verifying page: the specific Kaggle dataset page the CSV came from (unknown — first identify the dataset by matching columns/values, then read its license tab), or the HoopsHype/Spotrac/RealGM export page if that was the true upstream. |
| HoopsHype salaries (alternative upstream named in `fetch_salaries.py`) | No HoopsHype terms or data-use page was read in this run. HoopsHype is a USA Today/Gannett property; its parent terms were not checked. A "browser export or one-off scrape" workflow (per the script docstring) is a collection method, not a grant. | UNVERIFIED. Verifying page: HoopsHype terms of use / USA Today Network terms, read directly. |
| Draft / combine data | No separate draft/combine license exists in-repo. Two routes, two postures: (a) stats.nba.com draft/combine endpoints → same NBA-terms posture as stats.nba.com above (primary text UNVERIFIED); (b) BBRef draft pages → Sports Reference Terms §5 above, including the AI-training ban. Combine measurements republished from the NBA's official combine are NBA content under (a) regardless of which mirror they were copied from. | DERIVED FROM the two rows above; no independent terms page. Verifying pages: same as stats.nba.com and Sports Reference rows. |
| Tracking data (NBA stats `playertracking` endpoints; Second Spectrum raw) | NBA stats tracking endpoints are stats.nba.com endpoints → NBA-terms posture above. Second Spectrum raw tracking data: no public license exists. Published reporting is consistent that Second Spectrum is the NBA's official optical tracking provider under a league-wide enterprise agreement, that raw player-position data is proprietary to Second Spectrum / the league (e.g. a 2025 peer-reviewed paper states "Data of precise NBA player positions are proprietary to Second Spectrum" while releasing only a processed subset), and that public access is via the NBA's own published aggregates (shot locations, touches) rather than the raw feed. The program holds no Second Spectrum agreement and no raw tracking feed. | Second Spectrum raw: NO PUBLIC GRANT — treat as enterprise-only. Verifying page: none public; the absence of a public grant IS the finding. NBA tracking aggregates: same UNVERIFIED-primary-text status as stats.nba.com. |
| Open alternatives (not currently in the product; noted for the ledger's `license` vocabulary only) | Not investigated in depth this run. Any future "open" source (e.g. a CC0/CC BY dataset) must still be recorded per-file with its license tab read, not assumed from its host's reputation. | OUT OF SCOPE; do not substitute an open alternative for a rights review. |

### What changed vs. the earlier lanes

1. BBRef terms moved from "UNCONFIRMED" (SOURCES.md §7) to VERIFIED — and the
   news is bad under a strict reading: §5 item 11 bans AI-model training on
   SRL content, and item 10 bans competing/substitute databases. The earlier
   lanes' "robots.txt posture, not a license" framing was correct but
   incomplete: the binding document is the Terms of Use, and it is stricter
   than the robots fact.
2. ESPN moved from "least-encumbered candidate" to UNVERIFIED-grant: no-auth
   access plus a permissive CORS header is not a data-use grant, and the only
   ESPN developer terms found are from a retired program.
3. NBA terms remain UNVERIFIED from the primary source; the in-repo stub's
   ToS caveat stands and is now corroborated in substance (not in text) by
   consistent secondary quotations. The caveat must not be paraphrased as a
   quotation of NBA's current terms until the primary page is read.
4. Salary CSV remains UNVERIFIED, with the added point that Kaggle has no
   single license — identifying the dataset is a precondition to any claim.

---

## 2. Redistribution analysis

Posture key: **LIKELY FINE** = the item, as described, is a plausible
candidate for redistribution on the evidence cited — still hedged, still not
a legal opinion. **UNCLEAR** = evidence cuts both ways or the governing terms
were not verified; needs a legal read before redistribution. **DO NOT
REDISTRIBUTE** = redistribution would breach an express term found in §1 or
would republish third-party material verbatim with no grant.

| Item to redistribute | Posture | Reasoning (hedged to its evidence) |
|---|---|---|
| 64-d learned embeddings (MTNN output weights / vectors) | UNCLEAR | Favorable: embeddings are heavily transformed derivatives — no raw table, text, image, or mark is reproduced; learned weights are not a copy of any source page. Adverse and load-bearing: to the extent the model was trained on BBRef-derived features, SRL Terms §5 item 11 expressly bans using SRL content "for purposes of training … artificial intelligence models … including … supporting machine learning methods used to predict, classify, label, or score inputs." A derived output does not automatically cure a barred input use. If a future model is trained with BBRef-derived features removed and only NBA/ESPN/facts inputs remain, the posture improves toward LIKELY FINE — but NBA terms (personal, non-commercial, per secondary quotation) and ESPN's unverified terms still need the legal read. Do not ship new BBRef-trained weights until that read lands. |
| 14-stat per-100 z-scored player-season profiles (the served `vectors.json` profile fields) | UNCLEAR | Favorable: player names + game statistics are facts, and z-scoring is a further transformation; no SRL table layout, text, or mark is reproduced. Adverse: the same SRL §5 item 11 / item 10 analysis as embeddings applies to the training/serving inputs insofar as they derive from BBRef; and per secondary NBA quotation, NBA content is "personal, non-commercial use only," which a public served product may exceed. Aggregation + transformation helps the argument; it does not settle it. Legal read required before any claim stronger than "derived from public game statistics." |
| Aggregated zone shares / shot-position aggregates (e.g. % of shots from Corner 3, by player-season) | UNCLEAR if BBR/ESPN-sourced; LIKELY FINE only if computed from an NBA-licensed or facts-only feed | Favorable: zone shares are small aggregates, not reproductions of any source's table or chart; SRL §5's guiding principles welcome "sharing … data found on individual SRL webpages" with credit. Adverse: §5 item 10 bars creating a substitute data store, and a bulk zone-share table for all 12,966 player-seasons starts to look like a substitute dataset rather than sharing from individual pages; §5 item 11 reaches model-training use of the same aggregates. Per-season aggregates shown on a player page with credit are a much easier case than a downloadable all-seasons aggregate file. Keep aggregates behind the served product, not as a downloadable dataset, until the legal read. |
| Shot coordinates, per-shot (x, y, made/missed, zone) — BBR-derived (pixel→feet conversion) or ESPN-derived (feet transform) | UNCLEAR as a served visualization; DO NOT REDISTRIBUTE as a bulk file | Coordinates derived from BBR chart dots are a transformation of SRL content (pixel positions + reported distances), so §5 items 10–11 apply to bulk reuse; a per-game visualization with SRL credit is closer to the §5 "individual webpage" welcome than a 30-season shot-coordinate dump. ESPN-derived coordinates inherit ESPN's UNVERIFIED terms — no grant was found, so bulk redistribution cannot be cleared on "public API" alone. Never redistribute the raw chart-dot pixel data or ESPN's raw play objects. |
| Shot coordinates, per-shot — NBA ShotChartDetail / statscapture PBP | UNCLEAR for aggregates; DO NOT REDISTRIBUTE raw rows | Same NBA-terms problem as above (primary text unverified; secondary quotation: personal, non-commercial; no automated-means use; no bypass). Aggregated zone shares from an NBA feed are the most defensible NBA-derived output; raw per-shot rows republished verbatim are the least. The statscapture feed has no published grant at all. |
| Raw play-by-play text (ESPN play text, NBA PBP action text) | DO NOT REDISTRIBUTE | Verbatim third-party prose with no redistribution grant from either publisher; ESPN's current terms are unverified and NBA's quoted terms are personal/non-commercial. The shipped product already serves no PBP text (SOURCES.md §7) — keep it that way. Internal training use of PBP text is a separate question for the legal read; public serving is out. |
| Raw scraped tables verbatim (BBRef tables, NBA endpoint JSON, ESPN play objects, salary CSV) | DO NOT REDISTRIBUTE | Directly barred in the BBRef case by §5 item 10 (no competing/substitute database, no materially significant copying — SRL's own framing: "copy a materially significant portion of our data" is the harm the terms target) and unsupported by any grant in the NBA/ESPN/salary cases. This includes publishing the `pipeline/cache/` raw files, the snapshot JSONLs, or the salary CSV as downloadable artifacts. Raw files stay internal, access-controlled, and ledgered — or are deleted on a retention schedule the legal read sets. |
| Salary figures as served features (per-season salary / cap-hit numbers inside a player profile) | UNCLEAR | Salary numbers are facts about contracts, which favors redistribution of individual figures with attribution; but the file's upstream is unidentified, so no license chain exists at all, and a bulk salary dataset would be a substitute dataset for whichever upstream (Kaggle uploader / HoopsHype / Spotrac) actually compiled it. Serve individual figures only if at all, quarantine the bulk file, and identify the upstream before any redistribution decision. |
| Player names + seasons + team affiliations | LIKELY FINE | Names and seasons are facts, not protectable expression; no source's terms can plausibly bar stating that a player played a season. (This does not extend to biographical prose, photos, or marks, none of which the product serves.) |
| Derived model explanations (twin lists, nearest neighbours, "why they're twins" chips) | LIKELY FINE, conditional on the embedding posture above | Twin lists are outputs of the derived model, not reproductions of source content. Their posture inherits the embedding row: if the model itself is cleared, its outputs follow; if the BBRef-training question is unresolved, outputs are UNCLEAR by inheritance, not by their own content. |
| Second Spectrum raw tracking (per-frame player positions, pose data) | DO NOT REDISTRIBUTE — and DO NOT ACQUIRE outside an enterprise agreement | No public grant; published sources describe precise position data as proprietary to Second Spectrum / the league. The program does not hold it and must not obtain it via scrape, leak, or third-party mirror. Aggregates the NBA itself publishes (tracking aggregates on stats.nba.com) are a different item and fall under the NBA row. |
| Logos, trademarks, photos, video, audio | DO NOT REDISTRIBUTE (already excluded) | SRL Terms §7, NBA terms (marks), and ESPN terms all reserve marks; the product serves none. Keep the exclusion enforced in every new surface (including Pixel-sprite renders and story pages: no team logos, no player photos). |

### The facts-vs-compilation tension, stated plainly

The program's best argument is that game statistics are facts and its outputs
are transformed derivatives. The counter-argument, visible in the sources'
own terms, is that compilations, arrangements, and selections are claimed as
protected content (SRL §2: SRL "owns or licenses … the selection,
coordination, arrangement, and organization" of its content; NBA's quoted
terms claim the service as a "collective work or compilation"), and that
SRL's terms add express bans (competing database, AI training) that do not
depend on copyrightability of individual numbers. A legal read must resolve
which theory governs each output — this file deliberately does not.

---

## 3. Attribution requirements per source

Attribution is necessary in some cases and never sufficient on its own: a
credit line does not cure a barred use (notably SRL §5 item 11, which has no
credit exception).

- **Basketball-Reference / Sports Reference LLC — REQUIRED where SRL data is
  shown or derived from.** SRL §5 guiding principle (2): sharing/repackaging
  "should explicitly credit SRL as the source of the data to the maximum
  extent possible." Sharing page: "include the citation at the bottom of the
  table as a courtesy." Credit line to use on any page showing SRL-derived
  values: `Data: Basketball-Reference.com (Sports Reference LLC)` with a link
  to the source page where the value came from (player page, box score, or
  shot-chart page) — per-page links, not a single generic footer, wherever
  feasible. Teachers/search-engine exceptions (§6) do not apply to this
  program. Note: the served product currently carries no SRL credit line that
  this investigation found — add one for any SRL-derived surface, and record
  it in the ledger (see §4) rather than assuming the existing footnote covers
  it.
- **NBA / stats.nba.com — CREDIT CUSTOMARY, NOT A GRANT.** No credit line
  was found in NBA's quoted terms that would authorize reuse; do not write a
  credit line as if it were permission. Where NBA-derived values are shown,
  the honest line is `Stats: NBA (stats.nba.com)` — presented as provenance,
  not as a license claim — and only alongside the "derived from public game
  statistics, no media or marks" product claim, never "rights-free."
- **ESPN — CREDIT EXPECTED IF USED, TERMS UNVERIFIED.** The retired Developer
  Center terms required an approved ESPN mark on apps; those terms are
  retired and must not be copied into current pages. Until current ESPN terms
  are read, use a plain provenance line (`Play data: ESPN`) and do not use
  ESPN logos or marks.
- **Kaggle salary export — ATTRIBUTION PER THE (UNKNOWN) DATASET LICENSE.**
  CC BY would require creator name + dataset title + link; CC0 would not
  require attribution but practice favors it; a custom license may forbid
  redistribution outright. No credit line can be finalized until the dataset
  is identified. Interim line, if salary figures are shown at all:
  `Salary data: source unidentified (under provenance review)` — an honest
  flag, not a credit.
- **HoopsHype / Spotrac / RealGM (if identified as the salary upstream) —
  UNVERIFIED.** Credit per that publisher's terms once read; until then, the
  same "source unidentified" flag applies.
- **Second Spectrum — NO ATTRIBUTION LINE CAN AUTHORIZE USE.** Do not credit
  Second Spectrum as a source for data the program does not lawfully hold.
  If the NBA's own published tracking aggregates are used, credit the NBA
  (see NBA row), not Second Spectrum.
- **Draft / combine — CREDIT THE ROUTE, NOT THE MIRROR.** stats.nba.com
  route → NBA line; BBRef route → SRL line. Never credit a mirror site that
  merely republished the measurements.

---

## 4. Provenance ledger design

### Where it lives

- **Ledger file (append-only):**
  `pipeline/provenance/ledger.jsonl` in the serving repo checkout
  (vector-hoops-mlops-v2 lineage; the file is a design spec here — this
  investigation wrote nothing to any live checkout).
- **Format:** JSONL, one record per source file per pipeline event, never
  edited in place. Corrections are new records with `supersedes` pointing at
  the prior record's `record_id`. A companion human-readable manifest,
  `pipeline/provenance/MANIFEST.md`, is generated from the ledger at build
  time (never hand-edited) and ships with the build's provenance note.
- **Retention:** raw source files referenced by the ledger are retained
  under `pipeline/cache/` (or an access-controlled archive) for at least as
  long as any model trained on them is served; deletion of a raw file
  requires a ledger `retention` record stating what was deleted, when, and
  under which decision. Deleting raw files does not delete ledger records.
- **Per-season source rule (from SHOT_POSITION.md §6):** the ledger records
  `source` per season, not per tower. A season whose source changes (e.g.
  ShotChartDetail for 2020+, BBRef before) gets separate records per season,
  so a future rights review can excise or re-license one season without
  invalidating the whole tower.

### Schema (one JSON object per line)

```jsonc
{
  "record_id": "prov-20261026-0001",        // unique, monotonic; never reused
  "event": "fetch | snapshot | aggregate | integrate | supersede | retention",
  "event_time_utc": "2026-10-26T04:12:00Z", // when the event ran
  "source": "stats_nba | nba_statscapture | basketball_reference | espn_core | kaggle | hoopshype | second_spectrum | unknown",
  "source_detail": "ShotChartDetail | playbyplay | shot-chart | contracts | core-plays | salaries_history | ...",
  "season": "2023-24",                       // single season; one record per season per file
  "fetch_date": "2026-10-20",                // date the bytes were obtained (UTC)
  "endpoint_or_url_pattern": "https://stats.nba.com/stats/shotchartdetail?PlayerID={id}&Season={season}",
  "access_method": "nba_api | browser-ua-script | html-scrape | public-noauth-api | manual-drop | enterprise-feed",
  "file_path": "pipeline/cache/shotcharts/stats_nba/2023-24.json",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "record_count": 128431,                    // rows/records in the file
  "row_key": "player_id+season | game_id+player_id | event_id",
  "column_or_field_list_sha256": "…",        // hash of the sorted field list (schema drift detector)
  "parent_record_ids": ["prov-20261020-0007"], // inputs this record derives from; [] for raw fetches
  "output_artifact": "pipeline/cache/shotcharts/snapshots/shotcharts-20261020.jsonl",
  "output_artifact_sha256": "…",
  "license_posture_tag": "VERIFIED-GRANT | CREDIT-ONLY | UNCLEAR | BARRED-USE | UNVERIFIED",
  "license_note": "SRL ToS §5 item 11 bans AI training on this content; legal read pending",
  "attribution_line": "Data: Basketball-Reference.com (Sports Reference LLC)",
  "rate_limit_observed": "1 req/3s, single-threaded",
  "supersedes": null,                        // record_id this record corrects, if any
  "actor": "fetch script name + host (e.g. hatch-vm, alienware-forge)",
  "notes": "free text: probes, blocks, anomalies (e.g. HTTP 403 Akamai, HTTP 000 tarpit)"
}
```

Posture-tag vocabulary (closed list; a record with no tag is invalid):
- `VERIFIED-GRANT` — a publisher page granting this use was read and is cited
  in `license_note`. (No current source holds this tag for model training.)
- `CREDIT-ONLY` — the publisher welcomes sharing with credit and no broader
  ban applies to this specific use (e.g. SRL per-page sharing with credit,
  non-training, non-bulk).
- `UNCLEAR` — terms cut both ways or are unverified; usable internally only
  until a legal read, never as the basis for a public "rights-free" claim.
- `BARRED-USE` — an express term bans this use (e.g. SRL content for AI
  training under §5 item 11; verbatim bulk republication under §5 item 10).
  A `BARRED-USE` input blocks its downstream artifacts from being marked
  cleared, and must be surfaced in the build's provenance note.
- `UNVERIFIED` — no terms page read yet (e.g. ESPN current terms, NBA primary
  text, salary upstream). Treated as UNCLEAR for shipping decisions.

### How each pipeline stage writes to it

- **Fetch (raw collection).** Every fetch script appends one `fetch` record
  per file per season at write time: source, fetch date, endpoint/URL
  pattern, access method, file path, sha256, record count, field-list hash,
  rate-limit observed, actor host. A fetch that returns a block (HTTP 403 /
  000 tarpit / jail) still appends a record with `record_count: 0` and the
  block in `notes` — blocks are provenance too, and they are how the next
  investigator knows not to re-probe blindly. No fetch may write a file
  without a ledger record; the fetch wrapper (not each script's goodwill)
  enforces this by hashing the file it just wrote.
- **Snapshot (canonicalization).** Each snapshot job appends one `snapshot`
  record per output file: `parent_record_ids` = the raw fetch records it
  consumed, output path + sha256, the transform applied (e.g. "BBR pixels →
  feet, HOOP_X_PX 239.87, PX_PER_FT 9.962"), and the inherited posture tag
  (the strictest tag among its parents — a snapshot never upgrades its
  parents' posture).
- **Aggregate (features).** Each aggregation appends one `aggregate` record
  per output: `parent_record_ids` = snapshot records, the aggregation
  definition (e.g. "zone shares per player-season, 5 zones"), per-season
  source breakdown, and the strictest inherited tag. Aggregates that mix
  sources carry one record per season-source pair, never a blended tag.
- **Integrate (matrix / model input).** The matrix build appends one
  `integrate` record per feature family per build: the full
  `parent_record_ids` closure (aggregate records → snapshot records → fetch
  records), the feature manifest column list + its hash, the model run id,
  and the build's overall posture (strictest tag in the closure). The
  build FAILS (loudly, not silently) if any input in the closure carries
  `BARRED-USE` and no legal-read override record exists; the override, if
  one is ever granted, is itself a ledger record citing the legal read's
  date and scope — never a code comment or a chat message.

### The audit query it must answer

Question: **"For this feature value, show me every source file behind it."**

Procedure (implemented as `pipeline/provenance/audit.py`, reading only the
ledger — no re-fetching):

```
audit.py --player-id <NBA PLAYER_ID> --season <YYYY-YY> --feature <column>
  1. Look up the feature in the build's feature manifest
     (column -> feature family -> integrate record_id).
  2. Walk parent_record_ids transitively from that integrate record
     down to fetch records (closure; cycles rejected).
  3. Print, per leaf fetch record: source, season, fetch date,
     endpoint/URL pattern, file path, sha256, record count,
     license_posture_tag, license_note, attribution_line.
  4. Print the strictest posture tag in the closure and whether any
     BARRED-USE or UNVERIFIED leaf exists.
  5. Exit non-zero if any leaf file's current sha256 no longer matches
     the ledger (tamper/drift signal).
```

Example (illustrative, using the lanes' own numbers, not a live query):

```
$ audit.py --player-id 2544 --season 2023-24 --feature zone_corner3_share
integrate prov-20261026-0042  family=shotpos  tag=UNCLEAR
  aggregate prov-20261026-0031  zone shares, 2023-24, BBR-sourced
    snapshot  prov-20261020-0019  shotcharts-20261020.jsonl (545 records)
      fetch   prov-20261020-0007  basketball-reference.com/boxscores/shot-chart/…
              sha256=…  tag=CREDIT-ONLY (per-page sharing) → inherited UNCLEAR
              for bulk aggregate use; SRL ToS §5 items 10–11 noted
STRICTEST TAG IN CLOSURE: UNCLEAR — 1 UNVERIFIED leaf? no; 1 BARRED-USE leaf? no
```

If the audit cannot walk from a served value to fetch records (missing
links, unledgered legacy files such as the salary CSV), the answer is "the
chain is broken at <stage>" — and that broken link is itself a finding, not
a gap to paper over. Legacy files with no fetch record (notably
`salaries_history.csv`) get a single backfilled `fetch` record marked
`source: unknown`, `access_method: manual-drop`, `license_posture_tag:
UNVERIFIED`, with the identification task left open — never a guessed source.

---

## 5. The kill list (strict reading — stated plainly)

These stop now, or stop at the next decision point named. "Strict reading"
means: what the published terms say on their face, before any legal read
argues a narrower interpretation. A legal read may lift individual items;
silence, habit, or "everyone does it" does not.

1. **STOP training (or re-training) any model on Basketball-Reference
   content until the legal read on SRL Terms §5 item 11 lands.** The clause
   bans copying or using SRL content "for purposes of training, fine-tuning,
   prompting, or instructing artificial intelligence models" — and MTNN is
   an AI model trained on BBRef-derived features. This covers new training
   runs first; the already-shipped BBRef-trained champion is a retrospective
   exposure to be put to the legal read explicitly, not quietly grandfathered.
   Do not start a "clean" retrain that still includes BBRef advanced/award/
   contract/shot features and call it clean.
2. **STOP redistributing raw scraped tables verbatim** — BBRef tables, NBA
   endpoint JSON, ESPN play objects, snapshot JSONLs, and the salary CSV as
   downloadable artifacts. SRL §5 item 10 bars competing/substitute data
   stores; no other source grants verbatim republication either. Raw files
   stay internal and ledgered.
3. **STOP redistributing raw play-by-play text and raw per-shot rows in bulk.**
   No grant exists for either; per-game visualizations with credit are a
   different, narrower case (see §2) and still need the legal read for bulk
   or downloadable forms.
4. **STOP evading bot blocks.** No IP rotation, no fingerprint spoofing, no
   headless-browser evasion, no residential egress, no header rotation to
   defeat Akamai Bot Manager or SRL's bot filtering. Concretely: do not
   extend the existing `nba_http.py` browser-mimicry pattern (Origin/Referer
   set to nba.com, `x-nba-stats-origin`/`x-nba-stats-token` headers,
   `chrome120` impersonation profile) to new endpoints such as
   `shotchartdetail` without a ToS review — under the secondary NBA quotation
   that pattern is exactly "bypass or circumvent … measures employed to
   prevent or limit access … by automated means." The existing pattern's
   past use goes to the legal read; its future extension stops here. SRL
   scraping, where it continues at all (see item 1), stays within the
   published rate ceiling (≤20 req/min for non-FBref/Stathead sites) with
   margin — the shot module's ≤1 req/3 s sits exactly at the ceiling, so
   run it slower (≤1 req/4 s) and strictly single-threaded, and stop on any
   jail/block signal for 24 hours rather than retrying around it.
5. **STOP claiming "rights-free," "open data," or "licensed" for this
   product.** The honest claim remains "derived from public game statistics,
   no media or marks" — and even that claim must carry the per-source
   provenance note once the ledger exists. Never upgrade robots.txt
   compliance, no-auth access, or a permissive CORS header into a license
   in any doc, page footer, or PR description.
6. **STOP using the salary CSV as if its upstream were known.** Quarantine
   the market family for redistribution purposes until the upstream dataset
   (Kaggle dataset page, or HoopsHype/Spotrac/RealGM export) is identified
   and its license read. Internal training use of already-merged salary
   features goes to the same legal read as item 1; no new salary backfill
   from an unidentified scrape.
7. **STOP building a competing/substitute statistical database.** A
   downloadable all-seasons, all-players stat file — even derived — must not
   be published as a dataset product. The served product is a model and its
   explanations, not a data store. If a future feature starts to look like a
   queryable stat database, it goes back for a legal read first.
8. **STOP acquiring Second Spectrum raw tracking data by any unofficial
   route.** No scrape, no leaked dataset, no third-party mirror. Raw
   per-frame positions are enterprise-only; the program's location work
   stays on NBA-published aggregates, ESPN/BBR shot coordinates (under items
   1–4), and the statscapture feed (under its UNVERIFIED status) — and the
   fine-level "continuous trajectory" ambition stays BLOCKED until a lawful
   trajectory source exists, which this investigation confirms it does not.
9. **STOP new stats.nba.com automated collection until the primary NBA terms
   are read and an approved access path exists** (approved API key or
   official feed, per the shot stub's own retry procedure). The technical
   blocks (HTTP 000 tarpit on `/stats/*`, HTTP 403 Akamai on CDN) are the
   enforcement of that gate, not obstacles to route around.
10. **STOP treating a season's source as interchangeable.** Any tower or
    matrix that mixes sources across seasons without per-season ledger
    records is non-compliant with §4 by construction — fix the ledger
    before the next build, not after.

### What is NOT on the kill list (to avoid over-correction)

- Internal, ledgered research reads of public pages at polite rates for
  evaluating a source (as this investigation did) are not redistribution.
- Serving already-derived, heavily transformed model outputs (twin lists,
  explanations) is UNCLEAR by inheritance (§2), not independently barred —
  it is gated on the legal read, not killed outright.
- Player names, seasons, and individual game-stat facts remain LIKELY FINE
  to state.

---

## Sources consulted (2026-10-26)

- In-repo: `lanes/01-data-collection/SOURCES.md` §7; `lanes/07-pipeline-overhaul/
  SHOT_POSITION.md` §§2.1–2.5, §6; `lanes/07-pipeline-overhaul/INVENTORY.md` §5;
  `pipeline/shotcharts/sources/{bbr,espn_plays,stats_nba,nba_cdn}.py`;
  `pipeline/nba_http.py` (`_STATS_HEADERS`, `chrome120` impersonation);
  `pipeline/fetch_salaries.py` (sourcing notes); LICENSE absence re-confirmed
  in both checkouts.
- Publisher pages read: Sports Reference Terms of Use
  (`sports-reference.com/termsofuse.html`); Sports Reference Bot Traffic page
  (`ssref.com/bot-traffic.html`, updated 2024-05-29); Sports Reference sharing
  page (`sports-reference.com/sharing.html`).
- Secondary/press sources (marked as such in §1, not treated as primary
  terms): mirror quotations of NBA standard terms language; 2012-era ESPN
  Developer Center terms via contemporary press; Second Spectrum enterprise
  reporting and the 2025 DFFT paper's data-availability statement.
- NOT verified from a primary page in this run (see §1 for the exact
  verifying page in each case): NBA Terms of Use primary text; ESPN current
  Terms of Use / API terms; `basketball-reference.com/robots.txt` (live file);
  SRL's separate data-use and licensing guidelines page; the salary CSV's
  upstream dataset page; HoopsHype terms.

---

## Verdicts

VERDICT: PASS — per-source terms table with quotes or UNVERIFIED marks — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: PASS — redistribution table with per-item hedged posture — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: PASS — attribution requirements per source — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: PASS — provenance ledger schema, stage writes, and audit query — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: PASS — kill list under a strict reading — ~/workspace/mlops-v2-drafts/data-deep-dive/provenance-legal.md
VERDICT: BLOCKED — program cleared for republication / further BBRef-fed training — legal read still needed (SRL ToS §5 item 11 AI-training ban; NBA primary terms and ESPN current terms unverified; salary upstream unidentified)
