---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
refines:
  - ADR-0065
  - ADR-0193
---

# ADR-0279: Wars are a sibling collection in the persistent Editor rail

## Context

The Editor placed Campaigns in its scrolling navigation rail but exposed the
separate War library as a pinned footer action. An interim War screen then
replaced that whole rail with a War-specific navigator. Both presentations made
War look like a one-off tool even though Wars are an unbounded editable
collection with one active selection.

## Decision

- Wars is one collection row in the Editor's existing scrolling rail, directly
  alongside Skirmish Profiles and Unassigned Levels in the Workspace group.
  Selecting it changes only the adjacent workspace and preview columns. The
  rail's campaign rows, sibling collection rows, and pinned footer remain the
  same mounted navigation surface.
- Campaigns, Wars, Skirmish Profiles, and Unassigned Levels are authored child
  scenes in the Editor's `editor-content` slot. The Editor rail is the retained
  `editor-shell` host. Every change between those destinations uses the shared
  transition-only scene lifecycle and its accepted fade; route state may request
  a destination but may not replace visible Editor content directly.
- The War library continues to remain separate from the Campaign collection as
  required by ADR-0193. This decision aligns navigation and tab geometry; it
  does not merge their content models or editors.
- The Wars collection row uses the same compact Editor-rail tab geometry and
  continuous stone indexing as its two sibling collections. Multiple Wars are
  selected within the adjacent War workspace, exactly one is active, and a
  fresh session selects the first private War when available, otherwise the
  first available War.

## Consequences

- The pinned footer contains only creation, persistence, publication, and
  authentication verbs.
- Campaigns and Wars retain their own details and validation while sharing the
  Editor workspace's persistence controls.
- Adding or selecting Wars never replaces, re-keys, or reorders the Editor rail.
- Editor destination changes retain the rail, fade the complete outgoing
  workspace/preview region, commit the pending child, and fade that complete
  region back in without a Loading presentation.
