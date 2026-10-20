# SPEC — The January 1st Birthday Spike (age-fraud forensics)

**Status:** spec → run when `athletes_soccer.jsonl` completes
**/research/ slug (planned):** `january-first-birthday-spike`
**Question:** Do professional soccer players show an anomalous excess of
January 1 birthdays — the classic signature of fabricated birthdates used
to gain an age advantage in youth pipelines?

## Why this study

In youth soccer, being the oldest in your age group is a massive advantage.
Where birth registration is weak, families and academies fabricate birthdates —
and fabricated dates cluster on January 1 far beyond chance. Finding the spike
by country is detective work: it names the pipelines where the data itself
is the story.

## Data + freshness

- **Primary:** `specs/entity-anchors/v2/athletes_soccer.jsonl` (~372k players,
  Wikidata P569). Fresh: pulled 2026-10-19, pinned in provenance.
- **Controls:** `athletes_nfl/mlb/nhl.jsonl` (~43k each), NBA v1.1 players
  (2,352). If Jan 1 heaping is soccer-specific, it's not a Wikidata artifact.
- **Precision gate:** only `time_anchor.precision == "day"` records enter the
  analysis. Year-padded dates (`1946-01-01` meaning "1946") are already
  excluded by the pipeline — this is the single most important guardrail,
  because the artifact we're hunting looks exactly like the artifact we'd
  otherwise manufacture.

## Method

1. **Expected share:** 1/365.25 ≈ 0.274% of birthdays on Jan 1 (uniform null).
2. **Observed share** overall, then sliced by:
   - birthplace **country** (the interesting cut — fraud is federation-level)
   - birth **decade** (is it fading as registration improves?)
   - sport (control comparison)
3. **Test:** binomial z-score per country with ≥200 players; flag |z| > 5 and
   observed/expected > 3. Multiple-comparison note: report raw z, don't
   p-hack the leaderboard.
4. **Secondary:** full day-of-year distribution per flagged country —
   fabrication also shows up as heaping on the 1st of *every* month.

## Baselines

- Uniform 1/365.25 (primary).
- General-population birth seasonality: human births peak in late summer;
  Jan 1 is naturally *under*-represented, so the uniform null is conservative.
- Cross-sport: NFL/MLB/NHL/NBA Jan 1 rates. US sports have strong
  registration; they should sit near baseline. If they don't, suspect the
  data, not the players.

## What would invalidate it

1. **Wikidata systematically pads unknown dates to Jan 1 at the source.**
   Mitigated by the precision gate, but source-level padding before Wikidata
   ingestion is still possible. Check: do flagged countries also show
   month-1st heaping? (Fabrication heaps on 1sts generally; padding heaps
   only on Jan 1.)
2. **Real registration quirks.** Some countries register late births as Jan 1
   administratively. That's still a finding — just a bureaucratic one, not
   fraud. The writeup must distinguish "the paperwork says Jan 1" from
   "someone lied," and be honest when it can't.
3. **Selection, not fabrication.** If Jan 1 babies are genuinely *selected*
   more (relative-age effect inverted?), the spike is real but innocent.
   The decade trend helps: fabrication fades with better registration;
   selection effects don't.

## Output

- /research/ entry: question → data+freshness → method → result vs baseline →
  what would invalidate it → version/changelog (per standing rule).
- One chart: Jan 1 share by country (top 30 by player count), baseline line.
- One chart: decade trend for the top-5 flagged countries.
- No individual accusations. Countries and federations only, never players.

## Version plan

- v0.1: soccer only, country cut.
- v0.2: add decade trend + month-1st heaping check.
- v0.3: cross-sport control panel.
