---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0638](0638-a-committing-verb-opens-its-screen-at-the-menus-scale.md)"
  - "[ADR-0582](0582-run-preparation-tabs-are-named-for-the-act.md)"
---

# ADR-0640: A commitment does not repeat the tab that opened it — it says **Begin**

## Context

[ADR-0638](0638-a-committing-verb-opens-its-screen-at-the-menus-scale.md) put the committing verb
at the top of both Run columns at the menu's own scale. It left the WORDS as they were: **Play**
behind Continue, **Start Run** behind New.

The owner named the problem in the shape of a question: *"the word's purpose is going to be a
duplicate of the button that spawns it — 'continue' really should lead to a 'continue' button."*
And it is exactly right. A tab named for the act ([ADR-0582](0582-run-preparation-tabs-are-named-for-the-act.md))
opening a card whose button repeats that act spends the most prominent press on a word the player
has already read.

Three answers were weighed against published guidance, and two of them are worse than the echo:

- **No words at all.** Ruled out. NN/g's icon research is unambiguous — *"text labels are
  necessary to communicate the meaning and reduce ambiguity"*, and *"icon labels should be visible
  at all times"*. It is worse than usual here: this is a chess game, where a check mark is already
  a chess word with its own reserved log mark.
- **A generic word — "Go", "OK".** Ruled out. A button's text should summarise what will happen;
  GOV.UK ships "Start now" and "Save and continue" rather than "Submit" for the same reason.
- **Naming the phase — "To Deployment", changing with the Run.** Proposed and rejected by the
  owner: it labels a phase of the game on a button whose job is to enter it.

## Decision

**Both committing verbs say `Begin`.**

It repeats neither tab. It is ONE act behind both of them — the press that takes you into the Run
— so it is one word under the one mark that ADR-0638 already binds to every confirm band. Three
labels for one act was the thing that made the echo visible in the first place.

The wrinkle, stated rather than hidden: behind **Continue** you are resuming a Run already at
Battle 3, so `Begin` means *begin playing* rather than *begin the Run*. That is the price of not
echoing the tab, and it is smaller than the echo — the card directly under the button says which
Battle you are returning to, which is the fact the verb would otherwise have to carry.

`Abandon and Start` is untouched. It is not the resting verb; it is the destructive half of the
armed replacement question, and there the words are the warning.

## Consequences

- The Studio's **Confirm Mark** review surface reads `BEGIN` as the shortest label a commitment
  takes, which is what its candidates are judged against.
- A future committing verb gets the word for free by saying `confirm: true` and writing `Begin`;
  the contract test refuses the two labels this replaces.
- No gameplay, save-shape, `RunSaveVersion`, database-schema or media change.
