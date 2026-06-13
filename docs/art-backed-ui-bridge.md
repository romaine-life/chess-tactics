# Art-Backed UI Bridge

This document describes the current bridge between the approved screen renders
and the production web app.

The UI overhaul is intentionally using live skeleton screens as the normal app
surface while approved renders remain available as explicit references. This
keeps the work browser-first, lets reviewers see unfinished slots clearly, and
prevents the old utility UI from being mistaken for the target experience. It is
not the final component system.

## Contract

- `docs/ui-art-direction.md` remains the binding art direction source.
- `frontend/assets/ui/*.png` are the web-visible concept screens.
- `docs/art/ui-screen-concepts/*.png` are the saved source references.
- `frontend/assets/ui/main-menu-button-art-five-mode.png` is the approved
  bitmap source for the live main menu mode button stack.
- `frontend/assets/ui/main-menu-*-chrome-v1.png` are generated bitmap sources
  for the live main menu brand, profile/status, news/daily, and dock chrome.
- `frontend/assets/ui/main-menu-button-art-*.png` also includes generated
  candidates used by the main menu asset review board.
- `frontend/app.js` owns the `ART_SCREENS` manifest, image paths, and hotspot
  action wiring.
- `frontend/style.css` owns hotspot geometry and art-screen presentation.

Do not add a new one-off screen path for future concepts. Add the screen to
`ART_SCREENS`, define hotspot classes, and style those classes as percentage
rectangles over the 16:10 artboard.

## Review URLs

- `/` shows the live DOM main menu skeleton, with approved/generated bitmap
  families filled for buttons, brand, profile/status, news/daily, and dock
  chrome. Remaining unfinished asset slots stay labeled in place.
- `/?screen=main` explicitly opens the live DOM main menu skeleton.
- `/?screen=main-skeleton` also opens the live DOM main menu skeleton.
- `/?screen=main-concept` opens the saved main menu concept render.
- `/?screen=main-assets` opens the main menu asset review board. It compares
  the approved render crop against candidate live asset families before any
  candidate replaces a skeleton slot.
- `/?screen=campaigns` opens the live campaign editor skeleton.
- `/?screen=level-editor` opens the live level editor skeleton.
- `/?screen=skirmish` opens the live skirmish skeleton.
- `/?screen=campaigns-concept` opens the campaign editor concept render.
- `/?screen=level-editor-concept` opens the level editor concept render.
- `/?screen=skirmish-concept` opens the skirmish concept render.

Append `&hotspots=1` to concept review URLs to show the clickable overlay map.
For example, use `/?screen=main-concept&hotspots=1` or
`/?screen=level-editor-concept&hotspots=1`.

## What Is Live

The main menu, campaign editor, level editor, and skirmish now use live
skeletons as their default surfaces. The main menu mode button family, brand
lockup, profile/status panel, news/daily panels, and dock strip use generated
bitmap art with live HTML labels and click targets overlaid. Other labeled
slots are intentionally unfinished.

The concept routes keep real buttons layered over the saved renders. The
hotspots route back into existing app actions such as menu navigation, campaign
creation, level editor preview, sign-in, settings, and skirmish end-turn.

The visible editor controls, skirmish roster, and skirmish HUD inside the
concept renders are approved visual targets, not finished live UI.

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

1. Maintain a clear skeleton for each screen so unfinished asset slots remain
   visible during decomposition. Skeletons are the default app surfaces.
2. Fill one main menu asset family at a time. The button row uses
   `main-menu-button-art-five-mode.png`; the brand, profile/status, news/daily,
   and dock chrome use `main-menu-*-chrome-v1.png`; the battlefield plate is
   still intentionally labeled as pending art. Use
   `/?screen=main-assets` to compare candidates against the approved render
   before wiring them into the skeleton.
3. Extract editor and skirmish side panels as real DOM components.
4. Replace remaining rendered board imagery with canvas terrain tiles and overlays that
   match the concepts.
5. Replace rendered pieces with sprite-friendly chess silhouettes.
6. Keep the concept images available as visual regression references until the
   live screens clearly match them.

Each extraction should preserve the current review URL and hotspot behavior
until that slice becomes genuinely live.
