---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0510](0510-held-cards-are-immutable-formations.md)'s retirement of the gain transaction"
refines:
  - "[ADR-0026](0026-ui-icons-are-generated-as-a-cohesive-kit.md)"
  - "[ADR-0076](0076-generated-raster-assets-render-at-native-1x.md)"
  - "[ADR-0219](0219-run-piece-bundles-are-portrait-cards-with-a-live-gold-icon.md)"
  - "[ADR-0407](0407-expunctio-removes-one-card-per-sectio.md)"
  - "[ADR-0482](0482-expunctio-owns-card-aware-alienatio.md)"
---

# ADR-0486: Run disposal prices use directional gold marks

## Context

Expunctio presents two opposite gold movements beside the same card: Alienatio returns gold to
the player, while Athetize charges an Expunctio fee. Both previously used the same small gold-pile
resource icon, so their visual language made opposite transactions look identical. The labels and
live numbers were correct, but the player had to read them before learning whether gold would enter
or leave the Run.

The owner selected PixelLab candidate 02 for **gain gold** and candidate 12 for **lose gold**. Each
is a complete native 64×64 transparent mark: the pile and green plus form one gain composition, and
the pile and red minus form one loss composition.

## Decision

- Alienatio return uses the selected gain-gold mark; Expunctio fee and Paid use the selected
  lose-gold mark.
- The marks render at their native 64×64 size. They are not moved, enlarged, reduced into the
  existing compact coin seat, or reconstructed from separate plus/minus overlays.
- One shared `RunGoldTransactionAmount` primitive resolves installed
  `kind='run-gold-transaction'` drawables by `behavior.direction='gain'|'loss'`, renders the
  accepted immutable icon, and keeps the numeric amount live.
- The primitive's SHA-gated review query seam paints exact candidates in their real seats on the
  game-owned `/run?view=expunctio` review surface before acceptance; ordinary routes resolve only
  installed drawable media.
- Text labels remain visible, and the primitive exposes directional accessible names such as
  “2.5 gold gained” and “2.5 gold lost.” Color and sign are redundant visual carriers, not the
  only meaning.
- The accepted rasters occupy additive `ui/run/resources/gain-gold.png` and
  `ui/run/resources/lose-gold.png` semantic slots with typed `run-resource-icon` runtime metadata,
  exact generation provenance, and native-1× evidence. Git owns no media bytes.

## Consequences

- The player can distinguish earning from spending before reading the number or label.
- Compact neutral gold amounts elsewhere retain the existing shared gold resource icon.
- Any later Run surface that needs directional gold must reuse this primitive and installed
  drawable role rather than compose a local badge over the neutral coin.

## More Information

- [Runtime asset contract](../runtime-asset-contract.md)
- [Shared UI primitives](../shared-ui-primitives.md)
- [Expunctio card-aware Alienatio](0482-expunctio-owns-card-aware-alienatio.md)
