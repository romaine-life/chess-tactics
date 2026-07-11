# Historical kit brief — icons

This file is retained only because ADR-0011 and ADR-0026 cite the original
extraction brief. That workflow is superseded and is not production authority.

Current contract:

- icon pixels are generated through the method-verified forge;
- the 64×64 canvas and safe-area geometry are governed by ADR-0026;
- source pixels are fetched from private backend versions into an OS temporary
  workspace;
- generated pixels are uploaded as private candidates for semantic
  `ui/kit/icons/<name>.png` slots;
- owner review and backend acceptance move the active pointer; and
- no source, candidate, gate result, accepted pointer, or runtime media file is
  written to Git.

See `docs/kit-forge.md`, `docs/runtime-asset-contract.md`, and ADR-0081.
