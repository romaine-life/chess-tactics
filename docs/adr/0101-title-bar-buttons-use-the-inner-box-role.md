---
status: "accepted; routed caller-access mechanism superseded by ADR-0104"
date: 2026-07-15
deciders: Nelson, Codex
partially_superseded_by: "[ADR-0104](0104-title-bar-controls-are-typed-contributions-to-one-lane.md)"
---

# ADR-0101: Title-bar buttons use the inner-box role

## Context

ADR-0023 and ADR-0036 standardized title-bar controls on the old standalone
`mode-button` frame. The accepted chrome family now has one registered inner box
role, while title-bar buttons remain an unregistered exception. That exception
allows their frame source and state treatment to drift outside Chrome Lab and
outside the class-ownership checks.

## Decision

Every button rendered in the persistent title bar is a registered `inner-box`
consumer. `TitleBarButton` is the canonical primitive and emits both the
ancestor class and `data-chrome-unit="inner-box"`; React consumers use that
primitive instead of raw buttons. The dynamically constructed music control
must emit the same ownership markers.

The inner-box role owns frame art, rail thickness, and active-frame treatment.
Title-bar CSS may own button dimensions, content padding, typography, and icon
layout, but may not select a separate frame image. Repository checks reject raw
buttons in title action slots and known persistent controls that bypass this
ownership path.

ADR-0023's labeling rule and ADR-0036's bounded icon-only exception remain
unchanged.

## Consequences

- Chrome Lab changes to the accepted inner box now reach title-bar buttons.
- Title-bar geometry remains deliberate without forming a third chrome family.
- A new non-class-owned title action fails the repository check.

## More Information

- Supersedes ADR-0023's `mode-button` frame clause and ADR-0036 requirement 2's
  `mode-button` implementation detail.
- Builds on ADR-0082 and ADR-0059.
