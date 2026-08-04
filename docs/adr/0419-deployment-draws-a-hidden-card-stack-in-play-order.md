---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
supersedes:
  - "[ADR-0416](0416-klerosis-is-a-dedicated-pre-battle-screen.md)"
  - "[ADR-0417](0417-klerosis-deals-from-the-chartulary.md)'s face-up deal into a separate workspace"
  - "[ADR-0418](0418-klerosis-presents-the-deal-without-summary-copy-or-rosters.md)'s Confirm boundary"
partially_supersedes:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s Primogeniture unit ability and independently shuffled unit queue"
  - "[ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)'s Primogeniture fitting pair"
  - "[ADR-0414](0414-selected-starter-card-media-becomes-dedicated-runtime-identity.md)'s installed Primogeniture role"
refines:
  - "[ADR-0283](0283-run-card-face-is-one-shared-live-runtime-component.md)"
  - "[ADR-0350](0350-run-deployment-promotes-the-mounted-battlefield-in-place.md)"
  - "[ADR-0387](0387-bought-cards-travel-into-a-title-reachable-chartulary.md)"
  - "[ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)"
---

# ADR-0419: Deployment draws a hidden card stack in play order

## Context

The face-up Klerosis workspace revealed the complete combat deal before placement and then asked
the player to confirm information that was already fully exposed. It also created an independent
unit shuffle after the cards had established an immediately legible order. That weakened the deck
as a game object and revealed future card contents before an Adlected unit needed its decision.

His Grace had both Praecipuus on its card and Primogeniture on its King only because the card deal
and unit queue were separate orderings. Once the deal itself owns play order, the second rule is
redundant.

## Decision

- Deployment mounts the canonical empty battlefield immediately inside `RunForm`. There is no
  separate pre-Battle Klerosis workspace and no Confirm action.
- The exact Battle-limited deal animates face down from the real measured Chartulary shortcut into
  one small numbered stack in the bottom-right of Controls. The count is visible; card identities,
  future unit contents, and future destinations are not.
- Only after that transfer settles does Controls offer **Deploy all** and **Step through**. The two
  modes resolve one persisted sequence: Deploy all advances at full pace and pauses whenever
  Adlection requires input; Step through exposes and resolves one unit at a time.
- The top card flips only when it becomes active. Its surviving unit seats are read left to right
  in their persisted card order, and those units deploy before the next card is revealed. A card's
  internal order is randomized when the card instance is generated and never rerolled at Battle
  start, reload, retry, or presentation-mode change.
- A sold or lost unit leaves an empty seat in that persisted order. The visible face may condense
  its surviving contents, but the ordering identity does not close the gap or reorder later units.
- In Deploy all, the active card may release its units into the placement lane together; in Step
  through, one unit leaves the face at a time. Both use the same one-unit-at-a-time canonical
  placement resolver and the same information locks.
- After the active card's final surviving unit has fully settled, the card discards. Only then may
  the next face-down card flip. The final discard begins only after the final unit is settled;
  Battle begins after that discard completes.
- Praecipuus still moves His Grace to the top of every deal and thereby puts its King first.
  Primogeniture is retired: Praecipuus no longer grants it, the King does not need it, and its
  runtime icon/fitting role leaves the active product path.
- One universal, textless card back conceals every card identity. It is a complete shared Run-card
  object, not a face-specific frame or CSS imitation. Review candidates use
  `review/run-card-back/standard.png`; an accepted back resolves from
  `ui/run/card-back/standard.png`. Card Layout owns the exact-candidate Face/Back comparison and
  promotion remains a separate owner decision.
- Persistence owns the exact deal order, each card instance's seat order including empty seats,
  the active card, revealed state, unit cursor, pace, committed placements, and discard cursor.
  Reload never derives or reveals information that was not already shown.

## Consequences

- The deck determines both combat membership and deployment order, so His Grace belongs in the
  deck for one coherent reason rather than being duplicated by a unit-priority exception.
- Adlection can make a decision with only the information legitimately revealed so far.
- The battlefield remains continuous from the first placement through Battle while the Run-wide
  Strategikon and Controls stay structurally present through `RunForm`.
- The deployment save contract needs another append-only Run version/database migration when this
  sequence replaces the version-20 Klerosis document; generated media candidates alone do not
  advance that schema.

## More Information

- [Runtime asset contract](../runtime-asset-contract.md)
- [ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)
- [ADR-0415](0415-every-run-page-is-assembled-by-one-closed-form.md)
