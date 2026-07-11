# Terrain media authoring

Terrain pixels are live-storage-backed under
[ADR-0081](../../docs/adr/0081-runtime-assets-are-live-storage-backed.md).
This directory no longer contains a production bake that writes tile PNGs into
`frontend/public` or source/review images into `docs/art`.

## Ownership boundary

- Git owns the 96×180 projection constants, alpha/mask geometry, socket rules,
  prompts, and text provenance.
- Postgres owns semantic terrain slots, candidate metadata, review evidence,
  active/accepted pointers, and catalog revisions.
- Private object storage owns source, candidate, review, and accepted media
  bytes.
- `/assets/<slot>` is a backend route. It is never a path under `public`.

Terrain slots declare their role explicitly: top, side, animation sheet,
feature overlay, wall/fence face, prop, or preview. Code and level data retain
the stable slot id; they never retain a local filename or content hash.

## Authoring workflow

1. Generate or fetch source pixels into an operating-system temporary directory.
2. Apply the repository's deterministic projection/mask transforms there. The
   low-level path-parameterized transforms in this directory are not publishers.
3. Create a candidate with the shared live-media admin client, then upload each
   exact output byte stream to its semantic slot.
4. Mount those candidate versions in the real board renderer at canonical 1×.
5. Record owner review through the backend and accept the complete typed terrain
   set transactionally.
6. Delete the temporary workspace. Do not copy any source, proof, candidate, or
   accepted image into the repository.

Multi-output families must use one run id in their provenance and must be
validated as a complete domain set before acceptance. A contact sheet is
supplementary; it is not review evidence or promotion.

## Retired pipeline

The previous `build-*`, `forge-*`, and Git-hash guard scripts were deleted at
the ADR-0081 cutover. They depended on committed input pools, emitted directly
into `frontend/public/assets`, and treated manifests or filenames as production
registration. Do not restore them as seed, fallback, or regeneration paths.
