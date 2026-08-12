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

**All 23 are drained, in two passes.** The first took the five whose citations were unambiguous —
0078, 0079, 0559, 0561, 0562. The second took the other 18, moving **25 ADRs** to 0591-0636 and
**87 citations** with them. Later ADRs keep the earliest-landed record's number, because that
record's citations were correct when they were written; a moved block keeps its internal order, so
the wall-mirror sequence still reads in sequence.

Three traps the drain surfaced, all worth knowing before touching a number again:

- **`evidence.decision` in `liveMediaPolicy.js` is persisted production data**, not a reference.
  `'ADR-0556'` there means what is now ADR-0560, kept because accepted media rows cannot be patched.
  Renaming it would have broken validation of live rows. It is untouched.
- **Two ADRs head with `# NNNN — Title`** rather than `# ADR-NNNN:`, so a retitle keyed on one form
  silently skips them.
- **`git grep` line numbers go stale** the moment `main` moves — mid-drain, twice. A rewrite must be
  anchored on distinctive text and require exactly one match, or it edits the wrong comment.

## Consequences

- A new collision fails CI on the branch that creates it, when it is still free to fix.
- Every `(ADR-NNNN)` in the tree now resolves to exactly one decision, so following one is reliable.
- The baseline is empty and kept: it is the seam that made the drain reviewable in batches rather
  than one sweep, and the place to reach if a collision ever has to be tolerated for a release.
- `docs/adr` is exempt from the citation scan, so a future renumber moves filename-keyed links —
  mechanical — plus the plain-text citations outside it, which are not.
- Numeric ordering stays unchecked. The 0050-0064 stretch has been out of order since long before
  any of this, and reordering accepted rows is a separate decision.

## More Information

- [`check-adr-numbers.mjs`](../../frontend/scripts/check-adr-numbers.mjs)
- [`check-decision-log-index.mjs`](../../frontend/scripts/check-decision-log-index.mjs) — the other half
