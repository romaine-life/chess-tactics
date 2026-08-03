---
status: accepted
date: 2026-08-03
deciders: owner (Nelson) + Claude
partially_superseded_by:
  - "[ADR-0375](0375-the-profile-owns-what-an-interface-cue-sounds-like.md)'s owner-assigned cue mapping, which also withdraws this record's asserted Cards/Relics asymmetry as never having been an owner decision"
partially_supersedes:
  - "[ADR-0322](0322-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)'s retirement of the `card-purchase` runtime assignment"
refines:
  - "[ADR-0224](0224-owner-supplied-sfx-open-as-full-source-trim-instruments.md)"
  - "[ADR-0364](0364-enchiridion-cards-is-a-terminal-gallery-with-no-fourth-column.md)"
  - "[ADR-0371](0371-the-chartulary-is-the-held-half-of-the-cards-reference.md)"
---

# ADR-0372: A card sounds like a card when it is handled

## Context

The owner-supplied card-draw recording installed by ADR-0223 and re-trimmed under ADR-0224 lives
in the `sfx/card-purchase/v0.wav` live-media slot with a `card-purchase` sound set in the DB-owned
SFX profile. ADR-0322 then moved the *purchase* cue to `gold-sell` — buying is a gold transaction
and should sound like the Sell it mirrors — and retired the `card-purchase` runtime assignment
along with it. That left an accepted, installed recording with no runtime caller at all.

Meanwhile the reference surfaces grew: Cards is a gallery of real card faces (ADR-0364), Card
Types is a row list of the four properties, and the Chartulary mounts the same gallery over held
cards (ADR-0371). Clicking a card face in any of them played the generic interface click — the
same tap as a tab, a filter chip, or a Back button. A card face is a distinct physical object in
this game's fiction, and handling one is not the same gesture as pressing a control.

## Decision

- **Handling a card plays the card cue; transacting in gold plays the gold cue.** The two are
  different events, and the split is by gesture, not by screen. Selecting a card face in the Cards
  gallery, or a card property row in Card Types, requests the `card-purchase` sound set. Buying a
  card in the Shop keeps `gold-sell` — ADR-0322's reasoning about the *purchase* stands unchanged;
  only its retirement of the sound set as a runtime callable is superseded.
- The cue is requested through the existing `data-ui-sfx` attribute on the control, so it rides
  the one delegated UI-click listener, the Interface Sounds toggle, and the effects bus exactly
  like every other interface sample. No component gains its own audio call.
- The attribute goes on the shared `ReferenceTrigger` call sites inside `CardCodex` and the Card
  Types section, which is why "the Enchiridion or any other page" needs no per-host wiring: the
  Battle-hosted Strategikon renders the same components and inherits the cue.
- The sound set keeps the key and label it was installed under (`card-purchase`, "Card purchase"),
  because the key is the live-media slot path. The name records the recording's provenance, not
  the list of runtime events allowed to call it.

## Consequences

- The one installed card recording has a caller again, and the surfaces that display cards no
  longer sound identical to the chrome around them.
- ~~Cards is now audibly distinct from Relics and Units, which keep the generic click — that is the
  intended asymmetry, not an inconsistency to be evened out later.~~
  **Withdrawn by [ADR-0375](0375-the-profile-owns-what-an-interface-cue-sounds-like.md): the owner
  never expressed this preference. It was inferred by the agent and recorded here as though it had
  been decided. Whether Relics and Units should also sound distinct is an open question the owner
  answers by ear in the SFX Studio; no ADR holds a position on it.**
- A future card-handling gesture (a draw animation, a discard) has an obvious cue to reach for and
  no ADR standing in its way.
