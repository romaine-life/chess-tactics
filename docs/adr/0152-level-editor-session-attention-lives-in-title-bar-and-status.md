---
status: "accepted"
date: 2026-07-25
deciders: Nelson, Codex
refines: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
---

# ADR-0152: Level Editor session attention lives in the title bar and Status

## Context and Problem Statement

The editing-session card was mounted above every Level Editor control layer.
That made recovery and session metadata compete with the controls used for
ordinary board authoring, even when the current session needed no action.

## Decision Outcome

- Editing-session details, takeover actions, and recovery management appear
  only in the Level Editor's Status layer.
- The title bar shows one session-attention control only when another session
  holds authority or preserved server recoveries need review.
- Activating that control opens Status and scrolls to the relevant session or
  recovery information.
- The ordinary writer state is silent outside Status.
- Session fencing, read-only behavior, attribution, takeover, and recovery
  persistence remain unchanged.

## Consequences

Normal control layers contain only their authoring controls. Session problems
remain globally visible without repeating their full UI, and the attention
control leads directly to the place where the owner can act.
