---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0001](0001-use-adrs-for-decisions.md)"
---

# ADR-0616: An ADR number identifies one decision, and the collisions are a worklist

## Context and Problem Statement

Comments cite decisions by **number** — `(ADR-0433)` — because that is what fits in a comment. So a
number that names two decisions turns every one of its citations into a question.

23 numbers were shared by two or three ADRs each, and 19 of those were cited from code across 256
citations. It goes back to 0063 and runs through 0589. The cause is written down in
`check-decision-log-index.mjs` and is always the same: a branch numbers its ADR off a stale `main`,
another branch numbers the same one, both land, and nothing fails — each file is individually
well-formed and the decision log is keyed on filename.

That was tolerated, and stated as tolerable: the same guard's header read *"two ADRs may legitimately
share a number after a collision, and the filename is the only unambiguous identity."*

Then it cost something real. #936 hit a collision on 0587, resolved it by renaming its own ADR to
0588, and replaced `ADR-0587` with `ADR-0588` across the tree. That swept up all thirteen citations
belonging to #942's guest-owned Runs, which had landed on 0587 first. Those comments then pointed
confidently at an unrelated decision — strictly worse than pointing at two, because a reader who
follows one is misled rather than merely stuck, and nothing in the repo could tell.

## Decision Outcome

Chosen: **a number identifies one decision; `check-adr-numbers.mjs` enforces it against a shrinking
worklist.**

- The guard fails when a number is owned by more than one ADR, and when a cited number is owned by
  none. It reads citations from every tracked source and doc **except** `docs/adr` itself, which
  links by filename and is therefore never ambiguous.
- `adr-duplicate-baseline.json` holds the collisions that already existed. It is a **worklist, not an
  allowance**, and it only shrinks: a number that has been made unique must be removed from it or the
  guard fails. That is what stops the list being topped up instead of drained.
- An **uncited** collision fails too, and says so — that is the cheapest moment to fix one, because
  no citation has to be attributed yet.
- The sibling guard keeps its filename keying and now says why: a row's job is to index a FILE, and
  whether the number identifies one decision is this guard's job. The two together are what make a
  citation followable — one proves the decision is indexed, the other that it is identified.

**Renumbering is not a rename.** Every citation of a shared number has to be attributed to the right
side first, and getting that wrong recreates the #936 defect by hand. Attribution has two evidence
sources, in order: `git blame` on the citation line (does the commit that wrote it also add one of
the candidate ADRs?), and the topic of the citing file read against both candidates. Automated
scoring over both agreed with a hand review about 80% of the time, so it is a way to propose a
decision, never to make one.

Five numbers are drained here — 0078, 0079, 0559, 0561, 0562 — chosen because every citation was read
individually and all but one belonged to the keeper. The remaining 18 are named in the baseline. The
biggest are not close calls but volume: 0064 has 31 citations belonging to the mover and 16 more
needing a judgement, and 0085 has 36 spread across 30 documents.

## Consequences

- A new collision fails CI on the branch that creates it, when it is still free to fix.
- The remaining debt is explicit, counted, and in a file that cannot silently grow.
- Draining the rest is per-number work, and each number's citations must be read. `docs/adr` is
  exempt from the citation scan, so renumbering only ever has to move links keyed on the filename —
  which is mechanical — plus the plain-text citations outside it, which are not.
- Numeric ordering stays unchecked. The 0050-0064 stretch has been out of order since long before
  any of this, and reordering accepted rows is a separate decision.

## More Information

- [`check-adr-numbers.mjs`](../../frontend/scripts/check-adr-numbers.mjs)
- [`check-decision-log-index.mjs`](../../frontend/scripts/check-decision-log-index.mjs) — the other half
