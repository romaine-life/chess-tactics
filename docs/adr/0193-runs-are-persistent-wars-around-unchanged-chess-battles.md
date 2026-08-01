---
status: accepted
date: 2026-07-28
deciders: owner (Nelson) + Codex
partially_superseded_by:
  - "[ADR-0316](0316-run-openings-use-two-pawns-eight-gold-and-card-native-purchase-feedback.md)"
  - "[ADR-0315](0315-run-opening-is-the-normal-shop-and-draft-is-retired.md)"
  - "[ADR-0314](0314-run-openings-begin-with-only-the-permanent-king.md)"
  - "[ADR-0313](0313-run-openings-spend-nine-gold-on-one-of-three-seeded-cards.md)"
  - "[ADR-0220](0220-run-victory-gold-scales-with-enemy-force-value.md)"
  - "[ADR-0264](0264-run-relic-identities-carry-anti-story-residue.md)"
  - "[ADR-0265](0265-run-cards-keep-core-identities-while-units-carry-modifiers.md)"
  - "[ADR-0267](0267-pestiferous-cards-lose-units-and-persist-when-empty.md)"
  - "[ADR-0274](0274-relics-grant-unit-owned-deployment-abilities.md)"
---

# ADR-0193: Runs are persistent Wars around unchanged chess Battles

## Context

The game concept deliberately deferred roster continuity and roguelike progression. The
owner is now introducing that layer as **Run**: a short persistent army moves through an
authored sequence, receives shops and relics, and retries lost boards without ending the
Run. The feature must remain immediately recognizable as chess. The surrounding economy,
deployment, information, objectives, and rewards may change; a relic must never give a
piece non-chess movement, capture, attack, promotion, or other piece behavior.

Campaign is not the right content identity. The owner calls a complete authored Run
sequence a **War**, an individual level a **Battle**, and the Battles through the next Loot
shop a **Conflict**. Wars are separately authored and listed, and a Level may not cross
between Campaign and War or between two Wars.

## Decision

### Player and content surfaces

- Play gains one pinned **Run** destination at `/play/select/run`; exact `/run` owns the
  active Run screen. This refines ADR-0074 without restoring parallel top-level menu
  entries.
- The Editor gains a separate War library/editor. It may reuse Campaign editor primitives,
  but Wars are not Campaigns and are never grouped into the Campaign collection.
- A War is an ordered, variable-length list of exclusive Levels with a name, description,
  tier, and `eligibleForRun` flag. The final ordered Level ends the War automatically.
- Every non-final victory opens a shop. A Level's Battle settings may mark that shop as
  **Loot**. The final victory skips the shop and opens the War-victory summary.
- Only published official Wars with `eligibleForRun` enter the main Run pool, at equal
  odds. Private Wars remain directly playable from the War editor and never enter that
  pool.
- War Levels use the existing player placement-zone authoring. Every Run-eligible War
  Battle must expose at least one usable player-zone square on a board edge.

### Run start and persistent army

- One active Run is allowed per player. Starting another requires explicit abandonment.
- A Run is seeded, resumable after reload, server-backed and cross-device for a signed-in
  player. Anonymous play uses same-browser persistence and is adopted on sign-in.
- The army begins with a permanently retained, unsellable King and three Pawns.
- The opening draft deterministically reveals two different entries from this five-entry
  pool; the player takes one:
  - Pawn + Rook
  - Knight + Bishop
  - Bishop + Bishop
  - Knight + Knight
  - three Pawns + one seeded minor piece
- Piece values are Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9, and King 0 for economy
  calculations.
- Casualties restore after a retry or later Battle. Only an explicit permanent-removal
  effect, currently Mercenary Boat, removes an army unit.

### Deployment

- Every army unit attempts to deploy into the authored player zone; authored allied units
  remain player-controlled Battle-only allies and occupy their squares as obstacles.
- Insufficient capacity blocks excess persistent units for that Battle; the seeded blocked
  subset and placements remain identical on retry.
- **Discipline** lets the player deliberately assign that unit a valid zone square before
  the remaining random deployment resolves.
- **Positioned** is a preference inside random deployment, not new chess behavior:
  Pawns prefer the front zone row; Kings prefer the back row; Rooks prefer back-row outer
  squares. Discipline takes precedence.
- Surveyor's Compass exposes two deterministic valid random layouts after Discipline
  assignments; Muster Roll lets the player choose which units are blocked.
- A Run Battle starts only after its deployment choices are confirmed.

