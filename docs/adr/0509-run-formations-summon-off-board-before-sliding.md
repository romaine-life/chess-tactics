---
status: accepted
date: 2026-08-07
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)'s unit summon choreography"
  - "[ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)'s visible sideways Run arrival"
---

# ADR-0509: Run formations summon off-board before sliding

## Context

Run formations now begin fully outside the board and follow the same board-space direction as
their horizontal Deployment gravity. Materializing the complete formation directly at that
entry position communicates the rigid shape, but skips the established physical language by
which an individual unit joins a battlefield: fade while hovering, then accelerate into contact.

The two ideas are sequential rather than competing. Units must first exist at the off-board
formation seats before those seats can behave like one falling-piece block.

## Decision

Every newly introduced member of a Run formation reuses ADR-0045's canonical summon at its
off-board entry seat: it fades in while hovering sixty pixels above that seat, holds, and drops
under gravity. The existing fifty-millisecond unit stagger remains, including its royal-last
ordering.

The formation slide owns a separate shared clock. It cannot begin until the final staggered
summon has completed the full summon duration. Earlier units remain seated at the entry position
while they wait. Once released, every member receives the same projected board-`x` translation
and timing, preserving rows, holes, and overhangs until the persisted formation locks into place.

The choreography remains presentation-only and uses the compositor's existing arrival ledger.
Gameplay placement is already committed, and Deployment does not advance until the combined
summon-and-slide entrance reports that every unit has settled.

## Consequences

- The unit entrance retains one established physical vocabulary instead of inventing a special
  materialization for Run cards.
- The player can read the individual units first and the Tetris-like block second.
- A stagger can delay the slide, but it can never shear a formation in motion.
- Deployment arrival takes longer than the direct slide because both complete physical beats are
  now visible.

## More Information

- [ADR-0045](0045-units-deploy-with-a-staggered-drop-in.md)
- [ADR-0493](0493-generated-run-formations-fall-sideways-and-own-rarity.md)
- [Board render contract](../board-render-contract.md)
