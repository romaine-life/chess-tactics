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
- Every persisted value and live-media locator keeps the word it was coined with:
  `discipline`, `positioned`, `marshalled`, `plagued`, the `tactical` card type,
  and the icon slots named after them. These are storage identities and no
  player-facing surface may expose one. Retiring them belongs to ADR-0339's
  deferred paired-icon production cutover, which must migrate persisted values,
  installed configuration and media locators in one transaction.
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
- Cost: the gap between what the game says and what it stores widens from two
  words to five until the ADR-0339 cutover runs. Anyone reading a Run document,
  an icon slot or a seed label must consult the mapping above.
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
