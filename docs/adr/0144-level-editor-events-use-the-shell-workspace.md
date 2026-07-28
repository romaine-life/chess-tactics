---
status: "accepted"
date: 2026-07-19
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0064 Events presentation clause
  - ADR-0082 Events outer-panel classification
---

# ADR-0144: Level Editor Events use the shell workspace

## Context and Problem Statement

The Level Editor's Events instrument was implemented as a separately framed
overlay over the board. It duplicated the title-bar height, control-rail width,
grid gap, and outer-atom outset in fixed-position CSS. A shared outer-panel rule
also overrode that positioning, placing the surface in the board grid's normal
flow, centering it, and clipping its lower content.

More importantly, repairing that CSS would preserve the wrong ownership model.
The editor shell already owns a stable title bar, a left workspace, and one
right-side control rail. Events is alternate editor content, not a second window
with another exterior frame.

## Decision Outcome

When Events is open, it visually replaces the board inside the Level Editor's
existing left workspace. The persistent title bar and right controls remain in
place. The shell's grid defines every Events edge: below the title divider, to
the viewport bottom, from the left viewport edge to the controls divider.

The Events surface therefore:

- fills the positioned board-workspace parent rather than measuring the viewport;
- owns only its content layout and internal scrolling;
- may reuse the installed chrome family's generated fill through the shared
  fill-only primitive;
- does not instantiate `OuterChromeBox`, register as an `outer-panel` consumer,
  paint rails or corner atoms, use dialog semantics, or author viewport offsets;
- keeps every interactive control on the registered `inner` chrome path; and
- keeps the covered board mounted but inert and inaccessible so closing Events
  restores the existing camera and editor state without reinitialization.

Responsive layouts inherit the same rule: Events fills whichever grid area the
shell assigns to the board workspace. It does not calculate a separate desktop
or stacked-rail geometry.

## Consequences

- Events reads as a full editor mode within one stable shell rather than a modal
  floating over another surface.
- The title, controls, and Events surface cannot drift because only the parent
  grid owns their relationship.
- The retired Events outer-panel consumer is removed from Chrome Audit and the
  chrome registry. The real Level Editor remains the review surface for Events.
- Repository checks enforce parent-relative fill, the shared fill-only path,
  preserved board state, and the absence of fixed viewport calculations.

## More Information

- Partially supersedes [ADR-0064](0064-victory-conditions-two-list-model.md):
  its event model remains accepted; only the separately framed overlay
  presentation is retired.
- Partially supersedes
  [ADR-0082](0082-control-panel-chrome-has-outer-and-inner-roles.md): its two
  chrome roles remain accepted; Events is no longer an outer-panel consumer.
- Builds on [ADR-0033](0033-board-plus-control-panel-layout.md) and
  [ADR-0100](0100-title-and-controls-are-one-branched-rail-topology.md).
