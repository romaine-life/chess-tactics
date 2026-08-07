---
status: superseded by ADR-0510
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)'s use of Alienatio as the player-facing unit-action label"
partially_superseded_by:
  - "[ADR-0443](0443-athetize-is-the-card-action-within-expunctio.md)'s replacement of the Expunct card-action command"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)'s retirement of the standalone Alienatio destination and presentation family"
  - "[ADR-0510](0510-held-cards-are-immutable-formations.md)"
refines:
  - "[ADR-0374](0374-legatine-and-eutactic-retire-the-last-plain-run-vocabulary.md)"
  - "[ADR-0392](0392-sectio-is-the-run-disposal-and-acquisition-phase.md)"
---

# ADR-0432: Aliene is the Alienatio action verb

## Context

**Alienatio** correctly names the juridical operation by which a unit leaves the army in return
for value, but it is a noun. Reusing it on each unit's action button made the destination name
look like a command and left the interface without a verb for what the player actually does.

The Run already carries the grammatical pattern the operation needs. **Adlectio** is performed by
the English verb **adlect** and produces **Adlected** units; **Expunctio** is performed by the
English verb **expunct** and produces an **Expuncted** card. These are deliberately unfamiliar,
real English words rather than plain modern-language aliases or raw Latin imperative forms. The
Enchiridion teaches the vocabulary, following ADR-0374.

Archaic legal English **aliene** means to transfer title or property to another. It preserves the
exact ownership-transfer sense that selected *Alienatio*, supplies an actual transitive verb, and
sits in the same obscure learned register as **adlect** and **expunct**.

## Decision

- **Alienatio** remains the canonical noun for the operation, destination, route, scene,
  workspace, filter category, return calculation, model transition, persistence boundary, DOM/CSS
  family, and review-media identity.
- **Aliene** is the canonical player-facing command on every unit action that performs Alienatio.
  **Aliened** is the corresponding completed-state word in filters, buttons, explanatory copy, and
  transient presentation state.
- Action-facing component props, handlers, and local results use the `aliene`/`aliened` verb where
  they describe execution. `performAlienatio` continues to name the domain operation rather than
  an imperative.
- The persisted `alienatedUnits` collection remains unchanged. It is established wire vocabulary
  for the Alienatio transaction, not a player-facing command, and changing it would add a Run-save
  and database migration without changing behavior or durable meaning.
- **Alien**, **Alienate**, and Latin **Aliena** are not aliases. The first is dominated by an
  unrelated modern noun, the second is ordinary and primarily read as social estrangement, and
  the third would make this one control a raw Latin inflection rather than the obscure English
  action vocabulary used beside it.

## Consequences

- The workspace reads as a noun-led operation: **Alienatio**; a unit offers the command
  **Aliene**; a completed row reads **Aliened this visit**.
- The three Sectio operations now expose parallel grammatical pairs:
  **Adlectio / Adlect**, **Alienatio / Aliene**, and **Expunctio / Expunct**.
- The correction is presentation-only. It changes no economy, Run document, craft grammar,
  storage schema, media identity, or deterministic input.

## More Information

- [Merriam-Webster: abalienate](https://www.merriam-webster.com/dictionary/abalienate)
- [Webster's 1828 Dictionary: aliene](https://webstersdictionary1828.com/Dictionary/aliene)
- [Game concept](../game-concept.md)
- [ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)
