---
status: accepted
date: 2026-08-04
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0406](0406-klerosis-deals-cards-before-one-unit-at-a-time-deployment.md)'s borrowed starter-card visual identities"
partially_superseded_by:
  - "[ADR-0419](0419-deployment-draws-a-hidden-card-stack-in-play-order.md)'s retirement of the installed Primogeniture role"
refines:
  - "[ADR-0085](0085-runtime-assets-are-live-storage-backed.md)"
  - "[ADR-0340](0340-run-card-icon-fitting-is-an-owner-operated-studio-instrument.md)"
  - "[ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)"
  - "[ADR-0413](0413-royal-purple-belongs-to-praecipuus-not-starter-status.md)"
---

# ADR-0414: Selected starter-card media becomes dedicated runtime identity

## Context

His Grace and Front Lines were playable, but their runtime faces still borrowed the core Queen and
two-Pawn illustrations. Praecipuus borrowed Hieratic's property role, Primogeniture borrowed
Eutactic's state role, and His Grace borrowed Hieratic's frame slot. Card Layout and Card Icon
Fitting held the actual Codex and PixelLab comparisons only as private review candidates.

The owner selected the Codex candidate in every comparison, saved the fifth fitting pair, accepted
the fitted positions, and directed the selected work to be finished. The chosen frame is native
1060×1484. The two chosen 400×280 illustrations and two chosen 64×64 icons are intentional
nearest-neighbor derivatives of archived generated sources, so calling them native 1× would be
false even though the exact output pixels are approved.

## Decision

- Runtime uses dedicated semantic slots and identities:
  - `ui/run/card-art/his-grace/illustration.png` uses SHA-256
    `3911aa54c164a29837ac99d4d34bfc468c80af7ed8e4e41246c7431d9b394ec2`.
  - `ui/run/card-art/front-lines/illustration.png` uses SHA-256
    `56752ab5f9ff817113ae43c7278624aad5ab8f8fe42f8f5b174eedf84ce86bda`.
  - `ui/run/card-prototypes/praecipuus-frame-v1.png` uses SHA-256
    `93ee3e1497ae1a930ca9d8d0242fd8b1fd93cd30da01511662ef2c48ed9a062e`.
  - `ui/kit/icons/card-properties/praecipuus.png` uses SHA-256
    `f3e6be8674f1c106ba328a015ca10c7ad0d98f4eb7ec4f4a0f6e0c6a8cbda8e6`.
  - `ui/kit/icons/game/primogeniture.png` uses SHA-256
    `1ac63dcb8f0e6bbfa5c91c231d1734f21c051e4612a4c8b3d9c687745df2ca79`.
- Starter illustrations are standalone typed `run-card-art` records. They do not join or weaken
  the atomic 49-card core-art group: the two starter cards are fixed identities outside the
  generated offer deck.
- The Praecipuus frame has its own typed standalone frame slot. It deliberately reuses the
  Hieratic frame's measured openings because its generated RGB was transferred onto that exact
  accepted alpha mask without resampling; shared geometry does not mean shared semantic identity.
- Praecipuus and Primogeniture receive dedicated installed drawable roles. The App UI required-role
  inventory and its recorded icon fitting advance together with the media cutover.
- The saved owner fit becomes the committed baseline: Praecipuus is `{x: 1.35, y: -1.05,
  scale: 2.4}` and the shared five-state marker placement is `{x: 4.2, y: -0.45, scale: 4.15}`.
- A closed `run-starter-selected-derivative-production-exception-v1` admits only the exact two
  illustration and two icon output SHAs above, in their exact slots, with their archived source
  version, source SHA, source/output geometry, and transform. It does not admit another slot,
  another output, a regenerated approximation, or resampled media generally. The frame remains
  ordinary native-1× production media and uses no exception.
- Praecipuus joins the Enchiridion's Card Types addresses and uses canonical His Grace as its
  specimen. Primogeniture points back to Praecipuus in Abilities. The existing decorative row
  material may be shared; the dedicated property/state icons and actual card face own identity.
- The review slots and saved portfolio remain available for provenance and future fitting. Saving
  a design draft still never publishes media. This accepted cutover is the separate admin
  transaction ADR-0412 required.
- No relational schema or Run-save migration is needed. Runtime media pointers and installed
  drawable configuration remain live-storage records.

## Consequences

Every player-facing host now resolves the accepted starter art, royal Praecipuus frame, and two
new icons by their own meanings. Front Lines remains on the Standard frame. Exact owner-approved
derivatives are represented truthfully without turning a narrow exception into a general bypass.

## More Information

- [Runtime asset contract](../runtime-asset-contract.md)
- [Persistence](../persistence.md)
- [ADR-0412](0412-praecipuus-and-primogeniture-join-card-icon-fitting.md)
- [ADR-0413](0413-royal-purple-belongs-to-praecipuus-not-starter-status.md)
