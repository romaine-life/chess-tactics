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
  The generated five-button row asset family is accepted. Keep labels as live
  DOM text using the approved vendored pixel font, with transparent live click
  targets over the button art.
- Upper-left brand/title banner.
  The crest plus `Chess Tactics` title crop is accepted. Treat it as locked
  unless a later layout change exposes a fit issue.
- Art-backed live bridge approach.
  The main menu should continue using art-backed chrome with real DOM labels,
  controls, and hotspots instead of reverting to generic browser cards.
- Main menu scenic background placement.
  The live menu uses `frontend/public/assets/ui/main-menu/background-scene-v1.png`
  as a full-screen art-backed background layer with no baked UI, labels, panels,
  menu chrome, board, grid, platform, or pieces.

## Needs Review

The remaining areas should stay visibly unfinished until their production shape
is real enough to review. Do not fill the main menu with fake live systems just
to mimic the concept.

- Background scene art (00) — **placed / visual review needed**. The current
  generated background asset is wired into the live menu. Review it against the
  accepted concept for composition and mood as a background-only scene. The real
  board should be a later layer, not part of this image.
- Profile/account panel (03) — **partial production shell**. Keep the real
  account/sign-in/settings affordance backed by the generated secondary
  `profile-panel.png` chrome. Do not show fake rank, allies, enemies, or
  progression counts until those systems exist.
- Daily/news panel (04) — **open slot**. The concept target remains valid, but the
  main menu should not show a fake daily timer, objective, reward, or news feed.
  The live route may use the generated panel chrome only as an open-slot marker.
- Bottom dock (05) — **open slot**. Do not wire fake achievements/stats/collection
  actions to design pages. The live route may show inert generated dock chrome as
  an open-slot marker. Build the dock when its product destinations and asset
  treatment are ready.
- Battlefield area (06) — **absent for now**. Skirmish/battlefield assets are a
  separate directed workstream. The main menu should not show a crop, preview,
  placeholder board, or live labels in that area.

## Rejected / Do Not Use

- None yet.
