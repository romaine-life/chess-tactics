# UI-kit live-media authoring

UI-kit images use the shared live-media lifecycle in
[ADR-0085](adr/0085-runtime-assets-are-live-storage-backed.md). The former
batch forges and nine-slice bake scripts are retired: they read committed
reference images, wrote PNGs into `frontend/public`, and generated a Git-owned
catalog. They must not be restored.

Git may still own the UI kit's geometry algorithms, palette transforms, prompts,
and text provenance. Installed nine-slice geometry, identities, ordering, labels,
media-role assignments, and defaults are drawable-catalog data. Source images, atoms,
candidate frames, contact sheets, and accepted frames belong to private object
storage, with their lifecycle and active pointers in Postgres.

Surviving deterministic generation and assembly tools accept fetched inputs and
write candidate output only in explicit outside-repository temporary
workspaces. A Git-input/Git-output mode is not a supported authoring or
publication path.

## Method verification

A real Codex image-generation run emits an `image_generation_call` in its full
rollout session log. `codex exec --json` stdout is abridged and does not contain
that event. Any generator using Codex must validate the rollout through
`frontend/scripts/codex-imagegen.mjs`; a clean-looking bitmap is not proof that
an image model produced it.

Method verification is only provenance. Transparency checks are only mechanical
hygiene. Neither is visual acceptance. The exact uploaded candidate must be
shown in a game-owned review instrument and approved there before the backend
can atomically change an accepted pointer.

## Candidate workflow

1. Work in an operating-system temporary directory.
2. Generate on a flat chroma plate when transparency is required, then remove
   the plate without spatially resampling the subject.
3. Upload the exact resulting bytes and provenance through the shared
   live-media admin client. Do not copy them into `docs/art`, `frontend/public`,
   a source module, or a static manifest.
4. Preview the candidate through its semantic UI-kit role at native size.
5. Record owner review and accept the complete UI-kit projection through the
   backend transaction.
6. Delete the temporary workspace.

The nine-slice editor saves geometry and media-role assignments through the
drawable-catalog admin transaction. It has no filesystem-writing dev endpoint
or committed registry. Media promotion continues to use the candidate, review,
and acceptance API.
