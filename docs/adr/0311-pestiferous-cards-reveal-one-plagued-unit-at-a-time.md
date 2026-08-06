---
status: superseded by ADR-0492
date: 2026-08-01
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)'s Cacochymic player-facing terminology"
  - "[ADR-0397](0397-cacochymic-dies-at-combat-end-while-pestiferous-retargets.md)'s separation of unit death from card retargeting"
partially_supersedes:
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)'s whole-card Plagued pricing"
  - "[ADR-0267](0267-pestiferous-cards-lose-units-and-persist-when-empty.md)'s all-units-Plagued and resolution-time target clauses"
  - "[ADR-0269](0269-every-pestiferous-card-deteriorates-at-one-eighth-prevalence.md)'s resolution-time random target clause"
  - "[ADR-0272](0272-card-types-author-effects-and-may-conceal-unit-targets.md)'s all-contained-units-Plagued clause"
  - "[ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)'s all-acquired-units-Plagued and resolution-time target clauses"
---

# ADR-0311: Pestiferous cards reveal one Plagued unit at a time

## Context

Pestiferous cards marked every contained unit Plagued while only one unknown
unit was selected for loss after each Battle. The shared modifier therefore
communicated only that each unit might die, not which loss the player could
actually plan around. The result was mechanically deterministic but
player-facing arbitrary: the interface reported the victim only after the
decision-relevant Battle had ended.

The stepped Plagued discount also belonged to every unit despite only one unit
being at immediate risk. Revealing one current victim needs a corresponding
answer for offer pricing, repeated unit types, voluntary removal, and the next
attrition cycle.

## Decision

A nonempty Pestiferous card has exactly one publicly identified **Plagued** unit
at a time.

- The shop-offer transaction uses the card's persisted effect seed to select
  one exact piece index as the first target. The Contents Box marks that unit
  before purchase, including when several pieces have the same role.
- Only the marked unit carries the Plagued modifier and receives ADR-0265's
  piece-tier discount. The displayed offer cost therefore exposes the complete
  basis of its price.
- Purchase promotes the already selected offer target into the owned card. It
  does not reroll or conceal the target after commitment.
- On each committed victorious-Battle advancement, every owned nonempty
  Pestiferous card loses its current Plagued unit. It then selects, persists,
  and reveals one next target from its remaining members. The new target cannot
  suffer a second Pestiferous loss during that same advancement.
- Battle failure and retry perform no advancement. A repeated application of
  the same committed advancement is idempotent for each card.
- If the current target leaves its card through selling, cashing out, or another
  permanent-removal action, the card immediately selects and reveals a target
  from its remaining members. This does not exempt a nonempty card from its next
  ordinary Battle-advancement loss.
- An empty Pestiferous card has no target and remains the same dead-draw burden
  until an explicit removal effect purges it.
- Target selection remains seeded and persisted. Active Run format 7 stores the
  offer's exact target piece index and each owned card's exact target unit id.
  Format-5 and format-6 Runs deterministically retain their card membership,
  Concinnous target state, and loss history, choose one current target per
  nonempty Pestiferous card, and remove obsolete Plagued modifiers from its
  other surviving members.
- The shared card face exposes a direct Plagued marker in the unit ledger; Army
  inspection states that the marked unit will be lost after the next victorious
  Battle. This is direct state projection, not synthesized ability-description
  prose prohibited by ADR-0305.

The player-facing rule is: **“One unit on this card is Plagued. After each
victorious Battle, lose that unit, then Plague another unit on this card.”**

## Consequences

- Good: the hostile card remains attritional while its next loss becomes a
  readable fact the player can plan around.
- Good: Plagued has one exact meaning across pricing, card presentation, Army
  inspection, persistence, and loss resolution.
- Good: moving the seeded choice earlier preserves reload and retry resistance
  without hiding the result until after it matters.
- Cost: multi-unit Pestiferous offers usually receive a smaller discount than
  under the retired all-units-Plagued rule.
- Cost: every permanent unit-removal path must keep card membership, the current
  target, and projected unit modifiers synchronized.

## More Information

- [Game concept](../game-concept.md)
- [Persistence contract](../persistence.md)
- [ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)
- [ADR-0267](0267-pestiferous-cards-lose-units-and-persist-when-empty.md)
- [ADR-0286](0286-ataraxia-i-is-a-persisted-run-tier-with-draw-time-pestiferous-instances.md)
- [ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)
