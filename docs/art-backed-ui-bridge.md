# Art-Backed UI Bridge

This document describes the current bridge between the approved screen renders
and the production web app.

The UI overhaul is intentionally using the approved screen renders as visible
screens while live controls are layered on top. This gets the app into the
target visual world immediately, gives reviewers a faithful test surface, and
keeps the implementation browser-first. It is not the final component system.

## Contract

- `docs/ui-art-direction.md` remains the binding art direction source.
- `frontend/assets/ui/*.png` are the web-visible concept screens.
- `docs/art/ui-screen-concepts/*.png` are the saved source references.
- `frontend/app.js` owns the `ART_SCREENS` manifest, image paths, and hotspot
  action wiring.
- `frontend/style.css` owns hotspot geometry and art-screen presentation.

Do not add a new one-off screen path for future concepts. Add the screen to
`ART_SCREENS`, define hotspot classes, and style those classes as percentage
rectangles over the 16:10 artboard.

## Review URLs

- `/` shows the main menu concept.
- `/?screen=main` explicitly opens the main menu concept.
- `/?screen=campaigns` opens the campaign editor concept.
- `/?screen=level-editor` opens the level editor concept.
- `/?screen=skirmish` opens the skirmish concept.

Append `&hotspots=1` to any review URL to show the clickable overlay map. For
the root URL, use `/?hotspots=1`.

## What Is Live

The art-backed screens have real buttons layered over the render. The hotspots
route back into existing app actions such as menu navigation, campaign creation,
level editor preview, sign-in, settings, and skirmish end-turn.

The visible board, editor controls, roster, and HUD inside these art-backed
screens are still part of the render. They should be treated as an approved
visual target, not as finished live UI.

## Tuning Hotspots

Hotspots are percentage-positioned so they scale with the artboard. Use this
loop when adjusting them:

1. Open the target URL with `hotspots=1`.
2. Adjust the matching selector in `frontend/style.css`.
3. Hot-swap the frontend into the test slot.
4. Inspect normal mode and hotspot mode.

Keep hotspot labels short because they are also used as accessibility labels.

## Decomposition Roadmap

Replace the bridge from the inside out:

1. Extract persistent chrome: top HUD, profile area, mode navigation, and
   bottom/dock navigation.
2. Extract editor and skirmish side panels as real DOM components.
3. Replace rendered board imagery with canvas terrain tiles and overlays that
   match the concepts.
4. Replace rendered pieces with sprite-friendly chess silhouettes.
5. Keep the concept images available as visual regression references until the
   live screens clearly match them.

Each extraction should preserve the current review URL and hotspot behavior
until that slice becomes genuinely live.
