---
status: accepted
date: 2026-07-14
deciders: Nelson, Codex
---

# ADR-0095: Level Editor chrome rules are mechanically enforced

## Context and Problem Statement

ADR-0059 and ADR-0082 require the Level Editor to reuse the canonical chrome
hierarchy. A board-resize change nevertheless introduced native selects and a
locally painted dropdown because existing source-structure tests list known
controls instead of rejecting unknown controls.

## Decision Outcome

The production Level Editor chrome boundary has one AST-aware architecture gate.
It rejects native selects outside explicitly named migration debt, buttons that
do not declare a registered chrome unit, and direct impersonation of the
`inner-box` or `outer-panel` roles instead of the shared ChromeBox components.
It also rejects newly named Level Editor dropdown/select/button/box CSS that
paints local background or border chrome rather than consuming role variables.

`HouseSelect` is the canonical Level Editor dropdown. `InnerChromeBox` and
`OuterChromeBox` are the canonical box-role constructors. Existing native
selects are a finite named migration list: the gate may preserve them while they
are migrated, but additions or renamed copies fail.

The same checker runs from `npm run check` and explicitly in pull-request and
production CI. CI is the enforcement boundary; local Git hooks are optional.

## Consequences

- A new parallel dropdown or unregistered button fails before merge.
- Canonical primitive internals can implement their accessibility behavior
  without recursively satisfying their consumer-facing rule.
- Legacy debt is visible and cannot grow silently.
- A new exception requires an explicit checker and contract change.

## More Information

- Enforces [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
- Enforces [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md).
- The canonical divided dropdown remains governed by
  [ADR-0092](0092-dividers-inherit-their-host-chrome-role.md).
