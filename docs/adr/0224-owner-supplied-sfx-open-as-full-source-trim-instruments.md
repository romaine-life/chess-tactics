---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0314](0314-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s replacement of the dedicated purchase cue with the shared gold transaction cue"
---

# ADR-0224: Owner-supplied SFX open as full-source trim instruments

## Context

ADR-0223 wired the Run bundle-card purchase cue correctly but made the agent's
1.23-second excerpt the only editable audio presented to the owner. That made
approval a yes/no decision over the agent's judgment. Shortening that excerpt
could not recover any gesture the agent had already cut away.

This violates ADR-0071: sound timing and feel are owner judgment, so the
deliverable must put the complete source and its boundaries under the owner's
hands.

## Decision

- ADR-0223's dedicated `card-purchase` runtime cue remains in force.
- An owner-supplied SFX recording enters Studio as a complete private candidate,
  not only as an agent-selected excerpt. Agent cuts may remain separate attempts
  but cannot replace access to the complete source.
- Candidate-review URLs open an explicit SFX editing state. The main Studio
  stage shows the selected candidate's complete waveform and exact metadata;
  the existing fixed Controls rail owns start, end, full-source audition,
  selection audition, reset, derived-candidate save, and approval.
- Start and end are adjustable over the complete decoded recording through both
  sliders and numeric seconds. The selected interval remains visible in the
  waveform and its exact start, end, and duration remain legible.
- Saving never overwrites the source candidate. It encodes the selected PCM
  frames as a new 16-bit WAV candidate in the same semantic sound-set slot,
  verifies the returned hash and byte length, records the source version/hash,
  frame range, time range, audio geometry, encoder, and output hash in
  provenance, then opens that derived candidate for review.
- A complete-source editor candidate marked `requireTrim` cannot be accepted
  directly. A derived candidate drops that marker. Approval remains disabled
  while an unsaved trim is pending and still requires a full exact-byte
  audition of the derived candidate.
- When no candidate is selected, the same Sound Effects Viewer kind continues
  to host the global SFX assignment editor. Candidate editing never appears as
  an injected block above that unrelated editor.

This supersedes ADR-0223 while carrying forward its purchase-event wiring and
typed live-SFX requirements.

## Consequences

- The owner chooses the sound gesture and timing; the agent may seed an attempt
  without making it irreversible.
- Review links identify a complete editing state instead of swapping a small
  box at the top of an unrelated page.
- Every saved trim is immutable, reproducible, attributable, and recoverable
  through its source-candidate chain.
- Source and derived audio remain live-storage-backed; no recording bytes enter
  Git.
