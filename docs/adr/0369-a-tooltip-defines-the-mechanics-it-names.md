---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
supersedes:
  - "[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)'s deferral of the ability-definition inspection system"
extends:
  - 0217-run-relic-icons-use-immediate-styled-tooltips.md
  - 0339-run-card-properties-and-unit-states-use-paired-icons.md
---

# ADR-0369: A tooltip defines the mechanics it names

## Context

The Shop's card-property tip reads *"Grants Discipline to one contained unit when
the card is acquired."* Discipline is a named Run mechanic with its own deployment
rule, and the tip that invokes it does not say what it is. A reader who does not
already know the word has to leave the Shop for the Enchiridion, and a reader who
half-knows it guesses.

[ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)
removed the synthesized ability sentence from the card FACE and named the
replacement — "the future tooltip/reference/inspection system for ability
definitions" — as deliberately deferred. This is that system. It is not a return
of card-face prose: the card face still says nothing it was not authored to say.

Two constraints shaped the mechanism:

- The pop is `pointer-events: none` and always has been. A tip floats over a live
  card; making it hoverable so a keyword inside it could raise a second tip means a
  hover bridge, a hide delay, and a target the reader must travel to without
  falling off. That is a worse instrument than the one it replaces.
- The vocabulary is already unified.
  [ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)
  paired each card property with the unit state it bestows, so a definition table
  has one obvious membership: the four properties and the four states.

## Decision

**A tooltip resolves the named Run mechanics in its own body and carries their
definitions with it.** The shared `Tooltip`/`InfoTip` primitive does this for every
call site; no caller opts in, and no caller writes a glossary sentence by hand.

- `packages/board-render/src/run/glossary.ts` holds `RUN_GLOSSARY`, one entry per
  card property and unit state. A card property's definition **is** its authored
  `RUN_CARD_TYPE_REFERENCE` effect; a unit state's **is**
  `runAbilityGeneralDescription`, which the per-unit `runAbilityDescription` falls
  back to. The glossary therefore restates nothing and cannot drift from the rule
  the Army ledger applies.
- Definitions are the SHORT form. The Enchiridion keeps the long-form record, as
  it already does for card types (`effect` beside `description`). A tip states what
  a word means; the reference states everything about it.
- **Stacked, not nested.** The definitions render as further framed panes in the
  tip's own column, below it. They arrive on the hover or focus that raised the
  tip, so the pop stays non-interactive and there is no second thing to reach.
- The named term is marked in the prose with `<mark class="tooltip-keyword">` in
  the title color of the pane that defines it. The mark is the reference; there is
  no icon, underline, or control.
- A term the tip is already ABOUT is dropped. The Cacochymic marker's own tip does
  not restate Cacochymic beneath itself.
- **One level, never a chain.** Definitions are not themselves scanned. Pestiferous
  names Cacochymic; Cacochymic's pane names nothing further.
- At most three definitions per tip. A term past that is left unmarked rather than
  marked without a pane, because emphasis pointing at nothing is worse than plain
  text.
- Matching is whole-word and case sensitive against authored spellings, including
  inflections (`Disciplined`). The mechanics are capitalized proper names, so *a
  tactical retreat* is not the Tactical card property.
- The stack is measured after it mounts and hangs above the trigger when hanging
  below would run it off the viewport. The placement was written for one pop; a
  column is taller.
- Every pane is named in the trigger's `aria-describedby`, so a keyboard reader
  receives the definitions a sighted reader was just handed.

## Consequences

- Every existing tip gains this without being touched: card properties, the card
  face's unit-state markers, relic descriptions, Army ledger trait chips, the
  Ataraxia tier measure. Any future tip that names a mechanic is covered the day
  it is written.
- Authored prose may now invoke a mechanic by name and stop, instead of inlining a
  parenthetical definition. Text that already does this gets shorter over time.
- Adding a mechanic means adding a glossary entry; a keyword that has no entry is
  silently plain text, which reads as an ordinary word rather than as an error.
- A very long tip that names three mechanics produces a tall column. The cap and
  the flip-above placement bound it; if that still reads as too much, the answer is
  shorter authored prose, not a hidden definition.

## More Information

- [ADR-0217](0217-run-relic-icons-use-immediate-styled-tooltips.md)
- [ADR-0305](0305-card-ability-properties-do-not-synthesize-description-text.md)
- [ADR-0339](0339-run-card-properties-and-unit-states-use-paired-icons.md)
- `frontend/src/ui/shared/tooltipGlossary.tsx`, `frontend/src/ui/shared/InfoTip.tsx`
