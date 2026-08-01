---
status: superseded by ADR-0289
date: 2026-08-01
deciders: owner (Nelson) + Codex
superseded_by: ADR-0289
supersedes:
  - ADR-0287
---

# ADR-0288: Shell surfaces own their invariants

## Context and Problem Statement

ADR-0287 aligned every known shell workspace by requiring callers to compose a
`ShellWorkspaceBody`. The same change aligned the two known Controls rails with
a generated selector that enumerated their consumer ids. Those results fixed
the current inventory but left the invariant as a caller protocol: a new caller
could construct a workspace without its attached body, construct a Controls
rail outside the shared seam rule, or independently implement the retained
viewport's hidden, inert, and accessibility state.

A contract that says two separately constructible pieces must always occur
together has not identified the complete object. Guards over a list of known
callers detect drift after it is authored; they do not make the correct behavior
the default construction path.

## Decision Drivers

- A production shell consumer supplies workflow content, not shell anatomy.
- Required title, frame, attachment, and covered-state behavior must be created
  by their owning object rather than restated by callers.
- Variations such as a navigation rail, scroll layout, or workflow controls are
  slots within the invariant shell objects.
- Adding a destination through the supported API must inherit current geometry,
  paint, accessibility, and retained-state behavior without a new selector.

## Considered Options

- Keep the caller protocol and strengthen the inventory guards.
- Make the shell objects construct every invariant part and remove the lower-
  level production paths.

## Decision Outcome

Chosen: **make the shell objects construct every invariant part**.

- `ShellControlsPanel` is the only production application-shell Controls rail.
  It creates the fixed **Controls** title, titled outer role, placement class,
  semantic seam marker, and shared divider/fill behavior. Skirmish, Run, and the
  Level Editor provide content and title actions only. Generated chrome targets
  the semantic marker supplied inside this component; it never enumerates
  workflow consumer ids.
- `ShellWorkspace` creates its Controls-attached body unconditionally. Callers
  provide ordinary children plus optional `rail`, `bodyClassName`, and layout
  classes. There is no exported `ShellWorkspaceBody` and therefore no supported
  workspace construction that can omit the attached body.
- `ShellViewportSwap` creates the retained primary wrapper and owns its covered
  state. Callers provide the primary content, replacement content, the open
  state when it cannot be inferred, and optional persistent overlays. The
  component alone sets the covered marker, `visibility`, `inert`, and
  `aria-hidden`; hosts do not author `is-workspace-covered` branches.
- Skirmish/Strategikon, Run phase/self-inspection, and Level Editor
  board/Events/Artwork use that one viewport-swap construction. They may keep
  their workflow-specific content and layout classes, but those classes do not
  own shell attachment or covered-state semantics.
- `OuterChromeBox` and `OuterChromeHeader` remain lower-level chrome primitives
  for non-shell outer panels and developer review specimens. Production shell
  code may not combine them into another panel titled Controls.
- Static enforcement rejects production use of the retired consumer ids, a raw
  Controls title, an exported/direct workspace body, or caller-authored covered
  state. Live geometry continues to verify the resulting boundary on real
  routes; it is evidence that the owning object works, not the mechanism that
  makes callers comply.

### Consequences

- Good: a new shell Controls rail cannot forget its seam behavior because the
  title and seam marker are created by the Controls object.
- Good: a new workspace cannot forget its attached body because the body is an
  implementation detail of `ShellWorkspace`.
- Good: every replacement mode retains and suppresses its primary surface with
  one accessibility and visibility implementation.
- Good: the regression guard now protects the closed construction path rather
  than maintaining a list of correctly assembled parts.
- Cost: consumers must express their differences as slots and content classes;
  direct shell assembly is intentionally unavailable.

## More Information

- Supersedes [ADR-0287](0287-shell-workspace-bodies-dock-to-controls.md) while
  retaining its zero Controls-facing inset and Battle-only scenic gutter.
- Extends [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md),
  [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md),
  [ADR-0237](0237-run-destinations-fill-the-shell-workspace.md), and
  [ADR-0240](0240-run-self-inspection-owns-the-left-shell-workspace.md).
