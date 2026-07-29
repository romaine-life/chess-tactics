---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0202
---

# ADR-0203: Persistent scene hosts form a nested path

## Context

ADR-0202 introduced persistent visual hosts, but one flat host identity only
preserved the main-menu hierarchy. Play contains another stable hierarchy:
Skirmish, Levels, and campaign controls remain anchored while the selected
Play content changes. Treating all Play UI as the main menu's replaceable region
repeats the same false exit one level lower.

## Decision

A scene declares its deepest host in a registered host path. `play-shell` is
nested under `menu-shell`; standalone scenes have no persistent host path.

For each navigation, the director finds the deepest shared host:

- no shared host replaces the complete scene;
- `menu-shell` preserves the background, title, and main rail while replacing
  the complete menu destination;
- `play-shell` additionally preserves Play navigation while replacing only the
  selected Play content region.

Every host owns exactly one named destination region. Paint discovery,
inertness, failure, and entrance apply to that region, while ancestor hosts
remain the same mounted objects. Host paths are declarative and may be extended;
nesting may not be implemented through route-specific fade exceptions.

## Consequences

Opening Play reveals its complete navigation and initial content together.
Subsequent navigation among Skirmish, Levels, and campaigns keeps both ancestor
rails anchored and gates only the changing content. Leaving Play for another
main-menu destination preserves only the main-menu host.
