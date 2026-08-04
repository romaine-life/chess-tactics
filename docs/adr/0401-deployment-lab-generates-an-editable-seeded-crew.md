---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0402](0402-deployment-lab-generate-chooses-the-seed.md)'s one-click random seed"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s starter cards and single ordinary-unit ability"
refines:
  - "[ADR-0071](0071-the-deliverable-is-the-instrument.md)"
  - "[ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)"
---

# ADR-0401: Deployment Lab generates an editable seeded crew

## Context

Deployment Lab initially treated its seed only as an input to the canonical placement pass. Its
default roster and ability combinations were fixed, so moving the seed could explore different
square choices but never deal a different crew. The owner then had to construct every unit and
ability case by hand before testing it.

The Level Editor's Town, Forest, and terrain/cover generators establish the useful interaction:
seed and controls are editable generator inputs, an explicit action materializes their result, and
that result remains ordinary owner-editable data. A seed edit does not silently destroy later hand
edits.

## Decision

- Deployment Lab gains an explicit **Generate** action beside its seed. Generate replaces only the
  roster and its index-addressed Adlected manual placements; board geometry, obstacles, layout,
  dedicated regions, and lipsana inputs stay unchanged.
- A generated crew has six to ten units, exactly one King, and uniformly dealt remaining piece
  types from Pawn through Queen. The crew order is seeded and may place the King anywhere in the
  visible roster even though canonical Deployment still gives it placement priority.
- Each generated unit independently receives one uniformly dealt three-bit ability mask. The eight
  outcomes are no ability, each individual ability, each pair, and all three together. Ability
  order remains canonical: Adlected, Eutactic, Agminate.
- Crew generation uses a labelled deterministic stream derived from the same displayed seed that
  drives placement. The same seed and implementation produce the same complete crew; a different
  seed can vary crew size, types, order, and ability combinations without sharing the placement
  pass's random stream.
- Generate materializes ordinary `units` route data. Afterward every unit type and every ability
  checkbox remains manually editable, units may be added or removed, and the exact edited result
  continues to round-trip in the Studio URL. Changing the seed alone does not regenerate or erase
  those edits; pressing Generate again is the explicit replacement action.

## Consequences

- A seed now explores both the input crew and its canonical placement outcome instead of only the
  latter.
- Generated cases can be refined manually and handed off exactly without a generated/manual mode
  split.
- Multi-ability composition, no-ability baselines, duplicate piece types, and different army sizes
  appear naturally across seeds while every launched player flow remains valid because it has one
  King.

## More Information

- [ADR-0399](0399-deployment-lab-launches-the-real-player-flow.md)
- [ADR-0396](0396-eutactic-and-agminate-compose-as-best-fit-row-and-station.md)
