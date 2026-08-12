---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0556](0556-run-preparation-chooses-in-a-tab-column-of-one-line-rows.md)"
  - "[ADR-0334](0334-current-run-stays-visible-disabled-without-an-active-run.md)"
  - "[ADR-0289](0289-run-preparation-is-control-first-and-ataraxia-uses-one-selector.md)"
---

# ADR-0582: Run preparation's tabs are named for the act, not the object

## Context

Play opens Run preparation directly (ADR-0514), and its choice column is two rail tabs
(ADR-0558). They were labelled **Current Run** and **Start New Run**.

ADR-0556 had already cut those rows to one line each on the rule that *"a row whose whole job is
to open a detail column does not summarize that column"* — so the tab is its name and nothing
else. That makes the name the entire control, and **Current Run** was not naming a control. It
named the *object behind* the tab, leaving the player to infer what pressing it does; and the
object it named is one the surface states three more times, in the detail column's first facts
and in the Start New Run column's replacement note. Owner verdict: *"continue is just a lot more
clear."*

**Start New Run** had the opposite problem. It is a verb phrase in a seat whose sibling was a
noun phrase, so the pair did not read as one choice, and its "Start" duplicates the **Start Run**
verb the column it opens closes with.

## Decision

- The two tabs are **Continue** and **New**. Each names what pressing it does, and the pair reads
  as one question with two answers.
- **Start** is not the tab's to carry. What a new Run costs the one being held is stated by the
  detail column it opens — ADR-0557's replacement note and the armed **Abandon and Start**
  confirmation — so nothing is lost by taking the warning out of the tab.
- ADR-0334's **No active Run** detail line is unchanged. It is still the only thing on the surface
  that says why the tab cannot be taken, and it still appears only when the tab is disabled.
- The Continue tab's detail column is the landmark **Continue**; the New tab's is **New Run**, not
  the tab's bare "New". A landmark is announced away from the rail that supplied its subject,
  where "Continue" still stands on its own and "New" does not.
- Addresses, test ids, media slots and roles keep the words they already have —
  `/play/select/run/current`, `run-choice-new`, `ui/kit/icons/run/current.png`. They are
  identities, not labels; renaming an installed slot is a production content change with nothing
  to gain here.

## Consequences

- The retained direct Continue surface at `/play/select/continue` (ADR-0356) now shares a word with
  this tab. They cannot be seen together — Continue has no ordinary entry while Run is the sole
  mode (ADR-0514) — and they mean the same thing, so the collision is a synonym rather than an
  ambiguity. If Continue ever returns to ordinary navigation, the two must be reconciled there
  rather than by taking the word back off this tab.
- The Studio review page for the tabs' marks (`?mode=catalog&cat=runrailmarks`) names its seats
  by what the tabs say, so its previews still read as the shipped control. Its slot paths keep
  saying `current` / `new`, which is now a mismatch with the words above them and is called out
  in place.
- ADR-0289's naming clause — *"an active Run is identified as Current Run"*, *"remains separately
  labeled Start New Run"* — is superseded. Everything else it decided about that surface stands.
