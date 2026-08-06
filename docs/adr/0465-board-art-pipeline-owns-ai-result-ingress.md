---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0466](0466-ai-artwork-intake-is-source-agnostic.md)"
partially_supersedes:
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s Generation-References-owned attempt start and returned-image ingress"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
  - "[ADR-0464](0464-generation-references-freeze-the-autosaved-working-copy.md)"
---

# ADR-0465: Board Art Pipeline owns AI-result ingress

## Context

Generation References and AI-painted results are deliberately different image
roles, but the editor placed the control that started a returned-image upload in
the Generation References workspace under the implementation label **Start
manual AI handoff**. The Pipeline contained the result and every later stage,
yet an owner holding a finished PNG could not see how to add it there.

Creating a server-bound attempt before reading the returned image is necessary
for provenance, but it is not an owner task and does not deserve a separate
cross-workspace control.

## Decision

The Generation References workspace owns only working-copy capture, its
immutable reference library, and exact-reference copy/download. It does not
start pipeline slots or accept returned AI artwork.

The Board Art Pipeline owns a persistent **Add AI artwork** instrument. The
owner selects the Generation Reference that produced the result and chooses
**Paste AI artwork** or **Choose PNG file**. The client first validates that an
exact PNG is available, then creates the fenced waiting attempt bound to that
reference and stages the unchanged bytes for review. **Use this board** remains
the explicit commit that stores those bytes as an immutable Raw Pipeline Source.
An invalid or unavailable clipboard/file creates no empty attempt.

An existing waiting or interrupted slot keeps its contextual copy, paste, file,
discard, and resume actions inside the Pipeline. The separate **New attempt**
instrument for reusing an already committed Raw Pipeline Source remains
unchanged.

## Consequences

- Input-reference management and returned-image management match their visible
  workspaces.
- Attempt/reference binding remains exact without exposing attempt creation as
  a prerequisite action.
- An owner with finished artwork can enter through the Pipeline without first
  navigating back through Generation References.

## Verification

- Generation References has no attempt-start or returned-image control.
- Pipeline visibly offers Generation Reference selection plus paste and PNG-file
  entry even when it has zero slots.
- Valid paste/file entry creates a reference-bound waiting attempt and shows the
  exact local preview; invalid input creates no attempt.
- **Use this board** commits unchanged bytes through the existing Raw Pipeline
  Source contract.
