---
status: accepted
date: 2026-07-30
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0411](0411-reference-ancestors-own-empty-routed-roots.md)'s empty bare and unknown roots"
refines:
  - "[ADR-0231](0231-strategikon-and-enchiridion-share-one-reference-workspace-language.md)"
  - "[ADR-0254](0254-enchiridion-content-owns-the-remaining-menu-canvas.md)"
  - "[ADR-0052](0052-game-controls-are-buttons-routes-are-addresses.md)"
---

# ADR-0256: Individual lipsana are routable from the main-menu Enchiridion

## Context

The main-menu Enchiridion's lipsanon reference (ADR-0252–0254) selected a lipsanon
through component-local state. The rest of the reference workspace is
addressable — `/enchiridion/<section>` deep-links each section — but the
individually selected lipsanon was not: a reload, a shared link, sign-in
`returnTo`, and browser Back all forgot which lipsanon record was open.

The scene director keys transitions off the leaf manifest id, which previously
embedded the full route path. A naïve per-lipsanon path would therefore have
turned every lipsanon click into an exit/enter veil cycle, degrading what ADR-0253
established as direct, instant selection.

## Decision

- Each lipsanon has a main-menu address: `/enchiridion/lipsana/<lipsanon-id>`, built
  and parsed by one shared route module (`ui/enchiridionRoute.ts`) that
  MainMenu and the scene manifest both consume. `/enchiridion/<section>`
  parsing tolerates deeper address suffixes within their section.
- In the main-menu host, lipsanon-reference entries are NavButtons to those
  addresses (ADR-0052): selection pushes the lipsanon's route, so reload, Back /
  Forward, sign-in return, and shared links restore the same open record.
- Lipsanon addresses are the SAME retained scene as `/enchiridion/lipsana`: the
  enchiridion manifest id is the resolved section route (address suffixes and
  the bare/unknown-section fallbacks collapse onto their section), and the
  lipsanon instance carries no per-lipsanon param. Selecting a lipsanon is an
  address-only update inside the committed scene — no veil, no slot re-key;
  section changes remain real scene transitions.
- An unknown or absent lipsanon id renders the section's default selection (the
  first visible lipsanon) without rewriting the URL, mirroring the section
  fallback to `units`.
- The Battle-hosted Strategikon keeps ephemeral local lipsanon selection in both
  its Enchiridion and Lipsanotheca surfaces: mid-battle reference peeks do not
  write history. One `LipsanonTrigger` control renders both transports so the two
  hosts cannot drift visually (ADR-0231/0059).

## Consequences

- A specific lipsanon record can be handed to the owner, revisited after reload,
  and walked with Back/Forward from the main menu.
- Lipsanon browsing keeps ADR-0253's instant, tooltip-free selection feel; only
  the address changes per click.
- The scene manifest id for this family is now section-normalized, so
  `/enchiridion` → `/enchiridion/units` (already the same rendered view) no
  longer runs a pointless same-keys transition.
