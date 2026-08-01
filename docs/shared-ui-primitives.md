# Shared UI primitive registry

This is the mutable, implementation-level index required by
[ADR-0059](adr/0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md).
The ADR owns the reuse decision; this file records the current components to
search for before constructing a control or repeated surface.

## Registered chrome and common controls

- `ui/shared/ChromeButton.tsx` — every button or navigation button backed by a
  `data-chrome-unit`. Callers provide behavior, content, and local layout only;
  the component owns the semantic element, registered unit, tone, selected
  state, and pressed state. `ChromeUnitAudit` is the sole raw-markup specimen.
- `ui/shared/ChromeBox.tsx` — inner/outer framed boxes, shell workspaces, and
  structural chrome composition.
- `ui/shared/ActionList.tsx` — data-driven selectable/action rows. War battles,
  Campaign Editor levels, and Play level lists use this instead of constructing
  first/middle/last rows independently.
- `ui/shared/ChoiceGroup.tsx` — single-choice segmented controls rendered from
  option definitions.
- `ui/shared/CyclePicker.tsx` — previous/value/next controls; it owns both
  registered chevron keys.
- `ui/shared/AssetSwatchList.tsx` — Level Editor asset/material palettes; it
  owns the registered swatch button and selected state for every item.
- `ui/shared/SettingsControls.tsx` — settings sections, settings rows, and the
  standard text action button.
- `ui/shared/ApparatusRailTab.tsx` — menu-language navigation rail tabs.

## Studio and workflow compositions

- `ui/studio/StudioCatalogCard.tsx` — every Studio catalog card, including
  media, metadata, selected state, and card actions.
- `ui/dressing/SurfaceEffectsControls.tsx` — the shared icon-treatment and
  hover-slide instruments used by surface/page dressing tools.
- `ui/shared/ClusterJobPanel.tsx` — cluster job polling, selection, launch,
  cancellation, list, and detail shell shared by training and solver workflows.

## Non-visual repeated boundaries

- `net/http.ts#requestJson` — authenticated JSON request construction and
  shared `HttpError` handling for account-scoped API clients.

## Enforcement

`frontend/scripts/check-shared-primitives.mjs` rejects raw registered chrome
buttons, hand-built Studio card roots, hand-built segmented groups, positional
row spacing, and copied generic JSON request helpers. Its node tests and the
primitive render tests run in the normal frontend `check` command.
