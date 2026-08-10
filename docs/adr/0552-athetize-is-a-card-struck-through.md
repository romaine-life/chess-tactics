---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0035](0035-semantic-ui-icons-carry-a-private-anti-story-anchor.md)"
  - "[ADR-0318](0318-plagued-and-pestiferous-use-separate-owner-selected-icons.md)"
  - "[ADR-0366](0366-a-run-names-its-phase-as-route-and-its-repeatable-ideas-as-icons.md)"
  - "[ADR-0443](0443-athetize-is-the-card-action-within-expunctio.md)"
---

# ADR-0552: Athetize is a card struck through

## Context

[ADR-0443](0443-athetize-is-the-card-action-within-expunctio.md) gave the card-level
act inside Expunctio its own transitive verb so the containing movement and the act
performed on one record stopped sharing a noun. The control it named stayed a bare
word on a wide button.

That leaves **Athetize** carrying its whole meaning in a deliberately unfamiliar word.
The register is intentional and is not up for revision, but every other repeated act in
this game is also drawn: the board verbs (move, attack, capture, defend, wait, end-turn,
power) each own a mark, and so do the card properties and the unit states they grant. The
one destructive act a player performs on their own held formation had nothing.

## Decision

**Athetize gets a mark, and the mark is a card struck through by an X.** A navy card face
inside a gold filigree border, crossed corner to corner by one bold red X. It says
*this card, removed* without depending on the word beside it.

- The subject is **our** card, not a stock playing card or a bare delete glyph — the
  ornate gold-on-black back the Run already deals (ADR-0035's world-object vocabulary).
  The red belongs to the act: this is the button that already wears the `danger` tone.
- **The card it draws is the card the game deals.** The Chartulary's mark in the
  Strategikon is the player's LIVE card back — one of seven, resolved through
  `runCardBackMediaUrl` so a card in flight and the register it lands in cannot disagree
  about what a card looks like. A mark that strikes a *differently drawn* card therefore
  contradicts the register it removes from. The first candidates invented a pale navy
  card with a thin gold frame and read as a generic card beside the game's ornate ones;
  the accepted family is generated from the standard back as its style reference, so the
  struck card belongs to the same deck. It stays ONE installed raster rather than
  compositing an X over the live back: this mark names an action, not a card instance,
  and the seat's single-raster contract is what keeps it trimmed, tokenized and
  installable through the ordinary review. The consequence is accepted deliberately — the
  mark matches the standard back, and a player on one of the other six sees a card of the
  same deck rather than their exact chosen one.
- The mark belongs to the **control**, not to the screen. Expunctio owns the noun and
  already titles the workspace; what the button needs named is its effect. So the seat is
  `RunActionIcon`, a new shared primitive beside `RunProgressIcon`, and the slot joins the
  action family at `ui/kit/icons/game/athetize.png` rather than the Run-position marks at
  `ui/kit/icons/run/`.
- The seat is **reserved, not fail-closed** (ADR-0318): it holds its geometry before any
  art decision exists, so installing one later cannot shift the label beside it. It rides
  every state of that button — offered, spent, refused — because it is one control with
  one meaning, and the disabled styling already says which state it is in.
- The seat's size is **derived from the control it rides, never asserted**. It fills that
  control's content box and is held off the drawn frame by one `--ds-space-1` step on the
  block axis; the inline axis already clears the frame by the host's own `--ds-inset`
  (ADR-0055). Stating the block step is what makes the mark sit symmetrically inside the
  frame rather than flush against it — text gets away with a zero block inset because a
  line box carries its own leading, and a raster is ink to its edge. On the Expunctio
  button (46px tall, 7px frame, `0 var(--ds-inset)`) that resolves to a 24px seat with
  4px clear top and bottom. A first pass asserted 32px, which is exactly the content box,
  and the mark touched the frame.
- The mark ships **trimmed to its own ink and padded to the square that bounds it**, the
  same finish ADR-0366 gave the measures, so one seat size draws whatever is installed
  and no per-icon compensating transform exists to drift. `run-action-icon` therefore
  registers as a trimmed game-condition icon in the live-media policy, accepting a square
  raster from 16×16 through 64×64 whose runtime frame equals its own side.

**The pixels are the owner's call, not the agent's.** Candidates are uploaded to the slot
and judged in **Studio → Action Marks**, a catalog category reached by clicking its tab —
every candidate on one page, each mounted in the real Expunctio button, in both states
that button has. Nothing is installed until the owner installs one, and Install lives in
the controls rail as the whole decision in one act: record approval of those exact bytes,
accept the version into its slot, bind the slot to its `app-ui` role.

**There is no `?athetizeCandidate=<sha256>` seam, and the review is not a URL-only route.**
Both were built first and both were wrong under [ADR-0058](0058-every-route-is-click-reachable.md):
a dev surface is a Studio category reachable by clicking, never an address the owner has to
be handed. A candidate parameter also makes a *player* route carry review state it has no
business carrying, and turns a comparison into one page load per candidate, which is not a
comparison. The equivalent parameters elsewhere in the app are grandfathered debt; copying
one is not precedent.

## Consequences

- The Expunctio button states its effect in a mark as well as a learned word; the word
  keeps its register without carrying the whole load alone.
- `RunActionIcon` exists for the next card action that needs one — the family is a
  variant map, not a second bespoke seat.
- The owner selected **Option 08** — densest ornament, coolest gold, nearest the real card
  back at seat size — and it is installed: content `e294c24e…adb9d88`, native 64×64,
  accepted into `ui/kit/icons/game/athetize.png` and bound to `ui-kit-icons-game-athetize-png`.
  Every Athetize button paints it. The other seven candidates remain uploaded and
  unaccepted, so the catalog offers them for comparison without any of them being runtime art.
- Before that selection the seat rendered empty, which was the reserved state working rather
  than a missing asset. That contract still holds for the next action variant added here.
- No Run document, database, or save-format migration follows. This is presentation and
  one additive live-media slot, which is recoverable by retiring it.

## More Information

- Candidates were generated with PixelLab `create_image_pro` off a style reference
  composited from the three accepted Run marks, then trimmed by
  `frontend/scripts/bake-icon-stroke.mjs`'s `trimToInkSquare` — crop and pad only, so the
  bytes stay honestly native 1× under [ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md).
- Transparent-background generation hollowed out the card's flat interior on the first
  portrait attempt; the accepted portrait candidates were generated on uniform chroma
  green and keyed, which is the standing remedy for large flat interiors.
