> ⚠ **SUPERSEDED — do not follow the extraction method below.** Chrome art is now
> **generated** (codex img2img, method-verified) or assembled from generated atoms,
> not extracted from concept crops. See [ADR-0011](../../adr/0011-chrome-art-generated-not-extracted.md).
> Kept for history.

# Kit Art Brief — Row (9-slice, EXTRACTED from the original)

One reusable, transparent, 9-slice **list/setting row** frame. Extract real
pixels from the concept — do NOT redraw the frame or its corner accents.

## Source (read the PNG and crop real pixels)

- Source image: `docs/art/ui-screen-concepts/generated/settings-audio-concept-v1.png`
  (1586 × 992). Read with pngjs, crop real pixels.
- A clean setting-row frame occupies approximately **x=408, y=213, w=1116,
  h=82** (the "MASTER AUDIO" row). Its frame = thin border + small corner
  accents + dark-navy interior. The speaker icon, label, and ON toggle inside it
  are LIVE content — exclude them; sample the frame and a clean interior patch
  only.

## Method (per-slice extraction)

1. **Left & right caps (fixed):** crop the real left-end and right-end corner
   regions of the row frame (~18 px), including the small corner accents.
2. **Top & bottom edges (tile horizontally):** crop a clean vertical-thin strip
   of the top and bottom border from a span with no icon/label/toggle over it.
3. **Center (tile):** crop a clean patch of the dark interior (no content).
4. **Assemble** a 9-slice that stretches horizontally to any row width and a bit
   vertically. Keep outside-the-frame transparent.

## Deliverables

- `frontend/public/assets/ui/kit/row.png` (≈96 × 48) and `row@2x.png`.
- `frontend/scripts/generate-kit-row.mjs` — the crop+assemble script.

## Acceptance criteria

- Corner accents are the **real extracted concept pixels**, not a redraw.
- Transparent outside; real dark interior inside (not hollow).
- `border-image … fill / Npx round`: stretched to a wide row, no seam on top/
  bottom edges, caps undistorted, interior tiles with no repeat line.

## Constraints

Create ONLY `row.png`, `row@2x.png`, and `generate-kit-row.mjs`. Do NOT modify,
delete, or reformat any other file. No servers, no installs. List files when done.
