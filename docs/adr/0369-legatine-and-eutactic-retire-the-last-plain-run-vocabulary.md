---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
partially_supersedes:
  - "[ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)'s Positioned state name"
  - "[ADR-0329](0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md)'s restored Tactical qualifier name"
  - "[ADR-0274](0274-relics-grant-unit-owned-deployment-abilities.md)'s deferral of renaming Discipline and Positioned"
  - "[ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)'s Tactical/Discipline pair name"
extends:
  - "[ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)"
  - "[ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)"
---

# ADR-0369: Legatine and Eutactic retire the last plain Run vocabulary

## Context

Four causal card qualifiers each bestow one unit state. Two pairs had already
been given deliberately obscure names — Pestiferous/Cacochymic (ADR-0341) and
Hieratic/Agminate (ADR-0343) — while Concinnous still granted **Positioned** and
the **Tactical** card still granted **Discipline**. ADR-0274 recorded renaming
Discipline and Positioned as a separate decision and left it open; ADR-0309
retired Tactical once, and ADR-0329 restored it when the qualifier needed its own
frame. The result was one vocabulary in two registers, where three of the eight
words were ordinary English and five were not.

`runAbilityDisplayName` capitalized a state's stored value whenever no name was
recorded for it. That fallback is what let `positioned` and `discipline` reach the
screen as names at all: a state was player-facing by default and obscure only by
exception.

## Decision

- **Legatine** is the canonical qualifier for the card that grants deliberate
  placement, and **Adlected** is the state it bestows. **Eutactic** replaces
  Positioned as the state Concinnous bestows. Behavior is unchanged in all three
  cases; this decision renames and defines only.
- The four canonical pairs are **Pestiferous/Cacochymic**, **Concinnous/Eutactic**,
  **Legatine/Adlected**, and **Hieratic/Agminate**.
- The Enchiridion definitions are: **Eutactic** — well-ordered, drawn up in good
  array; **Adlected** — enrolled by direct appointment rather than by the usual
  process; **Legatine** — of a legate, a commander's deputy entrusted with a
  detached force. As with Concinnous and Agminate, the unfamiliar word is
  deliberate player-facing vocabulary and the reference teaches it.
- `runAbilityDisplayName` resolves a complete table and no longer falls back to
  capitalizing a stored value. A state added without a name is a type error rather
  than a retired word on screen.
- **A stored value and its name are one word.** `RunAbility` is
  `adlected | eutactic | agminate`, `RunUnitModifier` is `cacochymic`, and
  `RunCardType` carries `legatine`; the fields named after the retired words move
  with them (`temporaryAdlectedUnitId`, `adlectedUnitIds`, `cacochymicUnitId`,
  `cacochymicPieceIndex`, `cacochymicIndices`). `RUN_FORMAT_VERSION` 14 discards
  in-progress Runs rather than translating them, and the server validator accepts
  only the new words. This retires the two-vocabulary drift ADR-0341 and ADR-0343
  opened rather than widening it.
- **The live-media locators move too, which completes ADR-0339's deferred cutover.**
  Seven slots are re-pointed: the four unit-state icons to
  `ui/kit/icons/game/{adlected,eutactic,agminate,cacochymic}.png`, the card property
  icon to `ui/kit/icons/card-properties/legatine.png`, the row texture to
  `ui/surfaces/card-type-legatine.png`, and the frame to
  `ui/run/card-prototypes/legatine-adlected-frame-v1.png`. Each successor carries the
  **byte-identical content** of the version it replaces — same sha256, no regeneration
  and no resampling — so this re-identifies accepted artwork rather than proposing new
  pixels, exactly as ADR-0309 moved the Tactical frame's bytes onto Concinnous. The
  replaced slots are retired only after their successor is accepted and verified
  sha256-equal, and the `app-ui` drawable roles are rebound in the same pass, because
  the catalog fails closed on a role whose slot is retired.
- Two gaps in the media catalog's own contract had to be closed for this to be
  possible, and both are general fixes rather than rename plumbing:
  - `POST /api/admin/media-slots/<slot>/metadata` implements the patch the server
    already named in `media_slot_metadata_requires_patch` but never provided, so a
    slot's acceptance contract can be corrected after it is written. Without it a
    group contract could never gain or drop a member.
  - The card-type row-texture group accepts atomically, so moving one member re-accepts
    all four. The three textures that did not move are re-accepted only for that reason;
    their bytes are unchanged. The retiring member is stood down to standalone first, so
    retiring it does not demand retiring the group.
- Seed labels are RNG inputs, not names. `tactical:discipline:<coreId>` and
  `tactical-discipline-acquisition-target` keep their exact wording, because
  rewording one would deal different cards at every existing seed.
- The craft grammar accepts each card type and ability by its name, by its stored
  value, and by the retired word, so links minted under the old vocabulary keep
  resolving. Refusal messages quote the names the game says out loud.
- Ordinary uses of "tactical", "discipline" and "positioned" elsewhere in the game
  and the codebase retain their ordinary meaning and are untouched.

## Consequences

- Good: all eight player-facing words now sit in one register, and the pair a
  player meets on a card reads the same way as the pair beside it.
- Good: the display-name fallback that made drift silent is gone, so a future
  state cannot leak its storage identity by omission.
- Good: a Run document now reads in the same vocabulary as the screen, so
  debugging a document no longer needs a translation table.
- Cost: format 14 makes in-progress Runs unsupported.
- Good: the retired vocabulary now survives nowhere — not in a document, a slot path,
  a drawable role, or a line of code. Only the two seed labels keep their wording, and
  those are RNG inputs rather than names.
- Cost: three card-type row textures carry a new accepted version recording a rename
  they were not part of, because their acceptance group is atomic.
- Cost: the Enchiridion now teaches four obscure states rather than two, and
  Adlected in particular carries no meaning on sight.

## More Information

- [Game concept](../game-concept.md)
- [Persistence](../persistence.md)
- [Runtime asset contract](../runtime-asset-contract.md)
- [ADR-0274](0274-relics-grant-unit-owned-deployment-abilities.md)
- [ADR-0309](0309-concinnous-names-the-white-positioned-card-qualifier.md)
- [ADR-0329](0329-concinnous-and-tactical-use-distinct-frames-and-one-shared-coin.md)
- [ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)
- [ADR-0341](0341-cacochymic-replaces-plagued-as-the-pestiferous-unit-state-name.md)
- [ADR-0343](0343-agminate-replaces-marshalled-as-the-formation-ability-name.md)
