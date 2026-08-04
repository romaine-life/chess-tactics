---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
refines:
  - "[ADR-0340](0340-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)"
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)"
refined_by:
  - "[ADR-0414](0414-selected-starter-card-media-becomes-dedicated-runtime-identity.md)'s owner-approved runtime cutover"
---

# ADR-0412: Praecipuus and Primogeniture join Card Icon Fitting

## Context

His Grace introduced a fifth causal card-property and unit-state pair: Praecipuus grants
Primogeniture. Card Icon Fitting still enumerated only the four ordinary offer-card pairs and
only admitted candidates from their original generation batch. The new icon candidates were
therefore visible in Card Layout but absent from the owner-operated surface that selects and fits
these exact roles.

The existing fitting portfolio may already contain a saved four-pair draft. Adding the fifth pair
must not discard its selections or initialize the new property from unrelated zero geometry.

## Decision

- Card Icon Fitting includes **Praecipuus → Primogeniture** as its fifth pair. It reads the exact
  Codex and PixelLab candidates from the dedicated starter-card review slots and their own
  generation batch.
- The fitting specimen is the canonical His Grace card projection, including its King and public
  Primogeniture marker. During review it uses the owner-selected Codex His Grace illustration and
  the owner-selected Codex royal-purple starter-frame review pixels over the starter card's
  measured Hieratic geometry; this does not accept either medium or move a runtime pointer.
- Praecipuus retains its independent property-icon placement. Primogeniture uses the same shared
  unit-state placement controlled by the other four pairs; the fitting instrument remains the
  place to judge whether that shared seat works for all five.
- `iconPair=praecipuus` directly addresses the fifth pair in the Studio Viewer and survives
  Studio route rewrites.
- The portfolio id remains `run-card-icon-fitting-v1`, while its internal document advances to
  version 2. A prior four-pair document normalizes losslessly: existing geometry and selections
  that still name canonical versions survive, predecessor-slot ids resolve to their canonical
  accepted replacements, and the missing fifth pair receives the current review candidates plus
  the committed Praecipuus placement. No database migration is required.
- Saving remains a non-publishing design-draft write. Dedicated runtime roles, acceptance, and
  installed-configuration cutover remain a later explicit owner-approved transaction.

## Consequences

The owner can select and place both new icons at actual card scale without guessing from a contact
sheet or using Card Layout as a substitute fitting tool. Existing fitting work remains intact,
and review cannot silently publish the new visual identities.

## More Information

- [Runtime asset contract](../runtime-asset-contract.md)
- [Persistence](../persistence.md)
- [ADR-0340](0340-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)
- [ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)
