---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0338](0338-a-run-state-is-crafted-from-a-link.md)"
  - "[ADR-0354](0354-a-crafted-run-state-is-a-durable-link.md)"
---

# ADR-0549: Leaving the Sectio is not a commitment

## Context

`Continue to next Battle` was a one-way door. It ran `leaveSectio`, which discarded the whole
`RunSectioState` — the offers, the Adlectiones made against them, the Expunctio spent, and the
entry snapshot **Discard changes** restores from — and dropped the Run into Deployment. From the
moment that button was pressed, a purchase made a second earlier was permanent.

Nothing justifies that. Deployment tells the player nothing the Sectio did not already tell them:
the market's offers were the ones already on screen, the board is the one the Sectio's own
**View Battle** previewed, and the deal count is printed on that preview before the button is
pressed. A door that cannot be reopened is a punishment for having clicked, and the thing it
punishes — buying the wrong card — is exactly what the Sectio's own **Discard changes** exists to
undo while the player is still standing in it.

The obstacle was that the Sectio cannot be reopened by rebuilding it. Two of its fields are
unrecoverable once it has been left:

- `entrySnapshot` records the gold, army, Chartulary and lipsana as they stood *before* this
  visit's purchases. Once those purchases are applied there is nothing left to reconstruct it
  from, and a snapshot rebuilt from the current document would silently make **Discard changes** a
  no-op — the worst possible failure, because the control would still be there and still be
  pressable.
- `cardOffers` were drawn off `sectioCardCursor`, which `openSectio` advanced when it dealt them.
  Re-opening the Sectio by re-dealing would consume the *next* row of the hidden pile and offer a
  different market — a re-roll wearing the clothes of an undo.

## Decision

**The Sectio stays open behind the Deployment until Battle begins.** `RunDocument` gains
`sectioReturn: RunSectioState | null`, `leaveSectio` puts the Sectio it left into it, and
`returnToSectio` puts it back.

- `run.sectio` is the Sectio the Run is **in**; `run.sectioReturn` is the one **behind** it. They
  are never both set. Overloading the one field would have made `sectio !== null` stop meaning
  "the player is in the market", which is what every reader of it currently assumes.
- The state is kept **whole**, not recomputed, for the two reasons above. `returnToSectio` is the
  exact inverse of `leaveSectio`: `battleIndex` and `conflictIndex` are read back off the retained
  Sectio's own `afterBattleIndex`/`conflictIndex` rather than decremented, because the Sectio
  itself recorded where the Run stood while it was open. `sectioCardCursor` is untouched in both
  directions, so a round trip cannot draw a second market.
- The **Deployment is discarded**, not held. That is the point of coming back: a Battle deals from
  the cards the Run holds, so a Chartulary changed in the market must change the hand. Leaving
  again re-deals it.
- **`beginBattle` closes the market.** Everything after that point knows what the enemy does, so
  the purchase stops being an undo. `normalizeRunDocument` is the backstop: a retained Sectio found
  in any phase but Deployment is dropped, so a stale one can never offer a way back past a Battle
  already fought.
- **Battle 1 has no way back**, because there is no Sectio before it — the Run reaches its first
  Deployment from Commendatio or the opening grant. The control is simply absent there.

The control rides the **title bar's return lane**, as `‹ Back to Sectio`. That is where this app
puts Back — Settings, the Level Editor, the Campaign Editor, a test-play's `‹ Back to editor`, and
the Strategikon's own `‹ Back to Run` all use the same typed contribution — and the lane is empty
during Deployment. It is an `action`, not a `navigation`: the Sectio is a Run phase and not an
address, so the address bar is left exactly as it stands and a craft link stays pressable
(ADR-0531). Run *actions* still live in Controls — Abandon Run is at the foot of the rail and does
not move — and an open workspace's own `‹ Back to Run` wins the lane, because that one is the way
out of what is actually in front of the player.

## Consequences

- **RunSaveVersion 37**, with both migrations. A Run already standing in a Deployment left its
  Sectio before anything was retained and that state is gone, so the field arrives empty: that one
  Deployment offers no way back, and every later one does.
- The server validator holds the invariant rather than trusting the client. `sectioReturn` is
  refused outside Deployment, and a retained Sectio must be the exact one this Deployment was left
  from — one Battle back, and one Conflict back when that Battle closed a Conflict. Its offer count
  is measured against the lipsana held in its own `entrySnapshot`, not against the Run's current
  lipsana, so a Quartermaster's Ledger bought during that visit does not retroactively invalidate
  the market it was bought in.
- A crafted `craft=deployment` link carries the Sectio behind it, because the crafter reaches
  Deployment by playing `leaveSectio` like the game does. Its entry snapshot is restated as the
  **crafted** state, so pressing Back and then Discard changes returns to what the link asked for
  rather than to the roster the fast-forward happened to build on the way.
- Going back and buying **re-deals the hand**, since the deal is a shuffle over the cards held.
  That is the intended consequence, not a leak: the player is undoing a purchase, so of course
  what they carry into Battle changes. It does mean a player who dislikes their hand can change it
  by making any purchase at all — which is a market decision with a market price, and the Sectio
  is where prices are paid.
