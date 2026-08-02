---
status: accepted
date: 2026-08-02
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
---

# ADR-0338: A crafted Run is composed from real transitions, never authored state

## Context

Working on a Run screen means being on that screen. The Shop with 25 gold and a Rook on offer,
the deployment of Battle 4 with a specific army, the won War — each is many minutes of play
away, and an agent has no way to hand the owner "the exact screen I changed" other than
click-by-click directions.

The two obvious shortcuts both fail. Editing the database bypasses every invariant the Run
model holds. Hand-authoring the document is worse: `validateActiveRunBody` cross-checks army
and card membership, Plagued targets against unit modifiers, purchased offers against the
Shop entry snapshot, and each offer's cost against the exact derived price — a typed-out
document is rejected far more often than it is accepted, and a document that squeaks past the
validator can still be a state the game itself could never produce.

## Decision

- A crafted Run is **composed from the transitions the game plays** — `createRun`, `buyCard`,
  `leaveShop`, `prepareDeployment`, `beginBattle`, `openShop`. The crafter fast-forwards
  through the Battles before the target, deploying each one with the real deployment solver.
  It never assembles a Run document field by field.
- Requested overrides are applied **in the phase where each is legal**: army and relics before
  a Battle, so the Shop entry snapshot that `openShop` produces already contains them; Shop
  offers and loot only on a Shop that a real `openShop` created; gold last, so relic payouts
  and Battle rewards cannot move the number off the request.
- Crafted Shop cards are **looked up in the deck**, never synthesized. The deck already holds
  every legal multiset worth 1-9 gold, so a crafted card is a real core card with real art,
  and a card outside that range is refused with the reason.
- The **opening Shop takes no overrides**. Its offers, army and 8 starting gold are pinned
  value by value by the Run contract; it is craftable only as itself.
- The crafter is **shared code**. The Run model, its deployment solver and the crafter live in
  `@chess-tactics/board-render`, which the backend already depends on, so the server composes a
  Run with the very functions the client plays rather than a second implementation of pricing
  and rosters that can drift.
- **`POST /api/active-run/craft` is the interface.** It is admin-gated, takes a JSON spec, and
  sets the caller's own active Run. A request body has room the address does not, so the spec
  carries structured units with abilities, card objects, and whatever it grows next. The reply
  is the Run plus the address to open: **the link says where you are, never what the Run
  contains.** This grants no capability that database access did not already have — it only
  makes the result a document the game could have produced.
- The address form `/run?craft=<phase>&…` remains for one-off tweaks, applied on the Run screen
  and then dropped from the address. It is development-only, because in a built app an address
  must not rewrite a Run that was actually played. `battle=N` is the Battle you are at — for a
  Shop, the Shop you leave into Battle N. A refused spec **says why on the screen** and writes
  nothing.

## Consequences

- The crafted document is one the server accepts, because the game built it: the seam is
  covered by `PUT /api/active-run` returning 200 for every crafted phase, not by a second
  validator kept in step by hand.
- Crafting replaces the account's active Run — that is what adopting a Run means (ADR-0193),
  and there is one per account. A craft link is a debugging instrument, not a bookmark.
- The crafter exercises the same solver the player does, so a state the game cannot reach is
  reported as a refusal instead of being forged. The Surveyor's Compass layout choice, which
  a real player makes by hand, is made explicitly by the crafter for the Battles it
  fast-forwards through.
- Model internals the crafter composes with (`addArmyPieces`, `removeUnitFromArmyAndCards`,
  the Plagued discount table, the seeded Plagued target) are exported rather than copied, so
  there is no second implementation of Run pricing or roster identity to drift.
- Moving the Run model out of `frontend/src/run/` follows the convention the core model already
  set: the frontend keeps one-line re-export stubs (as `core/level.ts` and `core/pieces.ts`
  already do), so every existing import path and test still resolves.
