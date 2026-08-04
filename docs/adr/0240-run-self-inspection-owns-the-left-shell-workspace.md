---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_supersedes:
  - ADR-0216 lipsanon-strip visibility while self-inspection is open
  - ADR-0230 Army main-pane presentation
---

# ADR-0240: Run self-inspection owns the left shell workspace

## Context

Run Army inspection was rendered as another inset, framed panel in the ordinary
phase workspace. The result was a middle pane inside the already established
Play shell, leaving the lipsanon overlay above it and making player inspection read
like a secondary shop card rather than a complete workspace.

The Level Editor already has the intended ownership model: Events and artwork
workflows replace the complete left workspace with a fill-only surface while
the title bar and right Controls remain fixed. Run also needs a durable way to
inspect lipsana once that workspace covers the persistent lipsanon strip.

## Decision

- Run has a primary operational destination for its current phase, a
  transactional **Sell Units** destination during shops, and a distinct
  **Self inspection** group containing **Army** and **Lipsana**.
- Self-inspection fills the Play shell's complete left workspace, from the title
  divider to the bottom and from the left edge to the Controls divider. It uses
  the shared fill-only `ShellWorkspace` primitive and does not instantiate an
  `OuterChromeBox`, paint a second exterior frame, or calculate viewport and
  control-rail offsets.
- The right Controls panel remains fixed. Its primary phase button returns to
  the operational destination; Army and Lipsana remain sibling destinations
  under the explicit **Self inspection** heading. Shop Reset, Continue, and
  Run abandonment retain their existing ownership.
- Opening either self-inspection destination suppresses the lipsanon overlay,
  because that overlay occupies the workspace being replaced. **Lipsana**
  provides the durable replacement: a readable list of every held lipsanon's
  canonical icon, name, and complete effect, plus an explicit empty state.
- The covered phase remains mounted, hidden, inert, and inaccessible. In
  Battle, this preserves the existing board, camera, and Battle lifecycle, so a
  timed clock continues exactly as it did for Army inspection under ADR-0230.
- The shared shell-workspace primitive is workflow-neutral. Level Editor
  workspaces and Run self-inspection compose the same fill, clipping, and
  content bounds while retaining their own workflow-specific classes.

## Consequences

- Army and Lipsana read as two views of the player rather than shop or Battle
  controls.
- Inspection receives the full available Play workspace without a box inside a
  box, while the shell's title and Controls geometry cannot drift.
- The lipsanon strip remains persistent on operational and transactional Run
  destinations, but intentionally yields to the complete Lipsana workspace
  during self-inspection.
- Closing inspection restores the exact underlying phase state without
  reinitializing a Battle or between-Battle workflow.

## More Information

- Refines [ADR-0144](0144-level-editor-events-use-the-shell-workspace.md) by
  extracting its fill-only composition into a shared shell primitive.
- Partially supersedes
  [ADR-0216](0216-run-lipsana-live-in-a-playfield-overlay-beneath-the-title-bar.md)
  only while self-inspection is open.
- Partially supersedes
  [ADR-0230](0230-run-shops-separate-buying-army-inspection-and-selling.md):
  its inspection model, Battle-lifecycle rule, and selling workflow remain
  accepted; Army is now a shell-filling self-inspection destination rather
  than an inset main-pane outer panel.
