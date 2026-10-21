# User-feedback triage — format

report → triage → fix → changelog. Every user report gets a ticket; every
ticket gets a decision; every fix gets a changelog line.

## The ticket

| Field | What |
|---|---|
| `report` | the user's words, verbatim (never paraphrased into oblivion) |
| `date` | when it arrived |
| `surface` | page / feature / route |
| `repro` | steps to reproduce, or "could not reproduce" |
| `severity` | `blocker` / `wrong-number` / `confusing` / `polish` / `noise` |
| `bucket` | data bug / model question / UX / performance / security / noise |
| `owner` | who decides |
| `decision` | fix now / queue / won't fix (with reason) / needs-his-call |
| `changelog` | the line that ships when the fix lands |

## Severity guide

- **blocker** — page broken, game unplayable, wrong numbers presented as
  right. Acknowledge same-day; fix before the next launch.
- **wrong-number** — a number that fails its provenance. Treat it like a
  data QA failure: hard-block the claim until it's recomputed from source.
  Never "approximately fix" a wrong number.
- **confusing** — the page is right but reads wrong. Plain-words rewrite
  (Twin Explainer pattern: plain words, real numbers).
- **polish** — visual/UX nits. Queue with the design passes.
- **noise** — not actionable. Logged, closed, no reply needed.

## The rules

- A wrong-number report triggers the provenance ledger: recompute from
  source, update the ledger row, ship the fix, write the changelog.
- "Needs his call" items get one quiet tap, never a stack. Never re-offer
  a declined option.
- Fixes reference the ticket; tickets close only when the changelog line ships.
- Triage is read-only on the product until the decision lands — no
  drive-by fixes without a ticket.

## Worked pattern

The user-evidence walkthrough produced an 11-item fix list — the template
for how a batch of reports becomes shipped fixes:
- Daily Court score contradictions
- the 64-d vs 14-d footer conflation
- SHARE with no confirmation
- false guess-eligibility rejections
- …and seven more, each ticketed, each with evidence

Batched, ordered by his call, fixed with receipts, one changelog line each.
That is the rhythm: batch the small stuff, order it with him, ship it with
evidence.

## Changelog format

`- <date> — <surface>: <what changed> (fixes #<ticket>, PR #<n>)`

One line per fix. No hype. What changed, where, which PR.
Example:
`- 2026-10-20 — footer: 14-d scoring copy → 64-d (fixes #7, PR #127)`
