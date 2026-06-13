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

- Profile/status panel.
  Includes the right-rail player identity, guest/sign-in/account affordance,
  allies/threat counters, and related chrome.
- Daily/news panel.
  Includes daily-line copy, campaign-tools/news copy, and reusable panel chrome.
- Bottom dock.
  Includes achievements, campaigns, lobbies, collection, icon-only behavior,
  labels/tooltips, and hover/focus treatment.
- Battlefield plate framing/details.
  Includes the central board frame, status labels, depth, and responsive
  relationship to the accepted left-side controls.

## Rejected / Do Not Use

- None yet.
