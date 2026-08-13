---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md)"
  - "[ADR-0063](0063-rail-tab-continuity-is-data-indexed-not-dom-positioned.md)"
---

# ADR-0639: A dropdown option row is a control, so it wears the oak

## Context

[ADR-0433](0433-leaf-chrome-uses-oak-over-structural-teal-fields.md) settles what a surface is
made of: **a clickable leaf wears the oak, a field that hosts other people's controls wears the
structural marble.** It also settles the dropdown case explicitly —

> Opening a dropdown does not turn its popup field into a leaf. The closed trigger is oak; the
> popup remains structural teal because it hosts option rows.

Both halves of that were missing from `HouseSelect`, which is every dropdown in the app.

The popup field painted **nothing** — `background: transparent`, and its box was mounted with no
fill role at all. And each option row wore a hand-mixed `rgba(10, 28, 43, .42)`, with its cursor
and selected states as two more hand-mixed opaque fills on top.

So the one place in the shell where a whole column of surfaces is nothing *but* controls was the
one place a pressable surface carried no wood. The trigger you press to open the menu is oak; the
rows you press inside it were flat colour.

This surfaced on Play → New, where a Run's Ataraxia rung and its four rule options are all
chosen through this control.

## Decision

**The popup field takes the structural marble and every option row takes the leaf oak** — which
is what ADR-0433 already said, read the way it was written: the field is structural *because* it
hosts the rows, so the rows are the leaves.

- The oak is named on the row and **phased** with `leafSurfacePhase(index)`, so a menu is cut
  from one plank running down the list rather than stamping one crop per row ([ADR-0063](0063-rail-tab-continuity-is-data-indexed-not-dom-positioned.md)).
  A scrolling menu keeps one continuous grain.
- `.house-select-option`'s remaining surface declarations only REMOVE the shell's native button
  chrome, which is the same frameless reset `.section-box-member-verb` makes and is registered as
  one. It leaves the surface-debt baseline rather than staying in it with a new hash.
- **Under the cursor the row is LIT, not covered.** A translucent wash over dark oak desaturates
  it to grey — measured by eye against the real menu, it read as a row that had gone dead rather
  than one being pointed at. `filter: brightness()` keeps the grain and the hue.
- **The chosen option is a different fact from where the cursor is**, so it takes a different
  mark: the crisp cyan inset ring `.settings-tab.is-active` wears, that being the same statement
  one menu-language surface over. The two are independent and read together — a lit row carrying
  the ring is the chosen option under the cursor.

The group heading keeps its own plate. It classifies rows rather than being one, and nothing in
it can be pressed.

## Consequences

- Every dropdown in the app changes at once, because there is one primitive. That is the point.
- Net surface debt goes DOWN by two entries: the row's hand-mixed fill becomes a registered
  reset, and the cursor state stops painting a surface at all.
- No gameplay, save-shape, `RunSaveVersion`, database-schema or media change.
