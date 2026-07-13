---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
---

# ADR-0090: Private draft cards preview and manage working copies

## Context

The Editor's **Continue editing** section discovers the signed-in owner's dirty
and never-saved Level Editor documents. Those cards previously showed only a
canonical saved-position thumbnail. A never-saved document therefore showed a
`Not saved` box even though its durable working copy already contained a complete
board. The cards also suppressed their shared row controls, so the only available
operation was opening the row; renaming required entering the Level Editor, and
never-saved documents could not be removed.

The existing canonical-only thumbnail rule protects gameplay, campaign browsing,
sharing, and public previews from silently presenting unpromoted edits. A private
resume surface has a different job: it must identify the exact working document
the owner is about to reopen. Treating that owner-only preview as a canonical
campaign thumbnail made the discovery UI less truthful, not more.

## Decision

The authenticated `/editor` **Continue editing** cards are a narrow working-copy
preview and management surface:

- After reading the private summary index, the client may load the displayed
  documents through the existing owner-scoped `GET /api/editor-documents/:id`.
  It renders each returned working `Level` with the shared `LevelThumbnail`.
  The summary endpoint remains body-free, and the client hydrates only the bounded
  set of cards it will display.
- The card body and thumbnail continue the existing opaque document URL. Reading
  or opening a card does not create, save, publish, share, or rewrite a document.
- A card may rename its working Level inline. Rename uses the same full-body,
  compare-and-swap `PUT` as Level Editor autosave; it never promotes the Level to
  the canonical workspace. Empty input normalizes to `Untitled level`, and names
  use the Level Editor's 80-character limit.
- Cleanup is explicit and confirmed. A saved-baseline document uses **Discard
  changes**, restoring its working copy from the canonical Level and removing the
  now-clean card from this dirty-work index. A never-saved document may be
  permanently deleted with a compare-and-swap `DELETE`. That endpoint must reject
  any document with a saved baseline and must never delete or mutate canonical
  workspace content.
- Revision conflicts preserve the newer server document and are reported on the
  card instead of overwriting another tab's edits.

This exception does not change the canonical boundary. Gameplay, campaign and
level selectors, social/public previews, and server-generated thumbnails continue
to read canonical saved Levels only. A working-copy preview is private resume UI,
not a saved or publishable thumbnail.

## Consequences

- Never-saved work is visually identifiable from its actual board instead of a
  generic placeholder.
- Owners can rename or clean up drafts without first entering each document.
- The list stays lightweight until its bounded visible entries are known, while
  thumbnail rendering reuses the canonical client primitive rather than adding a
  second renderer.
- A never-saved delete is irreversible and therefore requires confirmation; a
  saved-backed card takes the safer Discard path and retains its stable document
  identity.
- Canonical gameplay and public presentation remain insulated from autosaved work.
