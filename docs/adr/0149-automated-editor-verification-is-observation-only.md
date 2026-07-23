---
status: accepted
date: 2026-07-20
deciders: Nelson, Codex
refines: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
---

# ADR-0149: Automated editor verification is observation-only

## Context

Authenticated visual verification must render the real private Level Editor.
Its ordinary session open becomes the writer when no lease exists, so a
short-lived headless screenshot can advance the fence and later manufacture an
expiry recovery despite making no edit. Closing after capture avoids expiry
only on a successful exit and still seizes authority during verification.

## Decision

The edit-session open contract accepts explicit `observe` intent. That request
creates a distinct attributable `observing` session, never a waiting or active
writer. Opening or closing it never acquires or extends the writer lease, advances
`edit_generation`, resolves another session's expiry, creates a recovery, or
changes working/canonical content.

The observer may read the exact owner document, attributed presence, and
recovery index, and may close itself. It cannot heartbeat, take over, upload
recovery content, or use a fenced mutation. Moving from observation to editing
requires a separate write-intent open with the same private page credential,
which then follows ADR-0143's normal active-or-waiting rules.

The repository screenshot helper supplies observe intent only on recognized
Level Editor routes. It authenticates and renders the real route, then closes
the inert session through the normal app navigation handshake. Ordinary browser
visits keep default write intent.

## Required verification

- Across one screenshot visit, the active writer, `edit_generation`, working
  revision/body, and recovery count remain unchanged.
- Observer heartbeat, takeover, recovery upload, and fenced mutation fail
  without changing authority or recoveries.
- The screenshot helper marks Level Editor requests only.

## Consequences

Authenticated screenshots no longer compete with the owner's Chrome tab or
pollute Status. An abruptly terminated observer may leave an inert attribution
row, but it cannot block editing or become an expiry-recovery source.

## Rejected alternatives

- **Open then close a writer:** still seizes authority and depends on cleanup.
- **Spoof administrator review:** represents the wrong authorization relation.
- **Use a fixture or signed-out page:** does not verify the real private editor.
- **Query-only client bypass:** changes authority without a server contract.

## More Information

- [ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)
- [Persistence contract](../persistence.md#level-editor-working-copies-and-sessions)
