---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)"
  - "[ADR-0428](0428-run-defeat-offers-retry-and-exits-without-blocking-controls.md)"
---

# ADR-0543: Leaving a Run does not wait for its account row

## Context

Confirming **Abandon Run** in the Sectio cleared the Run and then `await`ed the account's `DELETE
/api/active-run` before navigating to the Run picker. The store drops the Run from the browser
synchronously, so from the instant the dialog was confirmed the Run screen had nothing to draw and
fell through to its empty **No active Run** workspace — where the player then sat for the length of
a round trip, plus any autosave already queued ahead of it, because the DELETE is serialized behind
the save chain.

That empty workspace exists for an address opened without a Run: a heading, a sentence about
starting one from Play, and a button back to the picker. As a destination it is fine. As the thing
a player watches after pressing a button whose whole purpose was to leave, it reads as the place
they were sent — a dead end that answers a question nobody asked. The owner reported it as exactly
that, having never seen the picker the code was already navigating to. **Finish Run** on the War
victory screen had the same shape.

The obvious repair — navigate first, let the DELETE finish in the background — opens a race the
`await` had been closing by accident. `abandon` awaited the save chain and then issued its DELETE
outside it, which stops a queued PUT from resurrecting the abandoned Run but not the reverse: a new
Run started seconds later queues its first PUT while that DELETE is still in flight, the DELETE
lands second, and the account is left holding nothing while the browser believes it has a Run. Both
orderings were driven live; the unawaited exit against the old chain reproduced it every time.

## Decision

- Abandon Run and Finish Run **navigate in the same tick the Run is cleared**. Neither waits on the
  account copy. The destination is unchanged: `/play/select/run`, the Run picker, whose Current Run
  row is the disabled **No active Run** of ADR-0334 and whose **Start New Run** is the next action.
- `abandon()` puts its DELETE **inside** the save chain rather than merely behind it. Ordering is
  then total in both directions: a queued save cannot resurrect the Run, and a replacement Run's
  first PUT cannot be overtaken by the DELETE it was started after.
- `abandon()` keeps returning a promise, and callers that go on to write a **replacement** Run under
  the same account — Start New Run's own abandon, the War Editor's direct play — keep awaiting it.
  Awaiting is for callers that write next, not for callers that leave.
- Failure is reported where the player now is. A DELETE that does not land leaves the existing
  persistence message on the picker; it does not hold the exit or reinstate the Run.
- The empty **No active Run** workspace is unchanged and remains what `/run` shows when the address
  is opened without a Run. It is not a transition state, and no exit routes through it.

## Consequences

- Abandoning is immediate at any latency, and the screen the player lands on is the one that offers
  a new Run.
- The account row is deleted slightly after the player has left, so a hard reload inside that window
  can rehydrate the abandoned Run from the account. Bounded by one request, against a screen that
  now says what it is.
- Anything added later that both clears the Run and leaves should follow the same shape; anything
  that clears the Run to write another must await.
