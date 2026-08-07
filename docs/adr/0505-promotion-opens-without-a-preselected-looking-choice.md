---
status: accepted
date: 2026-08-06
deciders: Nelson
supersedes:
  - "[ADR-0504](0504-promotion-choices-stay-with-the-arrived-pawn.md)'s first-choice autofocus clause"
---

# ADR-0505: Promotion opens without a preselected-looking choice

## Context and Problem Statement

ADR-0504 automatically focused the first promotion button when the arrived-Pawn picker opened.
The browser's accepted focus treatment therefore drew a strong cyan ring around Queen before the
player had chosen anything. Although technically keyboard focus, it read as a selected or default
promotion and was not an accepted state for this choice surface.

## Decision

The promotion picker opens with no replacement button programmatically focused. Queen, Rook,
Bishop, and Knight therefore begin with equal visual weight and none implies a default. The
blocking dialog retains its accessible name and assertive announcement, while ordinary keyboard
navigation reaches the replacement buttons in their DOM order and receives the normal focus
treatment only after the player deliberately moves focus there.

This changes only the initial focus presentation. The anchored placement, pointer boundary,
structural teal field, oak leaf controls, click behavior, and atomic promotion flow are unchanged.

## Consequences

- Good: the picker does not visually answer its own question before the player acts.
- Good: deliberate keyboard focus remains visible once the player enters the choices.
- Cost: the picker does not force keyboard focus away from the originating board control.
