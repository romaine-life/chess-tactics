---
status: "accepted"
date: 2026-07-29
deciders: Nelson, Codex
refines:
  - ADR-0193
---

# ADR-0194: Scenes declare persistent visual hosts

## Context

ADR-0193 correctly made navigation one directed lifecycle, but treated every
destination identity as a replacement of the complete rendered hierarchy. The
main menu is itself a persistent visual host: Play, Settings, Campaign Editor,
and Lobbies occupy its destination region while the background, title bar, and
mode rail remain the same objects. Fading and remounting those shared controls
during same-host navigation creates a false exit followed by a duplicate reveal.

## Decision

Every scene manifest declares a stable visual-host identity. The director compares
the current and destination hosts before choosing its transition boundary.

- Different-host navigation retains the complete outgoing scene and atomically
  replaces it under ADR-0193.
- Same-host navigation retains the shared hierarchy without remounting or fading
  it. Activation still locks the host decisively.
- Only the destination region mounts unrevealed, owns the destination manifest and
  paint acknowledgements, and fades in after its complete painted frame.
- Loading and failure presentation remain director-owned. A leaf destination may
  not expose partial content or add its own first-frame spinner.

Host identity describes structural continuity, not similarity of colors,
background URLs, route prefixes, or React component names.

## Consequences

The main-menu controls do not disappear when opening Play or another embedded
menu destination. Going from the menu host to gameplay remains a complete scene
transition. New persistent shells must register a host and one explicit
destination region rather than relying on CSS exceptions.
