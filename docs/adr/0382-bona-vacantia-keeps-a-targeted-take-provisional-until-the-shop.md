# ADR-0382: Bona Vacantia keeps a targeted take provisional until the Shop

## Status

Superseded by [ADR-0383](0383-run-viewport-dom-is-a-scene-contribution.md).

## Context

ADR-0368 made a Bona Vacantia choice mandatory and made taking the lipsanon the act that
opens the Shop. Conscription Notice cannot be granted blind, however: it permanently gives
Adlected to one named army unit. The first implementation put a unit dropdown above the
three lipsana before the player had even chosen Conscription Notice. That control looked
unrelated to the objects on the mat, disclosed a second decision too early, and reduced a
persistent historical unit to one line in a generic selector.

The lipsanon flight now gives the choice a natural second beat. It can arrive in the held
strip without first writing the Run document, leaving Bona Vacantia mounted long enough to
ask who receives it. The owner also established the general interaction rule for this case:
a player may go back while the interface has revealed no consequential new information.
The Shop is that boundary; merely inspecting the same army is not.

## Decision

The mat asks only which lipsanon to take. It never shows a unit selector. Whether a lipsanon
needs a unit is the `unitTarget` fact in the canonical lipsanon registry, read by the model,
Bona Vacantia, the paid Shop offer, and administrator controls through one shared helper.

An ordinary lipsanon commits when its flight lands. That atomic take opens the Shop as before.

A unit-targeted lipsanon instead lands **provisionally** in the next held-strip seat. Its id
and the selected-unit id remain local presentation state; neither the lipsanon nor its ability
is written to the Run document yet. Bona Vacantia then replaces the mat with the exact Martial
Prosopography ledger and tile-backed unit profile. The normal left tab-rail column is absent on
this single-purpose screen, so its established width carries the lipsanon icon, effect,
Adlected definition, confirmation boundary, and a **Choose another lipsanon** action. The
profile's ordinary sell action is replaced with an explicit **Give Adlected to this unit**
action.

Confirming that profile action calls the existing atomic take with both ids. Only then does
the held lipsanon and permanent ability enter the document and the Shop appear. Choosing
another lipsanon returns to the untouched mat; leaving before confirmation likewise has no
persisted gameplay effect. Bona Vacantia remains mandatory because the player still cannot
reach the Shop without completing one take.

No pending target is added to `RunDocument`, no new Run phase or format is introduced, and
there is no resumable half-acquisition. The existing paid Shop offer is outside this decision:
the Shop and its offers are already revealed before that purchase begins.

## Consequences

- The visible provisionally landed item reuses the canonical held-lipsanon inventory item,
  while the flight continues to measure its destination from the canonical strip geometry.
- Martial Prosopography gains a typed optional profile action so other workflows can reuse
  its ledger and inspection scene without copying either or inheriting the sell transaction.
- Back is safe before confirmation because the player has learned only information that was
  already available through army inspection. After confirmation, the Shop's newly revealed
  offers make the choice final.
- ADR-0368's placement and mandatory-choice decision remains in force; its implication that
  every initial mat click immediately opens the Shop is partially superseded.
