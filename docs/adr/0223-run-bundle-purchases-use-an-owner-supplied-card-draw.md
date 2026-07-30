---
status: superseded by ADR-0224
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0223: Run bundle purchases use an owner-supplied card draw

## Context

Run piece bundles are presented as cards under ADR-0219, but purchasing one
currently triggers the generic interface click. The owner supplied
`https://www.youtube.com/watch?v=Ey6Ot5Ze3q4` as the source for a card-draw
purchase cue.

The 35.9-second recording contains shuffles, repeated card handling, and a final
isolated card gesture. A purchase needs one short action that confirms the card
left the shop without playing a whole shuffle.

## Decision

- A successful shop bundle-card activation requests the dedicated
  `card-purchase` interface sound instead of the generic click.
- Opening-draft cards are not purchases and retain normal interface feedback.
- The initial `card-purchase` candidate uses the final isolated gesture from the
  owner-supplied recording, spanning source time 33.32–34.55 seconds.
- The excerpt is decoded to 48 kHz stereo PCM WAV. An 8 ms opening fade and
  80 ms closing fade remove edit-boundary discontinuities without changing its
  pitch or playback rate.
- The candidate uses the typed `sfx/card-purchase/v0.wav` live-media slot and
  ADR-0222's exact-byte SFX audition, proof-gated acceptance, and live-profile
  installation flow. It does not ship as a repository-bundled fallback.
- Provenance records the owner-supplied URL, video ID, source and output hashes,
  excerpt times, and conversion properties.

## Consequences

- Buying a piece bundle sounds like taking its card from the shop.
- The purchase cue never layers with the default interface click.
- Disabled, already-purchased, and unaffordable cards remain silent because the
  delegated interface listener already excludes disabled controls.
