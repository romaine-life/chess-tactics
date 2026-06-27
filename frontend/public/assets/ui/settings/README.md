# Settings UI Asset Kit

> ⚠ **Legacy — the extraction method is retired.** These assets were lifted from
> concept art by the now-deleted `extract-settings-ui-assets.mjs` (extraction,
> retired by ADR-0011). They are still rendered by `/settings` and remain only
> until the settings chrome is rebuilt the current way: atom-assembled 9-slices
> (ADR-0012) with chroma-key transparency (ADR-0013). Do **not** reintroduce an
> extractor — there is no extraction "fallback" (see `docs/migration-policy.md`).

Runtime settings assets must be real component assets, not flattened screenshot crops with old text covered by dark rectangles. Frame assets keep their chrome and transparent interiors. Text, values, account state, and route labels are live DOM. Full-page generated screenshots stay reference-only.

The live `/settings` route is componentized. Header, rail, main panel, tabs,
rows, buttons, toggles, and icons are assembled from the smaller bitmap crops
in this kit, while labels, account state, and settings values remain live DOM.
The full-page bridge screens remain only as visual references and fallback
material for future extraction passes.

## Component-ready assets

Use these for the componentized settings UI:

- Page and panel frames: `header-frame.png`, `rail-panel-frame.png`, `main-panel-frame.png`.
- Navigation tabs: `rail-tab-active-generated.png`, `rail-tab-inactive-generated.png`.
- Rows: `setting-row-frame.png`, `setting-row-tall-frame.png`.
- Buttons and toggles: `neutral-button.png`, `primary-button.png`, `danger-button.png`, `stepper-button.png`, `toggle-on.png`, `toggle-off.png`.
- Tab icons: `icon-gear-generated.png`, `icon-speaker-generated.png`, `icon-knight-generated.png`, `icon-wrench-generated.png`.
- Row icons: `icon-monitor.png`, `icon-reset.png`, `icon-music.png`, `icon-effects.png`, `icon-interface-sounds.png`, `icon-design-index.png`, `icon-tileset-studio.png`, `icon-unit-studio.png`, `icon-tileset-review.png`, `icon-info.png`.

The contact sheet `contact-sheet.png` is generated for quick visual QA and is not a runtime asset.

## Bridge/reference images

`general.png`, `audio.png`, `gameplay.png`, and `creator-tools.png` are full-page bridge/reference images. They intentionally keep baked text and full-screen composition for visual comparison and fallback extraction only. Do not treat them as reusable component assets or as the primary live route surface.

## Runtime Rules

- Do not use assets with manually blanked text/content areas in the live route.
- Do not place live DOM text over an opaque screenshot crop unless the whole crop is an intentional control surface.
- Header, rail, and main panel assets should remain frame-only with transparent interiors.
- If an asset needs a label, render that label in DOM over a purpose-built frame/control asset.
- When rebuilding these assets, use the current method (atom-assembled 9-slices, ADR-0012; chroma-key transparency, ADR-0013) — not a re-run extractor (it is deleted).

See `manifest.json` for source image names, crop coordinates, dimensions, text/live limitations, and recommended usage for every generated file.
