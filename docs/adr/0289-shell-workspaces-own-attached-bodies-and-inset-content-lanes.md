---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
supersedes:
  - ADR-0288
---

# ADR-0289: Shell workspaces own attached bodies and inset content lanes

## Context and Problem Statement

ADR-0288 closed the construction paths for the shell Controls panel, workspace
body, and retained viewport state. Its workspace body correctly reaches the
Controls boundary, but it left subordinate content spacing to workflow classes.
The first migration consequently removed the Level Editor Events workspace's
mirrored inline-end perimeter without replacing it with a shared inner boundary.
The header, master/detail scrollers, and controls then stopped on independently
authored offsets even though they occupied one workspace.

The shell has two different geometric edges. A primary frame or drawn scroll
owner may need to touch Controls, while ordinary text and controls need a stable
content line inside that attached body. Treating those as one edge either
recreates an empty strip before Controls or leaves every workflow to guess its
own padding.

## Decision Drivers

- The workspace fill and body must continue to meet Controls.
- Ordinary content in every new workspace should receive correct opposing-edge
  alignment without a caller supplying padding or an inline-end token.
- Primary frames and drawn scroll owners must retain an explicit edge-attached
  composition without negative offsets.
- Decorative atom overhang is paint, not an alignment measurement, under
  ADR-0093.
- All new spacing must use the ADR-0031 token system.

## Decision Outcome

Chosen: **`ShellWorkspace` constructs both an attached body and its one inner
content container**.

- The shell-owned body continues to have zero inline-end padding and reaches the
  Controls boundary in every workspace.
- The shell-owned inner content container is inset by default. Its inline-end
  padding automatically mirrors the host family's existing inline-start body
  inset. Callers cannot provide an inline-end value or override token.
- The component exposes one semantic `edgeAttached` variant for primary frames
  and drawn scroll owners that already own their internal content spacing. That
  variant removes the inner-container end inset while leaving the same attached
  body in place. It is a content-kind declaration, not a geometry value.
- Level Editor Events, Level Artwork, ordinary Run destinations, and Run Relics
  use the default inset content lane. Strategikon and framed Run Army
  ledger/profile surfaces use the edge-attached variant.
- Events header actions, selected-rule controls, and other right-aligned inner
  chrome use the inner content line itself. Its master/detail clip aprons may
  expand for corner paint, but their compensating padding cannot move the rail
  edge away from that line.
- Static enforcement verifies that `ShellWorkspace` creates both layers, that
  there is no caller-tunable end inset, and that the edge-attached variant is
  used only through the shared component. The live workspace geometry gate can
  additionally compare selected inner-control border boxes with the computed
  content line.
- `ShellControlsPanel` and `ShellViewportSwap` retain all ownership and closed-
  construction requirements from ADR-0288 unchanged.

### Consequences

- Good: adding ordinary workspace content automatically produces a symmetric
  content perimeter while its background and body still fill to Controls.
- Good: changing a host family's start inset changes both ordinary content edges
  together.
- Good: edge-attached frames remain possible without restoring consumer-authored
  negative margins or padding exceptions.
- Good: visible inner rails align even when their decorative atoms have different
  paint overhangs.
- Cost: the few primary-frame consumers must identify themselves as edge-attached
  content; this semantic exception is covered by rendered dock geometry.

## More Information

- Supersedes [ADR-0288](0288-shell-surfaces-own-their-invariants.md) while
  retaining its Controls, body, and viewport ownership rules.
- Restores ADR-0279's symmetric content-line outcome without restoring its
  retired requirement that the workspace body itself stop before Controls.
- Extends [ADR-0031](0031-ui-spacing-system.md),
  [ADR-0093](0093-chrome-rails-own-alignment-atoms-use-clip-aprons.md),
  [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md), and
  [ADR-0237](0237-run-destinations-fill-the-shell-workspace.md).
