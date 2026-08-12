---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0571](0571-start-new-run-is-one-box-of-cells.md)"
  - "[ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)"
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)"
---

# ADR-0585: Abandoning a Run is confirmed in the seat that raised it, and the HUD is handed the control

## Context

**Abandon Run** opened a modal. `useRunAbandon` called `useConfirm`, which portalled an
`alertdialog` to `<body>` over a dimmed screen with a heading, a sentence, and a Keep Run /
Abandon Run pair — the kit's general-purpose replacement for `window.confirm()`.

The same question is already answered inline one screen away. Start New Run confirms replacing an
active Run without opening anything: the stakes stand in a cell of its own box, and the first press
ARMS the verb, which splits into Keep Run / Abandon and Start in the same row
([ADR-0571](0571-start-new-run-is-one-box-of-cells.md)). Two ways of asking "are you sure you want
to lose this Run?", one screen apart, is exactly the parallel [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
forbids — and the popup was the worse of the two:

- **It asked the question somewhere other than where it was raised.** The player pressed a control
  at the bottom of a rail and the answer appeared in the middle of the screen, over the Run under
  discussion, dimmed.
- **It drew its two answers in a chrome nothing else on the screen wears** (`le-seg-btn`), so the
  confirmation did not look like it belonged to the panel that raised it.
- **It spent a heading restating the button just pressed.** "Abandon this Run?" over a button
  labelled Abandon Run is a row of the dialog carrying no information.
- **And its body text existed to justify the layer it opened.** A modal that has darkened the
  screen owes the reader an explanation for doing so; a sentence naming what abandoning costs is
  that explanation. Answering in the seat opens nothing, so it owes nothing.

The control also existed three times. `RunMetaControls` and `ArrangedDeploymentControls` each built
their own `ChromeButton` and called the shared hook, and the Battle HUD built a THIRD one from an
`onAbandonRun` callback — with no mark, in a different wrapper, at a different measure. A single
action assembled separately in three places drifts by definition, and it had.

## Decision

**Abandoning a Run is confirmed in its own seat, by ONE control mounted in three places.**

- `RunAbandonControl` owns both states. At rest it is the single danger verb wearing the sign-out
  mark, `data-testid="abandon-run"`, exactly where it stood. Pressing it ARMS the question, and the
  verb SPLITS into `run-abandon-keep` / `run-abandon-confirm`, which is
  [ADR-0571](0571-start-new-run-is-one-box-of-cells.md)'s shape for the same question.
- **The armed question is ONE BOX holding its two answers.** A `DividedInnerChromeBox` wearing the
  structural marble, `verbColumns(answers)` declaring its two tracks, and `ChromeVerbRow` seating
  them. **The line between Keep Run and Abandon Run is a rail the box lays and caps from its own
  grid lines** ([ADR-0242](0242-divided-inner-grids-own-one-rail-topology.md)), capped where it
  meets the frame at either end. Shipped first as two framed buttons in a flex row with a gap
  between them, which is wrong twice over — a gap is what this kit puts between things that are NOT
  related, and each button drew a second frame a few pixels inside the one the question needed. The
  box takes no padding, or the rail would stop short of the frame it has to reach, and the cells
  that ARE the controls take none either, so the wood reaches it.
- **ONE seat height through both states.** Pressing a control must not resize the thing under the
  cursor. The two states are different objects — a framed button and a framed box — so
  `--run-abandon-seat-h` is stated once and derived twice: the resting button takes it directly,
  and the box's frameless plate is that height less a rail a side, which lands the box at the same
  height AND its wood on exactly the wood the button painted. **46px is read off the live DOM, not
  chosen**: every button in every one of the three rails measures it, with a 7px frame and 32px of
  oak inside. Both states are pinned to it because the resting height was EMERGENT — a 38px floor
  plus the mark's line box — so a change to the button's font or its mark would have moved one
  state and left the other where it was, silently. The rail is read from
  `--le-chrome-inner-rail-w`, which `chromeFamilyRuntime` stamps from the installed chrome catalog,
  so a retuned frame moves the plate with it rather than leaving a hardcoded number a few pixels
  out. Shipped wrong twice on the way here — a 30px plate (44px box against a 46px button) and then
  a 26px one derived from a 40px `min-block-size` that was only a FLOOR the mark already exceeded.
