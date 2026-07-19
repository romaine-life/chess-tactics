---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0107](0107-predrawn-registration-has-no-unsaved-dialog-state.md)"
---

# ADR-0108: Pre-drawn registration is local-first and explicitly saved

## Context

ADR-0107 made each point edit write immediately to the review URL. That blurred
the difference between placing a point and proving that the authored registration
had become durable. It also led browser inspection in a different browser profile
to be mistaken for inspection of the owner's Chrome session. Browser profiles do
not share local storage, so the authoring surface itself must report persistence
without relying on an agent inspecting another browser.

The owner requires a literal save action with an observable success condition.

## Decision

Point placement, keyboard nudging, and restore edit pending picker state. The
picker exposes a `SAVE REGISTRATION` button. Its synchronous click handler writes
a versioned record keyed by the exact candidate source to same-origin browser
`localStorage`, immediately reads it back, parses it, and compares its stable
serialization with the pending value. The UI may say `SAVED LOCALLY` only after
that read-back comparison succeeds. A failed write, missing read-back, or changed
value remains visibly failed and is not reported as saved.

After successful local verification, the app mirrors the same registration into
the temporary review URL and enables the live grid. On reopen or refresh, the
same browser's source-scoped local registration outranks the URL mirror. The URL
remains a shareable review handoff; browser local storage is the durable authority
for this temporary, unaccepted candidate registration.

This is browser-profile scoped by design. Chrome and the Codex in-app browser do
not share the record. Saved level content and accepted runtime assets remain
untouched.

## Consequences

- The owner controls the commit gesture and receives success only from the same
  storage authority that handled it.
- A placement cannot be silently mistaken for a durable save.
- Refreshing the same Chrome profile restores the last verified registration,
  even if a stale URL is reopened.
- Cross-browser inspection is neither required nor valid evidence of the save.
