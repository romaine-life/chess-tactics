---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s canonical-saved-Level capture requirement"
refines:
  - "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
---

# ADR-0464: Generation References freeze the autosaved working copy

## Context

The Level Editor already owns one durable, revisioned, autosaved working copy.
Generation Reference capture nevertheless required the same Level and viewing
pane to cross the separate Save or official Publish boundary first. For an
official Level, preparing an image-model input therefore required making the
entire in-progress Level visible to players.

Immutable model-input provenance requires a stable source revision. It does not
require that revision to be player-visible. Coupling those boundaries made an
art-authoring operation depend on an unrelated publication decision and made
the editor's acknowledged working-copy save appear ineffective.

## Decision

A new Generation Reference freezes the exact current acknowledged Level Editor
working-copy revision. The backend, while holding the document transaction,
derives the frame, background mode, semantic board, geometry digest, Level
digest, and working-copy revision from that durable document body. The client
captures the corresponding unit-free, cover-free, overlay-free PNG. Upload
fails closed if the working copy changes between metadata creation and byte
upload.

The immutable reference records explicit working-copy revision and Level-digest
fields. Existing canonical-reference records retain their historical version-1
metadata and remain valid; new records use the version-2 working-copy semantic
request and source-operation contracts.

The editor enables capture once autosave has acknowledged the exact current
frame and Level state. It never asks the owner to Save or Publish merely to
create or copy a Generation Reference. Save, official Publish, and user-map
Publish continue to promote content through their existing canonical and
player-visibility boundaries and have no effect on an already immutable
reference.

## Consequences

- Artwork generation can use in-progress Level work without exposing it to
  players.
- Reloading retains the source revision because it is the ordinary durable
  working copy, not browser-only state.
- Every candidate remains traceable to an exact immutable PNG, semantic packet,
  working-copy revision, hashes, actor, and time.
- Publication and artwork handoff no longer share labels, controls, or gates.

## Verification

- A never-published or canonically dirty working copy with an acknowledged valid
  frame can create and upload a Generation Reference.
- The stored version-2 request names the exact working-copy revision and Level
  digest and contains the unit-free, cover-free semantic board.
- A working-copy edit between reference metadata creation and PNG upload rejects
  the upload without mutating the immutable reference.
- Historical version-1 canonical references and their attempts remain readable
  and processable.
- The Generation References UI offers capture from the saved working copy and
  never routes the owner to Publish as part of that operation.