- **It states NO stakes.** Abandon Run already says what it does; a sentence adding that abandoning
  loses the army, the gold and the Battle progress tells a player who just pressed Abandon Run
  nothing they have not already decided. It was carried over from the dialog without being
  re-examined, and it read like it: a warning cell whose only job was to be the modal's body. The
  question is still ASKED — it is the armed group's accessible name — it simply is not restated on
  screen above two answers that are unambiguous. This also settles the alignment argument the
  sentence started, by removing the sentence: nothing in the box is prose, and the two verb cells
  centre their labels the way every verb cell in the app does.
- **`useConfirm` is gone from the Run.** It keeps its other consumers — Resign, the Level Editor,
  the Campaign editor — and this ADR does not retire the primitive. It says a Run's own destructive
  verb is not one of them, because that question has an inline answer already. Where a dialog IS
  right, its body text is still right: what does not survive is copying that body into a control
  that opens nothing.
- **The dialog's safeties are kept rather than dropped.** Arming moves focus to Keep Run, and
  Escape keeps the Run. Those were the two things the modal did that the label alone does not.
- **The answers share one ROW**, each its own compartment of it. They are two answers to one
  question; stacked, they read as two separate things to do. Neither wears a mark: the mark belongs
  to the control that ASKED, and at half a rail's width there is no room for one beside the word.
- **The Battle HUD is handed the CONTROL, not a callback.** `SkirmishHudProps.onAbandonRun` becomes
  `abandonRun?: ReactNode`. The confirmation now happens in the seat, so the seat is what the Run
  contributes; a callback would have left the HUD building its own copy of a control whose two
  states it knows nothing about. It is passed as a module-constant element, because the Battle
  presentation is deliberately memoized against unrelated Run writes and a fresh element per render
  would churn it.
- **The RESTING verb's material stays the SEAT's, not the control's**
  ([ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)). The Run's own rails have
  adopted the oak; the Battle HUD's Controls panel has not, and every button beside it there wears
  the field. So `fillSurface` defaults to the leaf oak and the HUD's copy passes `null`. What is
  shared is the behaviour and the words, not a skin imposed on a panel that never adopted it.
  **Armed, the seat has no say**: a box establishes its own containment level, so it wears the
  marble and every cell that is a control wears the oak, in all three seats.
- The control owns its own layout and button measure. Its three seats wrapped it in three different
  rows (`skirmish-view-row`, a bare group, `run-meta-navigation`) and sized it three ways; those
  wrappers are gone and the seats now supply only the eyebrow and the place. The armed box's verb
  plate is **30px**, not the 40px of the framed button beside it: a framed rail button's 9-slice
  eats a rail's width a side and leaves about 26px of oak, and a cell with no frame painting the
  neighbour's whole box would read heavier than every framed control around it — the same trade
  `.run-prep-box` records.

## Consequences

- One fewer layer over the game. Abandoning never dims the screen it is abandoning.
- Nothing in the armed question draws a rule of its own, and no page shows through between its
  parts — which is what makes it read as one question rather than a sentence with two buttons
  under it.
- Verified on the live route with real mouse clicks in all three seats — the Sectio rail, the
  Deployment panel and the Battle HUD — driven by `npm run shot --click` against crafted Runs. The
  arming press must wait for `data-scene-phase="current"`: clicked before the director settles it
  lands on the transition layer and nothing arms, which is the same trap
  [ADR-0571](0571-start-new-run-is-one-box-of-cells.md) recorded from its own check.
- The destructive path was driven end to end: a real click on the armed Abandon Run lands on
  `/play/select/run` reporting **No active Run**. A real click on Keep Run, and a real Escape,
  each return the seat to its resting control with the Run intact.
- The seat does not move at all when the question is asked — verified on the live route in all three
  rails, resting and armed both 46.00px to the hundredth. Carrying the stakes made the armed state
  three times the resting height; without them, arming changes what the seat says and nothing about
  its size.
- `data-testid="abandon-run"` stays on the ARMING control, so anything that presses it presses the
  same thing it always did and then meets the question. The two answers are new ids.
- No gameplay, RunSaveVersion, save-shape or database change. `abandon()` is untouched, including
  [ADR-0544](0544-leaving-a-run-does-not-wait-for-its-account-row.md)'s rule that leaving navigates
  in the same tick the Run is cleared and never waits on the account's DELETE.
