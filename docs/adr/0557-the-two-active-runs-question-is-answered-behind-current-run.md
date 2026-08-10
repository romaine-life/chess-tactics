---
status: accepted
date: 2026-08-09
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)"
  - "[ADR-0290](0290-run-preparation-follows-play-master-detail-navigation.md)"
  - "[ADR-0556](0556-run-preparation-chooses-in-a-tab-column-of-one-line-rows.md)"
---

# ADR-0557: The two-active-Runs question is answered behind Current Run

## Context

When a browser and its account each hold a different active Run, the store raises an adoption
conflict and Run preparation asked which one the account keeps. It asked by replacing the
**Current Run** row with a card carrying the question and its two buttons.

[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md) had already decided
the general principle — the row is an availability surface, not an existence surface, and stays
in its seat disabled rather than disappearing — but carved out this one exception: *"The
adoption-conflict card still replaces the row while it speaks for the account's current Run."*

The exception costs exactly what the rule was written to prevent. Run preparation offers two
things; in this state one of them is simply gone, and the player is handed a question instead of
the control they came for. It is also a question most players in that moment do not have: the
code already records that an adoption conflict does not gate a new Run, because starting one
discards both candidates and is therefore a third answer rather than something blocked by the
question. Somebody heading for **Start New Run** was made to read a two-Run disambiguation that
their next click would resolve anyway.

## Decision

- The Current Run row is present in every state, including an adoption conflict. Nothing removes
  a choice row from Run preparation.
- The conflict is answered in the **detail column the row opens** — the seat that already means
  "what happens if I take this row". Its head is **Two active Runs**, the copy names the two
  Wars, and **Keep account Run** / **Adopt browser Run** sit in the ordinary two-column detail
  action row where Current Run's Play and Start New Run's Start Run sit.
- The conflict replaces the Current Run FACTS, not the row: while it is unresolved, taking
  Current Run asks which Run before it offers to play one.
- The ambient signal stays where it was: the status line **This browser and account each have an
  active Run** keeps rendering under the choice list, so the pending question is discoverable
  without a card standing in a row's seat. It is no longer announced as an `alert`, because a
  question you navigate to is not an interruption.
- Start New Run is untouched and remains available throughout, as it already was.

## Consequences

- Run preparation's two rows are constant. A player never opens Play to find an expected control
  missing.
- The disambiguation reaches the player who needs it — the one resuming — and nobody else.
- ADR-0334's exception is withdrawn; its rule now has no exceptions, which is what makes the
  visible-but-disabled language a rule rather than a default.
- Resolving the conflict from the detail column returns the same column to Current Run's facts,
  so the answer lands where the next action already is.
