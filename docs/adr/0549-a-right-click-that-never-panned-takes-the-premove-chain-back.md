---
status: accepted
date: 2026-08-09
deciders: Nelson, Claude
refines:
  - "[ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md)"
  - "[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md)"
---

# ADR-0549: A right click that never panned takes the premove chain back

## Context and Problem Statement

A player queues premoves while the opponent is thinking, and every chess client they have ever
used cancels those with a right click on the board. Ours could only cancel with **Escape** — a key
nobody reaches for with a hand already on the mouse, and one the board advertises nowhere.

The reason it was never bound is real. The battlefield is wall-to-wall hit targets, so
[ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md) gave the secondary button to the
viewport: right-drag is how a filled board is panned at all. That leaves exactly one thing to tell
a take-back apart from a camera move — **how far the press travelled before it was released** —
and ADR-0128 explicitly refused to decide anything on that threshold, because what it was being
asked to gate was an *erase* of authored level content.

[ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) then claimed the release of a press that
never moved, to turn the formation Deployment carries on the cursor, and wrote the seam's licence
narrowly: `ViewPane`'s `onSecondaryClick` was for a **non-destructive** mode change only.

So the question is not "can we tell the two gestures apart" — `ViewPane` already does, and has
since ADR-0526. It is whether taking a premove chain back is on the near or the far side of the
line ADR-0128 drew.

## Decision Drivers

- Panning must survive untouched; it is the only way to move the camera on a filled board.
- The gesture chess players already know should do the thing they already expect.
- ADR-0128's refusal must not be quietly weakened into "a threshold is fine now".
- A mis-fire must cost the player something they can get back in the same breath.
- One take-back, not two implementations of one.

## Considered Options

- Leave it on Escape and advertise the key somewhere.
- Bind the take-back to the board's `contextmenu` event.
- Bind it to the secondary release that never crossed the pan threshold.

## Decision Outcome

Chosen: **a secondary press on the battle board that releases without panning takes the whole
premove chain back. A secondary press that panned is navigation and nothing else.**

The line the seam draws is not destructive versus non-destructive. It is **committed versus
uncommitted**:

1. **The gesture may take back what the player has not played.** A premove chain is a prediction
   held in memory: no move has been made, nothing has been captured, no clock has moved, a reload
   drops it, and the same clicks that built it rebuild it. A wrong take-back costs seconds of the
   opponent's thinking time, which is the whole budget the chain was queued out of anyway.
2. **It may never commit, capture, spend, or erase.** ADR-0128's refusal stands exactly as
   written: no authored content, no committed move, no gold, no level document is reachable from
   a press told apart from a pan by four pixels. The Level Editor still has no secondary-button
   meaning at all.
3. **The take-back is the one Escape already performs** — `clearPremoves`, plus the chain-building
   selection — reached through the same store action, never a second path.
4. **A phase that carries something on the cursor keeps the button.** Deployment's turn
   (ADR-0526) claims it while a formation is in hand; the take-back is what the button means when
   nothing else has claimed it.
5. **With nothing queued it is not an event.** The gesture is available on every square of a board
   made of hit targets, so on a quiet board it changes no state at all.
6. **It is bound to the release, never to `contextmenu`.** That event fires at the end of a pan
   too, so binding it there would clear the chain the player had just panned across the board to
   look at.

## Consequences

- Right-click cancel works the way it does in every other chess client, without a control, a hint,
  or a key.
- A pan that ends within the four-pixel threshold takes the chain back. That is the honest cost of
  putting anything on this gesture, and it is priced against a chain that is re-queued with the
  same clicks — which is why nothing heavier may ever be put here.
- Escape keeps working and stays the keyboard route.
- `ViewPane`'s `onSecondaryClick` seam now has a stated boundary rather than a blanket refusal, so
  the next surface that wants it has a rule to check itself against.
- No unit test reproduces the distinction — the threshold lives in real pointer events — so
  `npm run verify:premove-cancel` drives a real right-drag and a real right-click on a live board
  and reads the painted chain.

## More Information

- [ADR-0128](0128-level-editor-secondary-drag-is-pan-only.md) gives the secondary button to the
  viewport and refuses to put an erase behind a movement threshold.
- [ADR-0526](0526-a-formation-is-carried-on-the-cursor.md) claims the release of a press that never
  moved, for the formation on the cursor.
- [ADR-0358](0358-a-premove-is-judged-against-permanent-board-law.md) is what makes a premove a
  prediction rather than a move: it is judged against a position that does not exist yet, and
  reality is enforced once, at fire time.
