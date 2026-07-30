---
status: accepted
date: 2026-07-29
deciders: owner (Nelson) + Codex
---

# ADR-0222: Run Sell clink uses the owner-supplied coins recording

## Context

ADR-0221 established the dedicated `gold-sell` sound-set slot, exact-byte
Studio audition, proof-gated acceptance, and live-profile installation flow.
Its first candidate was rendered from a locally installed game's FMOD event.
The owner rejected that result and supplied
`https://www.youtube.com/watch?v=xQlAKXzlhKE` as the replacement source.

The supplied recording contains several coin gestures across 35.5 seconds.
Playing the whole recording for one sale would make the interface action slow
and ambiguous, so the replacement needs one self-contained strike with a
natural attack and decay.

## Decision

- ADR-0221's dedicated `gold-sell` action, typed live-media slot, exact-byte
  audition, proof, acceptance, and live-profile rules remain in force.
- The replacement candidate is the final isolated coin strike from the
  owner-supplied recording, spanning source time 32.92–34.08 seconds.
- The excerpt is decoded to 48 kHz stereo PCM WAV. An 8 ms opening fade and
  80 ms closing fade remove edit-boundary discontinuities without changing its
  pitch or playback rate.
- The live candidate records the source URL, video ID, source and output
  hashes, excerpt times, conversion properties, and the owner's source
  selection in provenance.
- Source and candidate bytes remain live-storage-backed and are not committed
  to Git. Runtime activation still requires the owner to audition and accept
  the exact candidate in Studio.

This supersedes ADR-0221 while carrying forward every decision except its
rejected initial-source selection.

## Consequences

- Sell retains one short, legible currency cue instead of a long coin-rattle
  recording.
- The rejected FMOD render cannot silently remain the intended source.
- Review and runtime continue to use the same canonical SFX system rather than
  a repository-bundled or screen-local audio path.