### Shop and economy

- A non-final victory grants 1 gold before its shop. Gold is stored in tenths.
- The bundle deck contains every unique multiset of purchasable pieces whose standard
  values total 1 through 9. A combination appears once in the deck even when it contains
  duplicate pieces. Shops shuffle the whole deck, reveal three bundles, or four with
  Quartermaster's Ledger, and permit buying at most one bundle. Unbought entries return
  before the next deterministic shuffle.
- Any persistent unit except the King may be sold. The base return is exactly 50% of
  standard value; Fair Scales changes it to 75%.
- A Loot shop reveals three previously unseen relics and grants exactly one for free.
  Merely revealing a relic burns it from all later offers in that Run.
- Merchant's Shopkey adds one fixed 10-gold relic offer to every shop in a Conflict. It is
  chosen and burned when first shown, remains sold or unsold for that Conflict, and
  refreshes only when the next Conflict starts.

### Initial relic registry

The registry launches with the twenty owner-approved relics below and remains data-driven
so the intended 27-entry first pool can be completed without reshaping the system.

1. **Conscription Notice** — choose one persistent unit; it permanently gains Discipline.
2. **Congressional Approval** — gain 5 gold.
3. **Inspirational Record** — one seeded persistent unit gains Discipline for this Battle.
4. **Training Linens** — Pawns gain Positioned.
5. **Royal Decree** — the King gains Positioned.
6. **Crenellated Rampart** — Rooks gain Positioned.
7. **Ghibelline Rampart** — Rooks prefer opposite sides of the King; with Royal Sceptre,
   one sits beside the edge King and the others keep opposite/corner placement.
8. **Pope's Staff** — Bishops prefer the back row.
9. **Pope's Robes** — Bishops alternate square colors; an odd extra color is seeded.
10. **Royal Tent** — requires Royal Decree; place up to three temporary neutral rocks in
    front of the King, omitting impossible edge cells.
11. **Royal Sceptre** — the King starts on a board-edge player-zone square.
12. **Mercenary's Rifle** — after victory, gain 10% of the surviving persistent army's
    value; the King contributes zero.
13. **Merchant's Shopkey** — the persistent per-Conflict paid relic offer above.
14. **Occult Dagger** — gain 10 gold; a Battle cannot be won until every enemy non-King is
    gone and the enemy King is then checkmated. An unsuitable Battle does not filter it.
15. **Deployment Vehicle** — when a deployed persistent unit dies, seed one blocked unit
    of equal or lower value into the Reservist pool, draw a Reservist, and deploy it using
    the normal placement rules. A draw with no valid square remains pooled.
16. **Mercenary Boat** — a persistent Pawn entering promotion may instead grant 2 gold,
    vanish, and be permanently removed from the army.
17. **Quartermaster's Ledger** — reveal four piece bundles instead of three.
18. **Fair Scales** — sell at 75% rather than 50%.
19. **Muster Roll** — choose the capacity-blocked units.
20. **Surveyor's Compass** — choose between two seeded valid random layouts.

Relics persist for the Run unless their wording is Battle-only. Royal Tent's rocks are
Battle-only. Reservist is a runtime deployment keyword; Deployment Vehicle assigns it only
at a death event, so blocked units are not pre-labelled.

## Invariants and enforcement

- The pure piece rules remain the authority for legal movement, capture, attack, castling,
  en passant, and promotion. Run code may prepare or add a normally behaving piece, but
  may not branch legal move generation by relic.
- Tests enumerate every relic and fail if any relic id is consumed by the movement/capture
  rule modules.
- Seeded War choice, draft, deployment, blocking, shops, and relic offers are persisted or
  reproducible and therefore stable on reload and retry.
- Run UI reads only canonical War/Level content. It has no compiled demo War or synthesized
  fallback board, preserving ADR-0070.
- War authoring and Run-state inspection are owner-operable surfaces, preserving ADR-0071.

## Consequences

- The old `game-concept.md` statements that boards have no continuity and that roguelike
  progression is out of scope are superseded.
- The campaign workspace document may carry a separate `wars` collection so both tiers,
  revisions, Level working copies, and canonical saves remain one content transaction;
  validation enforces disjoint membership and the UI keeps separate editors.
- Signed-in active Run state adds an account-scoped persisted document. Anonymous state is
  deliberately browser-scoped until adoption.
- Twenty relics are usable at launch; seven more require owner approval to reach the
  intended initial variety of 27.
