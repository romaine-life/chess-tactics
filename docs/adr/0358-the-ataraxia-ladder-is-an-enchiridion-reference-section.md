---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - ADR-0231
  - ADR-0266
  - ADR-0268
  - ADR-0291
  - ADR-0355
---

# ADR-0358: The Ataraxia ladder is an Enchiridion reference section

## Context and Problem Statement

Ataraxia is the only Run-wide rule system with no reference record. Units, Terrain,
Cards, Card Types, Relics and Abilities each have an Enchiridion section; the difficulty
ladder existed solely inside the Run-preparation selector, which shows one tier at a
time and only to a player already committed to starting a Run.

That leaves three things unreadable outside preparation:

- What a tier does. ADR-0291 gave every tier the same anatomy — numbered label,
  subtitle, literal impact — but the selector shows the impact only for the tier
  currently chosen.
- That the ladder is linear and cumulative (ADR-0268). The selector's disabled options
  imply gating without stating the rule.
- What the account has actually reached. The selector disables a locked option; nothing
  says how far the ladder goes or which rung is next.

The Strategikon presents the same reference sections mid-Battle, where a player deciding
how to handle a Pestiferous card cannot open the Run-preparation screen at all.

## Decision Drivers

- A rule that governs the whole Run belongs in the Run-wide reference, beside the card
  properties it switches on.
- The reference must not become a second authoring site for tier copy. ADR-0291's
  anatomy is authored once, in the Run model.
- ADR-0266 keeps historical exposition optional; a mechanical reference must be complete
  without it.
- ADR-0355 made a section of a rail a registry entry, so adding one must be a
  declaration rather than a new branch.

## Decision Outcome

Chosen: **Ataraxia is the seventh Enchiridion section**, addressed
`/enchiridion/ataraxia` on the main menu and `/{play,run}/strategikon/enchiridion/ataraxia`
in the Strategikon, registered in `sectionedShells.ts` like every other section.

- The section enumerates `ATARAXIA_TIERS` and prints each tier's authored anatomy from
  `ATARAXIA_BY_TIER`. It states no tier copy of its own, so a tier installed in the model
  cannot be described here in words the Run does not apply. Tier zero is a member of the
  list with no rendering branch (ADR-0291).
- `ATARAXIA_TIERS` becomes a model export derived from `INSTALLED_ATARAXIA_MAX_TIER`. The
  preparation selector's hand-written `[0, 1]` is replaced by it, so the two surfaces
  cannot disagree about which tiers exist.
- The one thing the reference adds beyond the selector is **standing**: each tier reads
  Completed, Unlocked, or Locked with the completion that opens it named. It reads the
  same `RunProgression` the selector reads and subscribes to `RUN_PROGRESSION_EVENT`, so
  account sync and a finished Run update it in place.
- A locked tier is stated in full, not hidden or blurred. The ladder is a reference; the
  gate is on selecting a tier, not on reading what it is.
- The section carries no historical exposition. ADR-0266's opt-in, factual, sourced
  explainer remains unbuilt, and this section is where it would land if it is ever built.

## Consequences

- Good: the ladder is legible without committing to a Run, and mid-Battle through the
  Strategikon, which is where a Pestiferous card actually raises the question.
- Good: installing Ataraxia II adds a rung to the model and appears in both the selector
  and this reference with no further edit.
- Good: the registry walk in `sectionedShells.test.ts` covered the new section the moment
  it was declared — the coverage check fails an entry with no address.
- Cost: the reference reads account progression, so it is the first Enchiridion section
  besides Relics whose content varies per account.
- Cost: the section's mark reuses the installed objective glyph, whose ink is thinner
  than its neighbours in the rail. Swapping it is a media-role change with no code
  consequence.

## More Information

- [ADR-0266](0266-ataraxia-names-optional-run-difficulty-after-real-history.md),
  [ADR-0268](0268-ataraxia-unlocks-linearly-and-stacks-cumulatively.md), and
  [ADR-0291](0291-ataraxia-zero-is-a-named-tier-with-visible-impact.md) author the ladder.
- [ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)
  makes one section body serve both hosts.
- [ADR-0355](0355-a-rail-of-sections-is-a-registry-entry.md) is why adding a section is a
  registry entry in two families rather than a branch in four places.
