---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s naming of the phase's two operations"
partially_supersedes:
  - "[ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md)'s Shop terminology"
  - "[ADR-0321](0321-run-opening-is-the-normal-shop-and-draft-is-retired.md)'s Shop terminology and stored phase name"
  - "[ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)'s `Run › Shop` route label"
  - "[ADR-0386](0386-shops-offer-read-only-intelligence-on-the-upcoming-battle.md)'s Shop terminology"
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)'s Shop terminology"
  - "[ADR-0388](0388-remaining-shop-cards-settle-into-their-new-seats.md)'s Shop terminology"
  - "[ADR-0389](0389-the-title-route-names-the-visible-strategikon-address.md)'s Shop route example"
extends:
  - "[ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)"
  - "[ADR-0380](0380-run-save-versions-always-migrate.md)"
---

# ADR-0392: Sectio is the Run disposal and acquisition phase

## Context

**Shop** named the interface as a familiar retail place. That was legible but false to the
activity and to the Run's established vocabulary. The phase follows catastrophe: war residue is
converted into gold, units may be relinquished for value, and expensive cards admit heterogeneous
groups whose backgrounds do not promise martial fitness. Buying one makes the army larger while
usually making its future draws less consistent.

The owner chose one deliberately antiquated word rather than a compound: **Sectio**. In Roman
public law a *sectio* was the state sale of confiscated property as an aggregate. Its purchaser,
the *sector*, took the mass with its liabilities and could subsequently break it into parcels.
That is the mechanic's useful metaphor: the player acquires an ill-assorted lot and inherits both
its strength and the disorder it introduces.

## Decision

- **Sectio** is the canonical name of the Run phase formerly called Shop. The title route reads
  `Run › Sectio`; the phase's workspace, controls, Battle preview, card transfer, Army access,
  selling, reset, and Continue behavior are otherwise unchanged.
- This is one vocabulary end to end, following ADR-0374 rather than adding a display alias.
  `RunPhase` stores `sectio`; `RunDocument.sectio` contains `RunSectioState`; acquired units use
  source `sectio`; model functions, craft grammar, scene identities, DOM contracts, CSS, tests,
  review instruments, and live-media contracts use the same root.
- **RunSaveVersion 18** losslessly migrates version 17. Account storage is rewritten by migration
  55 and browser storage performs the same bounded transform before current-state normalization:
  the phase, state property, unit sources, and offer-id prefixes move together. Runtime code reads
  only version 18 and contains no compatibility branch for the retired shape.
- Stored craft-link specifications whose phase is `shop` are rewritten to `sectio`; the readable
  craft grammar accepts only `sectio` afterward. Existing minted ids remain valid because the
  durable row moves in place.
- The live-media families move without changing their pixels: review and runtime slot prefixes,
  the `sectio-wrap` role, the `run-sectio-wrap` component/native role, metadata schemas, events,
  versions, and drawable bindings are renamed atomically.
- Seed labels are deterministic inputs rather than vocabulary. The existing strings containing
  `shop` remain byte-for-byte unchanged wherever changing them would redeal cards or lipsana.
  The proper name and stable id **Merchant's Shopkey** are also outside this decision; renaming
  that lipsanon is a separate content decision.
- Accepted historical ADR prose and the version-17 side of explicit migration transforms retain
  the old spelling as history. It is not a supported route, phase, UI label, identifier, media
  family, or current document field.

## Consequences

- The phase now names what happens rather than where a modern interface convention says it happens.
- A Run document, craft spec, scene identity, and title route all say **Sectio**.
- Existing active Runs and minted craft links survive through explicit migrations.
- The selected live artwork is reidentified without regeneration, resampling, or fallback paths.
- Action names such as **Sell Units** remain plain for now. Their vocabulary is the next independent
  naming decision rather than being smuggled into this phase rename.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [Migration policy](../migration-policy.md)
- [Runtime asset contract](../runtime-asset-contract.md)
