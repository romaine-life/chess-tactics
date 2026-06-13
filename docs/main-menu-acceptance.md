# Main Menu Acceptance Ledger

This ledger is the source of truth for what is settled in the main menu UI
bridge and what still needs review. Keep `/design/main-menu` aligned with
this file.

The browser-facing visual ledger lives at
`/design/main-menu`. Its `Accept`, `Needs Review`, and
`Reject` controls save a design-portfolio draft through
`/api/design-portfolios/main-menu-acceptance` when that endpoint is available,
with browser-local storage as a fallback. A decision is only committed to git
when this file is updated. See `docs/design-portfolio-persistence.md` for the
draft endpoint contract.

## Settled / Locked

- Main menu mode button stack.
  The painted five-button crop is accepted. Keep the source lettering and use
  transparent live click targets over the art.
- Upper-left brand/title banner.
  The crest plus `Chess Tactics` title crop is accepted. Treat it as locked
  unless a later layout change exposes a fit issue.
- Art-backed live bridge approach.
  The main menu should continue using art-backed chrome with real DOM labels,
  controls, and hotspots instead of reverting to generic browser cards.

## Needs Review

All four remaining elements are implemented to match the concept and await your
accept on `/design/main-menu`. Approach follows the render-fidelity + text-live
rules in `docs/ui-art-direction.md` — art for rendered visuals, live DOM for all
copy and numbers:

- Profile/status panel (03) — **hybrid**. Art-crop of the painterly lion crest
  from the render; clean SVG cog + rook silhouettes; live DOM text for the name,
  rank, sign-in/account affordance, and allies/enemies counters.
- Daily/news panel (04) — **DOM + live text + SVG icons**. Daily challenge
  (reticle, countdown, objective, reward gem) and news (cobalt/gold/red bulleted
  items). Copy stays live (localizable/accessible); only the small icons are SVG.
- Bottom dock (05) — **art-backed**. The concept dock is icon-only pixel art with
  no baked text, so it is a crop of the dock strip + transparent live hit-targets
  (the mode-button pattern), keeping the trophy/book/chart/chest icons and the
  notification badge instead of redrawn glyphs.
- Battlefield plate (06) — **art-backed preview**. The menu preview uses the
  concept board crop (the live canvas board returns in actual gameplay); live DOM
  header + status chips overlay it with a shadow for legibility.

## Rejected / Do Not Use

- None yet.
