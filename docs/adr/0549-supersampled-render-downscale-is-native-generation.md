---
status: "accepted"
date: 2026-08-09
deciders: Nelson
amends:
  - "[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md)"
---

# ADR-0549: A supersampled render downscale is native generation, not resampling

## Context and Problem Statement

[ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md) requires
accepted art to be generated at its delivery size and forbids any spatial resampling
on the accepted path. The unit catalog enforces it: an asset whose provenance says
`accepted-sprite-recapture` or `spatialResampling: true` can never be accepted, and
the block is monotonic.

That rule was written against a real failure. ADR-0075 had allowed a **recapture** —
take the already-accepted 512px sprite, shrink it, and accept the result — which is
circular. The source is finished delivery art, the resampler decides which authored
edges survive, and nobody ever makes a pixel decision at the size players see.

Two things have changed since.

**The runtime half of the problem is fixed.** ADR-0076 was written while the board
was *also* resampling at draw time: four unit families shipped 512px sprites that the
canvas point-sampled down to 78×92 with smoothing disabled, discarding roughly
forty-two of every forty-three source pixels. Accepted art really was being decided
twice by bad resamplers. The board now minifies through a mip chain, and the scene
layer rasterises at display resolution, so the runtime no longer degrades anything.

**Native-at-delivery-size produced worse art than the downscales it replaced.** A
full cel-shaded roster was rendered natively at 51×61 / 57×67 / 78×92 and installed.
The owner rejected four of six on sight: lost detail, lost sharpness, colour warping.
The pieces that read best were the ones ADR-0076 classifies as debt.

That result is not a tuning failure, it is sampling. A 51×61 frame is about three
thousand pixels. A collar step or a helmet ridge is smaller than one of them, so a
native render either happens to sample it or does not. Rendering the same model at
512 and averaging down puts every sub-pixel detail into the result. This is
supersampling — the ordinary way to render a small image well, and the same operation
Blender already performs inside a single frame through its pixel reconstruction
filter, just carried out at a ratio where it does more good.

## Decision

**Downsampling a high-resolution render of the source model is native generation and
is eligible for acceptance. Resampling delivery art is not, and remains forbidden.**

The line is what the resampler was handed:

- **Eligible — supersampled render.** The 3D source is rendered above delivery size
  and reconstructed down to it in one deterministic step. The pixels are decided by
  the model and the filter, and the operation is reproducible from the source.
- **Not eligible — recapture.** An already-accepted sprite is resized. The input is
  finished art, authored decisions are destroyed, and the provenance chain is
  circular. ADR-0076 §C and the existing `accepted-sprite-recapture` block stand
  unchanged.

### Why this does not reopen what ADR-0076 was protecting

ADR-0076's concern is that a resampler, rather than an author, picks which edges and
details survive. That is decisive for hand-authored pixel art, where every pixel is a
deliberate decision that a filter can only destroy. It does not bite on a render of a
3D model: there is no authored pixel to protect, and the alternative is not authorship
but a lottery over which sub-pixel features a sparse sample set happens to hit.

Hand-authored and generated pixel art — tiles, chrome, icons, anything drawn — keep
ADR-0076 unchanged. This amendment is scoped to raster art whose source is a 3D scene.

### Required evidence

A supersampled candidate records, and a family cannot be accepted without:

1. the render dimensions of the master and the delivery dimensions;
2. an integer or stated downscale ratio, and the filter used;
3. provenance naming the 3D source, so the result is reproducible;
4. `pipeline: 'supersampled-render'` rather than a recapture marker;
5. an in-app 1× proof at the real role and background, as ADR-0076 §F already requires.

A master must be a render of the model. Enlarging or re-rendering *from a sprite* to
manufacture a master is a recapture wearing a different name and stays blocked.

## Consequences

- Good: the pipeline can produce the art quality the owner actually wants, using the
  standard technique for the job, instead of being cornered into undersampling.
- Good: the honest distinction is now written down. The previous rule collapsed
  "resampled" into one category and could not tell supersampling from a recapture.
- Good: pawn and rook become fixable. Their predecessors are permanently blocked, and
  native replacements were rejected, so they were stranded on art nobody wanted.
- Cost: "no resampling" was a simple mechanical check and this is a narrower one; the
  guard has to distinguish provenance rather than reject a whole class.
- Cost: a master that is too small still undersamples. The ratio is now a thing to get
  right rather than a thing the rule made impossible to get wrong.

## More Information

- Amends [ADR-0076](0076-scaling-is-calibration-production-art-is-native-1x.md); its
  native-1× requirement, canonical-1× definitions and evidence gate otherwise stand.
- Supersedes nothing in [ADR-0075](0075-unit-directions-are-blender-authored.md); its
  recapture instrument remains calibration-only.
- Runtime half: the board's mip chain and display-resolution scene layer.
