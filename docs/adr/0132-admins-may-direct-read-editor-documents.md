---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
---

# ADR-0132: Admins may direct-read editor documents

## Context

Level Editor documents have globally unique opaque IDs, but their read endpoint previously
required the signed-in account to own the document. That made an exact review link unusable to
an administrator whenever another account created the working copy. Building a second review-copy
workflow would duplicate documents and add persistence behavior to what should be a direct link.

## Decision

An authenticated allowlisted administrator may read an existing Level Editor document through
`GET /api/editor-documents/:documentId` when given its exact opaque ID.

This is direct-read access only:

- `GET /api/editor-documents` remains owner-scoped, so administrators cannot enumerate another
  account's working copies.
- Resolve, create, autosave, Save, Discard, and Delete remain owner-scoped.
- Anonymous users and ordinary users still cannot read another owner's document.
- An unknown or deleted document ID still returns not found.
- Link-copy controls remain side-effect free under ADR-0068; they do not create, duplicate,
  publish, or re-save a document.

Runtime-produced document links continue to use IDs returned by successful document load,
resolve, create, or list responses. No separate review-document store or preparation step exists.

## Consequences

- An administrator can open a valid review link without signing in as its owner.
- Possessing a review link does not grant discovery or mutation rights.
- A fabricated or stale ID cannot be repaired by authorization and remains not found.
- The ordinary Level Editor URL remains the sole review handoff.

## More Information

- [Persistence](../persistence.md#level-editor-working-copies)
- [ADR-0068](0068-link-copy-controls-are-side-effect-free.md)
- [ADR-0090](0090-private-draft-cards-preview-and-manage-working-copies.md)
