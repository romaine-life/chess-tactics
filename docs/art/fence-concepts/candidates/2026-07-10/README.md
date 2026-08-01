# Fence native-art candidate bake-off — 2026-07-10

This directory is text provenance for a historical review batch. Its media was
migrated to private live storage; it is not a candidate source or rebuild path.

## Candidate matrix

| Lane | Material | Result | ADR-0076 status |
| --- | --- | --- | --- |
| Blender | stone rail + post | Direct `96x180` renders; rail spans 48 px and post is exactly `18x24` | Mechanically native, pending in-app/human review |
| PixelLab | wood rail | Two untouched `48x32` generations; best opaque span is 40 px | Native canvas, contract miss; do not resize |
| PixelLab | wood post | Two untouched `32x32` generations; best footprint is `12x28` | Native canvas, contract miss; do not resize |
| PixelLab | stone rail | Two untouched `48x32` generations; best opaque span is 42 px | Native canvas, contract miss; do not resize |
| PixelLab | stone post | Untouched `32x32` generation with exact `18x24` footprint | Mechanically native, pending composition/review |
| Codex | wood rail + post | High-resolution generated kit sheet | Calibration reference only; non-production |
| Codex | stone rail + post | High-resolution generated kit sheet | Calibration reference only; non-production |

The PixelLab misses are intentionally retained and labeled. ADR-0076 allows us
to learn from their scale, but forbids stretching them into the contract. The
next attempt must regenerate or render the chosen design at the required pixels.

The Codex sheets likewise remain design references. Chroma removal changes alpha
only and does not make their high-resolution subjects native gameplay art.

## Review proof

> Historical snapshot: this first-pass review originally exposed the two procedural
> runtime kits beside five candidates. The later realignment run reduced that batch,
> and ADR-0299 subsequently retired its dated route. Retained bridge and archive
> records are no longer Studio or Level Editor choices. Historical PixelLab and
> Codex prompt/provenance metadata remains as text.

The deleted contact-sheet, preview-builder, and repository-output scripts are
not supported regeneration paths. A new pass must upload candidates through the
live-media admin workflow and mount those exact versions in the board review.

The retired primary route used one pre-drawn private working copy served from the
durable editor-document database. Its Fence panel offered seven selectable artwork
kits at the time. That dated route and its fallback cycle are no longer supported.

The saved level continues to contain ordinary editable wood/stone rails and
authored posts. The `artReview` and `fenceArt` parameters substitute only the
selected review artwork inside the same globally depth-sorted scene canvas;
artwork-kit ids never enter gameplay data. The board is pre-drawn so it is useful
immediately, remains editable in the same system, and does not expire. The Studio gallery and
contact sheet remain supplementary comparison surfaces, never runtime-art
sources. Review mounting and interaction do not promote any candidate: the live
wood/stone kit is still the ADR-0076 calibration bridge, and all candidate status
labels above remain unchanged.
