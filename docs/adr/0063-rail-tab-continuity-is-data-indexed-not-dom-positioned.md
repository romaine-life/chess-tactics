---
status: "accepted"
date: 2026-07-04
deciders: Nelson, Claude
---

# ADR-0063: Rail-tab stone continuity is data-indexed, not DOM-positioned

Applies the rule [ADR-0062](0062-settings-twin-rail-is-placed-by-one-shared-rule.md)
established — a reported UI inconsistency is closed at the shared source of truth with a
guard, never a one-off patch where it showed — to a second axis of the same control.
ADR-0062 fixed where the settings-twin rail is **placed**; this ADR fixes how its carved-stone
skin stays **continuous** down the rail.

The main-menu rail, the Settings sidebar, and the Campaign rail share one control — the
`.settings-tab` — and one visual promise: their carved-stone skin reads as **one continuous
texture sheet running down the rail**, not a stamp that restarts on every button. This ADR
fixes how that continuity is computed.

## Context and Problem Statement

The stone continuity was originally free: the tabs painted a single `background-attachment:
fixed` sheet, so every tab sampled the same viewport-anchored texture and the seams lined up
automatically. That was retired (a Chromium fixed-background repaint bug blanked the tabs
during the Settings crossfade) and replaced with a per-tab vertical offset:

```css
.settings-tab:nth-child(2) { background-position-y: -98px; }
.settings-tab:nth-child(3) { background-position-y: -196px; }
.settings-tab:nth-child(4) { background-position-y: -294px; }
/* "The rail is exactly these four tabs in order." */
```

That ladder was authored against the **Settings sidebar**, which has exactly four tabs. But
the same `.settings-tab` chrome is reused on the **main-menu home rail**, which carries
**five** (Campaign · Solo Skirmish · Editor · Lobbies · Settings — the Settings tab was added
in #282). The fifth tab matched no rule, fell back to `background-position-y: 0`, and
restarted the stone at the top: a visible seam on the Settings button. The reporter saw it
exactly as "the Settings button doesn't follow the continuous-background rule."

The `nth-child` approach is wrong in kind, not just under-provisioned:

- It is coupled to **rail length**. Any rail longer than the ladder silently breaks, and the
  break lands on whichever tab happens to be last.
- It is coupled to **sibling structure**. The Campaign rail interleaves
  `.campaign-rail-group` divider rows between its tabs, so `nth-child` was already counting
  dividers as tabs there — its continuity was random.

## Decision Drivers

- One shared control must keep its continuity promise on **every** rail that renders it,
  regardless of how many tabs the rail has or what non-tab rows sit between them.
- Continuity should be a property the **data** carries, not one the DOM render order has to
  accidentally preserve.
- The regression must be catchable without launching a browser — a CI guard, not a screenshot
  someone remembers to take.

## Considered Options

1. **Extend the `nth-child` ladder** to cover five (or N) tabs.
2. **Key the offset to a data index** (`--tab-index`) each renderer sets from its own map
   position.
3. **Move the stone to the rail container** and let transparent tabs reveal it.

## Decision Outcome

Chosen: **option 2 — a data-owned `--tab-index`.** Each tab declares its position down the
rail; the shared CSS derives its slice from that:

```css
.settings-tab { background-position-y: calc(var(--tab-index, 0) * -98px); }
```

Every renderer sets it from the position the data already has — `MENU_TABS.map((t, i) => …)`,
`tabs.map((t, i) => …)`, and the Campaign rail's **running** counter across both tiers
(`officialCampaigns.length + i` for the second group) so the sheet flows unbroken through the
divider. Continuity is now immune to rail length and to non-tab siblings, because it no longer
reads the DOM to figure out where a tab sits — the tab already knows.

Option 1 was rejected as the same bug with a bigger number: it re-breaks at the next tab and
does nothing for the Campaign dividers. Option 3 was rejected because per-tab stone is load-
bearing elsewhere — the rail frame is transparent so the scene/rain show through the **gaps**
between tabs; moving the fill to the container would paint stone into those gaps and change
the look.

### Guardrail

`frontend/src/ui/settingsRailContinuity.test.ts` fails if:

- the CSS rule stops being index-driven or the fixed `nth-child` ladder returns; or
- any component that renders a `.settings-tab` ships without wiring `--tab-index` — so a new
  rail cannot reintroduce the seam by omission.

### The rule this instances

ADR-0062 stated it: a reported UI inconsistency is fixed **at the shared source of truth, with
a guard that makes the drift a test failure** — not with a one-off patch where the symptom
appeared (here: not by adding `nth-child(5)`). This ADR is a second instance on the same
control: ADR-0062 governed the rail's placement, this governs its stone. The pattern applies
whenever one shared control's invariant is being re-derived from incidental context (DOM
order, tab count, viewport) instead of from data the control owns.

### Consequences

- Good: the stone reads as one sheet on all three rails, at any tab count, dividers included.
- Good: adding a rail tab (or a whole new rail) can't silently break continuity — the guard
  demands the index.
- Cost: every `.settings-tab` renderer now has one required prop-through (its index). The
  guard test is what keeps that from being forgotten.

## More Information

- Code: `frontend/src/style.css` (`.settings-tab` continuity rule),
  `frontend/src/ui/MainMenu.tsx`, `frontend/src/ui/Settings.tsx`,
  `frontend/src/ui/Campaign.tsx`,
  `frontend/src/ui/settingsRailContinuity.test.ts`.
- The seam was introduced by #282 (Settings added to the main-menu rail) and surfaced against
  the shared four-tab ladder; #353 (drop the Level Editor tab) left the count at five.
- Related: [ADR-0062](0062-settings-twin-rail-is-placed-by-one-shared-rule.md) (the sibling —
  same control, same structural-lock rule, the placement axis),
  [ADR-0034](0034-nine-slice-line-frames-for-surface-fill.md) (the line-frame + separate
  surface-fill model these tabs use),
  [ADR-0057](0057-studio-tuning-surfaces-reset-to-committed-baseline.md) (the same "derive
  from the source of truth, never a hand-copied literal that rots" instinct).
