---
status: superseded by ADR-0222
date: 2026-07-29
deciders: owner (Nelson) + Codex
refines:
  - ADR-0047
  - ADR-0085
  - ADR-0089
  - ADR-0193
---

# ADR-0221: Run sells use a dedicated live gold clink

## Context

Run army sales currently trigger the delegated interface click, whose weight
reads as a generic thunk instead of a currency transaction. The owner selected
Slay the Spire 2's small-gold FMOD event from the locally installed game as the
specific reference and source material for this mod project:
`event:/sfx/ui/gold/gold_1`.

ADR-0089 already keeps authored SFX bytes in live `sfx/<sound-set>/v<n>` slots
and deliberately blocks audio promotion until an exact-byte, game-owned review
instrument exists. A local extracted WAV or generic proof payload cannot become
runtime authority by itself.

## Decision

- Run's Sell action requests the dedicated `gold-sell` interface sound instead
  of the default `click` sound. The delegated control listener chooses exactly
  one sound per activation, so Sell never layers the ordinary thunk beneath the
  gold cue.
- The initial `gold-sell` candidate is a unity-rate WAV render of
  `event:/sfx/ui/gold/gold_1` through the installed game's FMOD banks. Trimming
  engine-startup silence is recorded in provenance; the event mix is otherwise
  unchanged.
- Authored one-shot takes use typed
  `sfx/<sound-set>/v<n>.<supported-format>` slots with the `sfx` domain,
  `audio` role, matching media type, and runtime metadata declaring
  `sfx-sample`, the matching sound-set key, decoded duration, one-shot state,
  and no loop.
- Studio's SFX Viewer owns exact-candidate audition. It fetches the private
  content-addressed candidate, decodes those bytes, plays them once at playback
  rate 1, and records hash-pinned decoded duration, sample rate, channels,
  candidate revision, and slot-pointer snapshot.
- Owner approval accepts that reviewed candidate through the shared atomic
  pointer transaction and only then adds its sound-set metadata to the
  revisioned live SFX profile. Profile editing alone still cannot publish audio.
- Runtime remains silent when the dedicated set is absent. It does not fall
  back to the semantically wrong default click.

## Consequences

- Sell sounds like a gold transaction while all other controls retain their
  existing interface feedback.
- The SFX domain now has a typed completeness validator and exact-byte
  owner-operated promotion instrument, fulfilling ADR-0089's promotion gate.
- Future authored SFX takes can use the same slot and audition contract without
  committing media bytes to Git or inventing a second acceptance path.
