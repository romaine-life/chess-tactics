---
status: "accepted"
date: 2026-07-15
deciders: Nelson, Codex
---

# ADR-0102: Runtime buttons use registered inner chrome

## Context

ADR-0101 moved title-bar buttons onto the registered inner-box role, but the
same retired `mode-button` frame remained reachable through
`.app-header-button` on result overlays, Play selectors, lobby flows, and other
runtime controls. That made chrome ownership depend on where a button happened
to render and allowed unregistered old boxes to survive outside the title bar.

## Decision

The `mode-button.png` and `mode-button-active.png` frames have no runtime
consumers. Every runtime control that previously used `.app-header-button` must
declare a registered inner chrome unit and its complete ancestor class path.
The legacy class may temporarily provide content geometry while consumers are
renamed, but it owns no border, frame source, or state art.

The application root is a chrome-family scope so registered controls on light
and heavy routes consume the same installed inner role. Repository checks reject
direct runtime references to the retired images and any `.app-header-button`
consumer without `data-chrome-unit` and `chromeUnitClassNames(...)` ownership.

Status/error boxes and selectable utility cards encountered in this migration
also move to registered outer/inner roles rather than retaining local frame art.

## Consequences

- Result-overlay actions, Play actions, lobby choices, party choices, title
  controls, and Skirmish HUD controls share owner-tunable inner chrome.
- A new old-style button fails checks regardless of which screen contains it.
- The nine-slice editor no longer presents the retired frame as a placed app
  consumer.

## More Information

- Generalizes ADR-0101 beyond the title bar.
- Builds on ADR-0059 and ADR-0082.
