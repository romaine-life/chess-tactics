# Piece portrait contract

The portrait is the framed bust shown in the Skirmish HUD's Selected Unit card.
It is a separate visual role from the fixed-isometric board sprite and a separate
live-media semantic slot.

## Camera and composition

- Perspective lens, 55 mm on a 36 mm sensor.
- Eye-level presentation, 10° above the look-at point.
- Frontal three-quarter view: 30° camera azimuth for every piece while the unit
  itself keeps its canonical south-facing orientation.
- Adaptive bust framing: look at `0.62 × topZ` and frame a vertical span of
  `0.96 × topZ`. The distinctive top remains visible and the body bleeds through
  the bottom edge; it must not read as a full figurine or a base sliced flat.
- 512×512 transparent source render, Cycles, Standard view transform.

Per-piece framing overrides and crop rectangles are deterministic geometry and
may remain in Git. They must refer to stable portrait slots, never repository
paths, candidate ids, or blob hashes.

## Palettes

Each portrait family provides `navy-blue`, `crimson`, `golden`, `emerald`,
`black`, and `white`. The body material follows the board-unit palette recipe;
golden uses the iron-accent treatment. Black and white use curated value ramps
that preserve highlights and shadows.

## Live-media ownership

Portrait masters, candidates, review images, and accepted delivery rasters are
stored in private object storage. Postgres owns their typed portrait metadata,
review evidence, active/accepted pointers, and revisions. Runtime portrait
components resolve stable backend routes such as the semantic role for a piece
and palette; `/assets/...` is a backend semantic-slot address, never a
filesystem or `frontend/public` path.

The Selected Unit card, roster, Portrait editor, Studio, and server rendering
must all resolve the same catalog revision. A missing critical portrait slot is
an explicit availability failure. There is no badge, baked portrait, or generic
committed-art fallback for a required portrait role.

## Authoring and review

1. Fetch any required private source model through an authenticated authoring
   workflow into a temporary workspace.
2. Render the declared camera directly at the native target size. Do not crop,
   resize, or spatially resample the subject to manufacture native evidence.
3. Upload the exact output as a candidate with its camera, palette, source,
   dimensions, and no-resampling provenance.
4. Mount that candidate in the real HUD/roster/editor surfaces at canonical 1×.
5. Record owner review and accept the complete typed portrait family through the
   backend transaction.
6. Delete the temporary source and render workspace.

The retired portrait scripts that wrote masters, palette variants, or catalog
references under `frontend/public` and `docs/art` were deleted at the ADR-0085
cutover. They are not a regeneration or fallback path.
