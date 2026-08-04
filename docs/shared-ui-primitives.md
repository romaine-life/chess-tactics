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
  structural chrome composition. `ShellWorkspace` alone layers optional
  decorative background artwork between its installed fill and live content;
  callers supply installed media content, not attachment or clipping geometry
  (ADR-0336).
- `ui/RunForm.tsx` — the sole Run-page constructor. `createRunForm(...).add(
  runActivity(...))` permanently supplies the Run shell, title, Controls surface,
  Strategikon, lipsana strip, and workspace swap while activities contribute only
  bounded control, viewport, and overlay content (ADR-0415).
- `ui/SkirmishShell.tsx` — the internal persistent gameplay frame used only by
  `RunForm` and standalone `Skirmish`. Its `persistentViewportArtwork` seat owns
  environment art shared by sibling viewport destinations and keeps that art
  outside their director-owned fade.
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
- `ui/shared/ApparatusRailTab.tsx` — menu-language navigation rail columns and
  tabs. `ApparatusRailColumn` owns the main-menu column width, stack gap, and
  framed/open perimeter; `ApparatusRailTab` owns each button.
- `ui/shared/BoardViewFraming.tsx` — canonical contained read-only board framing.
  `FramedReadOnlyBoardView` owns pannable/zoomable `ViewPane` interaction and
  opening camera policy; `StaticReadOnlyBoardView` owns non-interactive stacks.
- `ui/KitScroll.tsx` — the only application scrollbar renderer. It hides the
  native scrollbar and owns the always-present drawn rail plus overflow-only
  thumb required by ADR-0030. Every Enchiridion reference body and every
  Strategikon destination that scrolls consumes this primitive; section lists
  must not become native `overflow: auto` owners.

## Studio and workflow compositions

- `ui/RunCardFace.tsx` — the canonical visible Run-card anatomy shared by Card
  Layout, Sectio visits, review, and Enchiridion; it owns the paired property/state
  icon seats and includes their media in atomic face promotion.
- `ui/RunCard.tsx` — the canonical interactive/reference host around
  `RunCardFace`; Sectio mode owns the gold transaction cue and supplies the exact
  source face used by the Adlectio transfer.
- `ui/runCardFlightView.tsx` — the Sectio-to-Chartulary transfer of that canonical
  face. It measures both live endpoints, contributes through the director-owned
  continuity layer above clipped shell layers, commits on landing, and exposes
  the transfer and survivor-reflow geometry plus the CSS-token duration parser
  for regression tests. `SectioCardRow` owns the live FLIP measurement for both
  plain and installed-wrap layouts.
- `ui/strategikonNavigation.ts` and `ui/StrategikonTitleNavigation.tsx` — one
  Strategikon destination inventory shared by the full workspace rail and the
  compact Controls-title shortcuts; the Chartulary shortcut also owns the card
  transfer target.
- `ui/strategikonRoute.ts` and `ui/enchiridionRoute.ts` — the canonical address
  parsers and exported section-label inventories shared by scene identity, rails,
  title shortcuts, and the complete standalone and gameplay title routes. Both
  parsers preserve an explicitly empty shell root rather than manufacturing Units
  as a default child (ADR-0411).
- `ui/shell/TitleRoute.tsx` — the canonical frameless title breadcrumb; it renders
  parsed destinations as `NavButton` segments inside the App-owned route line.
  Address-derived segments come directly from `titleBarConfig`, while the route portal
  is reserved for live document state such as the Run phase (ADR-0410).
- `ui/LevelInfoCompact.tsx` — the canonical derived Level ledger for board
  facts, authored and setup-event forces, zones, rules, and time control.
- `ui/RunIconPairReview.tsx` — the embedded Studio Card Icon Fitting Viewer;
  exact property/state candidate selection, per-property fitting, and the one
  shared unit-state fitting draft all render through `RunCardFace`.
- `ui/shared/RunAbilityIcon.tsx` — the shared compact unit-state icon consumer and
  the one `runUnitStateIconUrl` role resolver. Card faces, the army roster and the
  Enchiridion glossary all draw the accepted raster from here; only the review
  instrument passes an exact candidate URL into the same seat.
- `ui/shared/RunCardCostCoin.tsx` — the shared compact numbered card-cost coin,
  drawing the dedicated transparent derivative of the accepted card coin,
  overlaying the live value, and keeping the currency name in its accessible label.
- `ui/shared/PieceTypeIcon.tsx` — the accepted player-side, north-facing Battle
  sprite alpha-fitted for filters and pickers; consumers select a stable piece
  type and supply only local seat sizing while the shared live registry owns pixels.
- `ui/shared/InfoTip.tsx#Tooltip` — immediate hover/focus explanations for an
  existing visual trigger; its popup portals to the nearest screen host so
  component containment cannot clip fixed chrome.
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
