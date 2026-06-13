# Art-Backed UI Bridge

This document describes the current bridge between the approved screen renders
and the production web app.

The UI overhaul is intentionally using live bridge screens as the normal app
surface while approved renders remain available as explicit references. This
keeps the work browser-first, lets reviewers see unfinished slots clearly, and
prevents the old utility UI from being mistaken for the target experience. It is
not the final component system.

## Contract

- `docs/ui-art-direction.md` remains the binding art direction source.
- `frontend/public/assets/ui/*.png` are the Vite public concept screens served
  at `/assets/ui/*`.
- `docs/art/ui-screen-concepts/*.png` are the saved source references.
- `frontend/public/assets/ui/main-menu-aspirational.png` provides the approved
  painted crop for the live main menu mode button stack, including its labels.
- `frontend/public/assets/ui/main-menu-brand-title-only-v1.png` is the accepted
  title-only render crop for the live main menu brand plate.
- The main menu profile/status chrome (03) is **art-backed**: a percentage-cropped
  region of the approved render `main-menu-aspirational.png`, with a transparent live
  hotspot overlaid — the same pattern as the accepted mode buttons (01) and brand
  plate (02), because it carries rendered detail (the lion crest, the cog) that cannot
  be redrawn faithfully in DOM/SVG. The news/daily (04) and dock (05) chrome are simple
  text/icon panels with no rendered detail to lose, so they stay token-driven DOM
  components. The earlier *generated* `main-menu-*-chrome-v1.png` bitmaps (regenerated
  approximations that had drifted from the concept) were retired end-to-end (guarded by
  `frontend/scripts/check-no-chrome-bitmaps.mjs`).
- `frontend/public/assets/ui/main-menu-button-art-*.png` also includes generated
  no-text button candidates used by the main menu asset review board.
- `frontend/src/app.js` owns the `ART_SCREENS` manifest, image paths, and hotspot
  action wiring.
- `frontend/src/style.css` owns hotspot geometry and art-screen presentation.

Do not add a new one-off screen path for future concepts. Add the screen to
`ART_SCREENS`, define hotspot classes, and style those classes as percentage
rectangles over the 16:10 artboard.

## Review URLs

- `/` and `/main-menu` show the live DOM main menu bridge, with approved/generated bitmap
  families filled for buttons, brand, profile/status, news/daily, and dock
  chrome, plus a CSS-framed moonlit battlefield plate over the live canvas.
  Remaining unfinished asset slots stay labeled in place.
- `/main-menu/skeleton` also opens the live DOM main menu bridge.
- `/design/main-menu/render` opens the saved main menu concept render.
- `/design/main-menu` opens the main menu chrome review board. It renders each
  converted slot's live component as a specimen next to its approved render
  crop, rather than comparing a candidate bitmap.
- `/campaigns` opens the live campaign editor skeleton.
- `/level-editor` opens the live level editor skeleton.
- `/skirmish` opens the live skirmish skeleton.
- `/design/campaigns/render` opens the campaign editor concept render.
- `/design/level-editor/render` opens the level editor concept render.
- `/design/skirmish/render` opens the skirmish concept render.

Use the `/hotspots` suffix on concept review URLs to show the clickable overlay
map. For example, use `/design/main-menu/render/hotspots` or
`/design/level-editor/render/hotspots`.

## What Is Live

The main menu, campaign editor, level editor, and skirmish now use live bridge
surfaces by default. The main menu mode button family and brand lockup use
approved render crops with live HTML labels overlaid; the profile/status panel,
news/daily panels, and dock strip are token-driven DOM + inline-SVG components.
The main menu battlefield plate uses the live canvas board as its visual core with CSS chrome
and game-native labels. Other labeled slots are intentionally unfinished.

Current main menu acceptance state is tracked in
[main-menu-acceptance.md](main-menu-acceptance.md). In short: the painted mode
button stack, upper-left brand/title crop, and art-backed live bridge approach
are settled; profile/status, daily/news, bottom dock, and battlefield plate
details still need review.

The concept routes keep real buttons layered over the saved renders. The
hotspots route back into existing app actions such as menu navigation, campaign
creation, level editor preview, sign-in, settings, and skirmish end-turn.

The visible editor controls, skirmish roster, and skirmish HUD inside the
concept renders are approved visual targets, not finished live UI.

## Tuning Hotspots

Hotspots are percentage-positioned so they scale with the artboard. Use this
loop when adjusting them:

1. Open the target URL with the `/hotspots` suffix.
2. Adjust the matching selector in `frontend/src/style.css`.
3. Hot-swap the frontend into the test slot.
4. Inspect normal mode and hotspot mode.

Keep hotspot labels short because they are also used as accessibility labels.

## Decomposition Roadmap

Replace the bridge from the inside out:

1. Maintain a clear skeleton for each screen so unfinished asset slots remain
   visible during decomposition. Skeletons are the default app surfaces.
2. Fill one main menu asset family at a time. The button row uses a crop from
   `main-menu-aspirational.png` so the approved painted labels stay intact; the
   title/brand plate uses `main-menu-brand-title-only-v1.png` from the approved
   render; the profile/status, news/daily, and dock chrome use generated
   `main-menu-*-chrome-v1.png` assets; the battlefield plate uses the live
   moonlit canvas board inside CSS chrome. Use `/design/main-menu` to
   compare candidates against the approved render before wiring them into the
   bridge.
3. Extract editor and skirmish side panels as real DOM components.
4. Replace remaining rendered board imagery with canvas terrain tiles and overlays that
   match the concepts.
5. Replace rendered pieces with sprite-friendly chess silhouettes.
6. Keep the concept images available as visual regression references until the
   live screens clearly match them.

Each extraction should preserve the current review URL and hotspot behavior
until that slice becomes genuinely live.
