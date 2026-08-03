---
status: "accepted"
date: 2026-08-02
deciders: Nelson, Claude
---

# ADR-0362: Wall materials own a typed live-media projection and a game-owned review instrument

## Context and Problem Statement

ADR-0086 made the full-height `128x336` frame the only perimeter-wall geometry, and the renderer
has drawn walls at that geometry — anchored `(64,192)` — ever since. The runtime art never
followed. Every wall slot still serves the pre-ADR-0086 `128x240` bake, byte-identical to the
wall PNGs committed at `31e5b1a4` before full-height walls existed: the live-asset cutover
bridged those slots from the old repository files, and the full-height bake was staged as
candidates on 2026-07-15 but never accepted.

Stretched to 336 from a 192px anchor, the short art lands its base seam 59px above the tile seat
at 1.4x vertical scale. Walls float above the board, in gameplay and in the Level Editor, in
production.

Acceptance could not have completed even if someone had tried. Wall slots carry `domain: terrain`
but roles `media` and `review`, so `mediaDomainProjectionIssue` fell through to the board-tile
rules, which demand a `top`/`side`/`animation` role at native `96x180`. Every wall candidate was
rejected as `media_domain_projection_invalid`, whatever evidence it carried. The review surface
that did exist, `/studio/wall-candidates`, mounted candidates on the real board but had no review
or accept action — and its bespoke path is not a game-owned proof surface, so a proof taken there
was invalid by construction.

## Decision Drivers

- ADR-0086's full-height geometry must be enforceable at acceptance, not merely asserted in the
  renderer while the catalog serves whatever it was seeded with.
- Wall art is judged standing beside neighbouring walls on real terrain; a loose sprite or a
  contact sheet cannot support that judgement (generated-art handoff rule).
- Owner review proofs are only valid from a game-owned surface, and the Studio is the registered
  one for this domain.
- A wall candidate must not fall through to a projection built for a different asset shape.
- The instrument must not be keyed to one historical upload, or the next bake needs a code change
  before it can be reviewed.
- Provenance describes how bytes were produced; a reviewing surface cannot honestly synthesise it.

## Considered Options

- Relax the terrain tile projection to admit wall dimensions.
- Re-role wall slots as terrain `top` frames and widen the `96x180` rule.
- Give wall materials their own typed projection and proof, dispatched before the tile rules, with
  the review instrument mounted inside the Studio (chosen).

## Decision Outcome

Chosen: **wall materials are a typed live-media family with their own projection, their own owner
proof, and a game-owned Studio instrument that both mounts and accepts them.**

1. **Typed projection.** `wallMaterialSlot` recognises
   `tiles/feature/wall-<material>-<1|8|9|thumb>.png`. `wallMaterialMediaIssue` requires the terrain
   domain, `image/png`, the `media` role at exactly `128x336` for frames, and the `review` role at
   a square raster for picker thumbnails. It is dispatched before the board-tile rules, alongside
   the brush icon and SFX takes, so walls never fall through to the `96x180` tile contract.
   `metadata.runtime` stays optional but, when present, must agree with the uploaded frame.

2. **Typed owner proof.** `wall-material-canonical-board-proof-v1` pins renderer
   `BoardLabBoard/BoardBarrierSceneLayer`, canonical scale 1, no spatial resampling, the ADR-0086
   frame geometry, and a `/studio` surface URL. One proof covers a whole wall batch; each
   candidate is validated against its own `selectedCandidates` and `slotSnapshots` entry, and a
   frame must appear in `mountedSlots` — a wall that was not standing on the reviewed board cannot
   ride along on someone else's review.

3. **The instrument lives in the Studio.** Studio > Walls > Inspect opens the `wallcandidates`
   viewer, which mounts every waiting candidate on the real board renderer beside live terrain,
   shows picker thumbnails at native size, and carries Record owner review and Accept.
   `/studio/wall-candidates` becomes an alias that canonicalises to `/studio`, because an owner
   proof taken from the bespoke path can never be valid. Arm still paints a wall in the Level
   Editor.

4. **Candidate selection is geometry-driven.** The instrument picks each wall slot's newest
   candidate that already carries the canonical geometry, rather than matching an upload label. A
   later bake is reviewable without editing the instrument, and art that does not carry ADR-0086
   geometry is never offered for review at all.

5. **Evidence has one owner each.** The instrument completes native-1x evidence from each
   candidate's own bytes before recording the review, since patching bumps a row revision and
   would otherwise stale the proof. It never invents provenance: candidates whose uploader
   recorded none are named on the surface and block acceptance until that is repaired.

### Consequences

- Good: the exact regression is now a contract violation — a `128x240` wall can no longer be
  accepted onto a wall slot, whatever review it carries.
- Good: walls are judged where they are seen, and the same mounted board is what acceptance
  attests to.
- Good: future wall bakes need an upload and a review, not a code change.
- Cost: wall candidates uploaded without provenance need a metadata repair before they can be
  accepted; the 2026-07-14 batch was repaired from repository history.
- Cost: one more typed family in the live-media dispatch chain.

## More Information

- Full-height wall geometry: [ADR-0086](0086-all-perimeter-walls-use-full-height-geometry.md)
- Wall-face support and floor occlusion:
  [ADR-0085](0085-mirror-surfaces-end-at-the-wall-floor-boundary.md)
- Studio surfaces are navigable, not bespoke routes:
  [ADR-0058](0058-every-route-is-click-reachable.md)
- Generated feature-material rule:
  [ADR-0040](0040-feature-tiles-own-geometry-generate-material.md)
- Derived current-state contracts:
  [Board render contract](../board-render-contract.md) and
  [Asset generation contract](../asset-generation-contract.md)
