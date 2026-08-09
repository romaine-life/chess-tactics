---
status: accepted
date: 2026-08-09
deciders: Nelson, Claude
partially_supersedes:
  - "[ADR-0386](0386-shops-offer-read-only-intelligence-on-the-upcoming-battle.md)'s \"the persistent Run army is not projected onto the preview\" clause, and its **View Battle** name"
refines:
  - "[ADR-0393](0393-adlectio-and-alienatio-are-the-movements-within-sectio.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
  - "[ADR-0533](0533-a-seated-formation-is-a-plan-until-battle.md)"
---

# ADR-0549: Exploratio can imagine the army onto the ground, and every Sectio control wears a mark

## Context and Problem Statement

The Sectio's reconnaissance screen answered two of the three questions a player actually has
before spending gold. It shows the ground and it shows the opposition. It could not show the one
force the player controls, because ADR-0386 wrote that army out on purpose: *"The persistent Run
army is not projected onto the preview. The copy says that it deploys after leaving the Shop."*

That was the right call for the deal itself and remains so — the exact hand is settled by
`prepareDeployment` from the Run's own seed after the Sectio is left, and resolving it early
would hand the player an answer the Sectio is supposed to be decided without. But it also left the
screen unable to answer the question the ledger's own numbers raise and then drop: **ten squares,
three cards — does my army even fit on that band, and what does it look like standing there?**
A ten-square band and a five-square band read identically as a number.

Two smaller things were wrong with the same screen.

**Its name was the only English one in the room.** Every other movement of a Run answers to the
Latin the game is written in — Sectio, Adlectio, Expunctio, Commendatio, Deditio, Bona Vacantia,
Manubiae, Ataraxia — and the rail read `Sectio · View Battle · Expunctio`. ADR-0393 set that row
and the third seat has since become Expunctio; the second never moved.

**Nothing in the rail had a mark.** Six controls, six words, no glyph on any of them — in a
vocabulary the player is still learning, so the column offered nothing to aim at but reading. The
Strategikon's rail beside it is all marks, so the two navigation surfaces of the same Run did not
look like the same game.

## Decision Outcome

**Exploratio can deal the held collection onto the band and seat it at random, and says plainly
that it is imagining.**

- **Shuffle** sits in the Deployment section under Zone, where the deal count and the band size
  already are. Pressing it deals and seats one arrangement; pressing it again seats a different
  one; **Clear** returns the board to the authored map. The row states what is standing there —
  `3 cards · 7 units` — or `Not shown`.
- **It is not the deal the Run will make, and it never becomes one.** It shuffles on its own
  number, held in the screen's state, not on the deployment seed; nothing is written to the Run;
  and the note says so in the same breath as the rest of the deployment copy. ADR-0386's
  reasoning is preserved exactly: what stays unresolved is the *actual* hand and the enemy's
  randomized setup squares, neither of which this touches.
- **Every rule it applies is Deployment's own rule.** The King's card first, whole-card admission
  while the band has room, and `formationPlacementOptions` for where a formation may legally
  stand — so a preview cannot show an arrangement the Battle would refuse. That required lifting
  the phase guard off two functions rather than writing a second planner (ADR-0059):
  `formationPlacementOptions` and `distinctFormationRotations` are now the geometry, and
  `arrangedCardPlacementOptions` / `distinctCardRotations` are those plus the arranging phase's
  own reading of what is admitted and occupied. `runDeploymentLevelUnits` splits out of
  `levelWithRunDeployment` for the same reason: a board built from `boardCode` reads its units
  from that code, so the preview needs the figures, not a level carrying them.
- **A turn is part of the shuffle.** Every distinguishable rotation's seatings go into one pool and
  one is drawn from it, so a formation is as likely to be seated sideways as along the band, and a
  turn the remaining band cannot hold simply contributes nothing.
- The imagining is dropped when the map changes, and it is deliberately **not** in the address:
  it is a toy for asking a question, not a state worth linking. The screen's own craft link is
  what reproduces the ground it is asked about.

**The screen is named Exploratio** — the Roman army's word for going to look at the ground before
it is fought over, and the same `-atio` the Run's other movements answer to. The rail reads
`Sectio · Exploratio · Expunctio`.

The workspace id and its `?view=battle-preview` address are deliberately unchanged. They are
machinery, every craft link and ADR that names them still resolves, and renaming them would buy
nothing a player can see.

**Every Sectio control wears an installed kit mark**, from one inventory
(`RUN_SECTIO_CONTROL_ICON_ROLE`) so a destination cannot answer to two different glyphs: the
adlected file for the Sectio itself (Adlectio is its one act), the Run's own Battle mark for
reconnaissance of a Battle — the same mark the pane's header already carries — the strike-through
for Expunctio, the reset arrow for Reset Sectio, a drawn sword for leaving into the fighting, and
the door for abandoning the Run. Abandon Run wears it on the Deployment rail too, because it is
the same control reached from a second screen.

## Consequences

- The question "does my army fit on that band" is answerable on the screen that asks it, before
  the gold is spent, without resolving anything the Sectio is meant to be decided without.
- A band too small to admit a card shows that directly: the cards it could not take are dealt and
  reported, and only what fits is standing.
- The arranging path and the preview cannot drift, because they are one geometry with one guard
  between them. A change to where a formation may stand changes both.
- `RunSaveVersion` does not move: nothing here is persisted, and no document field is added.
- The readout column now genuinely exceeds a short viewport, which exposed a latent defect in it:
  its grid rows were `auto`, so grid's maximize-tracks step could only grow them as far as the
  free space allowed and every section rendered past the row it was given — Time printed straight
  through the note underneath it while the column reported nothing to scroll. `grid-auto-rows:
  max-content` takes each row's full height as its base size, which is what leaves a real overflow
  for the installed scrollbar to carry.
