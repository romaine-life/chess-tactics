---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0016 Git-owned nine-slice registry
  - ADR-0019 filesystem persistence for nine-slice editor state
  - ADR-0039 code-owned tile catalogs
  - ADR-0054 Git-owned nine-slice family and calibration configuration
  - ADR-0061 code-owned base prop identities
  - ADR-0083 Git-owned Chrome art-direction state
  - ADR-0085 stable-slot references from code
---

# ADR-0106: Installed content is database-owned

## Context

ADR-0085 moved media bytes and active pointers out of Git, but many consumers still compile the installed inventory into TypeScript. Editor palettes enumerate wall, fence, terrain, prop, doodad, and other concrete members; renderers construct semantic media slots from those ids; validators reject ids absent from compiled unions. The database therefore owns the selected pixels while Git still decides which content exists.

This hybrid requires a code change and deployment to add ordinary content, lets editor and runtime catalogs drift, and makes copying a nearby compiled registry appear architecturally valid.

## Decision

Git owns schemas, protocols, algorithms, deterministic geometry, and behavior discriminators. Postgres owns the complete installed content inventory and its configuration. Blob Storage owns media bytes.

- A logical drawable row owns its opaque id, kind, label, ordering, lifecycle, behavior parameters, metadata, and named media-role assignments.
- When a drawable uses media, each media-role assignment references a live semantic slot; the public projection resolves every role to one immutable media descriptor from the same database snapshot. Configuration-only drawables may have no media roles.
- Editors, Studio catalogs, renderers, validation, browser bakes, and server thumbnails consume the database projection. They do not enumerate installed members or construct slots from ids.
- Closed code unions may describe behavior only when executable logic branches on that behavior. Concrete installed materials and appearances are open-ended database ids.
- Missing catalog state fails closed. There is no compiled inventory, packaged fallback, filename-derived roster, or code-owned default content record.
- Adding, removing, renaming, reordering, or retagging an instance that uses existing behavior requires no source change or deployment.
- CI rejects recreation of a compiled inventory after each domain is migrated. Tests inject ids that never occur in production source and prove that they appear, persist, validate, and render through the catalog alone.

## Migration

Introduce one shared logical drawable catalog above live media slots. Move domains as complete vertical slices, populate live rows through admin transactions, then delete their compiled catalogs, path constructors, fallback defaults, closed content unions, and code-owned validation sets. A temporary migration tool may project current definitions for an operator-reviewed import, but it is deleted and cannot become a seed or runtime fallback.

The initial migration covers terrain surfaces and composites, Subterrain, road/river/fence/wall materials, structures and doodads, prop base membership, ground cover, wall decoration, UI surfaces, and UI slider configurations. The same catalog is consumed by browser startup and server-side rendering.

## Consequences

The database becomes the actual content authority rather than only the final media-pointer resolver. Migration is broad because inventory metadata is currently distributed across renderer, editor, Studio, serialization, and tests.
