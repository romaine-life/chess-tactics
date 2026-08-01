---
status: accepted
date: 2026-07-31
deciders: owner (Nelson) + Codex
supersedes:
  - 0263-card-scenes-are-an-owner-authored-studio-instrument.md
---

# ADR-0277: The card scene authoring instrument is removed

## Context

ADR-0263 shipped an owner instrument for composing card mock-up battlefields as
art-generation seeds: a Studio "Card Scenes" catalog opening the real Level
Editor in a document-free card-scene mode (`/editor/level?cardScene=<id>`), a
draggable card viewing pane, a reduced capture-stage viewer, and a revisioned
`card_scene_documents` backend document (migration 47) hydrated at boot.

The same day it merged (PR #564), the owner redirected card art away from
board-scene seeds entirely: cards get flavorful illustrated art with
flavor-first names, produced in a parallel card-redesign workstream. The
level-mock-up seeding workflow the instrument exists for is not part of that
direction, and no scene was ever authored.

## Decision

Remove the authoring instrument only; the rest of PR #564 stands.

Removed:

- The Studio "Card Scenes" catalog category, its `cardscene` viewer kind, and
  the `card`/`cardVariant` Studio URL params.
- The Level Editor card-scene mode: the `card-scene` layer, locked-layer set,
  document-free bootstrap branch, rail panel, and the viewing-pane overlay.
- The override document pipeline: `cardSceneOverrides` store, `net/cardScenes`
  client, boot hydration, and the backend `/api/card-scenes/*` endpoints.
- Override consumption in `runCardScenePlan` — scenes are again purely
  deterministic from the canonical card id, framed by the default viewing pane.

Kept (still accepted under ADR-0262): the generated vignette card faces,
authored card names, the Enchiridion Cards codex, and the installed-art plate
contract (`run-card-scene` slots at 480×360) as the future art install path.

Applied schema history is immutable (`predrawnArchiveUpgradePath.test.js` fails
readiness when a recorded migration is edited, renamed, or removed), so:

- **Migration 47** (`owner-authored Run card scene overrides`) stays in the
  inline ledger byte-for-byte as shipped; its checksum
  (`e6299b75…`) is already recorded in the shared development database and is
  now pinned by the upgrade-path test.
- **Migration 48** retires the feature append-only:
  `DROP TABLE IF EXISTS card_scene_documents;`. The development document held
  only empty overrides; production never wrote one.

The instrument remains recoverable from git history (`e88980f2`) if a future
direction wants it back.

## Consequences

- The Studio catalog and the Level Editor return to their pre-#564 surfaces; no
  route accepts `?cardScene=` any more.
- The migration ledger tops out at 48, and the sparse-history upgrade proof
  requires the complete 1–48 history with pinned identities for 47 and 48.
- Card-art enrichment (illustrated faces, install flow) is owned by the parallel
  card-redesign workstream.
